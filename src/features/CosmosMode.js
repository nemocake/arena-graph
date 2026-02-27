/**
 * COSMOS mode — particles form a rotating spiral galaxy.
 *
 * Graph nodes dissolve into a galaxy with logarithmic spiral arms,
 * Keplerian orbits, polar jets, stellar flares, and 6-pointed
 * diffraction spike rendering. Combined with afterimage trails
 * and boosted bloom, it creates a cinematic deep-space experience.
 *
 * When aurora is also active, aurora waves modulate galaxy colors on the GPU.
 */

import * as THREE from 'three';
import { CHANNEL_PALETTE } from '../constants.js';

const AMBIENT_COUNT = 6000;

// ─── Vertex shader ───
const cosmosVert = `
uniform float uTime;
uniform float uProgress;
uniform float uAurora;
uniform float uWaveDirections[15];
uniform float uWaveSpeeds[5];
uniform float uWaveWidths[5];
uniform float uWaveOffsets[5];
uniform float uWaveHues[15];
uniform float uNovaPulse;

attribute vec3 aOrigin;
attribute vec3 aColor;
attribute float aPhase;
attribute float aBaseSize;
attribute float aSpeed;

varying vec3 vColor;
varying float vAlpha;
varying float vHeat;

// ─── Simplex noise ───
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
  float prog = uProgress;
  float t = uTime;

  // ═══ GALAXY TARGET POSITION ═══

  // Orbit radius from original distance to centroid
  float origDist = length(aOrigin.xz) + abs(aOrigin.y) * 0.3;
  float radius = 30.0 + origDist * 0.65;

  // Assign to one of 4 spiral arms
  float armCount = 4.0;
  float armFrac = aPhase * armCount;
  float armIndex = floor(armFrac);
  float armOffset = armIndex / armCount * 6.2832;

  // Logarithmic spiral
  float spiralAngle = armOffset + log(1.0 + radius * 0.006) / 0.3;

  // Keplerian orbital speed (faster near center)
  float orbSpeed = aSpeed * 0.7 / max(pow(radius * 0.004, 0.5), 0.25);
  float angle = spiralAngle + t * orbSpeed;

  // Spread within arm (not all on the exact line)
  float armSpread = 12.0 + radius * 0.12;
  float spreadOffset = (fract(armFrac) - 0.5) * 2.0;
  angle += spreadOffset * armSpread / max(radius, 1.0);

  // XZ position on the spiral
  vec3 galaxyPos;
  galaxyPos.x = cos(angle) * radius;
  galaxyPos.z = sin(angle) * radius;

  // Thin disk with central bulge
  float diskThickness = mix(6.0, 100.0, exp(-radius * 0.007));
  float vertPhase = sin(aPhase * 37.7 + aOrigin.y * 0.01);
  galaxyPos.y = vertPhase * diskThickness * 0.4;

  // Arm-scale turbulence
  vec3 turb = curlNoise(galaxyPos * 0.0015 + t * 0.03) * 30.0;
  galaxyPos += turb * prog;

  // Fine dust turbulence
  vec3 dust = curlNoise(galaxyPos * 0.005 + t * 0.08 + 100.0) * 8.0;
  galaxyPos += dust * prog;

  // ═══ POLAR JETS ═══
  float centerDist = length(galaxyPos.xz);
  float isJet = step(0.93, aPhase) * step(centerDist, 70.0);
  float jetDir = step(0.5, fract(aPhase * 7.0)) * 2.0 - 1.0;
  float jetCurl = sin(t * 2.0 + aPhase * 20.0) * 15.0;
  galaxyPos.y += jetDir * (t * 120.0 * aSpeed + jetCurl) * isJet * prog;
  galaxyPos.x += sin(t * 1.5 + galaxyPos.y * 0.02) * 12.0 * isJet * prog;
  galaxyPos.z += cos(t * 1.3 + galaxyPos.y * 0.02) * 12.0 * isJet * prog;

  // ═══ SUPERNOVA PULSE ═══
  float novaExpand = uNovaPulse * 80.0;
  vec3 novaDir = normalize(galaxyPos + 0.001);
  galaxyPos += novaDir * novaExpand * (0.5 + aPhase * 0.5);

  // ═══ TRANSITION ═══
  vec3 pos = mix(aOrigin, galaxyPos, prog);

  // ═══ COLOR ═══
  float finalDist = length(pos.xz);
  float heat = exp(-finalDist * 0.004);
  vHeat = heat;

  // Astrophysical temperature palette
  vec3 hotColor  = vec3(0.7, 0.85, 1.0);   // O/B — blue-white
  vec3 warmColor = vec3(1.0, 0.92, 0.72);   // F/G — yellow-white
  vec3 midColor  = vec3(1.0, 0.45, 0.15);   // K   — orange
  vec3 coolColor = vec3(0.65, 0.12, 0.45);  // nebula — magenta-purple
  vec3 coldColor = vec3(0.1, 0.04, 0.18);   // void — deep purple

  vec3 tempColor;
  if (heat > 0.6) {
    tempColor = mix(warmColor, hotColor, (heat - 0.6) / 0.4);
  } else if (heat > 0.35) {
    tempColor = mix(midColor, warmColor, (heat - 0.35) / 0.25);
  } else if (heat > 0.12) {
    tempColor = mix(coolColor, midColor, (heat - 0.12) / 0.23);
  } else {
    tempColor = mix(coldColor, coolColor, heat / 0.12);
  }

  // Jet particles glow cyan-white
  vec3 jetColor = vec3(0.4, 0.8, 1.0);
  tempColor = mix(tempColor, jetColor, isJet * 0.8);

  // Aurora override
  if (uAurora > 0.5) {
    vec3 auroraColor = vec3(0.0);
    float totalIntensity = 0.0;
    for (int i = 0; i < 5; i++) {
      vec3 wDir = vec3(uWaveDirections[i*3], uWaveDirections[i*3+1], uWaveDirections[i*3+2]);
      float projected = dot(pos, wDir);
      float waveFront = uWaveOffsets[i] + t * uWaveSpeeds[i];
      float wDist = projected - waveFront;
      float wPhase = (wDist / uWaveWidths[i]) * 6.283;
      float intensity = max(0.0, cos(wPhase) * 0.5 + 0.5);
      intensity = intensity * intensity;
      vec3 hue = vec3(uWaveHues[i*3], uWaveHues[i*3+1], uWaveHues[i*3+2]);
      auroraColor += hue * intensity;
      totalIntensity += intensity;
    }
    float aStr = min(totalIntensity, 1.5);
    tempColor = mix(tempColor, tempColor * 0.2 + auroraColor * 0.8, aStr * 0.6);
  }

  vColor = mix(aColor * 0.15, tempColor, 0.85);

  // ═══ BRIGHTNESS ═══
  float breath = sin(t * 0.4 + aPhase * 6.283) * 0.5 + 0.5;

  // Stellar flares — sharp bright pops
  float flare = pow(max(0.0, sin(t * 3.5 + aPhase * 157.0)), 25.0) * 2.5;

  // Supernova pulse brightness
  float novaBright = uNovaPulse * 1.5;

  vAlpha = (0.15 + breath * 0.35 + heat * 0.55 + flare + isJet * 1.5 + novaBright) * prog;
  vAlpha = min(vAlpha, 1.0);

  // ═══ PROJECTION ═══
  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPos;

  float perspective = 300.0 / max(-mvPos.z, 1.0);
  float sizeBoost = 0.4 + heat * 2.0 + flare * 4.0 + isJet * 1.5 + novaBright * 2.0;
  gl_PointSize = max(aBaseSize * perspective * sizeBoost, 0.3);
}`;

// ─── Fragment shader — diffraction spike stars ───
const cosmosFrag = `
varying vec3 vColor;
varying float vAlpha;
varying float vHeat;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float dist = length(uv);

  // Core glow
  float glow = 1.0 - smoothstep(0.0, 0.5, dist);
  glow = pow(glow, 1.4);

  // 6-pointed diffraction spikes (stronger for hotter particles)
  float angle = atan(uv.y, uv.x);
  float spikes = pow(abs(cos(angle * 3.0)), 40.0);
  float spikeGlow = spikes * (1.0 - smoothstep(0.0, 0.48, dist));
  float spikeStrength = spikeGlow * vHeat * 0.7;

  // 4-pointed secondary spikes (rotated 45 deg, fainter)
  float spikes2 = pow(abs(cos(angle * 2.0 + 0.785)), 60.0);
  float spike2Glow = spikes2 * (1.0 - smoothstep(0.0, 0.35, dist));
  float spike2Strength = spike2Glow * vHeat * 0.25;

  float finalGlow = max(glow, max(spikeStrength, spike2Strength));
  float alpha = finalGlow * vAlpha;

  if (alpha < 0.005) discard;

  // Core brightens to white
  float core = smoothstep(0.2, 0.0, dist);
  vec3 color = mix(vColor, vec3(1.0), core * 0.75);

  // Spike color — chromatic blue shift
  vec3 spikeColor = mix(vColor, vec3(0.65, 0.8, 1.0), 0.4);
  color = mix(color, spikeColor, (spikeStrength + spike2Strength) * 0.4);

  // Airy ring at edge of core (subtle)
  float ring = smoothstep(0.28, 0.32, dist) * smoothstep(0.38, 0.32, dist);
  color += ring * vColor * 0.15 * vHeat;

  gl_FragColor = vec4(color * (1.0 + finalGlow * 0.35), alpha);
}`;


export class CosmosMode {
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
    this._novaPulse = 0;
    this._novaTimer = 0;

    const btn = document.getElementById('btn-cosmos');
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

      const chIds = this.graphData.blockToChannelsMap[blocks[i].id] || [];
      const chIdx = (chIds[0] && this.graphData.channelIndexMap[chIds[0]]) || 0;
      const col = new THREE.Color(CHANNEL_PALETTE[chIdx % CHANNEL_PALETTE.length]);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      phases[i] = Math.random();
      sizes[i] = 2.5 + Math.random() * 5;
      speeds[i] = 0.4 + Math.random() * 0.9;
    }

    // Ambient particles — distant stars and galactic dust
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const rangeZ = maxZ - minZ || 1;
    const pad = 0.5;

    for (let i = 0; i < AMBIENT_COUNT; i++) {
      const idx = blocks.length + i;

      // Mix: ~70% disk-distributed, ~30% halo/sphere
      const isHalo = Math.random() < 0.3;
      if (isHalo) {
        // Spherical halo
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 100 + Math.random() * rangeX * 0.8;
        positions[idx * 3] = Math.sin(phi) * Math.cos(theta) * r;
        positions[idx * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r * 0.4;
        positions[idx * 3 + 2] = Math.cos(phi) * r;
      } else {
        // Disk distribution (more particles near center)
        const r = Math.pow(Math.random(), 0.5) * rangeX * 0.7;
        const theta = Math.random() * Math.PI * 2;
        positions[idx * 3] = Math.cos(theta) * r;
        positions[idx * 3 + 1] = (Math.random() - 0.5) * 30 * Math.exp(-r * 0.003);
        positions[idx * 3 + 2] = Math.sin(theta) * r;
      }

      // Dim warm colors for ambient
      const ambientCol = new THREE.Color(CHANNEL_PALETTE[Math.floor(Math.random() * CHANNEL_PALETTE.length)]);
      ambientCol.lerp(new THREE.Color(0.25, 0.2, 0.35), 0.5);
      colors[idx * 3] = ambientCol.r;
      colors[idx * 3 + 1] = ambientCol.g;
      colors[idx * 3 + 2] = ambientCol.b;

      phases[idx] = Math.random();
      sizes[idx] = isHalo ? (0.5 + Math.random() * 1.5) : (1 + Math.random() * 3);
      speeds[idx] = 0.5 + Math.random() * 1.5;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('aOrigin', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aBaseSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

    this._material = new THREE.ShaderMaterial({
      vertexShader: cosmosVert,
      fragmentShader: cosmosFrag,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uNovaPulse: { value: 0 },
        uAurora: { value: 0 },
        uWaveDirections: { value: new Float32Array(15) },
        uWaveSpeeds: { value: new Float32Array(5) },
        uWaveWidths: { value: new Float32Array(5) },
        uWaveOffsets: { value: new Float32Array(5) },
        uWaveHues: { value: new Float32Array(15) },
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
    this._novaTimer = 0;
    this._novaPulse = 0;

    this._build();

    // Hide normal graph
    this.nodeRenderer.mesh.visible = false;
    for (const m of this.nodeRenderer.channelMeshes) m.visible = false;
    this.edgeRenderer.setVisible(false);

    this._points.visible = true;

    if (this.postProcessing) {
      this._originalBloom = this.postProcessing.bloomPass.strength;
      this.postProcessing.bloomPass.strength = 1.8;
      if (this.postProcessing.afterimagePass) {
        this.postProcessing.afterimagePass.enabled = true;
        this.postProcessing.afterimagePass.uniforms['damp'].value = 0.92;
      }
    }

    document.getElementById('btn-cosmos').classList.add('active');
  }

  deactivate() {
    if (!this.active) return;
    this.active = false;

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

    document.getElementById('btn-cosmos').classList.remove('active');
  }

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
    this._progress = Math.min(1, this._progress + delta * 0.25);
    const smooth = this._progress * this._progress * (3 - 2 * this._progress);

    this._elapsed += delta;
    const t = this._elapsed;

    // ─── Supernova pulses ───
    this._novaTimer += delta;
    if (this._novaTimer > 12.0) {
      this._novaTimer = 0;
      this._novaPulse = 1.0;
    }
    // Rapid decay
    this._novaPulse *= Math.pow(0.04, delta);
    if (this._novaPulse < 0.001) this._novaPulse = 0;

    // Bloom surge during nova
    if (this.postProcessing) {
      this.postProcessing.bloomPass.strength = 1.8 + this._novaPulse * 2.0;
    }

    // Update uniforms
    this._material.uniforms.uTime.value = this._elapsed;
    this._material.uniforms.uProgress.value = smooth;
    this._material.uniforms.uNovaPulse.value = this._novaPulse;

    // Galaxy rotation + tilt wobble
    if (this._points) {
      this._points.rotation.y += delta * 0.02;
      this._points.rotation.x = Math.sin(t * 0.025) * 0.12;
      this._points.rotation.z = Math.cos(t * 0.018) * 0.05;
    }
  }
}
