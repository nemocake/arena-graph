/**
 * Sphere layout — channels as orbital rings on a globe,
 * blocks distributed along each ring's latitude band.
 * Cross-linked blocks cluster at the poles.
 */
export class SphereLayout {
  compute(graphData) {
    const { channels, blocks, blockToChannelsMap } = graphData;

    const channelPositions = {};
    const blockPositions = {};

    // Separate cross-linked blocks for the poles
    const poleBlocks = [];
    const armBlocks = {};

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const chs = blockToChannelsMap[b.id] || [];
      if (chs.length > 1) {
        poleBlocks.push(i);
      } else if (chs.length === 1) {
        if (!armBlocks[chs[0]]) armBlocks[chs[0]] = [];
        armBlocks[chs[0]].push(i);
      } else {
        blockPositions[i] = { x: 0, y: 0, z: 0 };
      }
    }

    // Globe radius scales with total block count
    const radius = 600;

    // --- Poles: cross-linked blocks form a dense cluster at top and bottom ---
    const halfPole = Math.ceil(poleBlocks.length / 2);
    for (let i = 0; i < poleBlocks.length; i++) {
      const idx = poleBlocks[i];
      const top = i < halfPole;
      const localIdx = top ? i : i - halfPole;
      const localCount = top ? halfPole : poleBlocks.length - halfPole;

      // Tight spiral near pole
      const t = (localIdx + 1) / (localCount + 1);
      const phi = t * 0.4; // stay within ~23 degrees of pole
      const theta = localIdx * Math.PI * (3 - Math.sqrt(5)); // golden angle
      const r = radius * 0.85;

      const ySign = top ? 1 : -1;
      blockPositions[idx] = {
        x: r * Math.sin(phi) * Math.cos(theta),
        y: ySign * r * Math.cos(phi),
        z: r * Math.sin(phi) * Math.sin(theta),
      };
    }

    // --- Channel latitude bands ---
    // Sort channels by block count for even distribution
    const sortedChannels = [...channels].sort((a, b) => {
      return (armBlocks[b.id]?.length || 0) - (armBlocks[a.id]?.length || 0);
    });

    const bandCount = sortedChannels.length;

    for (let bandIdx = 0; bandIdx < bandCount; bandIdx++) {
      const ch = sortedChannels[bandIdx];
      const bandBlocks = armBlocks[ch.id] || [];

      // Distribute bands from south to north, avoiding the poles
      // Range: phi from ~0.3 to ~2.84 (avoid top/bottom 17 degrees)
      const phi = 0.3 + ((bandIdx + 0.5) / bandCount) * (Math.PI - 0.6);

      // Channel hub sits on the sphere surface at band center
      const chTheta = (bandIdx * Math.PI * 2) / bandCount; // spread starting angles
      channelPositions[ch.id] = {
        x: radius * Math.sin(phi) * Math.cos(chTheta),
        y: radius * Math.cos(phi),
        z: radius * Math.sin(phi) * Math.sin(chTheta),
        angle: chTheta,
      };

      // Blocks distributed along the latitude ring
      for (let i = 0; i < bandBlocks.length; i++) {
        const blockIdx = bandBlocks[i];
        const theta = chTheta + (i / bandBlocks.length) * Math.PI * 2;

        // Slight radial scatter so they don't sit perfectly on the surface
        const rScatter = radius + (Math.random() - 0.5) * 60;
        // Slight latitude scatter to give thickness to each band
        const phiScatter = phi + (Math.random() - 0.5) * (0.5 / bandCount);

        blockPositions[blockIdx] = {
          x: rScatter * Math.sin(phiScatter) * Math.cos(theta),
          y: rScatter * Math.cos(phiScatter),
          z: rScatter * Math.sin(phiScatter) * Math.sin(theta),
        };
      }
    }

    return { channelPositions, blockPositions };
  }
}
