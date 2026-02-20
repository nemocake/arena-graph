# arena-graph

A visual explorer for your [Are.na](https://www.are.na) channels. Renders all your blocks and connections as an interactive graph using Cytoscape.js.

\![status](https://img.shields.io/badge/status-active-brightgreen)

## What it does

Fetches every channel and block from an Are.na account via the API, builds a graph data file, and serves a single-page visualizer with:

- **Graph view** — spiral layout with channels as hubs and blocks as nodes
- **Auto-tagging** — extracts artist names, mediums, themes, and source domains from block metadata at build time
- **Search** — prefix-matching across a pre-built index
- **Gallery** — grid view of visible blocks, sortable by date/name/connections
- **Path finder** — shortest path between any two blocks (Dijkstra)
- **Constellation mode** — draws connections between blocks that share tags
- **Category filter** — filter by artist, medium, theme, or source with multi-select
- **Channel filter** — toggle individual channels on/off
- **Age heatmap** — color blocks by creation date
- **Stats panel** — type distribution, top tags, monthly histogram

## Setup

**Requirements:** Python 3 (no pip dependencies), a browser, and an [Are.na access token](https://dev.are.na/oauth/applications).

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

3. Serve it:

   ```bash
   python3 -m http.server 8000
   # open http://localhost:8000/graph/
   ```

## Project structure

```
scripts/fetch-arena.py   — fetches from Are.na API, builds graph JSON + auto-tags
data/arena-graph.json    — pre-built graph data (Cytoscape.js format)
graph/index.html         — the entire app in one file, no build step
```

## How auto-tagging works

The fetch script parses block titles and descriptions to extract tags — no ML involved:

- **Artists** — "Artist Name, Work Title" patterns
- **Mediums** — keyword matching (paper, textile, ceramic, etc.)
- **Themes** — keyword matching (grid, pattern, landscape, etc.)
- **Sources** — domains that appear on 5+ blocks

Tags are baked into the graph JSON at build time so the browser doesn't need to do any processing.

## License

MIT