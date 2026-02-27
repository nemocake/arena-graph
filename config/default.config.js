/**
 * Default configuration for arena-3d.
 * Users override these values in arena-3d.config.js
 */
export default {
  // Are.na connection
  arena: {
    username: '',        // Are.na username slug (e.g., "john-doe")
    channels: [],        // Specific channel slugs or full URLs
    token: '',           // API token — or set ARENA_ACCESS_TOKEN env var
  },

  // Display / branding
  display: {
    title: 'arena-3d',
    subtitle: '/graph',
    accentColor: '#ccff00',
  },

  // Graph layout & colors
  graph: {
    centerChannel: '',          // Channel slug to center (auto: largest)
    colorPalette: [
      '#ccff00', '#00f3ff', '#ff3366', '#ff9900', '#00ff88',
      '#ff00ff', '#ffff00', '#33ccff', '#ff6633', '#66ff33',
      '#cc66ff', '#00ffcc',
    ],
    colorOverrides: {},         // { 'channel-slug': '#ff0000' }
    defaultLayout: 'spiral',   // spiral | galaxy | sphere | head
  },

  // Feature toggles
  features: {
    layouts: ['spiral', 'galaxy', 'sphere', 'head'],
    modes: ['living', 'aurora', 'dream', 'cosmos', 'nebula'],
    search: true,
    gallery: true,
    pathfinder: true,
    timeline: true,
    minimap: true,
    stats: true,
    filters: true,
    autoTags: true,
    constellation: true,
    randomWalk: true,
    ageHeatmap: true,
    findSimilar: true,
    drift: true,
  },

  // Rendering
  rendering: {
    bloomStrength: 0.4,
    bloomRadius: 0.3,
    bloomThreshold: 0.6,
    fogDensity: 0.00015,
    scanlines: true,
    noise: true,
  },
};
