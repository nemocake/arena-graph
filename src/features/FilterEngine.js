import { CHANNEL_PALETTE } from '../constants.js';

/**
 * Handles type, channel, category, and timeline filters.
 * Updates node visibility via instance attributes.
 */
export class FilterEngine {
  constructor(state, graphData, nodeRenderer) {
    this.state = state;
    this.graphData = graphData;
    this.nodeRenderer = nodeRenderer;

    // --- Type filter pills ---
    const typePills = document.querySelectorAll('.type-pill');
    typePills.forEach(pill => {
      pill.addEventListener('click', () => {
        const type = pill.dataset.type;
        const types = this.state.get('visibleTypes');
        if (types.has(type)) {
          types.delete(type);
          pill.classList.remove('active');
          pill.classList.add('disabled');
        } else {
          types.add(type);
          pill.classList.add('active');
          pill.classList.remove('disabled');
        }
        this.state.set('visibleTypes', new Set(types));
        this._applyFilters();
      });
    });

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
    const list = document.getElementById('cat-filter-list');
    const search = document.getElementById('cat-filter-search');
    const pills = document.getElementById('cat-filter-active-pills');
    const tabs = document.querySelectorAll('.cat-tab');

    let open = false;
    let currentCat = 'artist';

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

    // Category tabs
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentCat = tab.dataset.cat;
        renderItems();
      });
    });

    // Populate counts
    const ati = this.graphData.autoTagIndex;
    const catCounts = { artist: 0, medium: 0, theme: 0, source: 0 };
    for (const tag in ati) {
      const cat = tag.split(':')[0];
      if (catCounts[cat] !== undefined) catCounts[cat]++;
    }
    for (const cat in catCounts) {
      const el = document.getElementById(`cat-count-${cat}`);
      if (el) el.textContent = catCounts[cat];
    }

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
        const colors = { artist: '#ff3366', medium: '#00ff88', theme: '#00f3ff', source: '#ff9900' };
        const color = colors[c.cat] || '#666';
        const pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.style.cssText = `background:${color}20; color:${color}; border:1px solid ${color}40;`;
        pill.textContent = c.tag.split(':')[1] + ' ×';
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

    // Apply visibility
    nr.fadeAllExcept(visibleIndices);
    this.state.set('visibleBlockIndices', visibleIndices);

    // Update timeline count
    const countEl = document.getElementById('timeline-count');
    if (countEl) countEl.textContent = `${visibleIndices.size} blocks`;
  }
}
