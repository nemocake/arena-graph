import { SEARCH_HIGHLIGHT_COLOR } from '../constants.js';

/**
 * Prefix-match search on pre-built searchIndex.
 * Highlights matching nodes.
 */
export class SearchEngine {
  constructor(state, graphData, nodeRenderer) {
    this.state = state;
    this.graphData = graphData;
    this.nodeRenderer = nodeRenderer;

    this.input = document.getElementById('search-input');
    this._debounceTimer = null;

    this.input.addEventListener('input', () => {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = setTimeout(() => this._search(), 150);
    });

    // Keyboard shortcut: / to focus search
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        this.input.focus();
      }
      if (e.key === 'Escape' && document.activeElement === this.input) {
        this.input.value = '';
        this.input.blur();
        this._clear();
      }
    });
  }

  _search() {
    const query = this.input.value.trim().toLowerCase();
    if (query.length < 2) {
      this._clear();
      return;
    }

    const { searchIndex, blockIndexMap } = this.graphData;
    const nr = this.nodeRenderer;

    // Split into words, find matching block IDs via prefix matching
    const words = query.split(/\s+/).filter(w => w.length > 0);
    let matchingBlockIds = null;

    for (const word of words) {
      const wordMatches = new Set();
      // Prefix match on index keys
      for (const key in searchIndex) {
        if (key.startsWith(word)) {
          for (const blockId of searchIndex[key]) {
            wordMatches.add(blockId);
          }
        }
      }
      if (matchingBlockIds === null) {
        matchingBlockIds = wordMatches;
      } else {
        // Intersection
        matchingBlockIds = new Set([...matchingBlockIds].filter(id => wordMatches.has(id)));
      }
    }

    if (!matchingBlockIds || matchingBlockIds.size === 0) {
      this._clear();
      return;
    }

    // Convert to indices and highlight
    const matchIndices = new Set();
    for (const blockId of matchingBlockIds) {
      const idx = blockIndexMap[blockId];
      if (idx !== undefined) matchIndices.add(idx);
    }

    // Fade all, highlight matches
    nr.fadeAllExcept(matchIndices);
    for (const idx of matchIndices) {
      nr.setBlockColor(idx, ...SEARCH_HIGHLIGHT_COLOR);
      nr.setBlockScale(idx, 1.8);
      nr.setBlockOpacity(idx, 1.0);
    }
    nr.commitAttributes();
  }

  _clear() {
    this.nodeRenderer.resetAttributes();
  }
}
