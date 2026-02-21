/**
 * Dashed edges between blocks sharing artist/medium/theme tags.
 * Expensive — only shows top N connections.
 */
export class ConstellationRenderer {
  constructor(state, graphData, edgeRenderer) {
    this.state = state;
    this.graphData = graphData;
    this.edgeRenderer = edgeRenderer;

    const btn = document.getElementById('btn-constellation');
    btn.addEventListener('click', () => {
      const active = !this.state.get('constellationActive');
      this.state.set('constellationActive', active);
    });

    state.on('constellationActive', (active) => {
      btn.classList.toggle('active', active);
      if (active) this._build();
      else this.edgeRenderer.clearConstellation();
    });
  }

  _build() {
    const { blocks, autoTagIndex, blockIndexMap } = this.graphData;
    const pairs = [];
    const pairSet = new Set();

    // For each tag, create edges between blocks sharing it
    // Limit to artist/medium/theme tags (skip source)
    const relevantTags = Object.keys(autoTagIndex).filter(t =>
      t.startsWith('artist:') || t.startsWith('medium:') || t.startsWith('theme:')
    );

    for (const tag of relevantTags) {
      const blockIds = autoTagIndex[tag];
      if (!blockIds || blockIds.length < 2 || blockIds.length > 50) continue;

      // Only create edges between first 10 blocks per tag to limit count
      const limit = Math.min(blockIds.length, 10);
      for (let i = 0; i < limit; i++) {
        for (let j = i + 1; j < limit; j++) {
          const aIdx = blockIndexMap[blockIds[i]];
          const bIdx = blockIndexMap[blockIds[j]];
          if (aIdx === undefined || bIdx === undefined) continue;

          const key = aIdx < bIdx ? `${aIdx}-${bIdx}` : `${bIdx}-${aIdx}`;
          if (pairSet.has(key)) continue;
          pairSet.add(key);
          pairs.push([aIdx, bIdx]);
        }
      }
    }

    this.edgeRenderer.setConstellationEdges(pairs);
  }
}
