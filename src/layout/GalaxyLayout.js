import { CENTER_ID, RGB_IDS } from '../constants.js';

/**
 * Galaxy layout — nodes arranged in logarithmic spiral arms
 * emanating from a dense core of cross-linked blocks.
 * Channels define the arms; multi-channel blocks form the nucleus.
 */
export class GalaxyLayout {
  compute(graphData) {
    const { channels, blocks, blockToChannelsMap } = graphData;

    const channelPositions = {};
    const blockPositions = {};

    // Separate cross-linked (multi-channel) blocks for the core
    const coreBlocks = [];
    const armBlocks = {};  // channelId -> [blockIndex, ...]

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const chs = blockToChannelsMap[b.id] || [];
      if (chs.length > 1) {
        coreBlocks.push(i);
      } else if (chs.length === 1) {
        if (!armBlocks[chs[0]]) armBlocks[chs[0]] = [];
        armBlocks[chs[0]].push(i);
      } else {
        blockPositions[i] = { x: 0, y: 0, z: 0 };
      }
    }

    // --- Galaxy core: dense cluster of cross-linked blocks ---
    const coreRadius = Math.sqrt(coreBlocks.length) * 6;
    for (let i = 0; i < coreBlocks.length; i++) {
      const idx = coreBlocks[i];
      // Fibonacci sphere distribution for even 3D spread
      const phi = Math.acos(1 - 2 * (i + 0.5) / coreBlocks.length);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = coreRadius * Math.cbrt((i + 1) / coreBlocks.length); // denser toward center
      blockPositions[idx] = {
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.cos(phi) * 0.3, // flatten vertically — it's a galaxy disk
        z: r * Math.sin(phi) * Math.sin(theta),
      };
    }

    // --- Spiral arms: each channel is an arm ---
    // Sort channels by block count descending for arm ordering
    const sortedChannels = [...channels].sort((a, b) => {
      return (armBlocks[b.id]?.length || 0) - (armBlocks[a.id]?.length || 0);
    });

    const armCount = sortedChannels.length;
    const armSpacing = (2 * Math.PI) / armCount;
    const armStartRadius = coreRadius + 40;

    // Logarithmic spiral parameters
    const spiralTightness = 0.18;  // how tight the spiral winds
    const armSpread = 25;          // perpendicular scatter from arm center
    const diskThickness = 30;      // vertical scatter

    for (let armIdx = 0; armIdx < armCount; armIdx++) {
      const ch = sortedChannels[armIdx];
      const armAngle = armIdx * armSpacing; // base angle for this arm
      const armBlockList = armBlocks[ch.id] || [];

      // Channel hub sits at the midpoint of its arm
      const midIdx = Math.floor(armBlockList.length * 0.4);
      const midT = midIdx / Math.max(armBlockList.length, 1);
      const midR = armStartRadius + midT * 800;
      const midTheta = armAngle + spiralTightness * Math.log(1 + midR / 50);

      channelPositions[ch.id] = {
        x: midR * Math.cos(midTheta),
        y: 0,
        z: midR * Math.sin(midTheta),
        angle: midTheta,
      };

      // Place blocks along the spiral arm
      for (let i = 0; i < armBlockList.length; i++) {
        const blockIdx = armBlockList[i];
        const t = i / Math.max(armBlockList.length - 1, 1);

        // Logarithmic spiral: r increases, angle winds
        const r = armStartRadius + t * 900;
        const theta = armAngle + spiralTightness * Math.log(1 + r / 50);

        // Perpendicular scatter (random offset from arm centerline)
        const scatter = (Math.random() - 0.5) * armSpread * (1 + t * 2);
        const perpX = -Math.sin(theta) * scatter;
        const perpZ = Math.cos(theta) * scatter;

        // Vertical scatter — thin disk, slightly more at edges
        const y = (Math.random() - 0.5) * diskThickness * (0.5 + t);

        blockPositions[blockIdx] = {
          x: r * Math.cos(theta) + perpX,
          y: y,
          z: r * Math.sin(theta) + perpZ,
        };
      }
    }

    return { channelPositions, blockPositions };
  }
}
