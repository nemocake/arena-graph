/**
 * Aurora mode — color waves sweep across the graph based on position and time,
 * like northern lights rolling through the network.
 *
 * Multiple overlapping wave fronts travel through 3D space,
 * each carrying a different hue. Where waves overlap, colors blend.
 * Node brightness pulses with the wave intensity.
 * Edges inherit the aurora color of their connected block.
 */

const WAVE_COUNT = 5;

// Aurora palette — ethereal colors
const AURORA_HUES = [
  [0.1, 1.0, 0.4],   // green
  [0.0, 0.8, 1.0],   // cyan
  [0.3, 0.4, 1.0],   // blue-violet
  [0.9, 0.2, 0.8],   // magenta
  [0.1, 1.0, 0.8],   // mint
];

export class AuroraMode {
  constructor(state, graphData, nodeRenderer, edgeRenderer, postProcessing) {
    this.state = state;
    this.graphData = graphData;
    this.nodeRenderer = nodeRenderer;
    this.edgeRenderer = edgeRenderer;
    this.postProcessing = postProcessing;

    this._active = false;
    this._elapsed = 0;
    this._originalBloom = 0;

    // Pre-compute normalized position along longest axis for each block
    // This gives each node a "spatial coordinate" the waves travel along
    this._spatialCoords = new Float32Array(graphData.blocks.length);

    // Waves: each has direction, speed, width, hue
    this._waves = [];
    for (let i = 0; i < WAVE_COUNT; i++) {
      this._waves.push({
        // Random 3D direction (normalized)
        dx: Math.cos(i * 1.256) * Math.cos(i * 0.7),
        dy: Math.sin(i * 0.7) * 0.3,
        dz: Math.sin(i * 1.256) * Math.cos(i * 0.4),
        speed: 80 + i * 35,       // units per second
        width: 250 + i * 60,      // wave width in world units
        offset: i * 400,          // starting offset so waves are staggered
        hue: AURORA_HUES[i % AURORA_HUES.length],
      });
    }

    const btn = document.getElementById('btn-aurora');
    btn.addEventListener('click', () => {
      if (this._active) this.stop();
      else this.start();
    });
  }

  start() {
    this._active = true;
    this._elapsed = 0;
    document.getElementById('btn-aurora').classList.add('active');

    if (this.postProcessing) {
      this._originalBloom = this.postProcessing.bloomPass.strength;
      this.postProcessing.bloomPass.strength = 0.8;
    }
  }

  stop() {
    this._active = false;
    document.getElementById('btn-aurora').classList.remove('active');

    this.nodeRenderer.resetAttributes();
    this.edgeRenderer.resetColors();

    if (this.postProcessing) {
      this.postProcessing.bloomPass.strength = this._originalBloom;
    }
  }

  update(delta) {
    if (!this._active) return;

    this._elapsed += delta;
    const t = this._elapsed;
    const nr = this.nodeRenderer;
    const gr = this.graphData;
    const er = this.edgeRenderer;

    // --- Compute aurora color per block ---
    for (let i = 0; i < gr.blocks.length; i++) {
      const pos = nr.getBlockPosition(i);

      // Accumulate wave contributions
      let totalR = 0, totalG = 0, totalB = 0;
      let totalIntensity = 0;

      for (const wave of this._waves) {
        // Project node position onto wave direction
        const projected = pos.x * wave.dx + pos.y * wave.dy + pos.z * wave.dz;

        // Wave front position moves over time
        const waveFront = wave.offset + t * wave.speed;

        // Distance from wave front (wrapping with sin for continuous waves)
        const dist = projected - waveFront;
        const phase = (dist / wave.width) * Math.PI * 2;

        // Smooth wave shape: raised cosine
        const intensity = Math.max(0, Math.cos(phase) * 0.5 + 0.5);
        const shaped = intensity * intensity; // sharpen the peak

        totalR += wave.hue[0] * shaped;
        totalG += wave.hue[1] * shaped;
        totalB += wave.hue[2] * shaped;
        totalIntensity += shaped;
      }

      // Blend aurora color with a dark base
      const baseR = nr.originalColors[i * 3] * 0.15;
      const baseG = nr.originalColors[i * 3 + 1] * 0.15;
      const baseB = nr.originalColors[i * 3 + 2] * 0.15;

      const auroraStrength = Math.min(totalIntensity, 1.5);

      nr.setBlockColor(
        i,
        Math.min(1, baseR + totalR * 0.7),
        Math.min(1, baseG + totalG * 0.7),
        Math.min(1, baseB + totalB * 0.7)
      );

      // Scale and opacity driven by wave intensity
      nr.setBlockScale(i, nr.originalScales[i] * (0.5 + auroraStrength * 1.0));
      nr.setBlockOpacity(i, 0.15 + auroraStrength * 0.7);
    }

    nr.commitAttributes();

    // --- Edges pick up aurora color from their target block ---
    for (let ei = 0; ei < er.edgeCount; ei++) {
      const edge = gr.edges[ei];
      const blIdx = gr.blockIndexMap[edge.target];
      const baseIdx = ei * 6;

      if (blIdx !== undefined) {
        const r = nr.colorAttr[blIdx * 3];
        const g = nr.colorAttr[blIdx * 3 + 1];
        const b = nr.colorAttr[blIdx * 3 + 2];
        const opacity = nr.opacityAttr[blIdx];
        const brightness = opacity * 0.6;

        er.colorArray[baseIdx]     = r * brightness;
        er.colorArray[baseIdx + 1] = g * brightness;
        er.colorArray[baseIdx + 2] = b * brightness;
        er.colorArray[baseIdx + 3] = r * brightness;
        er.colorArray[baseIdx + 4] = g * brightness;
        er.colorArray[baseIdx + 5] = b * brightness;
      }
    }
    er.lineSegments.geometry.getAttribute('color').needsUpdate = true;
  }

  get active() {
    return this._active;
  }
}
