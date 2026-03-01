/**
 * arena-3d Configuration
 *
 * Set your Are.na username or channel URLs below, then run:
 *   npm run fetch    — to pull your data
 *   npm run dev      — to launch the visualization
 *
 * Get an API token at: https://dev.are.na/oauth/applications
 */
export default {
  arena: {
    // Option A: Your Are.na username (fetches ALL your channels)
    username: '',

    // Option B: Specific channel URLs or slugs
    // channels: ['my-channel-slug', 'https://www.are.na/user/another-channel'],

    // API token (required for username mode, recommended for all use)
    // Free to get — see docs/TOKEN-GUIDE.md for a walkthrough
    token: '',
  },

  display: {
    title: 'arena-3d',       // Shown in header and browser tab
    subtitle: '/graph',       // Small label next to title
    // accentColor: '#ccff00', // UI accent color (default: acid green)
  },

  // graph: {
  //   centerChannel: '',      // Channel slug to place at center (default: largest)
  //   colorPalette: [],       // Custom hex array for channel colors
  //   colorOverrides: {},     // { 'channel-slug': '#ff0000' }
  //   defaultLayout: 'spiral',
  // },

  // features: {
  //   layouts: ['spiral', 'galaxy', 'sphere', 'head'],
  //   modes: ['living', 'aurora', 'dream', 'cosmos', 'nebula'],
  // },
};
