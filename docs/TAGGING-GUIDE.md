# Tagging Guide

arena-3d automatically extracts tags from your Are.na block titles and descriptions. Better-structured titles = richer visualizations with constellations, filtering, and similar-block discovery.

## How Auto-Tagging Works

The fetcher scans every block's title and description for patterns:

### Artist Names

**Format:** `Artist Name, Work Title` or `Artist Name — Description`

Separators recognized: `, ` | ` — ` | ` - ` | ` – `

Names that appear 2+ times across your blocks are confirmed as artist tags. This prevents false positives from random phrases.

```
Vera Molnar, Interruptions               → artist:vera-molnar
Frieder Nake — Walk Through Raster        → artist:frieder-nake
John Cage - 4'33"                         → artist:john-cage
```

### Medium / Material Tags

Keywords detected in title or description:

```
paper, ink, acrylic, canvas, oil, pencil, digital, collage, textile,
video, ceramic, glass, bronze, linen, watercolor, charcoal, lithograph,
woodcut, etching, silkscreen, embroidery, photograph, neon, wire, steel,
wood, plaster, marble, gouache, pastel, tempera, fresco, mosaic, porcelain,
aluminum, copper, latex, resin, plywood, cardboard, fabric, thread, yarn,
felt, silk, cotton, wool
```

Example: A block titled "Ink drawings on paper" → `medium:ink`, `medium:paper`

### Theme Tags

Conceptual keywords:

```
music, light, sound, landscape, grid, geometric, generative, abstract,
pattern, architecture, typography, algorithmic, minimal, kinetic, optical,
conceptual, systems, rhythm, portrait, nature, chance, noise, color, space,
time, movement, texture
```

Example: A block described as "Generative geometric patterns" → `theme:generative`, `theme:geometric`, `theme:pattern`

### Source Tags

Domains that appear 5+ times across your blocks get source tags:

```
source:youtube     (from youtube.com links)
source:wikipedia   (from wikipedia.org links)
source:tumblr      (from tumblr.com links)
```

## Tips for Better Tags

### Title Formatting

Use consistent title formats for best results:

**Best:**
```
Vera Molnar, Interruptions, 1968
Sol LeWitt — Wall Drawing #260
```

**Good:**
```
geometric pattern study
algorithmic art on paper
```

**Minimal tagging:**
```
IMG_4523.jpg
Untitled
```

### Descriptions

Add context in the block description field on Are.na:
- Materials used
- Artistic movement or theme
- Year or period
- Technique

### Channel Organization

How you organize channels doesn't affect auto-tagging, but it does affect:
- Graph layout (blocks cluster around their parent channel)
- Color coding (each channel gets a unique color)
- Cross-link detection (blocks in multiple channels become bridges)

## Using Tags in arena-3d

Once tags are extracted, they power several features:

1. **Category Filter** — Filter blocks by artist, medium, theme, or source
2. **Constellations** — Toggle CONSTELLATE to see dashed edges between blocks sharing tags
3. **Find Similar** — Click a block → "Find Similar" shows other blocks with matching tags
4. **Statistics** — Tag distribution breakdown in the STATS panel

## Custom Tags (Future)

We're working on:
- Manual tag overrides via a tags.json file
- Custom keyword lists you can add to the config
- Tag inheritance from Are.na's built-in channel descriptions
