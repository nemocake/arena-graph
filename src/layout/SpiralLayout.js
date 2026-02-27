import {
  GOLDEN_ANGLE, BLOCK_SPREAD, BLOCK_BASE_RADIUS,
  RING_GAP, Y_UNDULATION_FREQ, Y_UNDULATION_AMP,
  RING_Y_OFFSETS,
} from '../constants.js';

/**
 * 3D golden-angle spiral layout.
 * Center channel auto-detected (largest) or set via config.
 * All other channels distributed on an outer ring.
 * Blocks spiral around their parent channel.
 */
export class SpiralLayout {
  compute(graphData) {
    const { channels, blocks, blockToChannelsMap } = graphData;
    const centerId = graphData.centerChannelId;

    const channelPositions = {};
    const blockPositions = {};

    // Count blocks per channel
    const channelBlockCount = {};
    for (const b of blocks) {
      const chs = blockToChannelsMap[b.id] || [];
      for (const ch of chs) {
        channelBlockCount[ch] = (channelBlockCount[ch] || 0) + 1;
      }
    }

    // --- Ring 1: Center channel (auto-detected or config-specified) ---
    if (centerId) {
      channelPositions[centerId] = { x: 0, y: RING_Y_OFFSETS[0], z: 0, angle: 0 };
    }

    // Ring 1 max radius
    const centerCount = channelBlockCount[centerId] || 0;
    const centerMaxR = BLOCK_BASE_RADIUS + Math.sqrt(centerCount) * BLOCK_SPREAD;
    const outerRadius = centerMaxR + RING_GAP;

    // --- Outer ring: All other channels ---
    const outerChannels = channels.filter(c => c.id !== centerId);
    outerChannels.forEach((ch, i) => {
      const angle = (2 * Math.PI * i) / outerChannels.length - Math.PI / 2;
      channelPositions[ch.id] = {
        x: Math.cos(angle) * outerRadius,
        y: RING_Y_OFFSETS[1] + (i % 2 === 0 ? 0 : RING_Y_OFFSETS[2] - RING_Y_OFFSETS[1]),
        z: Math.sin(angle) * outerRadius,
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
