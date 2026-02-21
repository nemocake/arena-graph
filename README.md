# arena-graph

A 3D interactive graph visualization for [Are.na](https://www.are.na) channels. Renders blocks and connections as a navigable WebGL scene with bloom, fog, and custom shaders.

Currently built around my own Are.na profile, but the goal is to make this an open-source tool anyone can use to visualize their own channels.

![status](https://img.shields.io/badge/status-work%20in%20progress-yellow)

## What it does

Fetches every channel and block from an Are.na account via the API, builds a graph data file, and renders a full 3D visualization with:

- **Three.js/WebGL rendering** — InstancedMesh for 2300+ nodes in a single draw call, GLSL shaders with emissive glow
- **3D spiral layout** — channels arranged on concentric rings, blocks spiral around them with golden-angle spacing
- **Post-processing** — bloom, CRT scanlines, vignette, exponential fog
- **GPU picking** — O(1) hover detection via offscreen color-ID render
- **Search** — prefix-matching across a pre-built index
- **Gallery** — grid view of visible blocks, sortable by date/name/connections
- **Path finder** — shortest path between any two blocks (BFS)
- **Constellation mode** — dashed edges between blocks sharing tags
- **Category filter** — filter by artist, medium, theme, or source
- **Channel filter** — toggle individual channels on/off
- **Age heatmap** — color nodes by creation date (blue → red gradient)
- **Stats panel** — type distribution, top tags, monthly histogram
- **Minimap** — 2D canvas overlay with camera viewport
- **Random walk** — auto-navigate through connected blocks
- **Keyboard navigation** — arrow keys move between neighbors

## Setup

**Requirements:** Python 3, Node.js, and an [Are.na access token](https://dev.are.na/oauth/applications).

1. Clone the repo and add your token:

   ```
   git clone https://github.com/nemocake/arena-graph.git
   cd arena-graph
   echo "ARENA_ACCESS_TOKEN=your_token_here" > scripts/.env
   ```

2. Fetch your data:

   ```bash
   python3 scripts/fetch-arena.py         # incremental (uses cache)
   python3 scripts/fetch-arena.py --fresh  # full re-fetch
   ```

3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

The legacy Cytoscape.js version is still available at `graph/index.html` if you want to compare.

## Project structure

```
scripts/fetch-arena.py       — fetches from Are.na API, builds graph JSON + auto-tags
data/arena-graph.json        — pre-built graph data
graph/index.html             — legacy Cytoscape.js version (single file, no build step)
index.html                   — new entry point (HTML shell)
src/
  main.js                    — boot sequence, wires all systems together
  constants.js               — palette, layout params, rendering thresholds
  state/AppState.js           — reactive state management
  core/                      — SceneManager, CameraController, PostProcessing
  graph/                     — NodeRenderer, EdgeRenderer, ConstellationRenderer, GraphData
  layout/                    — SpiralLayout, LayoutEngine
  interaction/               — Raycaster, TooltipManager, SelectionManager, KeyboardNav
  features/                  — DetailPanel, SearchEngine, FilterEngine, PathFinder,
                               AgeHeatmap, FindSimilar, GalleryMode, StatsPanel,
                               MinimapRenderer, RandomWalk
  shaders/                   — GLSL vertex/fragment shaders (node, edge, picking, scanline)
  utils/                     — color helpers, binary search
  styles/main.css            — glass panels, scrollbars, overlays
```

## How auto-tagging works

The fetch script parses block titles and descriptions to extract tags — no ML involved:

- **Artists** — "Artist Name, Work Title" patterns
- **Mediums** — keyword matching (paper, textile, ceramic, etc.)
- **Themes** — keyword matching (grid, pattern, landscape, etc.)
- **Sources** — domains that appear on 5+ blocks

Tags are baked into the graph JSON at build time so the browser doesn't need to do any processing.

## Roadmap

- [ ] Make the data pipeline configurable for any Are.na user/channel
- [ ] Template mode — plug in your own Are.na token and see your graph
- [ ] Thumbnail textures on close zoom
- [ ] Performance LOD at distance
- [ ] Deploy as standalone page at conradhouse.com/graph

## License

MIT
