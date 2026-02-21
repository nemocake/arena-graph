/**
 * DOM right slide-out panel showing full block details.
 */
export class DetailPanel {
  constructor(state, graphData) {
    this.state = state;
    this.graphData = graphData;

    this.panel = document.getElementById('detail-panel');
    this.content = document.getElementById('detail-content');
    this.closeBtn = document.getElementById('detail-close');

    this.closeBtn.addEventListener('click', () => this.close());

    // Listen for selection
    state.on('selectedNodeIndex', (idx) => {
      if (idx >= 0) {
        this.show(graphData.blocks[idx]);
      } else {
        this.close();
      }
    });

    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.panel.classList.contains('open')) {
        this.close();
      }
    });
  }

  show(data) {
    if (!data) return;

    const channels = this.graphData.blockToChannelsMap[data.id] || [];
    const channelNames = channels.map(chId => {
      const ch = this.graphData.channelMap[chId];
      return ch ? ch.label : chId;
    });

    const created = data.createdAt ? new Date(data.createdAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    }) : '--';

    const tags = data.autoTags || [];
    const tagHtml = tags.map(t => {
      const [cat, val] = t.split(':');
      const colors = { artist: '#ff3366', medium: '#00ff88', theme: '#00f3ff', source: '#ff9900' };
      const color = colors[cat] || '#666';
      return `<span class="tag-pill" style="background:${color}20; color:${color}; border:1px solid ${color}40;">${t}</span>`;
    }).join(' ');

    let imageHtml = '';
    if (data.class === 'Image' && (data.display || data.thumb)) {
      const src = data.display || data.thumb;
      imageHtml = `
        <div class="mb-4 border border-white/[0.06] overflow-hidden">
          <img src="${src}" class="w-full object-contain max-h-[300px] bg-gray-900" loading="lazy"
               onerror="this.parentElement.innerHTML='<div class=\\'p-4 text-center font-mono text-[9px] text-gray-600\\'>Image failed to load</div>'">
        </div>`;
    }

    let contentHtml = '';
    if (data.content) {
      contentHtml = `
        <div class="mb-4">
          <div class="font-mono text-[8px] text-gray-600 uppercase tracking-widest mb-1">Content</div>
          <div class="font-sans text-[11px] text-gray-400 leading-relaxed" style="display:-webkit-box; -webkit-line-clamp:6; -webkit-box-orient:vertical; overflow:hidden;">${this._escapeHtml(data.content)}</div>
        </div>`;
    }

    let descHtml = '';
    if (data.description) {
      descHtml = `
        <div class="mb-4">
          <div class="font-mono text-[8px] text-gray-600 uppercase tracking-widest mb-1">Description</div>
          <div class="font-sans text-[11px] text-gray-400 leading-relaxed italic">${this._escapeHtml(data.description)}</div>
        </div>`;
    }

    this.content.innerHTML = `
      ${imageHtml}
      <div class="mb-3">
        <div class="font-mono text-[8px] text-gray-600 uppercase tracking-widest mb-1">Title</div>
        <div class="font-display text-lg font-bold text-white leading-tight">${this._escapeHtml(data.label || 'Untitled')}</div>
      </div>
      <div class="flex items-center gap-2 mb-4">
        <span class="font-mono text-[9px] px-1.5 py-0.5 border border-white/10 text-gray-400">${data.class || 'Block'}</span>
        <span class="font-mono text-[9px] text-gray-600">${created}</span>
        ${channels.length > 1 ? '<span class="font-mono text-[9px] text-acid">CROSS-LINKED</span>' : ''}
      </div>
      ${contentHtml}
      ${descHtml}
      <div class="mb-4">
        <div class="font-mono text-[8px] text-gray-600 uppercase tracking-widest mb-1.5">Channels</div>
        <div class="flex flex-wrap gap-1">
          ${channelNames.map(n => `<span class="font-mono text-[9px] text-gray-400 px-1.5 py-0.5 border border-white/10">${n}</span>`).join('')}
        </div>
      </div>
      ${tags.length > 0 ? `
      <div class="mb-4">
        <div class="font-mono text-[8px] text-gray-600 uppercase tracking-widest mb-1.5">Tags</div>
        <div class="flex flex-wrap gap-1">${tagHtml}</div>
      </div>` : ''}
      ${data.source ? `
      <div class="mb-4">
        <div class="font-mono text-[8px] text-gray-600 uppercase tracking-widest mb-1">Source</div>
        <a href="${data.source}" target="_blank" rel="noopener" class="font-mono text-[10px] text-acid hover:underline break-all">${data.domain || data.source}</a>
      </div>` : ''}
      <div class="flex gap-2 mt-4 pt-3 border-t border-white/[0.06]">
        <button class="ctrl-btn" id="detail-similar">SIMILAR</button>
        <button class="ctrl-btn" id="detail-arena">VIEW ON ARE.NA</button>
      </div>
    `;

    // Wire buttons
    const similarBtn = document.getElementById('detail-similar');
    if (similarBtn) {
      similarBtn.addEventListener('click', () => {
        const idx = this.graphData.blockIndexMap[data.id];
        if (idx !== undefined) this.state.set('similarTarget', idx);
      });
    }

    const arenaBtn = document.getElementById('detail-arena');
    if (arenaBtn) {
      arenaBtn.addEventListener('click', () => {
        if (data.source) window.open(data.source, '_blank');
      });
    }

    this.panel.classList.add('open');
  }

  close() {
    this.panel.classList.remove('open');
    this.state.set('selectedNodeIndex', -1);
  }

  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
