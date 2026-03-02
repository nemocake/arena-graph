/**
 * NEBULA mode — interactive 3D particle cloud with mouse repulsion.
 *
 * Particles form a volumetric cloud that reacts to the cursor.
 * Moving the mouse near particles pushes them away like magnetic
 * repulsion. Particles drift back when the cursor moves away.
 * Mouse velocity creates a directional wake through the cloud.
 *
 * Fragment shader uses soft gaussian glow for a volumetric fog look.
 * Displaced particles warm in color, creating visible interaction trails.
 */

import * as THREE from 'three';
import { CHANNEL_PALETTE } from '../constants.js';

const AMBIENT_COUNT = 8000;

// ─── Vertex shader ───
const nebulaVert = `
uniform float uTime;
uniform float uProgress;
uniform vec3 uMouse;
uniform vec3 uMouseVel;
uniform float uMouseActive;

attribute vec3 aOrigin;
attribute vec3 aColor;
attribute float aPhase;
attribute float aBaseSize;
attribute float aSpeed;

varying vec3 vColor;
varying float vAlpha;
varying float vPush;

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

void main() {
  float prog = uProgress;
  float t = uTime;

  // ═══ BASE CLOUD POSITION ═══
  vec3 pos = aOrigin;

  // Gentle organic drift — slow multi-frequency noise
  float driftScale = 0.0025;
  float driftSpeed = 0.06 * aSpeed;

  vec3 drift1 = vec3(
    snoise(pos * driftScale + t * driftSpeed + aPhase * 10.0),
    snoise(pos * driftScale + t * driftSpeed + 100.0 + aPhase * 10.0),
    snoise(pos * driftScale + t * driftSpeed + 200.0 + aPhase * 10.0)
  ) * 35.0;

  vec3 drift2 = vec3(
    snoise(pos * driftScale * 3.0 + t * driftSpeed * 1.5 + 50.0),
    snoise(pos * driftScale * 3.0 + t * driftSpeed * 1.5 + 150.0),
    snoise(pos * driftScale * 3.0 + t * driftSpeed * 1.5 + 250.0)
  ) * 12.0;

  pos += (drift1 + drift2) * prog;

  // Slow breathing — expand/contract
  float breath = sin(t * 0.15 + aPhase * 6.283) * 0.5 + 0.5;
  float globalBreath = sin(t * 0.08) * 0.5 + 0.5;
  pos *= 1.0 + (breath * 0.03 + globalBreath * 0.02) * prog;

  // ═══ MOUSE REPULSION ═══
  vec3 toParticle = pos - uMouse;
  float dist = length(toParticle);

  float repulsionRadius = 280.0;
  float repulsion = max(0.0, 1.0 - dist / repulsionRadius);
  // Cubic falloff — smooth edges, strong center
  repulsion = repulsion * repulsion * repulsion;

  vec3 pushDir = normalize(toParticle + vec3(0.001));
  float pushStrength = repulsion * 200.0 * uMouseActive * prog;
  pos += pushDir * pushStrength;

  // Wake effect — mouse velocity drags nearby particles
  float wakeRadius = repulsionRadius * 1.3;
  float wakeInfluence = max(0.0, 1.0 - dist / wakeRadius);
  wakeInfluence = wakeInfluence * wakeInfluence;
  pos += uMouseVel * wakeInfluence * 0.4 * uMouseActive * prog;

  // Turbulence boost near mouse (stir particles)
  float stirRadius = repulsionRadius * 0.8;
  float stirAmount = max(0.0, 1.0 - dist / stirRadius) * uMouseActive;
  vec3 stir = vec3(
    snoise(pos * 0.008 + t * 0.3),
    snoise(pos * 0.008 + t * 0.3 + 77.0),
    snoise(pos * 0.008 + t * 0.3 + 144.0)
  ) * stirAmount * 40.0 * prog;
  pos += stir;

  // Track push amount for color shift
  float pushAmount = repulsion * uMouseActive;
  vPush = pushAmount;

  // ═══ COLOR ═══
  // Base: soft nebula colors from channel
  vec3 baseColor = aColor;

  // Depth-based tint — further from center = cooler
  float centerDist = length(pos) * 0.002;
  vec3 warmTint = vec3(1.0, 0.85, 0.7);
  vec3 coolTint = vec3(0.6, 0.7, 1.0);
  vec3 depthColor = mix(warmTint, coolTint, min(centerDist, 1.0));
  baseColor = mix(baseColor, depthColor, 0.3);

  // Pushed particles warm up (glow hot when displaced)
  vec3 pushColor = vec3(1.0, 0.7, 0.4);
  vColor = mix(baseColor, pushColor, pushAmount * 0.7);

  // ═══ ALPHA ═══
  float opacity = 0.25 + breath * 0.15;

  // Pushed particles brighten
  opacity += pushAmount * 0.4;

  // Edge fade — particles far from cloud center fade
  float edgeFade = 1.0 - smoothstep(300.0, 600.0, length(aOrigin));
  opacity *= max(edgeFade, 0.15);

  vAlpha = opacity * prog;

  // ═══ PROJECTION ═══
  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPos;

  float perspective = 300.0 / max(-mvPos.z, 1.0);
  float sizeBoost = 0.8 + breath * 0.4 + pushAmount * 1.2;
  gl_PointSize = max(aBaseSize * perspective * sizeBoost, 0.5);
}`;

// ─── Fragment shader — soft volumetric cloud ───
const nebulaFrag = `
varying vec3 vColor;
varying float vAlpha;
varying float vPush;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float dist = length(uv);

  // Soft gaussian core
  float core = exp(-dist * dist * 8.0);

  // Even softer outer halo
  float halo = exp(-dist * dist * 2.5) * 0.35;

  // Combine for volumetric feel
  float glow = max(core, halo);

  float alpha = glow * vAlpha;
  if (alpha < 0.003) discard;

  // Subtle inner brightening
  vec3 color = vColor * (1.0 + core * 0.25);

  // Pushed particles get a faint rim glow
  float rim = smoothstep(0.15, 0.35, dist) * smoothstep(0.5, 0.35, dist);
  color += rim * vec3(0.3, 0.5, 1.0) * vPush * 0.5;

  gl_FragColor = vec4(color * glow, alpha);
}`;


export class NebulaMode {
  constructor(sceneManager, graphData, nodeRenderer, edgeRenderer, cameraController, postProcessing) {
    this.scene = sceneManager.scene;
    this.camera = sceneManager.camera;
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

    // Mouse tracking
    this._mouseWorld = new THREE.Vector3(9999, 9999, 9999);
    this._mouseTarget = new THREE.Vector3(9999, 9999, 9999);
    this._mousePrev = new THREE.Vector3(9999, 9999, 9999);
    this._mouseVel = new THREE.Vector3();
    this._mouseActive = 0;
    this._mouseActiveTarget = 0;

    // Raycasting for mouse-to-3D
    this._raycaster = new THREE.Raycaster();
    this._plane = new THREE.Plane();
    this._intersection = new THREE.Vector3();
    this._ndcMouse = new THREE.Vector2();

    // Mouse event handlers
    this._container = document.getElementById('graph-container');
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseLeave = this._onMouseLeave.bind(this);

  }

  _onMouseMove(event) {
    if (!this.active) return;

    const rect = this._container.getBoundingClientRect();
    this._ndcMouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this._ndcMouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Cast ray from camera through mouse point
    this._raycaster.setFromCamera(this._ndcMouse, this.camera);

    // Intersect with a plane facing the camera at cloud center
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    this._plane.setFromNormalAndCoplanarPoint(camDir, new THREE.Vector3(0, 0, 0));

    if (this._raycaster.ray.intersectPlane(this._plane, this._intersection)) {
      this._mouseTarget.copy(this._intersection);
      this._mouseActiveTarget = 1;
    }
  }

  _onMouseLeave() {
    this._mouseActiveTarget = 0;
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

    // Compute centroid from block positions
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < blocks.length; i++) {
      const pos = this.nodeRenderer.getBlockPosition(i);
      cx += pos.x; cy += pos.y; cz += pos.z;
    }
    cx /= blocks.length; cy /= blocks.length; cz /= blocks.length;

    // Block particles — place at their graph positions (they'll drift into cloud shape)
    for (let i = 0; i < blocks.length; i++) {
      const pos = this.nodeRenderer.getBlockPosition(i);
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      const chIds = this.graphData.blockToChannelsMap[blocks[i].id] || [];
      const chIdx = (chIds[0] && this.graphData.channelIndexMap[chIds[0]]) || 0;
      const col = new THREE.Color(CHANNEL_PALETTE[chIdx % CHANNEL_PALETTE.length]);
      // Soften colors for nebula feel
      col.lerp(new THREE.Color(0.6, 0.5, 0.7), 0.3);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;

      phases[i] = Math.random();
      sizes[i] = 4 + Math.random() * 7;
      speeds[i] = 0.3 + Math.random() * 0.8;
    }

    // Define cloud clusters for organic shape
    const clusters = [
      { x: cx, y: cy, z: cz, radius: 350, weight: 0.4 },
      { x: cx + 180, y: cy + 60, z: cz - 80, radius: 200, weight: 0.2 },
      { x: cx - 150, y: cy - 40, z: cz + 120, radius: 220, weight: 0.15 },
      { x: cx + 50, y: cy + 150, z: cz + 100, radius: 180, weight: 0.1 },
      { x: cx - 100, y: cy - 120, z: cz - 140, radius: 160, weight: 0.08 },
      { x: cx + 200, y: cy - 80, z: cz + 200, radius: 140, weight: 0.07 },
    ];

    // Compute cumulative weights for weighted random selection
    const totalWeight = clusters.reduce((s, c) => s + c.weight, 0);
    const cumWeights = [];
    let cum = 0;
    for (const c of clusters) {
      cum += c.weight / totalWeight;
      cumWeights.push(cum);
    }

    // Nebula palette — dreamy pastels
    const nebulaPalette = [
      new THREE.Color(0.75, 0.55, 0.85), // lavender
      new THREE.Color(0.55, 0.65, 0.95), // periwinkle
      new THREE.Color(0.85, 0.50, 0.65), // rose
      new THREE.Color(0.50, 0.80, 0.85), // sky
      new THREE.Color(0.90, 0.75, 0.55), // peach
      new THREE.Color(0.65, 0.85, 0.70), // mint
      new THREE.Color(0.80, 0.60, 0.90), // orchid
    ];

    for (let i = 0; i < AMBIENT_COUNT; i++) {
      const idx = blocks.length + i;

      // Pick cluster by weight
      const r = Math.random();
      let clusterIdx = 0;
      for (let j = 0; j < cumWeights.length; j++) {
        if (r <= cumWeights[j]) { clusterIdx = j; break; }
      }
      const cluster = clusters[clusterIdx];

      // Spherical distribution — denser near center (power distribution)
      const radius = Math.pow(Math.random(), 0.4) * cluster.radius;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[idx * 3] = cluster.x + Math.sin(phi) * Math.cos(theta) * radius;
      positions[idx * 3 + 1] = cluster.y + Math.sin(phi) * Math.sin(theta) * radius * 0.7; // slightly flattened
      positions[idx * 3 + 2] = cluster.z + Math.cos(phi) * radius;

      // Pick from nebula palette with slight randomization
      const baseCol = nebulaPalette[Math.floor(Math.random() * nebulaPalette.length)].clone();
      // Mix with channel color for connection to graph
      const chCol = new THREE.Color(CHANNEL_PALETTE[Math.floor(Math.random() * CHANNEL_PALETTE.length)]);
      baseCol.lerp(chCol, 0.2);
      // Dim slightly for depth
      const dimFactor = 0.5 + Math.random() * 0.5;
      colors[idx * 3] = baseCol.r * dimFactor;
      colors[idx * 3 + 1] = baseCol.g * dimFactor;
      colors[idx * 3 + 2] = baseCol.b * dimFactor;

      phases[idx] = Math.random();
      sizes[idx] = 3 + Math.random() * 9;
      speeds[idx] = 0.2 + Math.random() * 1.0;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('aOrigin', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aBaseSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

    this._material = new THREE.ShaderMaterial({
      vertexShader: nebulaVert,
      fragmentShader: nebulaFrag,
      uniforms: {
        uTime: { value: 0 },
        uProgress: { value: 0 },
        uMouse: { value: new THREE.Vector3(9999, 9999, 9999) },
        uMouseVel: { value: new THREE.Vector3() },
        uMouseActive: { value: 0 },
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

    // Attach mouse listeners
    this._container.addEventListener('mousemove', this._onMouseMove);
    this._container.addEventListener('mouseleave', this._onMouseLeave);

    if (this.postProcessing) {
      this._originalBloom = this.postProcessing.bloomPass.strength;
      this.postProcessing.bloomPass.strength = 1.0;
      if (this.postProcessing.afterimagePass) {
        this.postProcessing.afterimagePass.enabled = true;
        this.postProcessing.afterimagePass.uniforms['damp'].value = 0.88;
      }
    }

  }

  deactivate() {
    if (!this.active) return;
    this.active = false;

    this.nodeRenderer.mesh.visible = true;
    for (const m of this.nodeRenderer.channelMeshes) m.visible = true;
    this.edgeRenderer.setVisible(true);

    if (this._points) this._points.visible = false;

    // Remove mouse listeners
    this._container.removeEventListener('mousemove', this._onMouseMove);
    this._container.removeEventListener('mouseleave', this._onMouseLeave);

    // Reset mouse state
    this._mouseWorld.set(9999, 9999, 9999);
    this._mouseTarget.set(9999, 9999, 9999);
    this._mouseActiveTarget = 0;
    this._mouseActive = 0;

    if (this.postProcessing) {
      this.postProcessing.bloomPass.strength = this._originalBloom;
      if (this.postProcessing.afterimagePass) {
        this.postProcessing.afterimagePass.enabled = false;
      }
    }

  }

  update(delta) {
    if (!this.active || !this._material) return;

    // Smooth ramp-in
    this._progress = Math.min(1, this._progress + delta * 0.3);
    const smooth = this._progress * this._progress * (3 - 2 * this._progress);

    this._elapsed += delta;

    // ─── Smooth mouse tracking ───
    const lerpSpeed = 1.0 - Math.pow(0.001, delta); // frame-rate independent lerp
    this._mousePrev.copy(this._mouseWorld);
    this._mouseWorld.lerp(this._mouseTarget, lerpSpeed * 0.85);

    // Mouse velocity (smoothed)
    this._mouseVel.subVectors(this._mouseWorld, this._mousePrev);
    this._mouseVel.multiplyScalar(1.0 / Math.max(delta, 0.001));
    // Clamp velocity magnitude
    const velMag = this._mouseVel.length();
    if (velMag > 2000) this._mouseVel.multiplyScalar(2000 / velMag);

    // Smooth mouse active state
    this._mouseActive += (this._mouseActiveTarget - this._mouseActive) * Math.min(lerpSpeed * 0.5, 1.0);

    // Update uniforms
    this._material.uniforms.uTime.value = this._elapsed;
    this._material.uniforms.uProgress.value = smooth;
    this._material.uniforms.uMouse.value.copy(this._mouseWorld);
    this._material.uniforms.uMouseVel.value.copy(this._mouseVel);
    this._material.uniforms.uMouseActive.value = this._mouseActive;

    // Very slow rotation for depth perception
    if (this._points) {
      this._points.rotation.y += delta * 0.008;
    }
  }
}
