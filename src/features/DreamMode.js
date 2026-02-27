/**
 * Dream mode — dissolves the graph into a particle symphony.
 *
 * Each block becomes a glowing particle that flows through curl noise fields.
 * 4000 ambient particles fill the surrounding space.
 * When aurora is also active, aurora waves color the particles via GPU uniforms.
 * AfterimagePass creates motion trail persistence.
 */

import * as THREE from 'three';
import { CHANNEL_PALETTE } from '../constants.js';

const AMBIENT_COUNT = 4000;

// ─── Vertex shader ───
const dreamVert = `
uniform float uTime;
uniform float uProgress;
uniform float uAurora;
uniform float uWaveDirections[15];
uniform float uWaveSpeeds[5];
uniform float uWaveWidths[5];
uniform float uWaveOffsets[5];
uniform float uWaveHues[15];

attribute vec3 aOrigin;
attribute vec3 aColor;
attribute float aPhase;
attribute float aBaseSize;
attribute float aSpeed;

varying vec3 vColor;
varying float vAlpha;

vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 1.0 / 7.0;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x2_ = x_ * ns.x + ns.yyyy;
  vec4 y2_ = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x2_) - abs(y2_);

  vec4 b0 = vec4(x2_.xy, y2_.xy);
  vec4 b1 = vec4(x2_.zw, y2_.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

vec3 curlNoise(vec3 p) {
  float e = 0.5;
  vec3 off2 = vec3(31.4, 0.0, 0.0);
  vec3 off3 = vec3(0.0, 47.8, 0.0);

  float n1   = snoise(p);
  float n1_y = snoise(p + vec3(0, e, 0));
  float n1_z = snoise(p + vec3(0, 0, e));

  float n2   = snoise(p + off2);
  float n2_x = snoise(p + off2 + vec3(e, 0, 0));
  float n2_z = snoise(p + off2 + vec3(0, 0, e));

  float n3   = snoise(p + off3);
  float n3_x = snoise(p + off3 + vec3(e, 0, 0));
  float n3_y = snoise(p + off3 + vec3(0, e, 0));

  float ie = 1.0 / e;
  return vec3(
    (n3_y - n3) * ie - (n2_z - n2) * ie,
    (n1_z - n1) * ie - (n3_x - n3) * ie,
    (n2_x - n2) * ie - (n1_y - n1) * ie
  );
}

void main() {
  vec3 pos = aOrigin;
  float t = uTime;
  float spd = aSpeed;
  float prog = uProgress;

  // Multi-octave curl noise displacement
  float scale = 0.0018;
  float tScale = 0.1 * spd;

  vec3 flow1 = curlNoise(pos * scale + t * tScale * 0.25) * 160.0;
  vec3 flow2 = curlNoise(pos * scale * 2.8 + t * tScale * 0.4 + 100.0) * 55.0;
  vec3 flow3 = curlNoise(pos * scale * 7.0 + t * tScale * 0.7 + 200.0) * 18.0;

  pos += (flow1 + flow2 + flow3) * prog;

  // Breathing + global pulse
  float breath = sin(t * 0.35 + aPhase * 6.283) * 0.5 + 0.5;
  float globalPulse = sin(t * 0.12) * 0.5 + 0.5;
  pos *= 1.0 + globalPulse * 0.06 * prog;

  // Spiral drift
  float spiralAngle = t * 0.04 * spd + aPhase * 6.283;
  float spiralR = length(pos.xz) * 0.015 * prog;
  pos.x += sin(spiralAngle) * spiralR;
  pos.z += cos(spiralAngle) * spiralR;

  // Aurora coloring (GPU-side)
  if (uAurora > 0.5) {
    vec3 auroraColor = vec3(0.0);
    float totalIntensity = 0.0;

    for (int i = 0; i < 5; i++) {
      vec3 wDir = vec3(uWaveDirections[i*3], uWaveDirections[i*3+1], uWaveDirections[i*3+2]);
      float projected = dot(pos, wDir);
      float waveFront = uWaveOffsets[i] + t * uWaveSpeeds[i];
      float dist = projected - waveFront;
      float phase = (dist / uWaveWidths[i]) * 6.283;
      float intensity = max(0.0, cos(phase) * 0.5 + 0.5);
      intensity = intensity * intensity;

      vec3 hue = vec3(uWaveHues[i*3], uWaveHues[i*3+1], uWaveHues[i*3+2]);
      auroraColor += hue * intensity;
      totalIntensity += intensity;
    }

    float strength = min(totalIntensity, 1.5);
    vec3 dimBase = aColor * 0.1;
    vColor = dimBase + auroraColor * 0.8;
    vColor = clamp(vColor, 0.0, 1.0);
    vColor = mix(vColor, vec3(1.0), breath * 0.25 * strength);
  } else {
    // Default hue rotation
    float hueAngle = sin(t * 0.07 + pos.y * 0.0025 + aPhase * 3.14) * 0.45;
    float cs = cos(hueAngle);
    float sn = sin(hueAngle);
    vec3 k = vec3(0.57735);
    vColor = aColor * cs + cross(k, aColor) * sn + k * dot(k, aColor) * (1.0 - cs);
    vColor = clamp(vColor, 0.0, 1.0);
    vColor = mix(vColor, vec3(1.0), breath * 0.2);
  }

  // Alpha ramps with progress
  vAlpha = (0.25 + breath * 0.75) * prog;

  // Project
  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPos;

  float perspective = 280.0 / max(-mvPos.z, 1.0);
  gl_PointSize = max(aBaseSize * perspective * (0.5 + breath * 0.5), 0.5);
}`;

// ─── Fragment shader ───
const dreamFrag = `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);
  if (dist > 0.5) discard;

  // Soft glow with bright core
  float glow = 1.0 - smoothstep(0.0, 0.5, dist);
  float core = smoothstep(0.25, 0.0, dist);
  glow = pow(glow, 1.8);

  float alpha = glow * vAlpha;

  vec3 color = mix(vColor, vec3(1.0), core * 0.6);

  gl_FragColor = vec4(color * (1.0 + glow * 0.4), alpha);
}`;


export class DreamMode {
  constructor(sceneManager, graphData, nodeRenderer, edgeRenderer, cameraController, postProcessing) {
    this.scene = sceneManager.scene;
    this.graphData = graphData;
    this.nodeRenderer = nodeRenderer;
    this.edgeRenderer = edgeRenderer;
    this.cameraController = cameraController;
    this.postProcessing = postProcessing;

    this.active = false;
    this._points = null;
    this._material = null;
    this._progress = 0;
    this._elapsed = 0;
    this._originalBloom = 0;
    this._built = false;

    const btn = document.getElementById('btn-dream');
    if (btn) {
      btn.addEventListener('click', () => {
        if (this.active) this.deactivate();
        else this.activate();
      });
    }
  }

  _build() {
    if (this._built) return;
    this._built = true;

    const blocks = this.graphData.blocks;
    const totalCount = blocks.length + AMBIENT_COUNT;

    const positions = new Float32Array(totalCount * 3);
    const colors = new Float32Array(totalCount * 3);
    const phases = new Float32Array(totalCount);
    const sizes = new Float32Array(totalCount);
    const speeds = new Float32Array(totalCount);

    // Bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    // Block particles
    for (let i = 0; i < blocks.length; i++) {
      const pos = this.nodeRenderer.getBlockPosition(i);
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
      minZ = Math.min(minZ, pos.z);
      maxZ = Math.max(maxZ, pos.z);

      // Color from channel
      const chIds = this.graphData.blockToChannelsMap[blocks[i].id] || [];
      const chIdx = (chIds[0] && this.graphData.channelIndexMap[chIds[0]]) || 0;
      const col = new THREE.Color(CHANNEL_PALETTE[chIdx % CHANNEL_PALETTE.length]);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      phases[i] = Math.random();
      sizes[i] = 3 + Math.random() * 5;
      speeds[i] = 0.5 + Math.random() * 0.8;
    }

    // Ambient particles — fill surrounding space
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const rangeZ = maxZ - minZ || 1;
    const pad = 0.4;

    for (let i = 0; i < AMBIENT_COUNT; i++) {
      const idx = blocks.length + i;
      positions[idx * 3] = minX - rangeX * pad + Math.random() * rangeX * (1 + 2 * pad);
      positions[idx * 3 + 1] = minY - rangeY * pad + Math.random() * rangeY * (1 + 2 * pad);
      positions[idx * 3 + 2] = minZ - rangeZ * pad + Math.random() * rangeZ * (1 + 2 * pad);

      const ambientCol = new THREE.Color(CHANNEL_PALETTE[Math.floor(Math.random() * CHANNEL_PALETTE.length)]);
      ambientCol.lerp(new THREE.Color(0.3, 0.3, 0.4), 0.3);
      colors[idx * 3] = ambientCol.r;
      colors[idx * 3 + 1] = ambientCol.g;
      colors[idx * 3 + 2] = ambientCol.b;

      phases[idx] = Math.random();
      sizes[idx] = 1 + Math.random() * 2.5;
      speeds[idx] = 0.7 + Math.random() * 1.3;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('aOrigin', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aBaseSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

    // Aurora uniform arrays
    const waveDirections = new Float32Array(15);
    const waveSpeeds = new Float32Array(5);
    const waveWidths = new Float32Array(5);
    const waveOffsets = new Float32Array(5);
    const waveHues = new Float32Array(15);

    this._material = new THREE.ShaderMaterial({
      vertexShader: dreamVert,
      fragmentShader: dreamFrag,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uAurora: { value: 0 },
        uWaveDirections: { value: waveDirections },
        uWaveSpeeds: { value: waveSpeeds },
        uWaveWidths: { value: waveWidths },
        uWaveOffsets: { value: waveOffsets },
        uWaveHues: { value: waveHues },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this._points = new THREE.Points(geometry, this._material);
    this._points.frustumCulled = false;
    this._points.visible = false;
    this.scene.add(this._points);
  }

  activate() {
    if (this.active) return;
    this.active = true;
    this._progress = 0;
    this._elapsed = 0;

    this._build();

    // Hide normal graph
    this.nodeRenderer.mesh.visible = false;
    for (const m of this.nodeRenderer.channelMeshes) m.visible = false;
    this.edgeRenderer.setVisible(false);

    this._points.visible = true;

    if (this.postProcessing) {
      this._originalBloom = this.postProcessing.bloomPass.strength;
      this.postProcessing.bloomPass.strength = 1.2;
      if (this.postProcessing.afterimagePass) {
        this.postProcessing.afterimagePass.enabled = true;
      }
    }

    document.getElementById('btn-dream').classList.add('active');
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;

    // Restore normal graph
    this.nodeRenderer.mesh.visible = true;
    for (const m of this.nodeRenderer.channelMeshes) m.visible = true;
    this.edgeRenderer.setVisible(true);

    if (this._points) this._points.visible = false;

    if (this.postProcessing) {
      this.postProcessing.bloomPass.strength = this._originalBloom;
      if (this.postProcessing.afterimagePass) {
        this.postProcessing.afterimagePass.enabled = false;
      }
    }

    document.getElementById('btn-dream').classList.remove('active');
  }

  /** Pass aurora wave data into the dream shader uniforms */
  setAuroraWaves(waves) {
    if (!this._material) return;
    const u = this._material.uniforms;
    for (let i = 0; i < waves.length && i < 5; i++) {
      const w = waves[i];
      u.uWaveDirections.value[i * 3] = w.dx;
      u.uWaveDirections.value[i * 3 + 1] = w.dy;
      u.uWaveDirections.value[i * 3 + 2] = w.dz;
      u.uWaveSpeeds.value[i] = w.speed;
      u.uWaveWidths.value[i] = w.width;
      u.uWaveOffsets.value[i] = w.offset;
      u.uWaveHues.value[i * 3] = w.hue[0];
      u.uWaveHues.value[i * 3 + 1] = w.hue[1];
      u.uWaveHues.value[i * 3 + 2] = w.hue[2];
    }
  }

  setAuroraActive(active) {
    if (this._material) {
      this._material.uniforms.uAurora.value = active ? 1.0 : 0.0;
    }
  }

  update(delta) {
    if (!this.active || !this._material) return;

    // Smooth ramp-in
    this._progress = Math.min(1, this._progress + delta * 0.35);
    const smoothProg = this._progress * this._progress * (3 - 2 * this._progress);

    this._elapsed += delta;
    this._material.uniforms.uTime.value = this._elapsed;
    this._material.uniforms.uProgress.value = smoothProg;

    // Slow rotation
    if (this._points) {
      this._points.rotation.y += delta * 0.015;
    }
  }
}
