#!/usr/bin/env node

/**
 * arena-3d Data Fetcher
 *
 * Fetches Are.na channels and blocks, outputs arena-graph.json.
 * Reads config from config/arena-3d.config.js or CLI args.
 *
 * Usage:
 *   node scripts/fetch.js                          # uses config file
 *   node scripts/fetch.js --username john-doe       # fetch all channels for user
 *   node scripts/fetch.js --channels slug1,slug2    # fetch specific channels
 *   node scripts/fetch.js --token YOUR_TOKEN        # API token
 *   node scripts/fetch.js --fresh                   # ignore cache, re-fetch all
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const CACHE_PATH = join(DATA_DIR, '.arena-cache.json');
const OUTPUT_PATH = join(DATA_DIR, 'arena-graph.json');

const API_BASE = 'https://api.are.na/v2';
const PER_PAGE = 50;
const RATE_LIMIT_MS = 1200;
const MAX_RETRIES = 5;

// ─── Parse CLI args ──────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { fresh: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--username': parsed.username = args[++i]; break;
      case '--channels': parsed.channels = args[++i].split(',').map(s => s.trim()); break;
      case '--token': parsed.token = args[++i]; break;
      case '--fresh': parsed.fresh = true; break;
    }
  }
  return parsed;
}

// ─── Load config ─────────────────────────────────────────────────────────────

async function loadConfig() {
  const cliArgs = parseArgs();

  // Try loading config file
  let fileConfig = {};
  const configPath = join(ROOT, 'config', 'arena-3d.config.js');
  try {
    const mod = await import('file:///' + configPath.replace(/\\/g, '/'));
    fileConfig = mod.default || {};
  } catch (e) {
    // Config file missing or invalid — that's OK if CLI args are provided
  }

  const arena = fileConfig.arena || {};

  return {
    username: cliArgs.username || arena.username || '',
    channels: cliArgs.channels || (arena.channels || []).map(ch => {
      const match = ch.match(/are\.na\/[^/]+\/([^/?#]+)/);
      return match ? match[1] : ch;
    }),
    token: cliArgs.token || arena.token || process.env.ARENA_ACCESS_TOKEN || '',
    fresh: cliArgs.fresh,
  };
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function apiFetch(path, token) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'arena-3d/1.0',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await sleep(RATE_LIMIT_MS);
    try {
      const resp = await fetch(url, { headers });
      if (resp.status === 429 || resp.status >= 500) {
        throw new Error(`HTTP ${resp.status}`);
      }
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      }
      return await resp.json();
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        const delay = 5000 * Math.pow(2, attempt);
        console.log(`  ! Retry ${attempt}/${MAX_RETRIES} (${e.message}, waiting ${delay / 1000}s)`);
        await sleep(delay);
      } else {
        throw e;
      }
    }
  }
}

// ─── Cache ───────────────────────────────────────────────────────────────────

function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
  } catch { return {}; }
}

function saveCache(cache) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CACHE_PATH, JSON.stringify(cache));
}

// ─── Fetch channels ──────────────────────────────────────────────────────────

async function fetchUserChannels(username, token) {
  // First get user ID from username
  console.log(`> Looking up user: ${username}`);
  const userData = await apiFetch(`/users/${username}`, token);
  const userId = userData.id;
  console.log(`  Found user ID: ${userId}`);

  console.log('> Fetching channels...');
  const data = await apiFetch(`/users/${userId}/channels?per=100`, token);
  const channels = data.channels || [];
  console.log(`  Found ${channels.length} channels`);
  return { channels, userId, userSlug: username };
}

async function fetchSpecificChannels(slugs, token) {
  console.log(`> Fetching ${slugs.length} specific channels...`);
  const channels = [];
  for (const slug of slugs) {
    try {
      const ch = await apiFetch(`/channels/${slug}`, token);
      channels.push(ch);
      console.log(`  [OK] "${ch.title}" (${ch.length} blocks)`);
    } catch (e) {
      console.log(`  [ERR] Failed to fetch channel "${slug}": ${e.message}`);
    }
  }
  return { channels, userId: null, userSlug: '' };
}

// ─── Fetch blocks ────────────────────────────────────────────────────────────

async function fetchChannelBlocks(slug, totalLength, token) {
  const totalPages = Math.ceil(totalLength / PER_PAGE);
  const allBlocks = [];

  for (let page = 1; page <= totalPages; page++) {
    process.stdout.write(`  Page ${page}/${totalPages}...`);
    try {
      const data = await apiFetch(`/channels/${slug}/contents?per=${PER_PAGE}&page=${page}`, token);
      const contents = data.contents || [];
      allBlocks.push(...contents);
      console.log(` ${contents.length} blocks`);
    } catch (e) {
      console.log(` [ERR] ${e.message}`);
      // Try smaller page size
      if (PER_PAGE > 10) {
        console.log('  Retrying with smaller page size...');
        return fetchChannelBlocksSmall(slug, totalLength, token);
      }
      throw e;
    }
  }
  return allBlocks;
}

async function fetchChannelBlocksSmall(slug, totalLength, token) {
  const perPage = 10;
  const totalPages = Math.ceil(totalLength / perPage);
  const allBlocks = [];

  for (let page = 1; page <= totalPages; page++) {
    process.stdout.write(`  Page ${page}/${totalPages} (small)...`);
    const data = await apiFetch(`/channels/${slug}/contents?per=${perPage}&page=${page}`, token);
    const contents = data.contents || [];
    allBlocks.push(...contents);
    console.log(` ${contents.length} blocks`);
  }
  return allBlocks;
}

// ─── Auto-tagging ────────────────────────────────────────────────────────────

const MEDIUM_KEYWORDS = [
  'paper', 'ink', 'acrylic', 'canvas', 'oil', 'pencil', 'digital', 'collage',
  'textile', 'video', 'ceramic', 'glass', 'bronze', 'linen', 'watercolor',
  'charcoal', 'lithograph', 'woodcut', 'etching', 'silkscreen', 'embroidery',
  'photograph', 'neon', 'wire', 'steel', 'wood', 'plaster', 'marble',
  'gouache', 'pastel', 'tempera', 'fresco', 'mosaic', 'porcelain',
  'aluminum', 'copper', 'latex', 'resin', 'plywood', 'cardboard',
  'fabric', 'thread', 'yarn', 'felt', 'silk', 'cotton', 'wool',
];

const THEME_KEYWORDS = [
  'music', 'light', 'sound', 'landscape', 'grid', 'geometric', 'generative',
  'abstract', 'pattern', 'architecture', 'typography', 'algorithmic', 'minimal',
  'kinetic', 'optical', 'conceptual', 'systems', 'rhythm', 'portrait', 'nature',
  'chance', 'noise', 'color', 'space', 'time', 'movement', 'texture',
];

const FILE_EXT_RE = /\.(jpe?g|png|gif|bmp|tiff?|webp|svg|pdf|mp4|mov|avi|mp3|wav)$/i;

function extractArtistNames(seenBlocks) {
  const candidateCounts = {};
  const candidateMap = {};

  for (const [blockId, data] of Object.entries(seenBlocks)) {
    const title = data.label || '';
    if (!title || title === 'Untitled') continue;
    if (FILE_EXT_RE.test(title)) continue;

    for (const sep of [', ', ' — ', ' - ', ' – ']) {
      if (title.includes(sep)) {
        const name = title.split(sep, 1)[0].trim();
        if (name.length > 60 || name.length < 3) continue;
        if (!/[a-zA-Z]/.test(name)) continue;
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (slug) {
          candidateCounts[slug] = (candidateCounts[slug] || 0) + 1;
          if (!candidateMap[slug]) candidateMap[slug] = [];
          candidateMap[slug].push(`bl-${blockId}`);
        }
        break;
      }
    }
  }

  const confirmed = {};
  for (const [slug, count] of Object.entries(candidateCounts)) {
    if (count >= 2) {
      confirmed[`artist:${slug}`] = candidateMap[slug];
    }
  }
  return confirmed;
}

function extractKeywordTags(seenBlocks, keywords, prefix) {
  const tagMap = {};
  const patterns = keywords.map(kw => [kw, new RegExp(`\\b${kw}\\b`, 'i')]);

  for (const [blockId, data] of Object.entries(seenBlocks)) {
    const text = ((data.label || '') + ' ' + (data.description || '')).toLowerCase();
    if (!text.trim()) continue;
    for (const [kw, re] of patterns) {
      if (re.test(text)) {
        const tag = `${prefix}:${kw}`;
        if (!tagMap[tag]) tagMap[tag] = [];
        tagMap[tag].push(`bl-${blockId}`);
      }
    }
  }
  return tagMap;
}

function extractSourceTags(seenBlocks, domainCounts) {
  const domainBlocks = {};
  for (const [blockId, data] of Object.entries(seenBlocks)) {
    const dom = data.domain;
    if (dom && (domainCounts[dom] || 0) >= 5) {
      if (!domainBlocks[dom]) domainBlocks[dom] = [];
      domainBlocks[dom].push(`bl-${blockId}`);
    }
  }

  const tagMap = {};
  for (const [dom, blockIds] of Object.entries(domainBlocks)) {
    const slug = dom.replace('www.', '').split('.')[0]
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (slug) {
      const key = `source:${slug}`;
      tagMap[key] = [...(tagMap[key] || []), ...blockIds];
    }
  }
  return tagMap;
}

function autoTagBlocks(seenBlocks, domainCounts) {
  const allTags = {
    ...extractArtistNames(seenBlocks),
    ...extractKeywordTags(seenBlocks, MEDIUM_KEYWORDS, 'medium'),
    ...extractKeywordTags(seenBlocks, THEME_KEYWORDS, 'theme'),
    ...extractSourceTags(seenBlocks, domainCounts),
  };

  const blockTags = {};
  for (const [tag, blockIds] of Object.entries(allTags)) {
    for (const bid of blockIds) {
      if (!blockTags[bid]) blockTags[bid] = [];
      blockTags[bid].push(tag);
    }
  }

  return {
    autoTagIndex: allTags,
    blockAutoTags: blockTags,
    stats: {
      totalTagged: Object.keys(blockTags).length,
      totalTags: Object.values(blockTags).reduce((s, t) => s + t.length, 0),
      uniqueTags: Object.keys(allTags).length,
    },
  };
}

// ─── Search index ────────────────────────────────────────────────────────────

function buildSearchIndex(seenBlocks) {
  const index = {};
  for (const [blockId, data] of Object.entries(seenBlocks)) {
    const text = ((data.label || '') + ' ' + (data.description || '')).toLowerCase();
    const words = text.match(/[a-z0-9]{2,}/g) || [];
    const bid = `bl-${blockId}`;
    const seen = new Set();
    for (const w of words) {
      if (!seen.has(w)) {
        seen.add(w);
        if (!index[w]) index[w] = [];
        index[w].push(bid);
      }
    }
  }
  return index;
}

function buildSortedTimestamps(seenBlocks) {
  const entries = [];
  for (const [blockId, data] of Object.entries(seenBlocks)) {
    const created = data.connectedAt || data.createdAt || '';
    if (created) {
      try {
        const ts = new Date(created).getTime();
        if (!isNaN(ts)) entries.push([ts, `bl-${blockId}`]);
      } catch {}
    }
  }
  entries.sort((a, b) => a[0] - b[0]);
  return entries;
}

// ─── Build graph ─────────────────────────────────────────────────────────────

function buildGraph(channels, blocksByChannel, userSlug) {
  const nodes = [];
  const edges = [];
  const seenBlocks = {};

  // Channel nodes
  for (const ch of channels) {
    const length = ch.length || 0;
    const size = Math.max(50, Math.min(120, 30 + Math.log(length + 1) * 12));
    nodes.push({
      data: {
        id: `ch-${ch.id}`,
        label: ch.title,
        type: 'channel',
        slug: ch.slug,
        blockCount: length,
        status: ch.status || 'public',
        description: (ch.metadata || {}).description || '',
        updatedAt: ch.updated_at || '',
        arenaUrl: `https://www.are.na/${userSlug || ch.user?.slug || 'channel'}/${ch.slug}`,
        size: Math.round(size * 10) / 10,
      },
    });
  }

  // Block nodes + edges
  const channelIdMap = {};
  for (const ch of channels) channelIdMap[ch.slug] = ch.id;

  for (const [slug, blocks] of Object.entries(blocksByChannel)) {
    const channelId = channelIdMap[slug];
    if (!channelId) continue;

    for (const block of blocks) {
      if (!block || !block.id) continue;

      const blockId = block.id;
      const blockNodeId = `bl-${blockId}`;

      if (seenBlocks[blockId]) {
        seenBlocks[blockId].connectionCount++;
        const newConnected = block.connected_at || '';
        const existing = seenBlocks[blockId].connectedAt || '';
        if (newConnected && (!existing || newConnected < existing)) {
          seenBlocks[blockId].connectedAt = newConnected;
        }
      } else {
        const image = block.image || {};
        const thumb = image.thumb?.url || image.square?.url || null;
        const display = image.display?.url || null;
        const original = image.original?.url || null;

        const sourceUrl = block.source?.url || null;
        let domain = null;
        if (sourceUrl) {
          try { domain = new URL(sourceUrl).hostname; } catch {}
        }

        const createdAt = block.created_at || '';
        const connectedAt = block.connected_at || createdAt;

        const nodeData = {
          id: blockNodeId,
          label: block.title || block.generated_title || 'Untitled',
          type: 'block',
          class: block.class || 'Unknown',
          thumb, display, original,
          source: sourceUrl,
          domain,
          content: block.class === 'Text' ? (block.content || '') : null,
          description: block.description || '',
          createdAt,
          connectedAt,
          ts: connectedAt ? new Date(connectedAt).getTime() : null,
          connectionCount: 1,
        };
        seenBlocks[blockId] = nodeData;
        nodes.push({ data: nodeData });
      }

      edges.push({
        data: {
          id: `e-${channelId}-${blockId}`,
          source: `ch-${channelId}`,
          target: blockNodeId,
        },
      });
    }
  }

  const crossConnected = Object.values(seenBlocks).filter(d => d.connectionCount > 1).length;

  // Domain counts
  const domainCounts = {};
  for (const d of Object.values(seenBlocks)) {
    if (d.domain) domainCounts[d.domain] = (domainCounts[d.domain] || 0) + 1;
  }

  // Auto-tagging
  console.log('  > Running auto-tagging...');
  const { autoTagIndex, blockAutoTags, stats: autoTagStats } = autoTagBlocks(seenBlocks, domainCounts);
  console.log(`    ${autoTagStats.uniqueTags} unique tags, ${autoTagStats.totalTagged} blocks tagged`);

  // Apply autoTags to nodes
  for (const node of nodes) {
    const bid = node.data.id;
    if (blockAutoTags[bid]) {
      node.data.autoTags = blockAutoTags[bid];
    }
  }

  // Search index
  console.log('  > Building search index...');
  const searchIndex = buildSearchIndex(seenBlocks);
  console.log(`    ${Object.keys(searchIndex).length} unique terms indexed`);

  // Sorted timestamps
  const sortedTimestamps = buildSortedTimestamps(seenBlocks);

  return {
    meta: {
      userSlug: userSlug || '',
      fetchedAt: new Date().toISOString(),
      channelCount: channels.length,
      blockCount: Object.keys(seenBlocks).length,
      edgeCount: edges.length,
      crossConnectedBlocks: crossConnected,
      domainCounts,
      autoTagIndex,
      autoTagStats,
      searchIndex,
      sortedTimestamps,
    },
    elements: { nodes, edges },
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const cfg = await loadConfig();

  console.log('');
  console.log('  arena-3d Data Fetcher');
  console.log('  ====================');
  console.log('');

  if (!cfg.username && !cfg.channels.length) {
    console.error('  Error: No username or channels configured.');
    console.error('  Edit config/arena-3d.config.js or use --username/--channels flags.');
    process.exit(1);
  }

  if (!cfg.token && cfg.username) {
    console.error('  Error: API token is required when fetching by username.');
    console.error('  The Are.na API needs authentication to list a user\'s channels.');
    console.error('');
    console.error('  Get a free token (takes 2 minutes):');
    console.error('    1. Go to https://dev.are.na/oauth/applications');
    console.error('    2. Log in and click "New Application"');
    console.error('    3. Name it anything, submit, and copy the token');
    console.error('');
    console.error('  Then either:');
    console.error('    - Add it to config/arena-3d.config.js');
    console.error('    - Pass it with: npm run fetch -- --token YOUR_TOKEN');
    console.error('    - Set env var: ARENA_ACCESS_TOKEN=YOUR_TOKEN');
    console.error('');
    console.error('  Full guide: docs/TOKEN-GUIDE.md');
    process.exit(1);
  }

  if (!cfg.token) {
    console.log('  Note: No API token set. Rate limits may be stricter.');
    console.log('  See docs/TOKEN-GUIDE.md for how to get one (free, takes 2 minutes).');
    console.log('');
  }

  // Load cache
  const cache = cfg.fresh ? {} : loadCache();
  if (Object.keys(cache).length) {
    console.log(`  Resuming with ${Object.keys(cache).length} cached channels\n`);
  }

  // Fetch channels
  let channels, userSlug;
  if (cfg.username) {
    const result = await fetchUserChannels(cfg.username, cfg.token);
    channels = result.channels;
    userSlug = result.userSlug;
  } else {
    const result = await fetchSpecificChannels(cfg.channels, cfg.token);
    channels = result.channels;
    userSlug = result.userSlug;
  }

  // Fetch blocks per channel
  const blocksByChannel = {};
  for (const ch of channels) {
    const slug = ch.slug;
    const length = ch.length || 0;

    if (cache[slug]) {
      console.log(`\n[OK] "${ch.title}" (${length} blocks) — cached`);
      blocksByChannel[slug] = cache[slug];
      continue;
    }

    console.log(`\n> Fetching "${ch.title}" (${length} blocks)...`);
    if (length === 0) {
      console.log('  (empty channel, skipping)');
      blocksByChannel[slug] = [];
      cache[slug] = [];
      saveCache(cache);
      continue;
    }

    try {
      const blocks = await fetchChannelBlocks(slug, length, cfg.token);
      blocksByChannel[slug] = blocks;
      cache[slug] = blocks;
      saveCache(cache);
      console.log('  [OK] Saved to cache');
    } catch (e) {
      console.log(`  [ERR] Failed: ${e.message}. Skipping.`);
      blocksByChannel[slug] = [];
    }
  }

  // Build graph
  console.log('\n> Building graph...');
  const graph = buildGraph(channels, blocksByChannel, userSlug);

  // Write output
  mkdirSync(DATA_DIR, { recursive: true });
  const json = JSON.stringify(graph);
  writeFileSync(OUTPUT_PATH, json);

  const sizeKB = Math.round(json.length / 1024);
  console.log(`\n[OK] Graph written to data/arena-graph.json (${sizeKB} KB)`);
  console.log(`  ${graph.meta.channelCount} channels`);
  console.log(`  ${graph.meta.blockCount} unique blocks`);
  console.log(`  ${graph.meta.edgeCount} edges`);
  console.log(`  ${graph.meta.crossConnectedBlocks} blocks in multiple channels`);
  console.log(`  ${graph.meta.autoTagStats.uniqueTags} auto-tags`);
  console.log('');
}

main().catch(e => {
  console.error(`\n[ERR] ${e.message}`);
  process.exit(1);
});
