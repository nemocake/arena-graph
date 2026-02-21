import { AppState } from './state/AppState.js';
import { SceneManager } from './core/SceneManager.js';
import { PostProcessing } from './core/PostProcessing.js';
import { CameraController } from './core/CameraController.js';
import { GraphData } from './graph/GraphData.js';
import { NodeRenderer } from './graph/NodeRenderer.js';
import { EdgeRenderer } from './graph/EdgeRenderer.js';
import { ConstellationRenderer } from './graph/ConstellationRenderer.js';
import { SpiralLayout } from './layout/SpiralLayout.js';
import { LayoutEngine } from './layout/LayoutEngine.js';
import { Raycaster } from './interaction/Raycaster.js';
import { TooltipManager } from './interaction/TooltipManager.js';
import { SelectionManager } from './interaction/SelectionManager.js';
import { KeyboardNav } from './interaction/KeyboardNav.js';
import { DetailPanel } from './features/DetailPanel.js';
import { SearchEngine } from './features/SearchEngine.js';
import { FilterEngine } from './features/FilterEngine.js';
import { PathFinder } from './features/PathFinder.js';
import { AgeHeatmap } from './features/AgeHeatmap.js';
import { FindSimilar } from './features/FindSimilar.js';
import { GalleryMode } from './features/GalleryMode.js';
import { StatsPanel } from './features/StatsPanel.js';
import { MinimapRenderer } from './features/MinimapRenderer.js';
import { RandomWalk } from './features/RandomWalk.js';
import { CHANNEL_PALETTE } from './constants.js';

// ─── Boot sequence ───
const bootLog = document.getElementById('boot-log');
const bootProgress = document.getElementById('boot-progress');
const bootPercent = document.getElementById('boot-percent');
const bootStatus = document.getElementById('boot-status');
const bootScreen = document.getElementById('boot-screen');

function log(msg, delay) {
  return new Promise(resolve => {
    setTimeout(() => {
      const line = document.createElement('div');
      line.className = 'boot-text';
      line.innerHTML = `<span class="text-acid">></span> ${msg}`;
      bootLog.appendChild(line);
      bootLog.scrollTop = bootLog.scrollHeight;
      resolve();
    }, delay);
  });
}

function setProgress(pct, status) {
  bootProgress.style.width = pct + '%';
  bootPercent.textContent = pct + '%';
  if (status) bootStatus.textContent = status;
}

// ─── Main init ───
async function init() {
  await log('initializing three.js webgl engine...', 100);
  setProgress(10, 'loading engine...');

  await log('webgl renderer ready (instanced meshes)...', 300);
  setProgress(20, 'renderer ready...');

  await log('fetching arena-graph.json...', 200);
  setProgress(30, 'fetching data...');

  // Load data
  let rawData;
  try {
    const resp = await fetch('./data/arena-graph.json?v=' + Date.now());
    rawData = await resp.json();
  } catch (e) {
    await log('<span class="text-red-400">ERROR: failed to load graph data</span>', 0);
    setProgress(100, 'ERROR');
    return;
  }

  const graphData = new GraphData(rawData);
  await log(`parsed ${graphData.meta.blockCount} blocks across ${graphData.meta.channelCount} channels`, 200);
  setProgress(50, 'parsing nodes...');

  await log(`mapped ${graphData.meta.edgeCount} edges, ${graphData.meta.crossConnectedBlocks} cross-links`, 300);
  setProgress(60, 'mapping edges...');

  // ─── State ───
  const state = new AppState();
  state.set('graphData', graphData);

  // ─── Scene ───
  const container = document.getElementById('graph-container');
  const sceneManager = new SceneManager(container);

  await log('initializing post-processing pipeline...', 100);
  setProgress(65, 'post-processing...');

  const postProcessing = new PostProcessing(sceneManager);

  // ─── Camera ───
  const cameraController = new CameraController(sceneManager);

  await log('building instanced node mesh (2300+ instances)...', 200);
  setProgress(70, 'building nodes...');

  // ─── Renderers ───
  const nodeRenderer = new NodeRenderer(sceneManager.scene, graphData);
  const edgeRenderer = new EdgeRenderer(sceneManager.scene, graphData, nodeRenderer);

  await log('computing 3d spiral layout...', 100);
  setProgress(80, 'computing layout...');

  // ─── Layout ───
  const spiralLayout = new SpiralLayout();
  const layoutEngine = new LayoutEngine(nodeRenderer, edgeRenderer, graphData);

  // Compute and apply initial layout
  const layout = spiralLayout.compute(graphData);
  layoutEngine.applyImmediate(layout);

  await log('layout complete. initializing interactions...', 200);
  setProgress(90, 'interactions...');

  // ─── Interaction ───
  const raycaster = new Raycaster(sceneManager, nodeRenderer);
  const tooltipManager = new TooltipManager(sceneManager.camera, container);
  const selectionManager = new SelectionManager(state, graphData, nodeRenderer, edgeRenderer, cameraController);
  const keyboardNav = new KeyboardNav(state, graphData, nodeRenderer, cameraController);

  // ─── Features ───
  const detailPanel = new DetailPanel(state, graphData);
  const searchEngine = new SearchEngine(state, graphData, nodeRenderer);
  const filterEngine = new FilterEngine(state, graphData, nodeRenderer);
  const pathFinder = new PathFinder(state, graphData, nodeRenderer, edgeRenderer);
  const ageHeatmap = new AgeHeatmap(state, graphData, nodeRenderer);
  const findSimilar = new FindSimilar(state, graphData, nodeRenderer);
  const constellationRenderer = new ConstellationRenderer(state, graphData, edgeRenderer);
  const galleryMode = new GalleryMode(state, graphData);
  const statsPanel = new StatsPanel(state, graphData);
  const minimapRenderer = new MinimapRenderer(nodeRenderer, sceneManager.camera, graphData);
  const randomWalk = new RandomWalk(state, graphData, nodeRenderer, cameraController);

  // ─── Mouse interaction ───
  let pickThrottle = 0;
  container.addEventListener('mousemove', (e) => {
    raycaster.setMouse(e, container);

    // Throttle picking to ~30fps
    const now = performance.now();
    if (now - pickThrottle < 33) return;
    pickThrottle = now;

    const idx = raycaster.pick();
    if (idx !== state.get('hoveredNodeIndex')) {
      state.set('hoveredNodeIndex', idx);

      if (idx >= 0) {
        const block = graphData.blocks[idx];
        const pos = nodeRenderer.getBlockPosition(idx);
        tooltipManager.show(block, pos);
      } else {
        tooltipManager.hide();
      }
    } else if (idx >= 0) {
      const pos = nodeRenderer.getBlockPosition(idx);
      tooltipManager.updatePosition(pos);
    }
  });

  container.addEventListener('click', (e) => {
    const idx = state.get('hoveredNodeIndex');
    if (idx >= 0) {
      // Path mode intercept
      if (state.get('pathMode')) {
        pathFinder.addEndpoint(idx);
        return;
      }
      state.set('selectedNodeIndex', idx);
    }
  });

  container.addEventListener('mouseleave', () => {
    state.set('hoveredNodeIndex', -1);
    tooltipManager.hide();
  });

  // ─── Header controls ───
  document.getElementById('btn-fit').addEventListener('click', () => {
    cameraController.fitToNodes(nodeRenderer.getAllPositions());
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    // Clear all active modes
    state.batch({
      hoveredNodeIndex: -1,
      selectedNodeIndex: -1,
      kbSelectedNodeIndex: -1,
      pathMode: false,
      constellationActive: false,
      ageHeatmapActive: false,
      walkActive: false,
      similarTarget: -1,
      galleryOpen: false,
      statsOpen: false,
    });
    selectionManager.clearSelection();
    cameraController.reset();
  });

  document.getElementById('btn-spiral').addEventListener('click', () => {
    const newLayout = spiralLayout.compute(graphData);
    layoutEngine.animateTo(newLayout, 600, () => {
      minimapRenderer.invalidate();
    });
  });

  // Cross-links highlight
  document.getElementById('btn-crosslinks').addEventListener('click', () => {
    const active = !state.get('crosslinksActive');
    state.set('crosslinksActive', active);
    document.getElementById('btn-crosslinks').classList.toggle('active', active);

    if (active) {
      const crossIndices = new Set();
      for (let i = 0; i < graphData.blocks.length; i++) {
        const channels = graphData.blockToChannelsMap[graphData.blocks[i].id] || [];
        if (channels.length > 1) crossIndices.add(i);
      }
      nodeRenderer.fadeAllExcept(crossIndices);
      for (const idx of crossIndices) {
        nodeRenderer.setBlockScale(idx, 1.8);
        nodeRenderer.setBlockOpacity(idx, 1.0);
      }
      nodeRenderer.commitAttributes();
    } else {
      nodeRenderer.resetAttributes();
    }
  });

  // ─── Populate stats ───
  document.getElementById('stat-channels').textContent = graphData.meta.channelCount + ' channels';
  document.getElementById('stat-blocks').textContent = graphData.meta.blockCount + ' blocks';
  document.getElementById('stat-edges').textContent = graphData.meta.edgeCount + ' edges';
  document.getElementById('stat-cross').textContent = graphData.meta.crossConnectedBlocks + ' cross-links';
  document.getElementById('sync-date').textContent = new Date(graphData.meta.fetchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Populate type counts
  ['Image', 'Media', 'Link', 'Text', 'Attachment'].forEach(t => {
    const el = document.getElementById('count-' + t);
    if (el) el.textContent = graphData.typeCounts[t] || 0;
  });

  // ─── Channel legend ───
  const legendItems = document.getElementById('legend-items');
  graphData.channels.forEach((ch, i) => {
    const color = CHANNEL_PALETTE[i % CHANNEL_PALETTE.length];
    const el = document.createElement('div');
    el.className = 'flex items-center gap-2 cursor-pointer group';
    el.innerHTML = `
      <span class="legend-dot" style="background:${color}; box-shadow: 0 0 6px ${color}40;"></span>
      <span class="font-mono text-[10px] text-gray-500 group-hover:text-white transition-colors truncate">${ch.label}</span>
      <span class="font-mono text-[9px] text-gray-700 ml-auto">${ch.blockCount}</span>
    `;
    el.addEventListener('click', () => {
      const chIdx = graphData.channelIndexMap[ch.id];
      if (chIdx !== undefined) {
        const pos = nodeRenderer.getChannelPosition(chIdx);
        cameraController.flyTo(pos, 400);
      }
    });
    legendItems.appendChild(el);
  });
  document.getElementById('channel-legend').style.opacity = '1';

  // ─── Render loop additions ───
  sceneManager.onFrame((delta, elapsed) => {
    nodeRenderer.update(elapsed);
    minimapRenderer.render();
  });

  // ─── Boot complete ───
  await log('all systems operational. rendering graph...', 200);
  setProgress(100, 'complete');

  // Fade out boot screen
  setTimeout(() => {
    bootScreen.style.opacity = '0';
    setTimeout(() => {
      bootScreen.style.display = 'none';
    }, 700);
  }, 400);

  // Fit camera to graph
  setTimeout(() => {
    cameraController.fitToNodes(nodeRenderer.getAllPositions());
  }, 200);

  // Start render loop
  sceneManager.start();
}

init();
