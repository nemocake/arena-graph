export const CHANNEL_PALETTE = [
  '#ccff00', '#00f3ff', '#ff3366', '#ff9900', '#00ff88',
  '#ff00ff', '#ffff00', '#33ccff', '#ff6633', '#66ff33',
  '#cc66ff', '#00ffcc',
];

// Hard-coded RGB channel color overrides
export const RGB_COLORS = {
  'ch-2711353': '#ff3333', // RED
  'ch-2711352': '#33ff66', // GREEN
  'ch-2711351': '#3388ff', // BLUE
};

// Center channel (largest) and RGB ring channels
export const CENTER_ID = 'ch-2689725'; // visually intriguing
export const RGB_IDS = ['ch-2711353', 'ch-2711352', 'ch-2711351'];

// Layout
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
export const BLOCK_SPREAD = 18;
export const BLOCK_BASE_RADIUS = 40;
export const RING_GAP = 300;
export const Y_UNDULATION_FREQ = 0.3;
export const Y_UNDULATION_AMP = 50;
export const RING_Y_OFFSETS = [0, -200, 200]; // Ring 1, 2, 3

// Rendering
export const NODE_GEOMETRY_RADIUS = 4;
export const NODE_GEOMETRY_DETAIL = 1;
export const CHANNEL_SIZE_BASE = 20;
export const CHANNEL_SIZE_SCALE = 0.3;
export const EDGE_OPACITY = 0.07;
export const FADED_OPACITY = 0.06;

// Camera
export const CAMERA_FOV = 60;
export const CAMERA_NEAR = 1;
export const CAMERA_FAR = 20000;
export const CAMERA_INITIAL_Z = 2500;
export const FLY_TO_DURATION = 800;
export const FLY_TO_OFFSET = 150;

// Post-processing
export const BLOOM_STRENGTH = 0.4;
export const BLOOM_RADIUS = 0.3;
export const BLOOM_THRESHOLD = 0.6;
export const FOG_COLOR = 0x050505;
export const FOG_DENSITY = 0.00015;

// Interaction
export const TOOLTIP_OFFSET = 15;
export const HOVER_SCALE = 1.8;
export const HIGHLIGHT_SCALE = 1.5;
export const SEARCH_HIGHLIGHT_COLOR = [0, 0.95, 1]; // neon blue
export const PATH_COLOR = [1, 0.2, 0.4]; // pink
export const SIMILAR_COLOR = [0.8, 0.4, 1]; // purple
export const CONSTELLATION_COLOR = [0.8, 1, 0]; // acid

// Age heatmap gradient stops (t -> [r,g,b])
export const AGE_GRADIENT = [
  [0.0, [0.0, 0.4, 1.0]],   // blue
  [0.25, [0.0, 0.8, 0.8]],  // cyan
  [0.5, [0.0, 0.8, 0.0]],   // green
  [0.75, [0.8, 0.8, 0.0]],  // yellow
  [1.0, [1.0, 0.2, 0.0]],   // red
];

// Category colors
export const CAT_COLORS = {
  artist: '#ff3366',
  medium: '#00ff88',
  theme: '#00f3ff',
  source: '#ff9900',
};
