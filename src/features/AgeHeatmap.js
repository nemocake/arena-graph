import { ageGradientColor } from '../utils/ColorUtils.js';

/**
 * Recolors nodes by creation timestamp gradient.
 */
export class AgeHeatmap {
  constructor(state, graphData, nodeRenderer) {
    this.state = state;
    this.graphData = graphData;
    this.nodeRenderer = nodeRenderer;

    this.legend = document.getElementById('age-legend');
    const btn = document.getElementById('btn-age');

    btn.addEventListener('click', () => {
      const active = !this.state.get('ageHeatmapActive');
      this.state.set('ageHeatmapActive', active);
    });

    state.on('ageHeatmapActive', (active) => {
      btn.classList.toggle('active', active);
      this.legend.classList.toggle('hidden', !active);
      if (active) this._apply();
      else this._clear();
    });
  }

  _apply() {
    const nr = this.nodeRenderer;
    const { blocks, minDate, maxDate } = this.graphData;
    const range = maxDate - minDate;

    if (range <= 0) return;

    // Update legend dates
    const oldEl = document.getElementById('age-old');
    const newEl = document.getElementById('age-new');
    if (oldEl) oldEl.textContent = new Date(minDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    if (newEl) newEl.textContent = new Date(maxDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

    for (let i = 0; i < blocks.length; i++) {
      const ts = blocks[i].ts || 0;
      const t = (ts - minDate) / range;
      const [r, g, b] = ageGradientColor(t);
      nr.setBlockColor(i, r, g, b);
      nr.setBlockOpacity(i, 0.7);
    }
    nr.commitAttributes();
  }

  _clear() {
    this.nodeRenderer.resetAttributes();
  }
}
