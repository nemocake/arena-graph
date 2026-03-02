import { hexToRgb } from '../utils/ColorUtils.js';

/**
 * Living mode — nodes breathe, drift, and shimmer.
 * CPU-side position offsets + attribute animation per frame.
 */
export class LivingMode {
  constructor(state, graphData, nodeRenderer, edgeRenderer, postProcessing) {
    this.state = state;
    this.graphData = graphData;
    this.nodeRenderer = nodeRenderer;
    this.edgeRenderer = edgeRenderer;
    this.postProcessing = postProcessing;

    this._active = false;
    this._elapsed = 0;
    this._basePositions = null; // snapshot of positions when activated
    this._baseChannelPositions = null;
    this._phaseOffsets = null;  // unique per node for desynchronized motion
    this._originalBloom = 0;

    // Pre-compute phase offsets (deterministic per block)
    this._phaseOffsets = new Float32Array(graphData.blocks.length);
    for (let i = 0; i < graphData.blocks.length; i++) {
      this._phaseOffsets[i] = (i * 2654435761 & 0xFFFF) / 0xFFFF * Math.PI * 2;
    }

  }

  start() {
    this._active = true;
    this._elapsed = 0;
    const nr = this.nodeRenderer;

    // Snapshot current positions as base
    this._basePositions = [];
    for (let i = 0; i < this.graphData.blocks.length; i++) {
      this._basePositions.push(nr.getBlockPosition(i));
    }
    this._baseChannelPositions = [];
    for (let i = 0; i < this.graphData.channels.length; i++) {
      this._baseChannelPositions.push(nr.getChannelPosition(i));
    }

    // Boost bloom
    if (this.postProcessing) {
      this._originalBloom = this.postProcessing.bloomPass.strength;
      this.postProcessing.bloomPass.strength = 0.7;
    }
  }

  stop() {
    this._active = false;
    const nr = this.nodeRenderer;

    // Restore base positions
    if (this._basePositions) {
      for (let i = 0; i < this._basePositions.length; i++) {
        const p = this._basePositions[i];
        nr.setBlockPosition(i, p.x, p.y, p.z);
      }
    }
    if (this._baseChannelPositions) {
      for (let i = 0; i < this._baseChannelPositions.length; i++) {
        const p = this._baseChannelPositions[i];
        nr.setChannelPosition(i, p.x, p.y, p.z);
      }
    }

    nr.commitPositions();
    nr.resetAttributes();
    this.edgeRenderer.updatePositions();
    this.edgeRenderer.resetColors();

    // Restore bloom
    if (this.postProcessing) {
      this.postProcessing.bloomPass.strength = this._originalBloom;
    }
  }

  update(delta) {
    if (!this._active || !this._basePositions) return;

    this._elapsed += delta;
    const t = this._elapsed;
    const nr = this.nodeRenderer;
    const gr = this.graphData;

    // --- Position drift: layered sine waves per node ---
    for (let i = 0; i < gr.blocks.length; i++) {
      const base = this._basePositions[i];
      const phase = this._phaseOffsets[i];

      // 3 layered sine waves at different frequencies for organic motion
      const dx = Math.sin(t * 0.4 + phase) * 12
               + Math.sin(t * 0.17 + phase * 2.3) * 8
               + Math.sin(t * 0.09 + phase * 0.7) * 20;

      const dy = Math.cos(t * 0.3 + phase * 1.4) * 10
               + Math.sin(t * 0.13 + phase * 3.1) * 6
               + Math.cos(t * 0.07 + phase * 0.5) * 15;

      const dz = Math.sin(t * 0.35 + phase * 0.9) * 12
               + Math.cos(t * 0.15 + phase * 2.7) * 8
               + Math.sin(t * 0.08 + phase * 1.3) * 20;

      nr.setBlockPosition(i, base.x + dx, base.y + dy, base.z + dz);
    }

    // Channels drift slower, more gently
    for (let i = 0; i < gr.channels.length; i++) {
      const base = this._baseChannelPositions[i];
      const phase = i * 1.618;
      const dx = Math.sin(t * 0.12 + phase) * 8;
      const dy = Math.cos(t * 0.1 + phase * 1.3) * 5;
      const dz = Math.sin(t * 0.14 + phase * 0.7) * 8;
      nr.setChannelPosition(i, base.x + dx, base.y + dy, base.z + dz);
    }

    nr.commitPositions();
    this.edgeRenderer.updatePositions();

    // --- Breathing: scale + opacity pulse per node ---
    for (let i = 0; i < gr.blocks.length; i++) {
      const phase = this._phaseOffsets[i];

      // Slow breathing — each node on its own cycle
      const breath = Math.sin(t * 0.6 + phase) * 0.5 + 0.5; // 0..1

      const baseScale = nr.originalScales[i];
      const baseOpacity = nr.originalOpacities[i];

      nr.setBlockScale(i, baseScale * (0.8 + breath * 0.8));
      nr.setBlockOpacity(i, baseOpacity * (0.6 + breath * 0.5));
    }

    // --- Color shimmer: subtle hue shift ---
    for (let i = 0; i < gr.blocks.length; i++) {
      const phase = this._phaseOffsets[i];
      const shimmer = Math.sin(t * 0.3 + phase * 1.7) * 0.15;

      const baseR = nr.originalColors[i * 3];
      const baseG = nr.originalColors[i * 3 + 1];
      const baseB = nr.originalColors[i * 3 + 2];

      // Shift toward complementary hues slightly
      nr.setBlockColor(
        i,
        Math.min(1, baseR + shimmer * (1 - baseR)),
        Math.min(1, baseG + shimmer * 0.5 * (1 - baseG)),
        Math.min(1, baseB - shimmer * 0.3 * baseB)
      );
    }

    nr.commitAttributes();

    // --- Edge color pulse: slow traveling wave ---
    const er = this.edgeRenderer;
    for (let ei = 0; ei < er.edgeCount; ei++) {
      const wave = Math.sin(t * 0.4 + ei * 0.02) * 0.5 + 0.5;
      const baseIdx = ei * 6;
      const brightness = 0.4 + wave * 0.6;
      er.colorArray[baseIdx]     = er.originalColors[baseIdx] * brightness;
      er.colorArray[baseIdx + 1] = er.originalColors[baseIdx + 1] * brightness;
      er.colorArray[baseIdx + 2] = er.originalColors[baseIdx + 2] * brightness;
      er.colorArray[baseIdx + 3] = er.originalColors[baseIdx + 3] * brightness;
      er.colorArray[baseIdx + 4] = er.originalColors[baseIdx + 4] * brightness;
      er.colorArray[baseIdx + 5] = er.originalColors[baseIdx + 5] * brightness;
    }
    er.lineSegments.geometry.getAttribute('color').needsUpdate = true;
  }

  get active() {
    return this._active;
  }
}
