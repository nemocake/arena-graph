import { CHANNEL_PALETTE } from '../constants.js';

/**
 * Handles type, channel, category, and timeline filters.
 * Updates node visibility via instance attributes.
 */
export class FilterEngine {
  constructor(state, graphData, nodeRenderer, edgeRenderer) {
    this.state = state;
    this.graphData = graphData;
    this.nodeRenderer = nodeRenderer;
    this.edgeRenderer = edgeRenderer;

    // --- Type filter pills (dynamic) ---
    this._initTypePills();

    // --- Channel filter ---
    this._initChannelFilter();

    // --- Category filter ---
    this._initCategoryFilter();

    // --- Timeline ---
    this._initTimeline();

    // Listen for filter state changes
    state.on('visibleChannels', () => this._applyFilters());
    state.on('activeCategories', () => this._applyFilters());
    state.on('timelineRange', () => this._applyFilters());
  }

  _initTypePills() {
    const container = document.getElementById('type-pills');
    if (!container) return;

    const TYPE_LABELS = {
      Image: 'IMG', Media: 'MDA', Link: 'LNK',
      Text: 'TXT', Attachment: 'ATT', Block: 'BLK',
    };

    const types = this.graphData.typeCounts;
    const visibleTypes = new Set();

    for (const [type, count] of Object.entries(types)) {
      if (count === 0) continue;
      visibleTypes.add(type);
      const label = TYPE_LABELS[type] || type.substring(0, 3).toUpperCase();
      const pill = document.createElement('button');
      pill.className = 'type-pill active';
      pill.dataset.type = type;
      pill.innerHTML = `${label} <span class="text-gray-600">${count}</span>`;
      pill.addEventListener('click', () => {
        const current = this.state.get('visibleTypes');
        if (current.has(type)) {
          current.delete(type);
          pill.classList.remove('active');
          pill.classList.add('disabled');
        } else {
          current.add(type);
          pill.classList.add('active');
          pill.classList.remove('disabled');
        }
        this.state.set('visibleTypes', new Set(current));
        this._applyFilters();
      });
      container.appendChild(pill);
    }

    this.state.set('visibleTypes', visibleTypes);
  }

  _initChannelFilter() {
    const trigger = document.getElementById('ch-filter-trigger');
    const dropdown = document.getElementById('ch-filter-dropdown');
    const list = document.getElementById('ch-filter-list');
    const allBtn = document.getElementById('ch-filter-all');
    const noneBtn = document.getElementById('ch-filter-none');

    // Init visible channels
    const visibleCh = new Set(this.graphData.channels.map(c => c.id));
    this.state.set('visibleChannels', visibleCh);

    let open = false;
    trigger.addEventListener('click', () => {
      open = !open;
      dropdown.classList.toggle('open', open);
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (open && !document.getElementById('ch-filter-wrapper').contains(e.target)) {
        open = false;
        dropdown.classList.remove('open');
      }
    });

    const renderList = () => {
      list.innerHTML = '';
      const vis = this.state.get('visibleChannels');
      this.graphData.channels.forEach((ch, i) => {
        const color = CHANNEL_PALETTE[i % CHANNEL_PALETTE.length];
        const isOn = vis.has(ch.id);
        const el = document.createElement('div');
        el.className = 'ch-filter-item' + (isOn ? '' : ' disabled');
        el.style.setProperty('--ch-color', color);
        el.innerHTML = `
          <span class="ch-toggle ${isOn ? 'on' : ''}">${isOn ? '✓' : ''}</span>
          <span class="font-mono text-[10px] truncate" style="color: ${isOn ? '#ccc' : '#555'}">${ch.label}</span>
          <span class="font-mono text-[9px] ml-auto" style="color: ${isOn ? '#666' : '#333'}">${ch.blockCount}</span>
        `;
        el.addEventListener('click', () => {
          if (vis.has(ch.id)) vis.delete(ch.id);
          else vis.add(ch.id);
          this.state.set('visibleChannels', new Set(vis));
          renderList();
        });
        list.appendChild(el);
      });
    };

    allBtn.addEventListener('click', () => {
      this.state.set('visibleChannels', new Set(this.graphData.channels.map(c => c.id)));
      renderList();
    });
    noneBtn.addEventListener('click', () => {
      this.state.set('visibleChannels', new Set());
      renderList();
    });

    renderList();
  }

  _initCategoryFilter() {
    const trigger = document.getElementById('cat-filter-trigger');
    const dropdown = document.getElementById('cat-filter-dropdown');
    const tabContainer = document.getElementById('cat-filter-tabs');
    const list = document.getElementById('cat-filter-list');
    const search = document.getElementById('cat-filter-search');
    const pills = document.getElementById('cat-filter-active-pills');

    const ati = this.graphData.autoTagIndex;

    // Discover categories dynamically from data
    const catCounts = {};
    for (const tag in ati) {
      const cat = tag.split(':')[0];
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    }

    // Sort categories by item count (most first)
    const categories = Object.entries(catCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => ({ cat, count }));

    // Hide filter entirely if no categories
    if (categories.length === 0) {
      const wrapper = document.getElementById('cat-filter-wrapper');
      if (wrapper) wrapper.style.display = 'none';
      return;
    }

    // Color palette for categories — known ones get stable colors, others cycle
    const KNOWN_COLORS = {
      artist: '#ff3366', medium: '#00ff88', theme: '#00f3ff', source: '#ff9900',
    };
    const FALLBACK_COLORS = ['#cc66ff', '#ffcc00', '#00ffcc', '#ff6666', '#66ccff', '#ff66cc'];
    let fallbackIdx = 0;

    this._catColors = {};
    for (const { cat } of categories) {
      if (KNOWN_COLORS[cat]) {
        this._catColors[cat] = KNOWN_COLORS[cat];
      } else {
        this._catColors[cat] = FALLBACK_COLORS[fallbackIdx % FALLBACK_COLORS.length];
        fallbackIdx++;
      }
    }

    // Short label for tabs (first 3 chars uppercase)
    const TAB_LABELS = { artist: 'ART', medium: 'MED', theme: 'THM', source: 'SRC' };

    let open = false;
    let currentCat = categories[0].cat;

    // Build tabs dynamically
    const tabButtons = [];
    for (const { cat, count } of categories) {
      const label = TAB_LABELS[cat] || cat.substring(0, 3).toUpperCase();
      const color = this._catColors[cat];
      const btn = document.createElement('button');
      btn.className = 'cat-tab' + (cat === currentCat ? ' active' : '');
      btn.dataset.cat = cat;
      btn.style.setProperty('--cat-color', color);
      btn.innerHTML = `${label} <span class="opacity-40">${count}</span>`;
      btn.addEventListener('click', () => {
        tabButtons.forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        currentCat = cat;
        renderItems();
      });
      tabContainer.appendChild(btn);
      tabButtons.push(btn);
    }

    trigger.addEventListener('click', () => {
      open = !open;
      dropdown.classList.toggle('open', open);
    });

    document.addEventListener('click', (e) => {
      if (open && !document.getElementById('cat-filter-wrapper').contains(e.target)) {
        open = false;
        dropdown.classList.remove('open');
      }
    });

    const renderItems = (filter = '') => {
      list.innerHTML = '';
      const items = [];
      for (const tag in ati) {
        if (!tag.startsWith(currentCat + ':')) continue;
        const val = tag.split(':')[1];
        if (filter && !val.includes(filter.toLowerCase())) continue;
        items.push({ tag, val, count: ati[tag].length });
      }
      items.sort((a, b) => b.count - a.count);

      for (const item of items) {
        const el = document.createElement('div');
        el.className = 'cat-filter-item';
        const active = this.state.get('activeCategories').some(c => c.tag === item.tag);
        el.innerHTML = `
          <span style="color: ${active ? '#fff' : ''}">${item.val}</span>
          <span class="text-gray-700">${item.count}</span>
        `;
        el.addEventListener('click', () => {
          const cats = [...this.state.get('activeCategories')];
          const idx = cats.findIndex(c => c.tag === item.tag);
          if (idx >= 0) cats.splice(idx, 1);
          else cats.push({ tag: item.tag, cat: currentCat });
          this.state.set('activeCategories', cats);
          renderItems(search.value);
          renderPills();
        });
        list.appendChild(el);
      }
    };

    const renderPills = () => {
      pills.innerHTML = '';
      const cats = this.state.get('activeCategories');
      for (const c of cats) {
        const color = this._catColors[c.cat] || '#666';
        const pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.style.cssText = `background:${color}20; color:${color}; border:1px solid ${color}40;`;
        pill.textContent = c.tag.split(':')[1] + ' \u00d7';
        pill.addEventListener('click', () => {
          const updated = this.state.get('activeCategories').filter(x => x.tag !== c.tag);
          this.state.set('activeCategories', updated);
          renderPills();
          renderItems(search.value);
        });
        pills.appendChild(pill);
      }
    };

    search.addEventListener('input', () => renderItems(search.value));
    renderItems();
  }

  _initTimeline() {
    const panel = document.getElementById('timeline-panel');
    const scrubber = document.getElementById('timeline-scrubber');
    const endSlider = document.getElementById('timeline-end');
    const startLabel = document.getElementById('timeline-start-label');
    const endLabel = document.getElementById('timeline-end-label');
    const minLabel = document.getElementById('timeline-min-date');
    const maxLabel = document.getElementById('timeline-max-date');
    const countLabel = document.getElementById('timeline-count');

    const { minDate, maxDate, sortedTimestamps } = this.graphData;
    if (!sortedTimestamps.length) return;

    panel.classList.remove('hidden');
    const fmt = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    minLabel.textContent = fmt(minDate);
    maxLabel.textContent = fmt(maxDate);

    const update = () => {
      const startVal = parseInt(scrubber.value) / 1000;
      const endVal = parseInt(endSlider.value) / 1000;
      const range = [Math.min(startVal, endVal), Math.max(startVal, endVal)];

      const startTs = minDate + range[0] * (maxDate - minDate);
      const endTs = minDate + range[1] * (maxDate - minDate);
      startLabel.textContent = fmt(startTs);
      endLabel.textContent = fmt(endTs);

      this.state.set('timelineRange', range);
    };

    scrubber.addEventListener('input', update);
    endSlider.addEventListener('input', update);
  }

  _applyFilters() {
    const nr = this.nodeRenderer;
    const gr = this.graphData;
    const visTypes = this.state.get('visibleTypes');
    const visCh = this.state.get('visibleChannels');
    const activeCats = this.state.get('activeCategories');
    const timeRange = this.state.get('timelineRange');

    const visibleIndices = new Set();

    for (let i = 0; i < gr.blocks.length; i++) {
      const b = gr.blocks[i];

      // Type filter
      if (!visTypes.has(b.class)) continue;

      // Channel filter
      const channels = gr.blockToChannelsMap[b.id] || [];
      if (!channels.some(ch => visCh.has(ch))) continue;

      // Category filter
      if (activeCats.length > 0) {
        const tags = b.autoTags || [];
        const hasAll = activeCats.every(c => tags.includes(c.tag));
        if (!hasAll) continue;
      }

      // Timeline filter
      if (timeRange[0] > 0 || timeRange[1] < 1) {
        const ts = b.ts || 0;
        const normalized = gr.maxDate > gr.minDate ? (ts - gr.minDate) / (gr.maxDate - gr.minDate) : 0;
        if (normalized < timeRange[0] || normalized > timeRange[1]) continue;
      }

      visibleIndices.add(i);
    }

    // Apply visibility to nodes and edges
    nr.fadeAllExcept(visibleIndices);
    this.edgeRenderer.fadeEdgesExcept(visibleIndices);
    this.state.set('visibleBlockIndices', visibleIndices);

    // Update timeline count
    const countEl = document.getElementById('timeline-count');
    if (countEl) countEl.textContent = `${visibleIndices.size} blocks`;
  }
}
