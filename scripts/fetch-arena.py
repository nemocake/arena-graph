#!/usr/bin/env python3
"""
Are.na Graph Data Fetcher

Fetches all channels and blocks for a user, outputs a Cytoscape.js-compatible
graph JSON file at data/arena-graph.json.

Uses incremental caching: already-fetched channels are saved to a cache file
and skipped on re-run, so interrupted runs can resume.

Usage:
    python3 scripts/fetch-arena.py          # uses scripts/.env
    python3 scripts/fetch-arena.py --fresh  # ignore cache, fetch everything
"""

import json
import math
import os
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request
import urllib.error
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

# ─── Config ──────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
ROOT = SCRIPT_DIR.parent
CACHE_PATH = ROOT / "data" / ".arena-cache.json"

API_BASE = "https://api.are.na/v2"
PER_PAGE = 50          # smaller pages = fewer timeouts
RATE_LIMIT_S = 1.2     # 1.2s between requests
MAX_RETRIES = 5
USER_ID = 646889


# ─── Load token ──────────────────────────────────────────────────────────────

def load_token():
    token = os.environ.get("ARENA_ACCESS_TOKEN")
    if token:
        return token.strip()
    env_path = SCRIPT_DIR / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("ARENA_ACCESS_TOKEN="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError(
        "ARENA_ACCESS_TOKEN not found. Set it as an env var or in scripts/.env"
    )


# ─── HTTP fetch with retry ───────────────────────────────────────────────────

SSL_CTX = ssl.create_default_context()


def api_fetch(path, token):
    url = f"{API_BASE}{path}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "User-Agent": "arena-graph-builder/1.0",
    }

    for attempt in range(1, MAX_RETRIES + 1):
        time.sleep(RATE_LIMIT_S)
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=60, context=SSL_CTX) as resp:
                return json.loads(resp.read().decode())
        except (urllib.error.HTTPError, urllib.error.URLError,
                json.JSONDecodeError, TimeoutError, ConnectionResetError) as e:
            code = getattr(e, 'code', 0)
            is_retryable = (
                code in (429, 500, 502, 503, 504)
                or isinstance(e, (urllib.error.URLError, TimeoutError, ConnectionResetError))
            )
            if attempt < MAX_RETRIES and is_retryable:
                delay = 5 * (2 ** attempt)  # 10s, 20s, 40s, 80s
                print(f"\n  ! Retry {attempt}/{MAX_RETRIES} (HTTP {code}, waiting {delay}s)")
                time.sleep(delay)
            else:
                raise


# ─── Cache helpers ────────────────────────────────────────────────────────────

def load_cache():
    if CACHE_PATH.exists():
        try:
            return json.loads(CACHE_PATH.read_text())
        except json.JSONDecodeError:
            pass
    return {}


def save_cache(cache):
    CACHE_PATH.parent.mkdir(exist_ok=True)
    CACHE_PATH.write_text(json.dumps(cache))


# ─── Fetch all user channels ─────────────────────────────────────────────────

def fetch_user_channels(token):
    print("> Fetching user channels...")
    data = api_fetch(f"/users/{USER_ID}/channels?per=100", token)
    channels = data.get("channels", [])
    print(f"  Found {len(channels)} channels")
    return channels


# ─── Fetch all blocks for a channel (paginated) ─────────────────────────────

def fetch_channel_contents(slug, total_length, token, per_page=None):
    if per_page is None:
        per_page = PER_PAGE
    total_pages = math.ceil(total_length / per_page)
    all_blocks = []

    for page in range(1, total_pages + 1):
        sys.stdout.write(f"  Page {page}/{total_pages} (per={per_page})...")
        sys.stdout.flush()
        try:
            data = api_fetch(
                f"/channels/{slug}/contents?per={per_page}&page={page}", token
            )
        except Exception:
            if per_page > 10:
                # Retry the entire channel with smaller pages
                smaller = max(10, per_page // 5)
                print(f"\n  ! Page size {per_page} failing, retrying channel with per={smaller}")
                return fetch_channel_contents(slug, total_length, token, per_page=smaller)
            raise
        contents = data.get("contents", [])
        all_blocks.extend(contents)
        print(f" {len(contents)} blocks")

    return all_blocks


# ─── Auto-tagging ────────────────────────────────────────────────────────────

FILE_EXTENSIONS = re.compile(r'\.(jpe?g|png|gif|bmp|tiff?|webp|svg|pdf|mp4|mov|avi|mp3|wav)$', re.I)

MEDIUM_KEYWORDS = [
    'paper', 'ink', 'acrylic', 'canvas', 'oil', 'pencil', 'digital', 'collage',
    'textile', 'video', 'ceramic', 'glass', 'bronze', 'linen', 'watercolor',
    'charcoal', 'lithograph', 'woodcut', 'etching', 'silkscreen', 'embroidery',
    'photograph', 'neon', 'wire', 'steel', 'wood', 'plaster', 'marble',
    'gouache', 'pastel', 'tempera', 'fresco', 'mosaic', 'porcelain',
    'aluminum', 'copper', 'latex', 'resin', 'plywood', 'cardboard',
    'fabric', 'thread', 'yarn', 'felt', 'silk', 'cotton', 'wool',
]

THEME_KEYWORDS = [
    'music', 'light', 'sound', 'landscape', 'grid', 'geometric', 'generative',
    'abstract', 'pattern', 'architecture', 'typography', 'algorithmic', 'minimal',
    'kinetic', 'optical', 'conceptual', 'systems', 'rhythm', 'portrait', 'nature',
    'chance', 'noise', 'color', 'space', 'time', 'movement', 'texture',
]

# Pre-compile word-boundary patterns
_MEDIUM_PATTERNS = {kw: re.compile(r'\b' + re.escape(kw) + r'\b', re.I) for kw in MEDIUM_KEYWORDS}
_THEME_PATTERNS = {kw: re.compile(r'\b' + re.escape(kw) + r'\b', re.I) for kw in THEME_KEYWORDS}


def extract_artist_names(seen_blocks):
    """Two-pass artist extraction: extract candidate names, confirm those appearing 2+ times."""
    candidate_counts = defaultdict(int)
    candidate_map = defaultdict(list)  # name -> [block_id, ...]

    for block_id, data in seen_blocks.items():
        title = data.get("label") or ""
        if not title or title == "Untitled":
            continue
        # Skip filenames
        if FILE_EXTENSIONS.search(title):
            continue
        # Match "Artist Name, Work Title" or "Artist Name — Work Title"
        for sep in [', ', ' — ', ' - ', ' – ']:
            if sep in title:
                parts = title.split(sep, 1)
                name = parts[0].strip()
                # Validate: name should be 2+ words or a known single-name artist pattern,
                # and not be too long (likely a sentence, not a name)
                if len(name) > 60 or len(name) < 3:
                    continue
                # Should contain at least one letter
                if not any(c.isalpha() for c in name):
                    continue
                slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
                if slug:
                    candidate_counts[slug] += 1
                    candidate_map[slug].append(f"bl-{block_id}")
                break  # only use first separator match

    # Confirm artists appearing 2+ times
    confirmed = {}
    for slug, count in candidate_counts.items():
        if count >= 2:
            confirmed[f"artist:{slug}"] = candidate_map[slug]

    return confirmed


def extract_medium_tags(seen_blocks):
    """Match medium/material keywords against title + description."""
    tag_map = defaultdict(list)

    for block_id, data in seen_blocks.items():
        text = ((data.get("label") or "") + " " + (data.get("description") or "")).lower()
        if not text.strip():
            continue
        for kw, pattern in _MEDIUM_PATTERNS.items():
            if pattern.search(text):
                tag_map[f"medium:{kw}"].append(f"bl-{block_id}")

    return dict(tag_map)


def extract_theme_tags(seen_blocks):
    """Match theme keywords against title + description."""
    tag_map = defaultdict(list)

    for block_id, data in seen_blocks.items():
        text = ((data.get("label") or "") + " " + (data.get("description") or "")).lower()
        if not text.strip():
            continue
        for kw, pattern in _THEME_PATTERNS.items():
            if pattern.search(text):
                tag_map[f"theme:{kw}"].append(f"bl-{block_id}")

    return dict(tag_map)


def extract_source_tags(seen_blocks, domain_counts):
    """Generate source tags for domains with 5+ blocks."""
    # Build domain -> block ids map
    domain_blocks = defaultdict(list)
    for block_id, data in seen_blocks.items():
        dom = data.get("domain")
        if dom and domain_counts.get(dom, 0) >= 5:
            domain_blocks[dom].append(f"bl-{block_id}")

    tag_map = {}
    for dom, block_ids in domain_blocks.items():
        # Simplify domain to slug
        slug = dom.replace('www.', '').split('.')[0]
        slug = re.sub(r'[^a-z0-9]+', '-', slug.lower()).strip('-')
        if slug:
            tag_key = f"source:{slug}"
            # Merge if duplicate slugs
            if tag_key in tag_map:
                tag_map[tag_key].extend(block_ids)
            else:
                tag_map[tag_key] = block_ids

    return tag_map


def auto_tag_blocks(seen_blocks, domain_counts):
    """Run all auto-tagging strategies, return autoTagIndex and per-block autoTags."""
    all_tags = {}

    # Artist names
    artist_tags = extract_artist_names(seen_blocks)
    all_tags.update(artist_tags)

    # Medium keywords
    medium_tags = extract_medium_tags(seen_blocks)
    all_tags.update(medium_tags)

    # Theme keywords
    theme_tags = extract_theme_tags(seen_blocks)
    all_tags.update(theme_tags)

    # Source tags
    source_tags = extract_source_tags(seen_blocks, domain_counts)
    all_tags.update(source_tags)

    # Build per-block autoTags lists
    block_tags = defaultdict(list)
    for tag, block_ids in all_tags.items():
        for bid in block_ids:
            block_tags[bid].append(tag)

    # Stats
    total_tagged = len(block_tags)
    total_tags = sum(len(t) for t in block_tags.values())
    unique_tags = len(all_tags)

    return all_tags, block_tags, {
        "totalTagged": total_tagged,
        "totalTags": total_tags,
        "uniqueTags": unique_tags,
    }


def build_search_index(seen_blocks):
    """Build inverted word index for prefix search in the UI."""
    index = defaultdict(list)
    for block_id, data in seen_blocks.items():
        text = ((data.get("label") or "") + " " + (data.get("description") or "")).lower()
        words = re.findall(r'[a-z0-9]{2,}', text)
        bid = f"bl-{block_id}"
        seen_words = set()
        for w in words:
            if w not in seen_words:
                seen_words.add(w)
                index[w].append(bid)
    return dict(index)


def build_sorted_timestamps(seen_blocks):
    """Build sorted [timestamp_ms, block_id] array for binary search timeline."""
    entries = []
    for block_id, data in seen_blocks.items():
        created = data.get("connectedAt") or data.get("createdAt") or ""
        if created:
            try:
                dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                ts = int(dt.timestamp() * 1000)
                entries.append([ts, f"bl-{block_id}"])
            except (ValueError, OSError):
                pass
    entries.sort(key=lambda x: x[0])
    return entries


def compute_block_timestamp(created_at):
    """Convert ISO date string to epoch milliseconds."""
    if not created_at:
        return None
    try:
        dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        return int(dt.timestamp() * 1000)
    except (ValueError, OSError):
        return None


# ─── Build graph ─────────────────────────────────────────────────────────────

def build_graph(channels, blocks_by_channel):
    nodes = []
    edges = []
    seen_blocks = {}

    # Channel nodes
    for ch in channels:
        length = ch.get("length", 0)
        size = max(50, min(120, 30 + math.log(length + 1) * 12))
        nodes.append({
            "data": {
                "id": f"ch-{ch['id']}",
                "label": ch["title"],
                "type": "channel",
                "slug": ch["slug"],
                "blockCount": length,
                "status": ch.get("status", "public"),
                "description": (ch.get("metadata") or {}).get("description", ""),
                "updatedAt": ch.get("updated_at", ""),
                "arenaUrl": f"https://www.are.na/conrad-house/{ch['slug']}",
                "size": round(size, 1),
            }
        })

    # Block nodes + edges
    channel_id_map = {ch["slug"]: ch["id"] for ch in channels}

    for slug, blocks in blocks_by_channel.items():
        channel_id = channel_id_map.get(slug)
        if not channel_id:
            continue

        for block in blocks:
            if not block or not block.get("id"):
                continue

            block_id = block["id"]
            block_node_id = f"bl-{block_id}"

            if block_id in seen_blocks:
                seen_blocks[block_id]["connectionCount"] += 1
                # Keep earliest connected_at across channels
                new_connected = block.get("connected_at", "")
                existing = seen_blocks[block_id].get("connectedAt", "")
                if new_connected and (not existing or new_connected < existing):
                    seen_blocks[block_id]["connectedAt"] = new_connected
                    seen_blocks[block_id]["ts"] = compute_block_timestamp(new_connected)
            else:
                thumb = None
                image = block.get("image") or {}
                if image.get("thumb", {}).get("url"):
                    thumb = image["thumb"]["url"]
                elif image.get("square", {}).get("url"):
                    thumb = image["square"]["url"]

                # Display URL (larger, plays GIFs)
                display = None
                if image.get("display", {}).get("url"):
                    display = image["display"]["url"]
                # Original URL (for GIFs, this is the animated file)
                original = None
                if image.get("original", {}).get("url"):
                    original = image["original"]["url"]

                source_url = (block.get("source") or {}).get("url")
                domain = None
                if source_url:
                    try:
                        domain = urllib.parse.urlparse(source_url).netloc
                    except Exception:
                        pass

                created_at = block.get("created_at", "")
                connected_at = block.get("connected_at", "") or created_at
                ts = compute_block_timestamp(connected_at)

                node_data = {
                    "id": block_node_id,
                    "label": block.get("title") or block.get("generated_title") or "Untitled",
                    "type": "block",
                    "class": block.get("class", "Unknown"),
                    "thumb": thumb,
                    "display": display,
                    "original": original,
                    "source": source_url,
                    "domain": domain,
                    "content": block.get("content", "") if block.get("class") == "Text" else None,
                    "description": block.get("description", ""),
                    "createdAt": created_at,
                    "connectedAt": connected_at,
                    "ts": ts,
                    "connectionCount": 1,
                }
                seen_blocks[block_id] = node_data
                nodes.append({"data": node_data})

            edges.append({
                "data": {
                    "id": f"e-{channel_id}-{block_id}",
                    "source": f"ch-{channel_id}",
                    "target": block_node_id,
                }
            })

    cross_connected = sum(1 for d in seen_blocks.values() if d["connectionCount"] > 1)

    # Count source domains
    domain_counts = {}
    for d in seen_blocks.values():
        dom = d.get("domain")
        if dom:
            domain_counts[dom] = domain_counts.get(dom, 0) + 1
    # Sort by count descending
    domain_counts = dict(sorted(domain_counts.items(), key=lambda x: -x[1]))

    # ─── Auto-tagging ───
    print("  > Running auto-tagging...")
    auto_tag_index, block_auto_tags, auto_tag_stats = auto_tag_blocks(seen_blocks, domain_counts)
    print(f"    {auto_tag_stats['uniqueTags']} unique tags, "
          f"{auto_tag_stats['totalTagged']} blocks tagged, "
          f"{auto_tag_stats['totalTags']} total tag assignments")

    # Apply autoTags to block nodes
    for node in nodes:
        bid = node["data"].get("id", "")
        if bid in block_auto_tags:
            node["data"]["autoTags"] = block_auto_tags[bid]

    # ─── Search index ───
    print("  > Building search index...")
    search_index = build_search_index(seen_blocks)
    print(f"    {len(search_index)} unique terms indexed")

    # ─── Sorted timestamps ───
    print("  > Building sorted timestamps...")
    sorted_timestamps = build_sorted_timestamps(seen_blocks)
    print(f"    {len(sorted_timestamps)} timestamped blocks")

    return {
        "meta": {
            "userId": USER_ID,
            "userSlug": "conrad-house",
            "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "channelCount": len(channels),
            "blockCount": len(seen_blocks),
            "edgeCount": len(edges),
            "crossConnectedBlocks": cross_connected,
            "domainCounts": domain_counts,
            "autoTagIndex": auto_tag_index,
            "autoTagStats": auto_tag_stats,
            "searchIndex": search_index,
            "sortedTimestamps": sorted_timestamps,
        },
        "elements": {"nodes": nodes, "edges": edges},
    }


# ─── Main ────────────────────────────────────────────────────────────────────

def main():
    token = load_token()
    fresh = "--fresh" in sys.argv

    print("Are.na Graph Fetcher")
    print("====================\n")

    # Load cache (skip already-fetched channels)
    cache = {} if fresh else load_cache()
    if cache:
        print(f"  Resuming with {len(cache)} cached channels\n")

    # 1. Fetch channels
    channels = fetch_user_channels(token)

    # 2. Fetch blocks per channel (with caching)
    blocks_by_channel = {}
    for ch in channels:
        slug = ch["slug"]
        length = ch.get("length", 0)

        if slug in cache:
            print(f'\n[OK] "{ch["title"]}" ({length} blocks) — cached')
            blocks_by_channel[slug] = cache[slug]
            continue

        print(f'\n> Fetching "{ch["title"]}" ({length} blocks)...')
        if length == 0:
            print("  (empty channel, skipping)")
            blocks_by_channel[slug] = []
            cache[slug] = []
            save_cache(cache)
            continue

        try:
            blocks = fetch_channel_contents(slug, length, token)
            blocks_by_channel[slug] = blocks
            # Cache the raw block data (save after each channel)
            cache[slug] = blocks
            save_cache(cache)
            print(f"  [OK] Saved to cache")
        except Exception as e:
            print(f"\n  [ERR] Failed to fetch {slug}: {e}")
            print(f"  Skipping this channel. Re-run to retry.")
            blocks_by_channel[slug] = []

    # 3. Build graph
    print("\n> Building graph...")
    graph = build_graph(channels, blocks_by_channel)

    # 4. Write output
    out_dir = ROOT / "data"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "arena-graph.json"
    with open(out_path, "w") as f:
        json.dump(graph, f, separators=(",", ":"))

    file_size = out_path.stat().st_size
    ats = graph['meta']['autoTagStats']
    print(f"\n[OK] Graph written to {out_path} ({file_size / 1024:.0f} KB)")
    print(f"  {graph['meta']['channelCount']} channels")
    print(f"  {graph['meta']['blockCount']} unique blocks")
    print(f"  {graph['meta']['edgeCount']} edges")
    print(f"  {graph['meta']['crossConnectedBlocks']} blocks in multiple channels")
    print(f"  {ats['uniqueTags']} auto-tags, {ats['totalTagged']} blocks tagged")
    print(f"  {len(graph['meta']['searchIndex'])} search index terms")
    print(f"  {len(graph['meta']['sortedTimestamps'])} sorted timestamps")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n[ERR] Error: {e}", file=sys.stderr)
        sys.exit(1)
