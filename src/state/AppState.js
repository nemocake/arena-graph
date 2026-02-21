/**
 * Reactive state store using EventTarget.
 * All modules subscribe to specific state keys.
 */
export class AppState extends EventTarget {
  constructor() {
    super();
    this._state = {
      // Data
      graphData: null,
      nodes: [],
      edges: [],
      channels: [],
      blocks: [],
      channelColorMap: {},
      blockChannelMap: {},
      blockToChannelsMap: {},
      adjacency: {},       // nodeId -> [nodeId]
      nodeIndexMap: {},     // nodeId -> index in blocks array
      searchIndex: null,
      autoTagIndex: null,
      sortedTimestamps: [],

      // Interaction
      hoveredNodeIndex: -1,
      selectedNodeIndex: -1,
      kbSelectedNodeIndex: -1,

      // Filters
      visibleTypes: new Set(['Image', 'Media', 'Link', 'Text', 'Attachment']),
      visibleChannels: new Set(),
      activeCategories: [],     // [{tag, cat}]
      timelineRange: [0, 1],    // normalized 0-1

      // Computed visibility
      visibleBlockIndices: null, // Set<number> or null (all visible)

      // Feature modes
      crosslinksActive: false,
      pathMode: false,
      pathEndpoints: [],       // [nodeIndex, nodeIndex]
      pathResult: [],          // [nodeIndex...]
      constellationActive: false,
      ageHeatmapActive: false,
      walkActive: false,
      walkTrail: [],           // [nodeIndex...]
      galleryOpen: false,
      statsOpen: false,
      similarTarget: -1,
      similarResults: [],      // [nodeIndex...]
    };
  }

  get(key) {
    return this._state[key];
  }

  set(key, value) {
    const old = this._state[key];
    this._state[key] = value;
    this.dispatchEvent(new CustomEvent(`change:${key}`, { detail: { value, old } }));
  }

  on(key, fn) {
    this.addEventListener(`change:${key}`, (e) => fn(e.detail.value, e.detail.old));
  }

  // Batch multiple sets, fire events after all are set
  batch(updates) {
    const events = [];
    for (const [key, value] of Object.entries(updates)) {
      const old = this._state[key];
      this._state[key] = value;
      events.push([key, value, old]);
    }
    for (const [key, value, old] of events) {
      this.dispatchEvent(new CustomEvent(`change:${key}`, { detail: { value, old } }));
    }
  }
}
