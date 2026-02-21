import { SIMILAR_COLOR } from '../constants.js';

/**
 * Shared-tag scoring → highlight top 20 similar blocks.
 */
export class FindSimilar {
  constructor(state, graphData, nodeRenderer) {
    this.state = state;
    this.graphData = graphData;
    this.nodeRenderer = nodeRenderer;

    state.on('similarTarget', (idx) => {
      if (idx >= 0) this._find(idx);
      else this._clear();
    });
  }

  _find(targetIdx) {
    const target = this.graphData.blocks[targetIdx];
    if (!target) return;

    const targetTags = target.autoTags || [];
    if (targetTags.length === 0) return;

    const targetSet = new Set(targetTags);
    const scores = [];

    for (let i = 0; i < this.graphData.blocks.length; i++) {
      if (i === targetIdx) continue;
      const b = this.graphData.blocks[i];
      const tags = b.autoTags || [];
      let score = 0;
      for (const t of tags) {
        if (targetSet.has(t)) score++;
      }
      if (score > 0) scores.push({ idx: i, score });
    }

    // Sort by score descending, take top 20
    scores.sort((a, b) => b.score - a.score);
    const top = scores.slice(0, 20);

    const resultIndices = new Set([targetIdx, ...top.map(s => s.idx)]);
    const nr = this.nodeRenderer;

    // Fade all except results
    nr.fadeAllExcept(resultIndices);

    // Color similar blocks
    for (const s of top) {
      nr.setBlockColor(s.idx, ...SIMILAR_COLOR);
      nr.setBlockScale(s.idx, 1.3 + s.score * 0.2);
      nr.setBlockOpacity(s.idx, 0.9);
    }

    // Target block stays its original color but bigger
    nr.setBlockScale(targetIdx, 2.0);
    nr.setBlockOpacity(targetIdx, 1.0);
    nr.commitAttributes();

    this.state.set('similarResults', top.map(s => s.idx));
  }

  _clear() {
    this.nodeRenderer.resetAttributes();
    this.state.set('similarResults', []);
  }
}
