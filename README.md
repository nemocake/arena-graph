# Are.na Knowledge Graph

Interactive graph visualization of an Are.na collection. Built with Cytoscape.js.

## Setup

1. Add your Are.na token to `scripts/.env`:
   ```
   ARENA_ACCESS_TOKEN=your_token_here
   ```

2. Fetch/rebuild data (uses cache, no API calls if cache exists):
   ```bash
   python3 scripts/fetch-arena.py
   ```

3. Serve locally:
   ```bash
   python3 -m http.server 8000
   # Open http://localhost:8000/graph/
   ```

## Structure

- `graph/index.html` — The entire app (single file, ~3400 lines)
- `scripts/fetch-arena.py` — Data fetcher + auto-tagger
- `data/arena-graph.json` — Pre-built graph data (~3.3MB)

See `CLAUDE.md` for detailed architecture and integration notes.
