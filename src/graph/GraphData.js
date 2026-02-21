import { CHANNEL_PALETTE, RGB_COLORS } from '../constants.js';

/**
 * Parse JSON, build adjacency maps, lookup indices, color maps.
 */
export class GraphData {
  constructor(raw) {
    this.meta = raw.meta;
    this.searchIndex = raw.meta.searchIndex || {};
    this.autoTagIndex = raw.meta.autoTagIndex || {};
    this.sortedTimestamps = raw.meta.sortedTimestamps || [];

    const rawNodes = raw.elements.nodes;
    const rawEdges = raw.elements.edges;

    this.channels = [];
    this.blocks = [];
    this.channelMap = {};  // id -> channel data
    this.blockMap = {};    // id -> block data
    this.nodeById = {};    // id -> node data (channel or block)

    // Separate channels and blocks
    for (const n of rawNodes) {
      const d = n.data;
      this.nodeById[d.id] = d;
      if (d.type === 'channel') {
        this.channels.push(d);
        this.channelMap[d.id] = d;
      } else {
        this.blocks.push(d);
        this.blockMap[d.id] = d;
      }
    }

    // Channel color map
    this.channelColorMap = {};
    this.channels.forEach((ch, i) => {
      this.channelColorMap[ch.id] = RGB_COLORS[ch.id] || CHANNEL_PALETTE[i % CHANNEL_PALETTE.length];
    });

    // Block -> first channel (primary color)
    this.blockChannelMap = {};
    // Block -> [all channel ids]
    this.blockToChannelsMap = {};

    for (const e of rawEdges) {
      const src = e.data.source;
      const tgt = e.data.target;
      if (!this.blockChannelMap[tgt]) {
        this.blockChannelMap[tgt] = src;
      }
      if (!this.blockToChannelsMap[tgt]) this.blockToChannelsMap[tgt] = [];
      if (!this.blockToChannelsMap[tgt].includes(src)) {
        this.blockToChannelsMap[tgt].push(src);
      }
    }

    // Assign colors to blocks
    for (const b of this.blocks) {
      const parentCh = this.blockChannelMap[b.id];
      b.color = parentCh ? this.channelColorMap[parentCh] : '#666666';
    }

    // Adjacency list (for pathfinding, keyboard nav)
    // block <-> block via shared channels
    this.adjacency = {};
    const channelToBlocks = {};
    for (const e of rawEdges) {
      const chId = e.data.source;
      const blId = e.data.target;
      if (!channelToBlocks[chId]) channelToBlocks[chId] = [];
      channelToBlocks[chId].push(blId);
      // Also store direct edges
      if (!this.adjacency[chId]) this.adjacency[chId] = [];
      if (!this.adjacency[blId]) this.adjacency[blId] = [];
      this.adjacency[chId].push(blId);
      this.adjacency[blId].push(chId);
    }
    this.channelToBlocks = channelToBlocks;

    // Block index map (blockId -> index in this.blocks)
    this.blockIndexMap = {};
    this.blocks.forEach((b, i) => {
      this.blockIndexMap[b.id] = i;
    });

    // Channel index map
    this.channelIndexMap = {};
    this.channels.forEach((ch, i) => {
      this.channelIndexMap[ch.id] = i;
    });

    // Edges as simple arrays for rendering
    this.edges = rawEdges.map(e => ({
      source: e.data.source,
      target: e.data.target,
      id: e.data.id,
    }));

    // Type counts
    this.typeCounts = {};
    for (const b of this.blocks) {
      const cls = b.class || 'Block';
      this.typeCounts[cls] = (this.typeCounts[cls] || 0) + 1;
    }

    // Min/max timestamps
    if (this.sortedTimestamps.length) {
      this.minDate = this.sortedTimestamps[0][0];
      this.maxDate = this.sortedTimestamps[this.sortedTimestamps.length - 1][0];
    } else {
      this.minDate = 0;
      this.maxDate = 0;
    }
  }

  getBlockColor(blockId) {
    const b = this.blockMap[blockId];
    return b ? b.color : '#666666';
  }

  getChannelColor(channelId) {
    return this.channelColorMap[channelId] || '#666666';
  }

  /**
   * BFS shortest path between two node IDs.
   * Returns array of node IDs from start to end, or [] if no path.
   */
  bfsPath(startId, endId) {
    if (startId === endId) return [startId];
    const visited = new Set([startId]);
    const queue = [[startId]];
    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];
      const neighbors = this.adjacency[current] || [];
      for (const n of neighbors) {
        if (n === endId) return [...path, n];
        if (!visited.has(n)) {
          visited.add(n);
          queue.push([...path, n]);
        }
      }
    }
    return [];
  }
}
