/**
 * DOM modal with collection statistics bar charts.
 */
export class StatsPanel {
  constructor(state, graphData) {
    this.state = state;
    this.graphData = graphData;

    this.modal = document.getElementById('stats-modal');
    this.content = document.getElementById('stats-content');
    this.closeBtn = document.getElementById('stats-close');

    const btn = document.getElementById('btn-stats');
    btn.addEventListener('click', () => {
      const open = !this.state.get('statsOpen');
      this.state.set('statsOpen', open);
    });

    this.closeBtn.addEventListener('click', () => this.state.set('statsOpen', false));
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.state.set('statsOpen', false);
    });

    state.on('statsOpen', (open) => {
      btn.classList.toggle('active', open);
      this.modal.classList.toggle('hidden', !open);
      if (open) this._render();
    });
  }

  _render() {
    const gr = this.graphData;
    const { blocks, typeCounts, autoTagIndex, meta } = gr;

    // Type distribution
    const typeHtml = this._barChart(typeCounts, 'Type Distribution');

    // Top artists
    const artists = {};
    for (const tag in autoTagIndex) {
      if (tag.startsWith('artist:')) {
        artists[tag.split(':')[1]] = autoTagIndex[tag].length;
      }
    }
    const topArtists = Object.entries(artists).sort((a, b) => b[1] - a[1]).slice(0, 15);
    const artistHtml = this._barChart(Object.fromEntries(topArtists), 'Top Artists');

    // Top mediums
    const mediums = {};
    for (const tag in autoTagIndex) {
      if (tag.startsWith('medium:')) {
        mediums[tag.split(':')[1]] = autoTagIndex[tag].length;
      }
    }
    const topMediums = Object.entries(mediums).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const mediumHtml = this._barChart(Object.fromEntries(topMediums), 'Top Mediums');

    // Top themes
    const themes = {};
    for (const tag in autoTagIndex) {
      if (tag.startsWith('theme:')) {
        themes[tag.split(':')[1]] = autoTagIndex[tag].length;
      }
    }
    const topThemes = Object.entries(themes).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const themeHtml = this._barChart(Object.fromEntries(topThemes), 'Top Themes');

    // Monthly histogram
    const monthCounts = {};
    for (const b of blocks) {
      if (!b.createdAt) continue;
      const d = new Date(b.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthCounts[key] = (monthCounts[key] || 0) + 1;
    }
    const sortedMonths = Object.entries(monthCounts).sort((a, b) => a[0].localeCompare(b[0]));
    const monthHtml = this._barChart(Object.fromEntries(sortedMonths.slice(-24)), 'Monthly Activity (last 24mo)');

    this.content.innerHTML = `
      <div class="grid grid-cols-2 gap-6">
        <div>
          <div class="mb-4 p-3 border border-white/[0.06]">
            <div class="font-mono text-[8px] text-gray-600 uppercase tracking-widest mb-1">Overview</div>
            <div class="grid grid-cols-2 gap-2 font-mono text-[10px]">
              <div><span class="text-gray-500">Channels:</span> <span class="text-white">${meta.channelCount}</span></div>
              <div><span class="text-gray-500">Blocks:</span> <span class="text-white">${meta.blockCount}</span></div>
              <div><span class="text-gray-500">Edges:</span> <span class="text-white">${meta.edgeCount}</span></div>
              <div><span class="text-gray-500">Cross-links:</span> <span class="text-acid">${meta.crossConnectedBlocks}</span></div>
            </div>
          </div>
          ${typeHtml}
          ${mediumHtml}
        </div>
        <div>
          ${artistHtml}
          ${themeHtml}
        </div>
      </div>
      <div class="mt-4">${monthHtml}</div>
    `;
  }

  _barChart(data, title) {
    const entries = Object.entries(data);
    if (entries.length === 0) return '';
    const maxVal = Math.max(...entries.map(e => e[1]));

    const bars = entries.map(([label, count]) => {
      const pct = (count / maxVal * 100).toFixed(0);
      return `
        <div class="flex items-center gap-2 mb-1">
          <span class="font-mono text-[9px] text-gray-500 w-24 truncate text-right">${label}</span>
          <div class="flex-1"><div class="stat-bar" style="width: ${pct}%"></div></div>
          <span class="font-mono text-[9px] text-gray-600 w-8 text-right">${count}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="mb-4">
        <div class="font-mono text-[8px] text-gray-600 uppercase tracking-widest mb-2">${title}</div>
        ${bars}
      </div>
    `;
  }
}
