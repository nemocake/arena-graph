/**
 * Aurora mode — customizable color light show across the graph.
 *
 * Modes: waves, chase, pulse, twinkle, rain
 * Presets: aurora, christmas, ocean, sunset, neon, mono, custom
 * Sliders: speed, brightness, spread, bloom
 */

// ─── Color presets (RGB 0-1) ───
const PRESETS = {
  aurora: [
    [0.1, 1.0, 0.4],   // green
    [0.0, 0.8, 1.0],   // cyan
    [0.3, 0.4, 1.0],   // blue-violet
    [0.9, 0.2, 0.8],   // magenta
    [0.1, 1.0, 0.8],   // mint
  ],
  christmas: [
    [1.0, 0.0, 0.0],   // red
    [0.0, 0.9, 0.2],   // green
    [1.0, 0.85, 0.0],  // gold
    [1.0, 1.0, 1.0],   // white
    [0.0, 0.9, 0.2],   // green again
  ],
  ocean: [
    [0.0, 0.2, 0.6],   // deep blue
    [0.0, 0.5, 0.8],   // mid blue
    [0.0, 0.8, 0.9],   // cyan
    [0.0, 1.0, 0.6],   // aqua
    [0.1, 0.3, 0.7],   // navy
  ],
  sunset: [
    [1.0, 0.3, 0.0],   // orange
    [1.0, 0.1, 0.3],   // hot pink
    [0.8, 0.0, 0.4],   // magenta
    [1.0, 0.6, 0.0],   // amber
    [0.6, 0.0, 0.6],   // purple
  ],
  neon: [
    [1.0, 0.0, 1.0],   // magenta
    [0.0, 1.0, 1.0],   // cyan
    [1.0, 1.0, 0.0],   // yellow
    [0.0, 1.0, 0.0],   // green
    [1.0, 0.2, 0.4],   // pink
  ],
  mono: [
    [0.8, 1.0, 0.0],   // acid
    [0.6, 0.8, 0.0],   // dark acid
    [1.0, 1.0, 0.4],   // light acid
    [0.4, 0.6, 0.0],   // olive
    [0.9, 1.0, 0.2],   // bright acid
  ],
};

const WAVE_COUNT = 5;

function hexToRgb01(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

function rgb01ToHex(rgb) {
  const r = Math.round(rgb[0] * 255).toString(16).padStart(2, '0');
  const g = Math.round(rgb[1] * 255).toString(16).padStart(2, '0');
  const b = Math.round(rgb[2] * 255).toString(16).padStart(2, '0');
  return '#' + r + g + b;
}

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

    // Settings
    this._mode = 'waves';
    this._preset = 'aurora';
    this._colors = PRESETS.aurora.map(c => [...c]);
    this._speed = 1.0;
    this._brightness = 0.7;
    this._spread = 0.5;
    this._bloomStrength = 0.8;

    // Per-node random seeds for twinkle mode
    this._twinkleSeeds = new Float32Array(graphData.blocks.length);
    for (let i = 0; i < this._twinkleSeeds.length; i++) {
      this._twinkleSeeds[i] = Math.random() * 1000;
    }

    // Waves
    this._waves = [];
    this._rebuildWaves();

    // ─── DOM wiring ───
    // Panel close
    const closeBtn = document.getElementById('aurora-panel-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.stop();
      });
    }

    // Mode buttons
    const modeContainer = document.getElementById('aurora-modes');
    if (modeContainer) {
      modeContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mode]');
        if (!btn) return;
        modeContainer.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._mode = btn.dataset.mode;
      });
    }

    // Preset buttons
    const presetContainer = document.getElementById('aurora-presets');
    if (presetContainer) {
      presetContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-preset]');
        if (!btn) return;
        presetContainer.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this._preset = btn.dataset.preset;

        const customPanel = document.getElementById('aurora-custom-colors');
        if (this._preset === 'custom') {
          customPanel.classList.remove('hidden');
          // Keep current custom colors
        } else {
          customPanel.classList.add('hidden');
          this._colors = PRESETS[this._preset].map(c => [...c]);
        }
        this._rebuildWaves();
        this._updateColorPreview();
        this._syncSwatchesToColors();
      });
    }

    // Custom color inputs
    const swatches = document.querySelectorAll('.aurora-color-input');
    swatches.forEach((input, i) => {
      input.addEventListener('input', (e) => {
        const rgb = hexToRgb01(e.target.value);
        this._colors[i] = rgb;
        input.parentElement.style.background = e.target.value;
        this._rebuildWaves();
        this._updateColorPreview();
      });
    });

    // Sliders
    this._bindSlider('aurora-speed', 'aurora-speed-val', (v) => {
      this._speed = v / 100;
      return this._speed.toFixed(1) + '\u00d7';
    });

    this._bindSlider('aurora-brightness', 'aurora-brightness-val', (v) => {
      this._brightness = v / 100;
      return Math.round(v) + '%';
    });

    this._bindSlider('aurora-spread', 'aurora-spread-val', (v) => {
      this._spread = v / 100;
      this._rebuildWaves();
      return Math.round(v) + '%';
    });

    this._bindSlider('aurora-bloom', 'aurora-bloom-val', (v) => {
      this._bloomStrength = v / 100;
      if (this._active && this.postProcessing) {
        this.postProcessing.bloomPass.strength = this._bloomStrength;
      }
      return Math.round(v) + '%';
    });

    this._updateColorPreview();
  }

  _bindSlider(sliderId, labelId, onChange) {
    const slider = document.getElementById(sliderId);
    const label = document.getElementById(labelId);
    if (!slider) return;
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      label.textContent = onChange(val);
    });
  }

  _rebuildWaves() {
    this._waves = [];
    for (let i = 0; i < WAVE_COUNT; i++) {
      const spreadScale = 0.3 + this._spread * 1.4;
      this._waves.push({
        dx: Math.cos(i * 1.256) * Math.cos(i * 0.7),
        dy: Math.sin(i * 0.7) * 0.3,
        dz: Math.sin(i * 1.256) * Math.cos(i * 0.4),
        speed: 80 + i * 35,
        width: (250 + i * 60) * spreadScale,
        offset: i * 400,
        hue: this._colors[i % this._colors.length],
      });
    }
  }

  _updateColorPreview() {
    const preview = document.getElementById('aurora-color-preview');
    if (!preview) return;
    const hexColors = this._colors.map(c => rgb01ToHex(c));
    preview.style.background = `linear-gradient(90deg, ${hexColors.join(', ')}, ${hexColors[0]})`;
  }

  _syncSwatchesToColors() {
    const inputs = document.querySelectorAll('.aurora-color-input');
    inputs.forEach((input, i) => {
      if (this._colors[i]) {
        const hex = rgb01ToHex(this._colors[i]);
        input.value = hex;
        input.parentElement.style.background = hex;
      }
    });
  }

  start() {
    this._active = true;
    this._elapsed = 0;
    const panel = document.getElementById('aurora-panel');
    if (panel) panel.classList.remove('hidden');

    if (this.postProcessing) {
      this._originalBloom = this.postProcessing.bloomPass.strength;
      this.postProcessing.bloomPass.strength = this._bloomStrength;
    }
  }

  stop() {
    this._active = false;
    const panel = document.getElementById('aurora-panel');
    if (panel) panel.classList.add('hidden');

    this.nodeRenderer.resetAttributes();
    this.edgeRenderer.resetColors();

    if (this.postProcessing) {
      this.postProcessing.bloomPass.strength = this._originalBloom;
    }
  }

  update(delta) {
    if (!this._active) return;

    this._elapsed += delta * this._speed;
    const t = this._elapsed;
    const nr = this.nodeRenderer;
    const gr = this.graphData;
    const er = this.edgeRenderer;
    const brightness = this._brightness;

    // Dispatch to mode
    switch (this._mode) {
      case 'waves':   this._updateWaves(t, nr, gr, brightness); break;
      case 'chase':   this._updateChase(t, nr, gr, brightness); break;
      case 'pulse':   this._updatePulse(t, nr, gr, brightness); break;
      case 'twinkle': this._updateTwinkle(t, nr, gr, brightness, delta); break;
      case 'rain':    this._updateRain(t, nr, gr, brightness); break;
      default:        this._updateWaves(t, nr, gr, brightness);
    }

    nr.commitAttributes();

    // Edges pick up aurora color from their target block
    for (let ei = 0; ei < er.edgeCount; ei++) {
      const edge = gr.edges[ei];
      const blIdx = gr.blockIndexMap[edge.target];
      const baseIdx = ei * 6;

      if (blIdx !== undefined) {
        const r = nr.colorAttr[blIdx * 3];
        const g = nr.colorAttr[blIdx * 3 + 1];
        const b = nr.colorAttr[blIdx * 3 + 2];
        const opacity = nr.opacityAttr[blIdx];
        const edgeBright = opacity * 0.6;

        er.colorArray[baseIdx]     = r * edgeBright;
        er.colorArray[baseIdx + 1] = g * edgeBright;
        er.colorArray[baseIdx + 2] = b * edgeBright;
        er.colorArray[baseIdx + 3] = r * edgeBright;
        er.colorArray[baseIdx + 4] = g * edgeBright;
        er.colorArray[baseIdx + 5] = b * edgeBright;
      }
    }
    er.lineSegments.geometry.getAttribute('color').needsUpdate = true;
  }

  // ─── WAVES: Original aurora waves sweeping through 3D space ───
  _updateWaves(t, nr, gr, brightness) {
    for (let i = 0; i < gr.blocks.length; i++) {
      const pos = nr.getBlockPosition(i);
      let totalR = 0, totalG = 0, totalB = 0, totalIntensity = 0;

      for (const wave of this._waves) {
        const projected = pos.x * wave.dx + pos.y * wave.dy + pos.z * wave.dz;
        const waveFront = wave.offset + t * wave.speed;
        const dist = projected - waveFront;
        const phase = (dist / wave.width) * Math.PI * 2;
        const intensity = Math.max(0, Math.cos(phase) * 0.5 + 0.5);
        const shaped = intensity * intensity;

        totalR += wave.hue[0] * shaped;
        totalG += wave.hue[1] * shaped;
        totalB += wave.hue[2] * shaped;
        totalIntensity += shaped;
      }

      const baseR = nr.originalColors[i * 3] * 0.15;
      const baseG = nr.originalColors[i * 3 + 1] * 0.15;
      const baseB = nr.originalColors[i * 3 + 2] * 0.15;
      const auroraStrength = Math.min(totalIntensity, 1.5);

      nr.setBlockColor(i,
        Math.min(1, baseR + totalR * brightness),
        Math.min(1, baseG + totalG * brightness),
        Math.min(1, baseB + totalB * brightness)
      );
      nr.setBlockScale(i, nr.originalScales[i] * (0.5 + auroraStrength * 1.0));
      nr.setBlockOpacity(i, 0.15 + auroraStrength * 0.7);
    }
  }

  // ─── CHASE: Colors chase around like string lights ───
  _updateChase(t, nr, gr, brightness) {
    const colorCount = this._colors.length;
    const chaseSpeed = t * 3.0;

    for (let i = 0; i < gr.blocks.length; i++) {
      // Each node gets assigned to a color based on its index, shifting over time
      const phase = (i * 0.15 + chaseSpeed) % colorCount;
      const colorIdx = Math.floor(phase) % colorCount;
      const nextIdx = (colorIdx + 1) % colorCount;
      const blend = phase - Math.floor(phase);

      // Smooth blend between adjacent colors
      const c1 = this._colors[colorIdx];
      const c2 = this._colors[nextIdx];
      const r = c1[0] * (1 - blend) + c2[0] * blend;
      const g = c1[1] * (1 - blend) + c2[1] * blend;
      const b = c1[2] * (1 - blend) + c2[2] * blend;

      // Pulsing brightness per-node for sparkle
      const sparkle = 0.6 + 0.4 * Math.sin(i * 2.37 + t * 5.0);

      nr.setBlockColor(i,
        Math.min(1, r * brightness * sparkle),
        Math.min(1, g * brightness * sparkle),
        Math.min(1, b * brightness * sparkle)
      );
      nr.setBlockScale(i, nr.originalScales[i] * (0.6 + sparkle * 0.8));
      nr.setBlockOpacity(i, 0.3 + sparkle * 0.6);
    }
  }

  // ─── PULSE: All nodes breathe together in sync, cycling colors ───
  _updatePulse(t, nr, gr, brightness) {
    const colorCount = this._colors.length;
    const cyclePhase = (t * 0.5) % colorCount;
    const colorIdx = Math.floor(cyclePhase) % colorCount;
    const nextIdx = (colorIdx + 1) % colorCount;
    const blend = cyclePhase - Math.floor(cyclePhase);

    const c1 = this._colors[colorIdx];
    const c2 = this._colors[nextIdx];
    const cr = c1[0] * (1 - blend) + c2[0] * blend;
    const cg = c1[1] * (1 - blend) + c2[1] * blend;
    const cb = c1[2] * (1 - blend) + c2[2] * blend;

    // Global pulse
    const pulse = 0.3 + 0.7 * (Math.sin(t * 2.5) * 0.5 + 0.5);

    for (let i = 0; i < gr.blocks.length; i++) {
      nr.setBlockColor(i,
        Math.min(1, cr * brightness * pulse),
        Math.min(1, cg * brightness * pulse),
        Math.min(1, cb * brightness * pulse)
      );
      nr.setBlockScale(i, nr.originalScales[i] * (0.5 + pulse * 1.0));
      nr.setBlockOpacity(i, 0.2 + pulse * 0.7);
    }
  }

  // ─── TWINKLE: Random nodes light up like fairy lights ───
  _updateTwinkle(t, nr, gr, brightness) {
    const colorCount = this._colors.length;

    for (let i = 0; i < gr.blocks.length; i++) {
      const seed = this._twinkleSeeds[i];
      // Each node twinkles at its own frequency
      const freq = 1.5 + (seed % 3) * 0.8;
      const twinkle = Math.max(0, Math.sin(t * freq + seed) * 0.8 + 0.2);
      const on = twinkle > 0.3;

      if (on) {
        const c = this._colors[Math.floor(seed) % colorCount];
        const intensity = twinkle * twinkle;

        nr.setBlockColor(i,
          Math.min(1, c[0] * brightness * intensity),
          Math.min(1, c[1] * brightness * intensity),
          Math.min(1, c[2] * brightness * intensity)
        );
        nr.setBlockScale(i, nr.originalScales[i] * (0.4 + intensity * 1.2));
        nr.setBlockOpacity(i, intensity * 0.9);
      } else {
        nr.setBlockColor(i,
          nr.originalColors[i * 3] * 0.08,
          nr.originalColors[i * 3 + 1] * 0.08,
          nr.originalColors[i * 3 + 2] * 0.08
        );
        nr.setBlockScale(i, nr.originalScales[i] * 0.4);
        nr.setBlockOpacity(i, 0.08);
      }
    }
  }

  // ─── RAIN: Colors rain down the Y axis ───
  _updateRain(t, nr, gr, brightness) {
    const colorCount = this._colors.length;
    const spreadScale = 0.3 + this._spread * 1.4;
    const dropSpacing = 300 * spreadScale;

    for (let i = 0; i < gr.blocks.length; i++) {
      const pos = nr.getBlockPosition(i);
      // Drops fall along Y axis, with X offset for variation
      const dropPhase = (pos.y + t * 200 + pos.x * 0.3) / dropSpacing;
      const dropFrac = dropPhase - Math.floor(dropPhase);

      // Sharp bright peak as the "drop" passes
      const dropIntensity = Math.max(0, 1.0 - dropFrac * 3.0);
      const shaped = dropIntensity * dropIntensity;

      const colorPhase = (Math.floor(dropPhase) + Math.floor(pos.x * 0.01)) % colorCount;
      const c = this._colors[Math.abs(colorPhase) % colorCount];

      if (shaped > 0.01) {
        nr.setBlockColor(i,
          Math.min(1, c[0] * brightness * shaped),
          Math.min(1, c[1] * brightness * shaped),
          Math.min(1, c[2] * brightness * shaped)
        );
        nr.setBlockScale(i, nr.originalScales[i] * (0.4 + shaped * 1.2));
        nr.setBlockOpacity(i, 0.1 + shaped * 0.8);
      } else {
        nr.setBlockColor(i,
          nr.originalColors[i * 3] * 0.06,
          nr.originalColors[i * 3 + 1] * 0.06,
          nr.originalColors[i * 3 + 2] * 0.06
        );
        nr.setBlockScale(i, nr.originalScales[i] * 0.4);
        nr.setBlockOpacity(i, 0.06);
      }
    }
  }

  get active() {
    return this._active;
  }

  /** Expose wave data for dream mode integration */
  get waves() {
    return this._waves;
  }
}
