/**
 * Auto-navigate through graph + breadcrumbs trail.
 */
export class RandomWalk {
  constructor(state, graphData, nodeRenderer, cameraController) {
    this.state = state;
    this.graphData = graphData;
    this.nodeRenderer = nodeRenderer;
    this.cameraController = cameraController;

    this.breadcrumbs = document.getElementById('walk-breadcrumbs');
    this.trail = document.getElementById('walk-trail');
    this._interval = null;

    const btn = document.getElementById('btn-walk');
    btn.addEventListener('click', () => {
      const active = !this.state.get('walkActive');
      this.state.set('walkActive', active);
    });

    state.on('walkActive', (active) => {
      btn.classList.toggle('active', active);
      this.breadcrumbs.classList.toggle('hidden', !active);
      if (active) this._start();
      else this._stop();
    });

    // Random button
    document.getElementById('btn-random').addEventListener('click', () => {
      const idx = Math.floor(Math.random() * this.graphData.blocks.length);
      this.state.set('selectedNodeIndex', idx);
    });
  }

  _start() {
    this.state.set('walkTrail', []);
    this._step();
    this._interval = setInterval(() => this._step(), 3000);
  }

  _stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this.state.set('walkTrail', []);
    this.trail.innerHTML = '';
    this.nodeRenderer.resetAttributes();
  }

  _step() {
    const trail = [...this.state.get('walkTrail')];
    const gr = this.graphData;
    const nr = this.nodeRenderer;

    let nextIdx;
    if (trail.length === 0) {
      // Start random
      nextIdx = Math.floor(Math.random() * gr.blocks.length);
    } else {
      // Pick random neighbor
      const currentIdx = trail[trail.length - 1];
      const block = gr.blocks[currentIdx];
      const channels = gr.blockToChannelsMap[block.id] || [];
      const neighborIds = [];
      for (const chId of channels) {
        const adj = gr.adjacency[chId] || [];
        for (const nId of adj) {
          const idx = gr.blockIndexMap[nId];
          if (idx !== undefined && idx !== currentIdx && !trail.includes(idx)) {
            neighborIds.push(idx);
          }
        }
      }
      if (neighborIds.length > 0) {
        nextIdx = neighborIds[Math.floor(Math.random() * neighborIds.length)];
      } else {
        nextIdx = Math.floor(Math.random() * gr.blocks.length);
      }
    }

    trail.push(nextIdx);
    if (trail.length > 10) trail.shift();
    this.state.set('walkTrail', trail);

    // Highlight trail
    const trailSet = new Set(trail);
    nr.resetAttributes();
    for (const idx of trail) {
      nr.setBlockOpacity(idx, 0.9);
      nr.setBlockScale(idx, 1.3);
    }
    // Current node bigger
    nr.setBlockScale(nextIdx, 2.0);
    nr.setBlockOpacity(nextIdx, 1.0);
    nr.commitAttributes();

    // Fly to
    const pos = nr.getBlockPosition(nextIdx);
    this.cameraController.flyTo(pos, 200);

    // Update breadcrumbs
    this._renderBreadcrumbs(trail);

    // Select
    this.state.set('selectedNodeIndex', nextIdx);
  }

  _renderBreadcrumbs(trail) {
    this.trail.innerHTML = '';
    for (let i = 0; i < trail.length; i++) {
      const block = this.graphData.blocks[trail[i]];
      const crumb = document.createElement('span');
      crumb.className = 'walk-crumb';
      crumb.innerHTML = `${i > 0 ? '<span class="arrow">→</span> ' : ''}${(block.label || 'Untitled').substring(0, 20)}`;
      crumb.addEventListener('click', () => {
        this.state.set('selectedNodeIndex', trail[i]);
      });
      this.trail.appendChild(crumb);
    }
  }
}
