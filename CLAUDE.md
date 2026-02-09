# Are.na Knowledge Graph

## What This Is

Interactive graph visualization of Conrad's Are.na collection — 12 channels, 2,333 blocks, 2,407 edges. Built as a single-page app with Cytoscape.js. The goal is to integrate this into the main website at `conradhouse.com/graph`.

## Architecture

```
arena-graph/
├── scripts/
│   └── fetch-arena.py      # Data fetcher + auto-tagger (Python 3, no deps)
│   └── .env                 # ARENA_ACCESS_TOKEN=... (not committed)
├── graph/
│   └── index.html           # Everything: HTML + CSS + JS in one file (~3400 lines)
├── data/
│   ├── arena-graph.json     # Graph data (~3.3MB, committed)
│   └── .arena-cache.json    # Raw API cache (~9MB, gitignored)
```

## Key Decisions

- **Single file**: All JS lives in one IIFE inside `index.html`. No build step, no bundler.
- **No dependencies beyond CDN**: Cytoscape.js 3.30.4, Tailwind CSS, Google Fonts (JetBrains Mono, Space Grotesk, Syne).
- **Data at build time**: `fetch-arena.py` does all heavy lifting (auto-tagging, search index, timestamp pre-computation). The browser just reads the pre-built JSON.
- **localStorage tags**: Manual tags persist in `localStorage` under key `arena-graph-tags`.

## Data Pipeline

```bash
# First time: needs ARENA_ACCESS_TOKEN in scripts/.env
python3 scripts/fetch-arena.py

# Subsequent runs: uses cache, only fetches new/changed channels
python3 scripts/fetch-arena.py

# Fresh fetch (ignore cache):
python3 scripts/fetch-arena.py --fresh
```

The script outputs `data/arena-graph.json` with:
- `meta`: stats, `autoTagIndex` (inverted tag→blocks map), `searchIndex` (word→blocks), `sortedTimestamps` (for binary search timeline)
- `elements.nodes`: channel nodes + block nodes (each block has `autoTags`, `ts` fields)
- `elements.edges`: channel→block connections

## Auto-Tag System

307 tags extracted at build time, no ML:
- `artist:anni-albers` — parsed from "Artist Name, Work Title" pattern (192 artists)
- `medium:paper` — keyword matching against title+description (37 mediums)
- `theme:grid` — keyword matching (26 themes)
- `source:garadinervi` — domains with 5+ blocks (52 sources)

## Features (Phase 1 + Phase 2)

### Core
- Cytoscape graph with spiral/radial/orbit/domain layouts
- Channel color coding, cross-link emphasis
- Double-click channel to focus/isolate
- Detail panel (right slide-out) with full block info

### Performance (Phase 2)
- Viewport-only LOD (thumbnails only when zoomed in + in view)
- Targeted highlight (tracks changed elements instead of touching all 4752)
- Selector-based type filtering
- Binary search timeline with rAF throttle
- Pre-built search index (prefix matching, multi-word intersection)
- Image preload queue (max 5 concurrent)
- Cached minimap bitmap (off-screen canvas for nodes, live viewport overlay)
- Batch rAF layout animation (single loop instead of 2345 individual .animate())

### Exploration (Phase 2)
- **Gallery**: Grid thumbnails of visible blocks, sortable (newest/oldest/A-Z/connections)
- **Find Similar**: Scores blocks by shared auto-tag count, highlights top 20
- **Age Heatmap**: Blue→red gradient by creation date
- **Keyboard Nav**: Arrow keys move between connected blocks
- **Path Finder**: Click two blocks → Dijkstra shortest path
- **Constellation**: Dashed edges between blocks sharing artist/medium/theme tags
- **Stats Panel**: Type distribution, top artists/mediums/themes/domains, monthly histogram
- **Auto-Tag UI**: Apply auto-tags to localStorage, category filter (ART/MED/THM/SRC)

### Tagging
- Manual tags via localStorage (create, assign to blocks, export/import JSON)
- Auto-tags from build data (Apply Auto-Tags button in settings)
- Tag filter bar with category dropdown

## Code Patterns

### Hooks for Late-Defined Features
Features register cleanup callbacks so earlier code (like the RST button) can clean up without forward references:
```javascript
const _resetHooks = [];
const _escapeHooks = [];

// RST button calls:
_resetHooks.forEach(fn => fn());

// Later, a feature registers:
_resetHooks.push(() => { /* cleanup */ });
```

### Highlight Tracking
Instead of `cy.elements().addClass('faded')` (touches all 4752 elements), we track what was changed:
```javascript
let _lastHighlightedSet = null;
let _lastFadedSet = null;

function clearHighlight() {
    if (_lastHighlightedSet) _lastHighlightedSet.removeClass('highlighted');
    if (_lastFadedSet) _lastFadedSet.removeClass('faded');
}
```

## Integration Notes

When integrating into the main site:
1. `index.html` assumes the graph data is at `../data/arena-graph.json` (line ~618)
2. Navigation links in the header point to `../writings/index.html`, `../projects/index.html`, etc. — adjust paths
3. The page requires desktop (mobile splash screen blocks it)
4. Tailwind is loaded via CDN — if the main site uses a built Tailwind, reconcile configs
5. The `scripts/.env` file with `ARENA_ACCESS_TOKEN` is needed to re-fetch data
