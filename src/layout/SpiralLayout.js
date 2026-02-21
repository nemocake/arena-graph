import {
  CENTER_ID, RGB_IDS,
  GOLDEN_ANGLE, BLOCK_SPREAD, BLOCK_BASE_RADIUS,
  RING_GAP, Y_UNDULATION_FREQ, Y_UNDULATION_AMP,
  RING_Y_OFFSETS,
} from '../constants.js';

/**
 * 3D golden-angle spiral layout.
 * Channels on concentric XZ rings with Y offsets.
 * Blocks spiral around their parent channel.
 */
export class SpiralLayout {
  compute(graphData) {
    const { channels, blocks, blockToChannelsMap } = graphData;

    const channelPositions = {}; // channelId -> {x, y, z, angle}
    const blockPositions = {};   // blockIndex -> {x, y, z}

    // Count blocks per channel
    const channelBlockCount = {};
    for (const b of blocks) {
      const chs = blockToChannelsMap[b.id] || [];
      for (const ch of chs) {
        channelBlockCount[ch] = (channelBlockCount[ch] || 0) + 1;
      }
    }

    // --- Ring 1: Center channel ---
    const centerIdx = channels.findIndex(c => c.id === CENTER_ID);
    if (centerIdx >= 0) {
      channelPositions[CENTER_ID] = { x: 0, y: RING_Y_OFFSETS[0], z: 0, angle: 0 };
    }

    // Ring 1 max radius (for sizing ring 2)
    const centerCount = channelBlockCount[CENTER_ID] || 0;
    const centerMaxR = BLOCK_BASE_RADIUS + Math.sqrt(centerCount) * BLOCK_SPREAD;
    const ring2Radius = centerMaxR + RING_GAP;

    // --- Ring 2: RGB channels ---
    const rgbIndices = RGB_IDS.map(id => channels.findIndex(c => c.id === id)).filter(i => i >= 0);
    let maxRgbBlocks = 0;
    for (const id of RGB_IDS) {
      maxRgbBlocks = Math.max(maxRgbBlocks, channelBlockCount[id] || 0);
    }

    RGB_IDS.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / 3 - Math.PI / 2;
      channelPositions[id] = {
        x: Math.cos(angle) * ring2Radius,
        y: RING_Y_OFFSETS[1],
        z: Math.sin(angle) * ring2Radius,
        angle,
      };
    });

    // Ring 3 radius
    const rgbMaxR = BLOCK_BASE_RADIUS + Math.sqrt(maxRgbBlocks) * BLOCK_SPREAD;
    const ring3Radius = ring2Radius + rgbMaxR + RING_GAP;

    // --- Ring 3: All other channels ---
    const otherChannels = channels.filter(c => c.id !== CENTER_ID && !RGB_IDS.includes(c.id));
    otherChannels.forEach((ch, i) => {
      const angle = (2 * Math.PI * i) / otherChannels.length - Math.PI / 2;
      channelPositions[ch.id] = {
        x: Math.cos(angle) * ring3Radius,
        y: RING_Y_OFFSETS[2],
        z: Math.sin(angle) * ring3Radius,
        angle,
      };
    });

    // --- Block positions ---
    const channelBlockCounters = {};
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const chs = blockToChannelsMap[b.id] || [];

      if (chs.length === 0) {
        blockPositions[i] = { x: 0, y: 0, z: 0 };
        continue;
      }

      // Multi-channel blocks: average position with jitter
      if (chs.length > 1) {
        let avgX = 0, avgY = 0, avgZ = 0;
        let count = 0;
        for (const chId of chs) {
          const pos = channelPositions[chId];
          if (pos) {
            avgX += pos.x;
            avgY += pos.y;
            avgZ += pos.z;
            count++;
          }
        }
        if (count > 0) {
          avgX /= count;
          avgY /= count;
          avgZ /= count;
        }
        avgX += (Math.random() - 0.5) * 80;
        avgY += (Math.random() - 0.5) * 40;
        avgZ += (Math.random() - 0.5) * 80;
        blockPositions[i] = { x: avgX, y: avgY, z: avgZ };
        continue;
      }

      // Single-channel block: golden angle spiral
      const chId = chs[0];
      const chPos = channelPositions[chId];
      if (!chPos) {
        blockPositions[i] = { x: 0, y: 0, z: 0 };
        continue;
      }

      if (!channelBlockCounters[chId]) channelBlockCounters[chId] = 0;
      const idx = channelBlockCounters[chId]++;

      const r = BLOCK_BASE_RADIUS + Math.sqrt(idx) * BLOCK_SPREAD;
      const angle = idx * GOLDEN_ANGLE;
      const yUndulation = Math.sin(idx * Y_UNDULATION_FREQ) * Y_UNDULATION_AMP;

      blockPositions[i] = {
        x: chPos.x + Math.cos(angle) * r,
        y: chPos.y + yUndulation,
        z: chPos.z + Math.sin(angle) * r,
      };
    }

    return { channelPositions, blockPositions };
  }
}
