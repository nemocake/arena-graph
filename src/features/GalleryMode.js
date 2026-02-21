/**
 * DOM grid of visible blocks with sorting.
 */
export class GalleryMode {
  constructor(state, graphData) {
    this.state = state;
    this.graphData = graphData;

    this.panel = document.getElementById('gallery-panel');
    this.grid = document.getElementById('gallery-grid');
    this.countEl = document.getElementById('gallery-count');
    this.sortEl = document.getElementById('gallery-sort');
    this.closeBtn = document.getElementById('gallery-close');

    const btn = document.getElementById('btn-gallery');
    btn.addEventListener('click', () => {
      const open = !this.state.get('galleryOpen');
      this.state.set('galleryOpen', open);
    });

    this.closeBtn.addEventListener('click', () => this.state.set('galleryOpen', false));

    state.on('galleryOpen', (open) => {
      btn.classList.toggle('active', open);
      this.panel.classList.toggle('open', open);
      if (open) this._render();
    });

    this.sortEl.addEventListener('change', () => {
      if (this.state.get('galleryOpen')) this._render();
    });

    state.on('visibleBlockIndices', () => {
      if (this.state.get('galleryOpen')) this._render();
    });
  }

  _render() {
    const visible = this.state.get('visibleBlockIndices');
    const blocks = this.graphData.blocks;

    // Get visible block data
    let items = [];
    if (visible) {
      for (const idx of visible) {
        items.push({ idx, data: blocks[idx] });
      }
    } else {
      items = blocks.map((d, i) => ({ idx: i, data: d }));
    }

    // Sort
    const sort = this.sortEl.value;
    switch (sort) {
      case 'newest':
        items.sort((a, b) => (b.data.ts || 0) - (a.data.ts || 0));
        break;
      case 'oldest':
        items.sort((a, b) => (a.data.ts || 0) - (b.data.ts || 0));
        break;
      case 'alpha':
        items.sort((a, b) => (a.data.label || '').localeCompare(b.data.label || ''));
        break;
      case 'connections':
        items.sort((a, b) => (b.data.connectionCount || 0) - (a.data.connectionCount || 0));
        break;
    }

    // Limit for performance
    const limited = items.slice(0, 200);

    this.countEl.textContent = `${items.length} blocks`;
    this.grid.innerHTML = '';

    for (const item of limited) {
      const d = item.data;
      const card = document.createElement('div');
      card.className = 'gallery-card';

      const hasImage = d.class === 'Image' && d.thumb;
      card.innerHTML = `
        ${hasImage
          ? `<img src="${d.thumb}" alt="${d.label || ''}" loading="lazy"
                 onerror="this.style.display='none'">`
          : `<div style="height:100px;display:flex;align-items:center;justify-content:center;">
              <span class="font-mono text-[9px] text-gray-600">${d.class || 'Block'}</span>
            </div>`
        }
        <div class="card-label">${d.label || 'Untitled'}</div>
      `;

      card.addEventListener('click', () => {
        this.state.set('selectedNodeIndex', item.idx);
      });

      this.grid.appendChild(card);
    }
  }
}
