import * as THREE from 'three';
import particleVert from '../shaders/particle.vert';
import particleFrag from '../shaders/particle.frag';

/**
 * Synaptic mode — signals fire through the real network topology.
 *
 * Chain reactions propagate through actual connections:
 * a node fires, sends particles along edges to neighbors,
 * which fire in turn, creating cascading waves through the graph.
 *
 * Firing rate driven by connection count — hubs ignite more.
 * Cross-linked nodes act as bridges between channel clusters.
 * Node type affects particle color temperature.
 */

const MAX_PARTICLES = 8000;
const MAX_SIGNALS = 300;
const SIGNAL_SPEED = 280;        // units per second
const FIRE_DURATION = 0.6;       // how long a node stays "fired"
const CHAIN_PROBABILITY = 0.35;  // chance a fired node triggers neighbors
const SPONTANEOUS_RATE = 3;      // new spontaneous fires per second

export class SynapticMode {
  constructor(state, graphData, nodeRenderer, edgeRenderer, postProcessing, scene) {
    this.state = state;
    this.graphData = graphData;
    this.nodeRenderer = nodeRenderer;
    this.edgeRenderer = edgeRenderer;
    this.postProcessing = postProcessing;
    this.scene = scene;

    this._active = false;
    this._elapsed = 0;
    this._originalBloom = 0;

    // Particle pool
    this._positions = new Float32Array(MAX_PARTICLES * 3);
    this._colors = new Float32Array(MAX_PARTICLES * 3);
    this._lives = new Float32Array(MAX_PARTICLES);
    this._velocities = new Float32Array(MAX_PARTICLES * 3); // direction
    this._particleCount = 0;

    // Signal pool: particles traveling along a specific edge
    this._signals = [];

    // Per-node fire state
    this._fireTimes = new Float32Array(graphData.blocks.length).fill(-10);

    // Pre-compute block neighbor indices for fast lookup
    this._blockNeighbors = [];
    for (let i = 0; i < graphData.blocks.length; i++) {
      const b = graphData.blocks[i];
      const chs = graphData.blockToChannelsMap[b.id] || [];
      const neighbors = new Set();
      for (const chId of chs) {
        const adj = graphData.adjacency[chId] || [];
        for (const nId of adj) {
          const idx = graphData.blockIndexMap[nId];
          if (idx !== undefined && idx !== i) neighbors.add(idx);
        }
      }
      this._blockNeighbors.push([...neighbors]);
    }

    // Connection count per block (drives fire intensity)
    this._connectionCounts = this._blockNeighbors.map(n => n.length);
    this._maxConnections = Math.max(1, ...this._connectionCounts);

    // Build particle mesh
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this._positions, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this._colors, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(this._lives, 1));

    this._material = new THREE.ShaderMaterial({
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this._points = new THREE.Points(geo, this._material);
    this._points.frustumCulled = false;
    this._points.visible = false;

    scene.add(this._points);

    // Button
    const btn = document.getElementById('btn-synaptic');
    btn.addEventListener('click', () => {
      if (this._active) this.stop();
      else this.start();
    });
  }

  start() {
    this._active = true;
    this._elapsed = 0;
    this._particleCount = 0;
    this._signals = [];
    this._fireTimes.fill(-10);
    this._points.visible = true;
    document.getElementById('btn-synaptic').classList.add('active');

    // Boost bloom hard
    if (this.postProcessing) {
      this._originalBloom = this.postProcessing.bloomPass.strength;
      this.postProcessing.bloomPass.strength = 0.9;
    }
  }

  stop() {
    this._active = false;
    this._points.visible = false;
    document.getElementById('btn-synaptic').classList.remove('active');

    this.nodeRenderer.resetAttributes();
    this.edgeRenderer.resetColors();

    if (this.postProcessing) {
      this.postProcessing.bloomPass.strength = this._originalBloom;
    }
  }

  _fireNode(blockIdx) {
    this._fireTimes[blockIdx] = this._elapsed;
  }

  _spawnSignal(fromIdx, toIdx) {
    if (this._signals.length >= MAX_SIGNALS) return;

    const fromPos = this.nodeRenderer.getBlockPosition(fromIdx);
    const toPos = this.nodeRenderer.getBlockPosition(toIdx);

    // Color from source block
    const nr = this.nodeRenderer;
    const r = nr.originalColors[fromIdx * 3];
    const g = nr.originalColors[fromIdx * 3 + 1];
    const b = nr.originalColors[fromIdx * 3 + 2];

    this._signals.push({
      fromIdx,
      toIdx,
      sx: fromPos.x, sy: fromPos.y, sz: fromPos.z,
      tx: toPos.x, ty: toPos.y, tz: toPos.z,
      r, g, b,
      progress: 0,
      speed: SIGNAL_SPEED * (0.7 + Math.random() * 0.6),
    });
  }

  _emitParticle(x, y, z, r, g, b, vx, vy, vz) {
    if (this._particleCount >= MAX_PARTICLES) {
      // Recycle oldest
      this._particleCount = 0;
    }
    const i = this._particleCount++;
    this._positions[i * 3] = x;
    this._positions[i * 3 + 1] = y;
    this._positions[i * 3 + 2] = z;
    this._colors[i * 3] = r;
    this._colors[i * 3 + 1] = g;
    this._colors[i * 3 + 2] = b;
    this._lives[i] = 1.0;
    this._velocities[i * 3] = vx;
    this._velocities[i * 3 + 1] = vy;
    this._velocities[i * 3 + 2] = vz;
  }

  update(delta) {
    if (!this._active) return;

    this._elapsed += delta;
    const t = this._elapsed;
    const nr = this.nodeRenderer;
    const gr = this.graphData;

    // --- Spontaneous firing ---
    const firesToSpawn = Math.floor(SPONTANEOUS_RATE * delta * 10);
    for (let f = 0; f < firesToSpawn; f++) {
      if (Math.random() < SPONTANEOUS_RATE * delta) {
        // Weight toward highly connected nodes
        let idx;
        if (Math.random() < 0.6) {
          // Pick a connected node
          const candidates = [];
          for (let i = 0; i < gr.blocks.length; i++) {
            if (this._connectionCounts[i] > 3) candidates.push(i);
          }
          idx = candidates[Math.floor(Math.random() * candidates.length)] || 0;
        } else {
          idx = Math.floor(Math.random() * gr.blocks.length);
        }
        this._fireNode(idx);

        // Send signals to random subset of neighbors
        const neighbors = this._blockNeighbors[idx];
        const maxSend = Math.min(neighbors.length, 5);
        const shuffled = [...neighbors].sort(() => Math.random() - 0.5);
        for (let i = 0; i < maxSend; i++) {
          this._spawnSignal(idx, shuffled[i]);
        }
      }
    }

    // --- Update signals (particles traveling along edges) ---
    for (let i = this._signals.length - 1; i >= 0; i--) {
      const s = this._signals[i];
      const dx = s.tx - s.sx;
      const dy = s.ty - s.sy;
      const dz = s.tz - s.sz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 1) {
        this._signals.splice(i, 1);
        continue;
      }

      s.progress += (s.speed * delta) / dist;

      // Emit trail particles along the path
      const px = s.sx + dx * s.progress;
      const py = s.sy + dy * s.progress;
      const pz = s.sz + dz * s.progress;

      // Trail: emit with slight perpendicular scatter
      const scatter = 3;
      this._emitParticle(
        px + (Math.random() - 0.5) * scatter,
        py + (Math.random() - 0.5) * scatter,
        pz + (Math.random() - 0.5) * scatter,
        s.r, s.g, s.b,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8
      );

      // Signal arrived
      if (s.progress >= 1.0) {
        this._fireNode(s.toIdx);

        // Burst particles at arrival
        for (let p = 0; p < 6; p++) {
          const angle = Math.random() * Math.PI * 2;
          const elev = (Math.random() - 0.5) * Math.PI;
          const speed = 20 + Math.random() * 40;
          this._emitParticle(
            s.tx, s.ty, s.tz,
            s.r * 1.5, s.g * 1.5, s.b * 1.5,
            Math.cos(angle) * Math.cos(elev) * speed,
            Math.sin(elev) * speed,
            Math.sin(angle) * Math.cos(elev) * speed
          );
        }

        // Chain reaction — fire onward
        if (Math.random() < CHAIN_PROBABILITY) {
          const neighbors = this._blockNeighbors[s.toIdx];
          if (neighbors.length > 0) {
            // Pick 1-3 neighbors, avoid sending back
            const candidates = neighbors.filter(n => n !== s.fromIdx);
            const count = Math.min(candidates.length, 1 + Math.floor(Math.random() * 2));
            const shuffled = [...candidates].sort(() => Math.random() - 0.5);
            for (let c = 0; c < count; c++) {
              this._spawnSignal(s.toIdx, shuffled[c]);
            }
          }
        }

        this._signals.splice(i, 1);
      }
    }

    // --- Update particles (drift + decay) ---
    for (let i = 0; i < this._particleCount; i++) {
      this._lives[i] -= delta * 1.2;
      if (this._lives[i] <= 0) {
        this._lives[i] = 0;
        continue;
      }
      this._positions[i * 3] += this._velocities[i * 3] * delta;
      this._positions[i * 3 + 1] += this._velocities[i * 3 + 1] * delta;
      this._positions[i * 3 + 2] += this._velocities[i * 3 + 2] * delta;

      // Slow down
      this._velocities[i * 3] *= 0.96;
      this._velocities[i * 3 + 1] *= 0.96;
      this._velocities[i * 3 + 2] *= 0.96;
    }

    // Commit particle buffers
    const geo = this._points.geometry;
    geo.getAttribute('position').needsUpdate = true;
    geo.getAttribute('aLife').needsUpdate = true;
    geo.getAttribute('aColor').needsUpdate = true;
    geo.setDrawRange(0, this._particleCount);

    // --- Node visuals: fired nodes flash bright ---
    for (let i = 0; i < gr.blocks.length; i++) {
      const timeSinceFire = t - this._fireTimes[i];

      if (timeSinceFire < FIRE_DURATION) {
        // Flash: bright scale + opacity
        const flash = 1.0 - (timeSinceFire / FIRE_DURATION);
        const eased = flash * flash; // ease out
        nr.setBlockScale(i, nr.originalScales[i] * (1.0 + eased * 2.0));
        nr.setBlockOpacity(i, Math.min(1.0, nr.originalOpacities[i] + eased * 0.6));

        // Brighten color
        nr.setBlockColor(
          i,
          Math.min(1, nr.originalColors[i * 3] + eased * 0.5),
          Math.min(1, nr.originalColors[i * 3 + 1] + eased * 0.5),
          Math.min(1, nr.originalColors[i * 3 + 2] + eased * 0.5)
        );
      } else {
        // Dim resting state — the network sleeps until fired
        const restPulse = Math.sin(t * 0.5 + i * 0.01) * 0.05;
        nr.setBlockScale(i, nr.originalScales[i] * (0.6 + restPulse));
        nr.setBlockOpacity(i, nr.originalOpacities[i] * (0.3 + restPulse));
        nr.setBlockColor(
          i,
          nr.originalColors[i * 3] * 0.4,
          nr.originalColors[i * 3 + 1] * 0.4,
          nr.originalColors[i * 3 + 2] * 0.4
        );
      }
    }
    nr.commitAttributes();

    // --- Edge glow: edges connected to recently fired nodes glow ---
    const er = this.edgeRenderer;
    for (let ei = 0; ei < er.edgeCount; ei++) {
      const edge = gr.edges[ei];
      const blIdx = gr.blockIndexMap[edge.target];
      const baseIdx = ei * 6;

      if (blIdx !== undefined) {
        const timeSinceFire = t - this._fireTimes[blIdx];
        if (timeSinceFire < FIRE_DURATION * 1.5) {
          const glow = 1.0 - (timeSinceFire / (FIRE_DURATION * 1.5));
          const brightness = 0.2 + glow * 2.0;
          er.colorArray[baseIdx]     = er.originalColors[baseIdx] * brightness;
          er.colorArray[baseIdx + 1] = er.originalColors[baseIdx + 1] * brightness;
          er.colorArray[baseIdx + 2] = er.originalColors[baseIdx + 2] * brightness;
          er.colorArray[baseIdx + 3] = er.originalColors[baseIdx + 3] * brightness;
          er.colorArray[baseIdx + 4] = er.originalColors[baseIdx + 4] * brightness;
          er.colorArray[baseIdx + 5] = er.originalColors[baseIdx + 5] * brightness;
        } else {
          er.colorArray[baseIdx]     = er.originalColors[baseIdx] * 0.15;
          er.colorArray[baseIdx + 1] = er.originalColors[baseIdx + 1] * 0.15;
          er.colorArray[baseIdx + 2] = er.originalColors[baseIdx + 2] * 0.15;
          er.colorArray[baseIdx + 3] = er.originalColors[baseIdx + 3] * 0.15;
          er.colorArray[baseIdx + 4] = er.originalColors[baseIdx + 4] * 0.15;
          er.colorArray[baseIdx + 5] = er.originalColors[baseIdx + 5] * 0.15;
        }
      }
    }
    er.lineSegments.geometry.getAttribute('color').needsUpdate = true;
  }

  get active() {
    return this._active;
  }
}
