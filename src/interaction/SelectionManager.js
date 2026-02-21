import { HOVER_SCALE, HIGHLIGHT_SCALE, FADED_OPACITY } from '../constants.js';

/**
 * Manages hover/click selection and neighborhood highlighting.
 */
export class SelectionManager {
  constructor(state, graphData, nodeRenderer, edgeRenderer, cameraController) {
    this.state = state;
    this.graphData = graphData;
    this.nodeRenderer = nodeRenderer;
    this.edgeRenderer = edgeRenderer;
    this.cameraController = cameraController;

    this._lastHovered = -1;
    this._neighborCache = new Map();

    // Listen for state changes
    state.on('hoveredNodeIndex', (idx) => this._onHover(idx));
    state.on('selectedNodeIndex', (idx) => this._onSelect(idx));
  }

  _onHover(idx) {
    const nr = this.nodeRenderer;

    // Restore previous hovered node
    if (this._lastHovered >= 0 && this._lastHovered !== this.state.get('selectedNodeIndex')) {
      nr.setBlockScale(this._lastHovered, nr.originalScales[this._lastHovered]);
      nr.commitAttributes();
    }

    if (idx >= 0) {
      // Highlight hovered node
      nr.setBlockScale(idx, HOVER_SCALE);

      // Neighborhood highlight
      this._highlightNeighborhood(idx);

      nr.commitAttributes();
    } else {
      // Clear neighborhood highlight if nothing selected
      if (this.state.get('selectedNodeIndex') < 0) {
        nr.resetAttributes();
      }
    }

    this._lastHovered = idx;
  }

  _onSelect(idx) {
    if (idx >= 0) {
      // Highlight selected + fly to
      this._highlightNeighborhood(idx);
      const pos = this.nodeRenderer.getBlockPosition(idx);
      this.cameraController.flyTo(pos, 150);
    } else {
      this.nodeRenderer.resetAttributes();
      this.edgeRenderer.resetColors();
    }
  }

  _highlightNeighborhood(centerIdx) {
    const block = this.graphData.blocks[centerIdx];
    if (!block) return;

    const nr = this.nodeRenderer;
    const gr = this.graphData;

    // Find neighbor block indices via shared channels
    const neighborIndices = new Set([centerIdx]);
    const channels = gr.blockToChannelsMap[block.id] || [];

    for (const chId of channels) {
      const neighbors = gr.adjacency[chId] || [];
      for (const nId of neighbors) {
        const idx = gr.blockIndexMap[nId];
        if (idx !== undefined) neighborIndices.add(idx);
      }
    }

    // Fade non-neighbors, brighten neighbors
    nr.fadeAllExcept(neighborIndices);

    // Extra emphasis on center node
    nr.setBlockScale(centerIdx, HIGHLIGHT_SCALE);
    nr.setBlockOpacity(centerIdx, 1.0);
    nr.commitAttributes();
  }

  /**
   * Clear all selection state.
   */
  clearSelection() {
    this.state.batch({
      hoveredNodeIndex: -1,
      selectedNodeIndex: -1,
    });
    this.nodeRenderer.resetAttributes();
    this.edgeRenderer.resetColors();
  }
}
