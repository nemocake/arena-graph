import { PATH_COLOR, FADED_OPACITY } from '../constants.js';

/**
 * Click two blocks → BFS shortest path.
 */
export class PathFinder {
  constructor(state, graphData, nodeRenderer, edgeRenderer) {
    this.state = state;
    this.graphData = graphData;
    this.nodeRenderer = nodeRenderer;
    this.edgeRenderer = edgeRenderer;

    this.statusEl = document.getElementById('path-status');
    this.statusText = document.getElementById('path-status-text');
    this.endpoints = [];

    const btn = document.getElementById('btn-path');
    btn.addEventListener('click', () => this.toggle());

    state.on('pathMode', (active) => {
      btn.classList.toggle('active', active);
      this.statusEl.classList.toggle('hidden', !active);
      if (!active) this._clear();
    });
  }

  toggle() {
    const active = !this.state.get('pathMode');
    this.state.set('pathMode', active);
    if (active) {
      this.endpoints = [];
      this.statusText.textContent = 'Click first node...';
    }
  }

  /**
   * Called when a block is clicked while path mode is active.
   */
  addEndpoint(blockIndex) {
    if (!this.state.get('pathMode')) return;

    this.endpoints.push(blockIndex);

    if (this.endpoints.length === 1) {
      // Highlight first endpoint
      this.nodeRenderer.setBlockColor(blockIndex, ...PATH_COLOR);
      this.nodeRenderer.setBlockScale(blockIndex, 2.0);
      this.nodeRenderer.setBlockOpacity(blockIndex, 1.0);
      this.nodeRenderer.commitAttributes();
      this.statusText.textContent = 'Click second node...';
    }

    if (this.endpoints.length === 2) {
      this._findPath();
    }
  }

  _findPath() {
    const [startIdx, endIdx] = this.endpoints;
    const startId = this.graphData.blocks[startIdx].id;
    const endId = this.graphData.blocks[endIdx].id;

    const path = this.graphData.bfsPath(startId, endId);

    if (path.length === 0) {
      this.statusText.textContent = 'No path found!';
      return;
    }

    // Convert IDs to indices and highlight
    const pathIndices = [];
    for (const nodeId of path) {
      const idx = this.graphData.blockIndexMap[nodeId];
      if (idx !== undefined) pathIndices.push(idx);
    }

    // Fade everything, highlight path
    const pathSet = new Set(pathIndices);
    this.nodeRenderer.fadeAllExcept(pathSet);

    for (const idx of pathIndices) {
      this.nodeRenderer.setBlockColor(idx, ...PATH_COLOR);
      this.nodeRenderer.setBlockScale(idx, 1.5);
      this.nodeRenderer.setBlockOpacity(idx, 1.0);
    }

    // Endpoints larger
    this.nodeRenderer.setBlockScale(startIdx, 2.0);
    this.nodeRenderer.setBlockScale(endIdx, 2.0);
    this.nodeRenderer.commitAttributes();

    // Highlight edges along path
    const edgeIndices = [];
    for (let i = 0; i < path.length - 1; i++) {
      const key = `${path[i]}-${path[i + 1]}`;
      const eIdx = this.edgeRenderer.edgeIndexMap[key];
      if (eIdx !== undefined) edgeIndices.push(eIdx);
    }
    this.edgeRenderer.highlightEdges(edgeIndices, PATH_COLOR);

    this.statusText.textContent = `Path: ${pathIndices.length} nodes, ${path.length - 1} hops`;
    this.state.set('pathResult', pathIndices);
  }

  _clear() {
    this.endpoints = [];
    this.nodeRenderer.resetAttributes();
    this.edgeRenderer.resetColors();
    this.state.set('pathResult', []);
  }
}
