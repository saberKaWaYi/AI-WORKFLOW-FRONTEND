const state = {
  user: null,
  page: 'data',
  view: null,
  dataSource: '',
  dataLanguage: '',
  displayType: '',
  dataLoaded: false,
  data: { nodes: [], edges: [], has_english: false, has_chinese: false },
  filters: {
    query: '',
    focusNodeId: '',
    focusDepth: 1,
    pathSourceId: '',
    pathTargetId: '',
    sizeMode: 'uniform',
    layout: 'radial'
  }
};

const DATASOURCES = new Map([
  ['genshin', { nameZh: '原神', apiUrl: '/api/network/genshin' }]
]);

const DATA_TEXT = {
  empty: '没有找到匹配数据',
  noRelated: '暂无相关角色',
  idLabel: 'ID',
  connections: '连接',
  relatedTitle: '相关角色',
  selectAll: '不限',
  loadedStatus: '已加载 {nodes} 个节点与 {edges} 条关系。',
  focusStatus: '当前显示 {name} 辐射 {depth} 层的相关节点。',
  pathStatus: '当前显示从 {source} 到 {target} 的有向路径，共 {steps} 步。',
  pathMissingStatus: '从 {source} 到 {target} 没有找到有向路径。',
  inDegree: '入度',
  outDegree: '出度',
  totalDegree: '总计',
  relationLabel: '关系',
  relationTitle: '{source} 到 {target} 的关系',
  unknown: '未知',
  importPrompt: '请从左侧选择数据集加载数据。',
  emptyHint: '请从左侧选择数据源并配置展示方式'
};

const app = {
  cards: {
    panel: {
      hoveredId: null,
      pinnedId: null
    },
    index: {
      degreeById: new Map(),
      relatedById: new Map()
    }
  },
  graph: {
    nodes: [],
    edges: [],
    nodeMap: new Map(),
    hoverNode: null,
    hoverEdge: null,
    draggingNode: null,
    panning: false,
    running: true,
    cooling: 0,
    imageCache: new Map(),
    viewport: {
      scale: 1,
      minScale: 0.45,
      maxScale: 2.8,
      offsetX: 0,
      offsetY: 0,
      dragStartX: 0,
      dragStartY: 0,
      startOffsetX: 0,
      startOffsetY: 0
    }
  },
  index: {
    nodeById: new Map(),
    degreeById: new Map(),
    undirectedById: new Map(),
    outgoingById: new Map()
  },
  view: {
    focus: { active: false, nodeIds: new Set() },
    path: { active: false, found: false, nodeIds: new Set(), edgeKeys: new Set(), steps: 0 }
  },
  dom: {}
};

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

boot();

async function boot() {
  initDom();
  bindShell();
  bindAuth();
  const me = await api('/api/auth/me');
  if (me.user) {
    state.page = me.user.lastPage || 'data';
    enterApp(me.user);
  }
}

function initDom() {
  app.dom = {
    authScreen: qs('[data-auth-screen]'),
    authBgText: qs('[data-auth-bg-text]'),
    appShell: qs('[data-app-shell]'),
    authMessage: qs('[data-auth-message]'),
    grid: qs('#characterGrid'),
    graphWrap: qs('[data-view="graph"]'),
    canvas: qs('#graphCanvas'),
    status: qs('[data-status]'),
    total: qs('[data-total]'),
    visible: qs('[data-visible]'),
    edges: qs('[data-edges]'),
    pageTitle: qs('[data-page-title]'),
    search: qs('[data-search]'),
    focusNode: qs('[data-focus-node]'),
    focusDepth: qs('[data-focus-depth]'),
    pathSource: qs('[data-path-source]'),
    pathTarget: qs('[data-path-target]'),
    sizeMode: qs('[data-size-mode]'),
    layout: qs('[data-layout]'),
    dataSource: qs('[data-data-source]'),
    dataLanguage: qs('[data-data-language]'),
    displayType: qs('[data-display-type]'),
    languageField: qs('[data-language-field]'),
    displayTypeField: qs('[data-display-type-field]'),
    configSection: qs('[data-config-section]'),
    graphFilterSection: qs('[data-graph-filter-section]'),
    cardsFilterSection: qs('[data-cards-filter-section]'),
    emptyPage: qs('[data-empty-page]'),
    mainHeader: qs('[data-main-header]'),
    floatingPanel: qs('[data-floating-panel]'),
    floatingTitle: qs('[data-floating-title]'),
    floatingContent: qs('[data-floating-content]'),
    tooltip: qs('#tooltip')
  };

  populateDataSourceOptions();
  generateAuthBgText();
}

function generateAuthBgText() {
  const container = app.dom.authBgText;
  if (!container) return;

  const text = 'AI视频生成工作平台';
  const count = (Math.ceil(window.innerWidth / 240) + 6) * (Math.ceil(window.innerHeight / 60) + 6);

  container.innerHTML = Array.from({ length: count }, () => `<span>${text}</span>`).join('');
}

function bindShell() {
  const savedTheme = localStorage.getItem('ai-workflow-theme');
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', savedTheme ? savedTheme === 'dark' : prefersDark);
  updateThemeButton();

  qs('[data-sidebar-toggle]')?.addEventListener('click', () => {
    app.dom.appShell?.classList.toggle('sidebar-collapsed');
  });

  qs('[data-theme-toggle]')?.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('ai-workflow-theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
    updateThemeButton();
  });

  window.addEventListener('resize', generateAuthBgText);

  qs('[data-logout]')?.addEventListener('click', async () => {
    await api('/api/auth/logout', { method: 'POST' });
    state.user = null;
    app.dom.appShell?.classList.add('is-hidden');
    app.dom.authScreen?.classList.remove('is-hidden');
  });

  app.dom.dataSource?.addEventListener('change', handleDataSourceChange);
  app.dom.dataLanguage?.addEventListener('change', handleLanguageChange);
  app.dom.displayType?.addEventListener('change', handleDisplayTypeChange);
}

function populateDataSourceOptions() {
  const select = app.dom.dataSource;
  if (!select) return;
  select.innerHTML = '<option value="">请选择</option>';
  DATASOURCES.forEach((config, key) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = config.nameZh;
    select.appendChild(option);
  });
}

async function handleDataSourceChange(event) {
  const sourceKey = event.target.value;
  state.dataSource = sourceKey;
  state.dataLanguage = '';
  state.displayType = '';
  state.dataLoaded = false;
  state.view = null;

  // 禁用语言和展示类型下拉框
  if (app.dom.dataLanguage) {
    app.dom.dataLanguage.setAttribute('disabled', '');
    app.dom.dataLanguage.innerHTML = '<option value="">请先选择数据源</option>';
  }
  if (app.dom.displayType) {
    app.dom.displayType.setAttribute('disabled', '');
    app.dom.displayType.value = '';
  }

  if (!sourceKey) {
    renderPage();
    return;
  }

  const config = DATASOURCES.get(sourceKey);
  if (!config) return;

  try {
    const response = await fetch(config.apiUrl);
    const data = await response.json();
    state.data = normalizeData(data);
    populateLanguageOptions();
    // 启用语言下拉框
    app.dom.dataLanguage?.removeAttribute('disabled');
    renderPage();
  } catch (error) {
    console.error('Failed to load data source:', error);
    state.data = { nodes: [], edges: [], has_english: false, has_chinese: false };
  }
}

function populateLanguageOptions() {
  const select = app.dom.dataLanguage;
  if (!select) return;

  select.innerHTML = '';
  const { has_chinese, has_english } = state.data;

  if (has_chinese) {
    const option = document.createElement('option');
    option.value = 'zh';
    option.textContent = '中文';
    select.appendChild(option);
  }
  if (has_english) {
    const option = document.createElement('option');
    option.value = 'en';
    option.textContent = 'English';
    select.appendChild(option);
  }

  if (has_chinese) {
    state.dataLanguage = 'zh';
    select.value = 'zh';
  } else if (has_english) {
    state.dataLanguage = 'en';
    select.value = 'en';
  }
}

function handleLanguageChange(event) {
  state.dataLanguage = event.target.value;
  // 启用展示类型下拉框
  app.dom.displayType?.removeAttribute('disabled');
  // 更新节点下拉框的显示名称
  rebuildNodeSelects();
  renderPage();
}

function handleDisplayTypeChange(event) {
  state.displayType = event.target.value;
  state.view = state.displayType || null;

  if (state.displayType === 'graph') {
    app.dom.graphFilterSection?.classList.remove('is-hidden');
    app.dom.cardsFilterSection?.classList.add('is-hidden');
  } else if (state.displayType === 'cards') {
    app.dom.graphFilterSection?.classList.add('is-hidden');
    app.dom.cardsFilterSection?.classList.remove('is-hidden');
  } else {
    app.dom.graphFilterSection?.classList.add('is-hidden');
    app.dom.cardsFilterSection?.classList.add('is-hidden');
  }

  if (state.displayType && state.data.nodes.length > 0) {
    state.dataLoaded = true;
    rebuildIndexes();
    rebuildNodeSelects();
  }
  renderPage();
}

function updateThemeButton() {
  const dark = document.documentElement.classList.contains('dark');
  qsa('[data-theme-icon]').forEach((item) => (item.textContent = dark ? '☾' : '☀'));
}

function bindAuth() {
  qsa('[data-auth-tab]').forEach((tab) => tab.addEventListener('click', () => selectAuthTab(tab.dataset.authTab)));
  qs('[data-auth-form="login"]')?.addEventListener('submit', onLogin);
  qs('[data-auth-form="register"]')?.addEventListener('submit', onRegister);
  qs('[data-guest]')?.addEventListener('click', onGuest);
  applyAuthTranslations();
}

function applyAuthTranslations() {
  const loginTab = qs('[data-auth-tab="login"]');
  const registerTab = qs('[data-auth-tab="register"]');
  const loginBtn = qs('[data-auth-form="login"] .primary-btn');
  const registerBtn = qs('[data-auth-form="register"] .primary-btn');
  const guestBtn = qs('[data-guest]');

  if (loginTab) loginTab.textContent = '登录';
  if (registerTab) registerTab.textContent = '注册';
  if (loginBtn) loginBtn.textContent = '登录';
  if (registerBtn) registerBtn.textContent = '注册并进入';
  if (guestBtn) guestBtn.textContent = '游客登录';
}

function selectAuthTab(name) {
  qsa('[data-auth-tab]').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.authTab === name));
  qsa('[data-auth-form]').forEach((form) => form.classList.toggle('is-hidden', form.dataset.authForm !== name));
  showAuthMessage('');
}

function onLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const entrySystem = qs('[data-entry-system]')?.value || 'data';
  state.page = entrySystem;
  submitAuth(() => api('/api/auth/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) }));
}

function onRegister(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const entrySystem = qs('[data-entry-system-reg]')?.value || 'data';
  state.page = entrySystem;
  submitAuth(() => api('/api/auth/register', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) }));
}

function onGuest() {
  state.page = 'data';
  submitAuth(() => api('/api/auth/guest', { method: 'POST' }));
}

async function submitAuth(action) {
  try {
    showAuthMessage('');
    const result = await action();
    enterApp(result.user);
  } catch (error) {
    showAuthMessage(error.message || 'Operation failed');
  }
}

function enterApp(user) {
  state.user = user;
  app.dom.authScreen?.classList.add('is-hidden');
  app.dom.appShell?.classList.remove('is-hidden');

  bindFilters();
  bindCanvasEvents();
  renderPage();
  requestAnimationFrame(animationLoop);
}

function renderPage() {
  qsa('[data-view]').forEach((el) => el.classList.add('is-hidden'));
  app.dom.emptyPage?.classList.remove('is-hidden');
  app.dom.mainHeader?.classList.add('is-hidden');

  if (state.page === 'data') {
    app.dom.pageTitle.textContent = '数据展示';

    if (state.dataLoaded && state.view) {
      app.dom.emptyPage?.classList.add('is-hidden');
      app.dom.mainHeader?.classList.remove('is-hidden');
      qs(`[data-view="${state.view}"]`)?.classList.remove('is-hidden');

      if (state.view === 'cards') renderCardsView();
      if (state.view === 'graph') renderGraphView();
    } else {
      app.dom.status.textContent = '';
      app.dom.total.textContent = '0';
      app.dom.visible.textContent = '0';
      app.dom.edges.textContent = '0';
    }
  } else if (state.page === 'text') {
    app.dom.pageTitle.textContent = '文本AI任务链';
    qs('[data-view="text"]')?.classList.remove('is-hidden');
    app.dom.emptyPage?.classList.add('is-hidden');
    app.dom.configSection?.classList.add('is-hidden');
    app.dom.graphFilterSection?.classList.add('is-hidden');
    app.dom.cardsFilterSection?.classList.add('is-hidden');
    app.dom.status.textContent = '';
  } else if (state.page === 'video') {
    app.dom.pageTitle.textContent = '视频AI任务链';
    qs('[data-view="video"]')?.classList.remove('is-hidden');
    app.dom.emptyPage?.classList.add('is-hidden');
    app.dom.configSection?.classList.add('is-hidden');
    app.dom.graphFilterSection?.classList.add('is-hidden');
    app.dom.cardsFilterSection?.classList.add('is-hidden');
    app.dom.status.textContent = '';
  }
}

function renderCardsView() {
  const nodes = getVisibleNodes();
  updateStats(nodes);
  renderGrid(nodes);
  syncFloatingPanel();
}

function getVisibleNodes() {
  const nodes = state.data.nodes || [];
  return [...nodes].filter(matchesFilters).sort(compareNodes);
}

function matchesFilters(node) {
  if (!state.filters.query) return true;
  const haystack = [node.vid, node.properties.name_zh, node.properties.name_en].join(' ').toLowerCase();
  return haystack.includes(state.filters.query);
}

function compareNodes(a, b) {
  const locale = state.dataLanguage === 'zh' ? 'zh-Hans-CN' : 'en';
  return getName(a).localeCompare(getName(b), locale);
}

function updateStats(visibleNodes) {
  const allNodes = state.data.nodes || [];
  app.dom.total.textContent = allNodes.length;
  app.dom.visible.textContent = visibleNodes.length;
  app.dom.edges.textContent = state.data.edges?.length || 0;
  app.dom.status.textContent = allNodes.length
    ? formatText(DATA_TEXT.loadedStatus, { nodes: allNodes.length, edges: state.data.edges?.length || 0 })
    : DATA_TEXT.emptyHint;
}

function renderGrid(nodes) {
  if (!nodes.length) {
    app.dom.grid.innerHTML = `<div class="empty">${escapeHtml(DATA_TEXT.empty)}</div>`;
    return;
  }

  app.dom.grid.innerHTML = nodes.map(renderCharacterCard).join('');

  app.dom.grid.removeEventListener('mouseover', onCardHover);
  app.dom.grid.removeEventListener('mouseout', onCardLeave);
  app.dom.grid.addEventListener('mouseover', onCardHover);
  app.dom.grid.addEventListener('mouseout', onCardLeave);
  app.dom.floatingPanel?.removeEventListener('click', onPanelClick);
  app.dom.floatingPanel?.removeEventListener('mouseleave', onPanelLeave);
  app.dom.floatingPanel?.addEventListener('click', onPanelClick);
  app.dom.floatingPanel?.addEventListener('mouseleave', onPanelLeave);
  document.removeEventListener('click', onDocumentClick);
  document.addEventListener('click', onDocumentClick);
  window.removeEventListener('scroll', syncFloatingPanel);
  window.addEventListener('scroll', syncFloatingPanel, { passive: true });
}

function renderCharacterCard(node) {
  const image = node.properties.photo || '';
  const degree = app.cards.index.degreeById.get(node.vid) || 0;
  return `
    <article class="character-card" data-character-id="${escapeHtml(node.vid)}">
      <div class="portrait">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(getName(node))}" loading="lazy">` : ''}</div>
      <div class="card-body">
        <h3>${escapeHtml(getName(node))}</h3>
        <p>${escapeHtml(getOtherName(node))}</p>
        <div class="chips">
          <span class="chip">ID: ${escapeHtml(node.vid)}</span>
          <span class="chip">连接 ${degree}</span>
        </div>
      </div>
    </article>
  `;
}

function onCardHover(event) {
  if (app.cards.panel.pinnedId) return;
  const card = event.target.closest('[data-character-id]');
  if (!card) return;
  showFloatingPanel(card.dataset.characterId);
}

function onCardLeave(event) {
  if (app.cards.panel.pinnedId) return;
  const card = event.target.closest('[data-character-id]');
  if (!card) return;
  if (card.contains(event.relatedTarget)) return;
  if (event.relatedTarget?.closest?.('[data-floating-panel]')) return;
  hideFloatingPanel();
}

function onPanelClick(event) {
  const jumpButton = event.target.closest('[data-related-jump]');
  if (jumpButton) {
    openCharacterPanel(jumpButton.dataset.targetId);
    return;
  }
  if (app.cards.panel.hoveredId) {
    app.cards.panel.pinnedId = app.cards.panel.hoveredId;
    syncFloatingPanel();
  }
}

function onPanelLeave() {
  if (app.cards.panel.pinnedId) return;
  hideFloatingPanel();
}

function onDocumentClick(event) {
  if (!app.cards.panel.pinnedId) return;
  if (event.target.closest('[data-floating-panel]')) return;
  closePinnedPanel();
}

function showFloatingPanel(characterId) {
  app.cards.panel.hoveredId = characterId;
  syncFloatingPanel();
}

function hideFloatingPanel() {
  app.cards.panel.hoveredId = null;
  updatePanelVisibility(false);
}

function openCharacterPanel(characterId) {
  app.cards.panel.hoveredId = characterId;
  app.cards.panel.pinnedId = characterId;
  document.querySelector(`[data-character-id="${cssEscape(characterId)}"]`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });
  requestAnimationFrame(syncFloatingPanel);
}

function closePinnedPanel() {
  app.cards.panel.hoveredId = null;
  app.cards.panel.pinnedId = null;
  updatePanelVisibility(false);
}

function syncFloatingPanel() {
  const activeId = app.cards.panel.pinnedId || app.cards.panel.hoveredId;
  if (!activeId) {
    updatePanelVisibility(false);
    return;
  }

  const anchor = document.querySelector(`[data-character-id="${cssEscape(activeId)}"]`);
  if (!anchor) {
    updatePanelVisibility(false);
    return;
  }

  if (app.dom.floatingTitle) app.dom.floatingTitle.textContent = DATA_TEXT.relatedTitle;
  if (app.dom.floatingContent) app.dom.floatingContent.innerHTML = renderRelatedList(activeId);
  updatePanelVisibility(true);
  app.dom.floatingPanel?.classList.toggle('is-pinned', app.cards.panel.pinnedId === activeId);
  positionFloatingPanel(anchor, app.dom.floatingPanel);
}

function renderRelatedList(characterId) {
  const relatedList = app.cards.index.relatedById.get(characterId) || [];
  if (!relatedList.length) {
    return `<div class="related-empty">${escapeHtml(DATA_TEXT.noRelated)}</div>`;
  }

  return `
    <div class="related-list">
      ${relatedList.map(renderRelatedItem).join('')}
    </div>
  `;
}

function renderRelatedItem({ node, edge, direction }) {
  const label = direction === 'out' ? edgeEndpoint(edge, 'target') : edgeEndpoint(edge, 'source');
  const relation = getRelationText(edge);
  const fallback = `ID: ${node.vid}`;
  return `
    <button class="related-item" type="button" data-related-jump data-target-id="${escapeHtml(node.vid)}">
      <strong>${escapeHtml(label || getName(node))}</strong>
      <span>${escapeHtml(relation || fallback)}</span>
    </button>
  `;
}

function positionFloatingPanel(anchor, panel) {
  if (!panel) return;
  const anchorRect = anchor.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const gap = 12;
  const margin = 16;
  let left = anchorRect.right + gap;
  let top = anchorRect.top;

  if (left + panelRect.width > window.innerWidth - margin) {
    left = anchorRect.left - panelRect.width - gap;
  }
  if (left < margin) {
    left = Math.max(margin, window.innerWidth - panelRect.width - margin);
  }
  if (top + panelRect.height > window.innerHeight - margin) {
    top = window.innerHeight - panelRect.height - margin;
  }
  if (top < margin) {
    top = margin;
  }

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function updatePanelVisibility(visible) {
  app.dom.floatingPanel?.classList.toggle('is-open', visible);
  if (!visible) {
    app.dom.floatingPanel?.classList.remove('is-pinned');
  }
}

function renderGraphView() {
  buildViewFilters();
  const visibleNodeIds = buildVisibleNodeIds();
  const visibleEdgeKeys = app.view.path.active ? app.view.path.edgeKeys : null;

  app.graph.nodes = buildGraphNodes(visibleNodeIds);
  app.graph.nodeMap = new Map(app.graph.nodes.map((node) => [node.vid, node]));
  app.graph.edges = buildGraphEdges(visibleEdgeKeys);

  updateStats(app.graph.nodes);
  applyLayout(true);
}

function buildViewFilters() {
  app.view.focus = buildFocusSelection();
  app.view.path = buildPathSelection();
}

function buildFocusSelection() {
  const startId = state.filters.focusNodeId;
  if (!startId || !app.index.nodeById.has(startId)) {
    return { active: false, nodeIds: new Set() };
  }

  const maxDepth = Math.max(1, state.filters.focusDepth);
  const nodeIds = new Set([startId]);
  const queue = [{ nodeId: startId, depth: 0 }];

  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= maxDepth) continue;
    for (const next of app.index.undirectedById.get(current.nodeId) || []) {
      if (nodeIds.has(next.nodeId)) continue;
      nodeIds.add(next.nodeId);
      queue.push({ nodeId: next.nodeId, depth: current.depth + 1 });
    }
  }

  return { active: true, startId, depth: maxDepth, nodeIds };
}

function buildPathSelection() {
  const sourceId = state.filters.pathSourceId;
  const targetId = state.filters.pathTargetId;
  const empty = { active: false, found: false, nodeIds: new Set(), edgeKeys: new Set(), steps: 0 };

  if (!sourceId || !targetId || !app.index.nodeById.has(sourceId) || !app.index.nodeById.has(targetId)) {
    return empty;
  }

  if (sourceId === targetId) {
    return {
      active: true,
      found: true,
      sourceId,
      targetId,
      nodeIds: new Set([sourceId]),
      edgeKeys: new Set(),
      steps: 0
    };
  }

  const queue = [sourceId];
  const visited = new Set([sourceId]);
  const previous = new Map();

  while (queue.length) {
    const currentId = queue.shift();
    for (const next of app.index.outgoingById.get(currentId) || []) {
      if (visited.has(next.nodeId)) continue;
      visited.add(next.nodeId);
      previous.set(next.nodeId, { fromId: currentId, edge: next.edge });
      if (next.nodeId === targetId) {
        return buildResolvedPath(sourceId, targetId, previous);
      }
      queue.push(next.nodeId);
    }
  }

  return {
    active: true,
    found: false,
    sourceId,
    targetId,
    nodeIds: new Set([sourceId, targetId]),
    edgeKeys: new Set(),
    steps: 0
  };
}

function buildResolvedPath(sourceId, targetId, previous) {
  const nodeIds = new Set([targetId]);
  const edgeKeys = new Set();
  let currentId = targetId;
  let steps = 0;

  while (currentId !== sourceId) {
    const item = previous.get(currentId);
    if (!item) break;
    steps += 1;
    edgeKeys.add(edgeKey(item.edge));
    nodeIds.add(item.fromId);
    currentId = item.fromId;
  }

  return { active: true, found: true, sourceId, targetId, nodeIds, edgeKeys, steps };
}

function buildVisibleNodeIds() {
  let nodeIds = new Set((state.data.nodes || []).map((node) => node.vid));
  if (app.view.focus.active) nodeIds = intersectSets(nodeIds, app.view.focus.nodeIds);
  if (app.view.path.active) nodeIds = intersectSets(nodeIds, app.view.path.nodeIds);
  return nodeIds;
}

function buildGraphNodes(visibleNodeIds) {
  const canvas = app.dom.canvas;
  return (state.data.nodes || [])
    .filter((node) => visibleNodeIds.has(node.vid))
    .map((node, index) => {
      const seed = seededPosition(index, node.vid);
      const degree = app.index.degreeById.get(node.vid) || { in: 0, out: 0, total: 0 };
      const radius = state.filters.sizeMode === 'uniform' ? 18 : Math.max(16, Math.min(34, 14 + Math.sqrt(degree.total) * 2.4));
      const graphNode = {
        ...node,
        x: seed.x * Math.max(1, canvas?.clientWidth || 800),
        y: seed.y * Math.max(1, canvas?.clientHeight || 600),
        vx: 0,
        vy: 0,
        r: radius,
        degree,
        isFocusCenter: node.vid === state.filters.focusNodeId,
        isPathNode: app.view.path.nodeIds.has(node.vid)
      };
      preloadNodeImage(graphNode);
      return graphNode;
    });
}

function buildGraphEdges(visibleEdgeKeys) {
  return (state.data.edges || [])
    .filter((edge) => app.graph.nodeMap.has(edge.source_vid) && app.graph.nodeMap.has(edge.target_vid))
    .filter((edge) => !visibleEdgeKeys || visibleEdgeKeys.has(edgeKey(edge)))
    .map((edge) => ({
      ...edge,
      isPath: app.view.path.edgeKeys.has(edgeKey(edge))
    }));
}

function applyLayout(resetVelocity) {
  const canvas = app.dom.canvas;
  if (!canvas) return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const centerX = width / 2;
  const centerY = height / 2;
  const nodes = [...app.graph.nodes].sort((a, b) => b.degree.total - a.degree.total);

  nodes.forEach((node, index) => {
    if (resetVelocity) node.vx = node.vy = 0;

    if (state.filters.layout === 'circle') {
      placeCircleNode(node, index, nodes.length, centerX, centerY, width, height);
    } else if (state.filters.layout === 'radial') {
      placeRadialNode(node, index, nodes, centerX, centerY, width, height);
    } else if (state.filters.layout === 'columns') {
      placeColumnNode(node, index, width, height);
    } else {
      placeSeedNode(node, index, centerX, centerY, width, height);
    }
  });

  app.graph.running = true;
  app.graph.cooling = state.filters.layout === 'force' ? 1 : 0;
  drawGraph();
}

function placeCircleNode(node, index, count, centerX, centerY, width, height) {
  const angle = (Math.PI * 2 * index) / Math.max(1, count);
  const radius = Math.min(width, height) * 0.38;
  node.x = centerX + Math.cos(angle) * radius;
  node.y = centerY + Math.sin(angle) * radius;
}

function placeRadialNode(node, index, nodes, centerX, centerY, width, height) {
  const topDegree = Math.max(1, nodes[0]?.degree.total || 1);
  const ring = 1 - (node.degree.total || 1) / topDegree;
  const angle = (Math.PI * 2 * index * 0.618) % (Math.PI * 2);
  const radius = Math.min(width, height) * (0.08 + ring * 0.38);
  node.x = centerX + Math.cos(angle) * radius;
  node.y = centerY + Math.sin(angle) * radius;
}

function placeColumnNode(node, index, width, height) {
  const balance = node.degree.out - node.degree.in;
  const column = balance > 3 ? 0.25 : balance < -3 ? 0.75 : 0.5;
  node.x = width * column + (seededPosition(index, node.vid).x - 0.5) * 50;
  node.y = 56 + (index % Math.max(1, Math.floor(height / 42))) * 42;
}

function placeSeedNode(node, index, centerX, centerY, width, height) {
  const seed = seededPosition(index, node.vid);
  const angle = Math.PI * 2 * seed.x;
  const radius = Math.min(width, height) * (0.1 + seed.y * 0.28);
  node.x = centerX + Math.cos(angle) * radius;
  node.y = centerY + Math.sin(angle) * radius;
}

function animationLoop() {
  if (state.page !== 'data' || state.view !== 'graph') {
    requestAnimationFrame(animationLoop);
    return;
  }

  if (state.filters.layout === 'force' && app.graph.running) {
    simulateForceLayout();
  }
  drawGraph();
  requestAnimationFrame(animationLoop);
}

function simulateForceLayout() {
  for (let i = 0; i < 2; i++) {
    applyRepulsion();
    applyEdgeTension();
    moveNodes();
  }
}

function applyRepulsion() {
  app.graph.nodes.forEach((a, i) => {
    for (let j = i + 1; j < app.graph.nodes.length; j++) {
      const b = app.graph.nodes[j];
      const dx = a.x - b.x || 0.01;
      const dy = a.y - b.y || 0.01;
      const distanceSquared = dx * dx + dy * dy;
      const force = Math.min(1.8, 780 / distanceSquared) * app.graph.cooling;
      const distance = Math.sqrt(distanceSquared);
      a.vx += (dx / distance) * force;
      a.vy += (dy / distance) * force;
      b.vx -= (dx / distance) * force;
      b.vy -= (dy / distance) * force;
    }
  });
}

function applyEdgeTension() {
  app.graph.edges.forEach((edge) => {
    const source = app.graph.nodeMap.get(edge.source_vid);
    const target = app.graph.nodeMap.get(edge.target_vid);
    if (!source || !target) return;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const targetDistance = 72 + Math.min(55, (source.r + target.r) * 2.2);
    const force = (distance - targetDistance) * 0.0009 * app.graph.cooling;
    source.vx += dx * force;
    source.vy += dy * force;
    target.vx -= dx * force;
    target.vy -= dy * force;
  });
}

function moveNodes() {
  const canvas = app.dom.canvas;
  if (!canvas) return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const centerX = width / 2;
  const centerY = height / 2;
  let energy = 0;

  app.graph.nodes.forEach((node) => {
    if (node.fixed) return;
    node.vx += (centerX - node.x) * 0.006 * app.graph.cooling;
    node.vy += (centerY - node.y) * 0.006 * app.graph.cooling;
    node.vx *= 0.72;
    node.vy *= 0.72;

    const speed = Math.hypot(node.vx, node.vy);
    if (speed > 5) {
      node.vx = (node.vx / speed) * 5;
      node.vy = (node.vy / speed) * 5;
    }

    node.x = Math.max(node.r + 8, Math.min(width - node.r - 8, node.x + node.vx));
    node.y = Math.max(node.r + 8, Math.min(height - node.r - 8, node.y + node.vy));
    energy += Math.abs(node.vx) + Math.abs(node.vy);
  });

  app.graph.cooling *= 0.985;
  if (app.graph.cooling < 0.035 || energy < 0.08) app.graph.running = false;
}

function drawGraph() {
  const canvas = app.dom.canvas;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.save();
  ctx.translate(app.graph.viewport.offsetX, app.graph.viewport.offsetY);
  ctx.scale(app.graph.viewport.scale, app.graph.viewport.scale);
  app.graph.edges.forEach((edge) => drawEdge(ctx, edge));
  app.graph.nodes.forEach((node) => drawNode(ctx, node));
  ctx.restore();
}

function drawEdge(ctx, edge) {
  const source = app.graph.nodeMap.get(edge.source_vid);
  const target = app.graph.nodeMap.get(edge.target_vid);
  if (!source || !target) return;

  const points = edgeLine(source, target);
  const active = edge.isPath || edge === app.graph.hoverEdge || source === app.graph.hoverNode || target === app.graph.hoverNode;
  const color = edge.isPath ? 'rgba(200, 138, 40, 0.92)' : active ? 'rgba(200, 138, 40, 0.82)' : getCssColor('--line', 0.72);

  ctx.strokeStyle = color;
  ctx.lineWidth = edge.isPath ? 2.4 : active ? 1.8 : 1;
  ctx.beginPath();
  ctx.moveTo(points.startX, points.startY);
  ctx.lineTo(points.endX, points.endY);
  ctx.stroke();

  drawArrow(ctx, points.endX, points.endY, points.ux, points.uy, color, edge.isPath ? 8 : 6);
}

function edgeLine(source, target) {
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;
  return {
    startX: source.x + ux * (source.r + 4),
    startY: source.y + uy * (source.r + 4),
    endX: target.x - ux * (target.r + 8),
    endY: target.y - uy * (target.r + 8),
    ux,
    uy
  };
}

function drawArrow(ctx, x, y, ux, uy, color, size) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - ux * size - uy * size * 0.7, y - uy * size + ux * size * 0.7);
  ctx.lineTo(x - ux * size + uy * size * 0.7, y - uy * size - ux * size * 0.7);
  ctx.closePath();
  ctx.fill();
}

function drawNode(ctx, node) {
  const active = node === app.graph.hoverNode || node.isFocusCenter || node.isPathNode;
  ctx.beginPath();
  ctx.arc(node.x, node.y, node.r + (active ? 7 : 4), 0, Math.PI * 2);
  ctx.fillStyle = node.isPathNode
    ? 'rgba(200, 138, 40, 0.28)'
    : node.isFocusCenter
      ? 'rgba(35, 122, 111, 0.28)'
      : active
        ? 'rgba(200, 138, 40, 0.22)'
        : 'rgba(35, 122, 111, 0.16)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
  drawNodeBody(ctx, node);
  ctx.strokeStyle = active || node.isPathNode ? getCssColor('--accent-2') : getCssColor('--panel-strong');
  ctx.lineWidth = active || node.isPathNode ? 3 : 2;
  ctx.stroke();
}

function drawNodeBody(ctx, node) {
  const image = app.graph.imageCache.get(node.properties.photo || '');
  if (image?.ready) {
    ctx.save();
    ctx.clip();
    const size = node.r * 2;
    ctx.fillStyle = getCssColor('--panel-strong');
    ctx.fillRect(node.x - node.r, node.y - node.r, size, size);
    ctx.drawImage(image.element, node.x - node.r, node.y - node.r, size, size);
    ctx.restore();
    return;
  }

  const gradient = ctx.createRadialGradient(node.x - node.r * 0.35, node.y - node.r * 0.35, 1, node.x, node.y, node.r);
  gradient.addColorStop(0, getCssColor('--accent-2'));
  gradient.addColorStop(1, getCssColor('--accent'));
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.font = `700 ${Math.max(12, node.r * 0.75)}px Segoe UI, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(getName(node) || node.vid).slice(0, 1).toUpperCase(), node.x, node.y + 1);
  ctx.restore();
}

function preloadNodeImage(node) {
  const url = node.properties.photo;
  if (!url || app.graph.imageCache.has(url)) return;
  const entry = { ready: false, element: new Image() };
  entry.element.crossOrigin = 'anonymous';
  entry.element.onload = () => {
    entry.ready = true;
    drawGraph();
  };
  entry.element.onerror = () => drawGraph();
  entry.element.src = url;
  app.graph.imageCache.set(url, entry);
}

function bindCanvasEvents() {
  const canvas = app.dom.canvas;
  if (!canvas) return;

  canvas.addEventListener('pointerdown', onCanvasPointerDown);
  canvas.addEventListener('pointermove', onCanvasPointerMove);
  canvas.addEventListener('pointerup', onCanvasPointerUp);
  canvas.addEventListener('pointerleave', onCanvasPointerUp);
  canvas.addEventListener('pointerleave', hideTooltip);
  canvas.addEventListener('wheel', onCanvasWheel, { passive: false });

  window.addEventListener('resize', () => {
    if (state.page === 'data' && state.view === 'graph') {
      applyLayout(false);
    }
  });
}

function onCanvasPointerDown(event) {
  const canvas = app.dom.canvas;
  if (!canvas) return;

  const point = eventPoint(event);
  app.graph.draggingNode = findNodeAt(point.x, point.y);

  if (app.graph.draggingNode) {
    app.graph.draggingNode.fixed = true;
    app.graph.running = false;
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  app.graph.panning = true;
  app.graph.viewport.dragStartX = event.clientX;
  app.graph.viewport.dragStartY = event.clientY;
  app.graph.viewport.startOffsetX = app.graph.viewport.offsetX;
  app.graph.viewport.startOffsetY = app.graph.viewport.offsetY;
  canvas.setPointerCapture(event.pointerId);
}

function onCanvasPointerMove(event) {
  const canvas = app.dom.canvas;
  if (!canvas) return;

  const point = eventPoint(event);

  if (app.graph.draggingNode) {
    app.graph.draggingNode.x = point.x;
    app.graph.draggingNode.y = point.y;
    app.graph.draggingNode.vx = 0;
    app.graph.draggingNode.vy = 0;
    showNodeTooltip(app.graph.draggingNode, event);
    return;
  }

  if (app.graph.panning) {
    app.graph.viewport.offsetX = app.graph.viewport.startOffsetX + (event.clientX - app.graph.viewport.dragStartX);
    app.graph.viewport.offsetY = app.graph.viewport.startOffsetY + (event.clientY - app.graph.viewport.dragStartY);
    hideTooltip();
    drawGraph();
    return;
  }

  app.graph.hoverNode = findNodeAt(point.x, point.y);
  app.graph.hoverEdge = app.graph.hoverNode ? null : findEdgeAt(point.x, point.y);

  if (app.graph.hoverNode) showNodeTooltip(app.graph.hoverNode, event);
  else if (app.graph.hoverEdge) showEdgeTooltip(app.graph.hoverEdge, event);
  else hideTooltip();
}

function onCanvasPointerUp(event) {
  if (app.graph.draggingNode) {
    app.graph.draggingNode.fixed = false;
    app.graph.draggingNode = null;
  }
  app.graph.panning = false;
  try {
    app.dom.canvas?.releasePointerCapture(event.pointerId);
  } catch {}
}

function onCanvasWheel(event) {
  event.preventDefault();
  const canvas = app.dom.canvas;
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const cursorX = event.clientX - rect.left;
  const cursorY = event.clientY - rect.top;
  const before = screenToWorld(cursorX, cursorY);
  const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
  const nextScale = clamp(app.graph.viewport.scale * factor, app.graph.viewport.minScale, app.graph.viewport.maxScale);
  if (nextScale === app.graph.viewport.scale) return;

  app.graph.viewport.scale = nextScale;
  app.graph.viewport.offsetX = cursorX - before.x * app.graph.viewport.scale;
  app.graph.viewport.offsetY = cursorY - before.y * app.graph.viewport.scale;
  drawGraph();
}

function findNodeAt(x, y) {
  for (let i = app.graph.nodes.length - 1; i >= 0; i--) {
    const node = app.graph.nodes[i];
    if (Math.hypot(x - node.x, y - node.y) <= node.r + 5) return node;
  }
  return null;
}

function findEdgeAt(x, y) {
  let best = null;
  let bestDistance = 7;

  app.graph.edges.forEach((edge) => {
    const source = app.graph.nodeMap.get(edge.source_vid);
    const target = app.graph.nodeMap.get(edge.target_vid);
    if (!source || !target) return;
    const points = edgeLine(source, target);
    const distance = pointToSegmentDistance(x, y, points.startX, points.startY, points.endX, points.endY);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = edge;
    }
  });

  return best;
}

function showNodeTooltip(node, event) {
  const tooltip = app.dom.tooltip;
  if (!tooltip) return;

  tooltip.innerHTML = `
    ${node.properties.photo ? `<img src="${escapeHtml(node.properties.photo)}" alt="">` : ''}
    <h3>${escapeHtml(getName(node))}</h3>
    <p>ID: ${escapeHtml(node.vid)}</p>
    <div class="chips">
      <span class="chip">${DATA_TEXT.inDegree} ${node.degree.in}</span>
      <span class="chip">${DATA_TEXT.outDegree} ${node.degree.out}</span>
      <span class="chip">${DATA_TEXT.totalDegree} ${node.degree.total}</span>
    </div>
  `;
  moveTooltip(event);
}

function showEdgeTooltip(edge, event) {
  const tooltip = app.dom.tooltip;
  if (!tooltip) return;

  const source = edgeEndpoint(edge, 'source');
  const target = edgeEndpoint(edge, 'target');
  const extraFields = Object.entries(edge.properties || {})
    .filter(([key, value]) => value && !['source_name_en', 'target_name_en', 'source_name_zh', 'target_name_zh', 'content_en', 'content_zh', 'title_en', 'title_zh'].includes(key))
    .map(([key, value]) => `<p>${escapeHtml(key)}: ${escapeHtml(value)}</p>`)
    .join('');

  tooltip.innerHTML = `
    <h3>${escapeHtml(formatText(DATA_TEXT.relationTitle, { source, target }))}</h3>
    <p>${escapeHtml(getRelationText(edge))}</p>
    ${extraFields}
    <div class="chips">
      <span class="chip">${escapeHtml(edge.source_vid)}</span>
      <span class="chip">${DATA_TEXT.relationLabel}</span>
      <span class="chip">${escapeHtml(edge.target_vid)}</span>
    </div>
  `;
  moveTooltip(event);
}

function moveTooltip(event) {
  const tooltip = app.dom.tooltip;
  if (!tooltip) return;

  tooltip.classList.add('visible');
  const x = Math.min(window.innerWidth - 320, event.clientX + 14);
  const y = Math.min(window.innerHeight - 180, event.clientY + 14);
  tooltip.style.left = `${Math.max(10, x)}px`;
  tooltip.style.top = `${Math.max(10, y)}px`;
}

function hideTooltip() {
  app.graph.hoverNode = null;
  app.graph.hoverEdge = null;
  app.dom.tooltip?.classList.remove('visible');
}

function eventPoint(event) {
  const canvas = app.dom.canvas;
  if (!canvas) return { x: 0, y: 0 };

  const rect = canvas.getBoundingClientRect();
  return screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
}

function screenToWorld(x, y) {
  return {
    x: (x - app.graph.viewport.offsetX) / app.graph.viewport.scale,
    y: (y - app.graph.viewport.offsetY) / app.graph.viewport.scale
  };
}

function getName(node, lang = state.dataLanguage) {
  const props = node?.properties || {};
  return props[`name_${lang}`] || props.name_en || node?.vid || DATA_TEXT.unknown;
}

function getOtherName(node, lang = state.dataLanguage) {
  const next = lang === 'zh' ? 'en' : 'zh';
  return node?.properties?.[`name_${next}`] || node?.vid || '';
}

function edgeEndpoint(edge, side, lang = state.dataLanguage) {
  return edge?.properties?.[`${side}_name_${lang}`] || edge?.[`${side}_id`] || '';
}

function edgeKey(edge) {
  return `${edge.source_vid}->${edge.target_vid}::${edge.id || edgeTitle(edge) || ''}`;
}

function edgeTitle(edge, lang = state.dataLanguage) {
  const props = edge?.properties || {};
  return props[`content_${lang}`] || props[`title_${lang}`] || props.content_en || props.title_en || edge?.id || '';
}

function getRelationText(edge) {
  const props = edge?.properties || {};
  return props[`content_${state.dataLanguage}`] || props[`title_${state.dataLanguage}`] || '';
}

function intersectSets(a, b) {
  return new Set([...a].filter((value) => b.has(value)));
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function getCssColor(name, alpha) {
  const color = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (alpha == null) return color;
  return color.startsWith('#') ? `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}` : color;
}

function seededPosition(index, text) {
  let hash = 2166136261;
  const value = `${text}:${index}`;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const x = ((hash >>> 0) % 10000) / 10000;
  hash = Math.imul(hash ^ 0x9e3779b9, 16777619);
  const y = ((hash >>> 0) % 10000) / 10000;
  return { x, y };
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(value);
  return String(value).replace(/["\\]/g, '\\$&');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  })[char]);
}

function formatText(template, values = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    credentials: 'same-origin',
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}

function showAuthMessage(message) {
  app.dom.authMessage.textContent = message;
}

async function loadDataset(name) {
  const config = DATASOURCES.get(name);
  if (!config) return;

  try {
    const response = await fetch(config.apiUrl);
    const data = await response.json();
    state.data = normalizeData(data);
    state.dataSource = name;
  } catch (error) {
    console.error('Failed to load data source:', error);
    state.data = { nodes: [], edges: [], has_english: false, has_chinese: false };
  }
}

function normalizeData(data) {
  if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw new Error('JSON 需要包含 nodes 和 edges 数组');
  }
  data.nodes.forEach((node) => {
    node.properties = node.properties || {};
  });
  data.edges.forEach((edge) => {
    edge.properties = edge.properties || {};
  });
  return data;
}

function rebuildIndexes() {
  const nodes = state.data.nodes || [];
  const edges = state.data.edges || [];

  app.index.nodeById = new Map(nodes.map((node) => [node.vid, node]));
  app.index.degreeById = new Map(nodes.map((node) => [node.vid, { in: 0, out: 0, total: 0 }]));
  app.index.undirectedById = new Map(nodes.map((node) => [node.vid, []]));
  app.index.outgoingById = new Map(nodes.map((node) => [node.vid, []]));

  app.cards.index.degreeById = new Map(nodes.map((node) => [node.vid, 0]));
  app.cards.index.relatedById = new Map(nodes.map((node) => [node.vid, []]));

  edges.forEach((edge) => {
    const sourceDegree = app.index.degreeById.get(edge.source_vid) || { in: 0, out: 0, total: 0 };
    const targetDegree = app.index.degreeById.get(edge.target_vid) || { in: 0, out: 0, total: 0 };

    sourceDegree.out += 1;
    sourceDegree.total += 1;
    targetDegree.in += 1;
    targetDegree.total += 1;

    app.index.degreeById.set(edge.source_vid, sourceDegree);
    app.index.degreeById.set(edge.target_vid, targetDegree);

    app.index.undirectedById.get(edge.source_vid)?.push({ nodeId: edge.target_vid, edge });
    app.index.undirectedById.get(edge.target_vid)?.push({ nodeId: edge.source_vid, edge });
    app.index.outgoingById.get(edge.source_vid)?.push({ nodeId: edge.target_vid, edge });

    app.cards.index.degreeById.set(edge.source_vid, (app.cards.index.degreeById.get(edge.source_vid) || 0) + 1);
    app.cards.index.degreeById.set(edge.target_vid, (app.cards.index.degreeById.get(edge.target_vid) || 0) + 1);

    const sourceNode = app.index.nodeById.get(edge.source_vid);
    const targetNode = app.index.nodeById.get(edge.target_vid);
    if (sourceNode && targetNode) {
      app.cards.index.relatedById.get(edge.source_vid)?.push({ node: targetNode, edge, direction: 'out' });
      app.cards.index.relatedById.get(edge.target_vid)?.push({ node: sourceNode, edge, direction: 'in' });
    }
  });
}

function rebuildNodeSelects() {
  const nodes = [...(state.data.nodes || [])].sort((a, b) => {
    const locale = state.dataLanguage === 'zh' ? 'zh-Hans-CN' : 'en';
    return getName(a).localeCompare(getName(b), locale);
  });

  renderNodeSelect(app.dom.focusNode, state.filters.focusNodeId, nodes);
  renderNodeSelect(app.dom.pathSource, state.filters.pathSourceId, nodes);
  renderNodeSelect(app.dom.pathTarget, state.filters.pathTargetId, nodes);
}

function renderNodeSelect(select, selectedValue, nodes) {
  if (!select) return;
  const options = [
    `<option value="">${escapeHtml(DATA_TEXT.selectAll)}</option>`,
    ...nodes.map((node) => `<option value="${escapeHtml(node.vid)}">${escapeHtml(getName(node))} (${escapeHtml(node.vid)})</option>`)
  ];
  select.innerHTML = options.join('');
  select.value = selectedValue;
}

function bindFilters() {
  app.dom.search?.addEventListener('input', (event) => {
    state.filters.query = event.target.value.trim().toLowerCase();
    renderPage();
  });

  app.dom.focusNode?.addEventListener('change', (event) => {
    state.filters.focusNodeId = event.target.value;
    if (state.filters.focusNodeId) resetPathFilter();
    syncFilterControls();
    renderPage();
  });

  app.dom.focusDepth?.addEventListener('change', (event) => {
    state.filters.focusDepth = Number(event.target.value) || 1;
    if (state.filters.focusNodeId) resetPathFilter();
    syncFilterControls();
    renderPage();
  });

  app.dom.pathSource?.addEventListener('change', (event) => {
    state.filters.pathSourceId = event.target.value;
    if (state.filters.pathSourceId || state.filters.pathTargetId) resetFocusFilter();
    syncFilterControls();
    renderPage();
  });

  app.dom.pathTarget?.addEventListener('change', (event) => {
    state.filters.pathTargetId = event.target.value;
    if (state.filters.pathSourceId || state.filters.pathTargetId) resetFocusFilter();
    syncFilterControls();
    renderPage();
  });

  app.dom.sizeMode?.addEventListener('change', (event) => {
    state.filters.sizeMode = event.target.value;
    renderPage();
  });

  app.dom.layout?.addEventListener('change', (event) => {
    state.filters.layout = event.target.value;
    applyLayout(true);
  });
}

function syncFilterControls() {
  if (app.dom.focusNode) app.dom.focusNode.value = state.filters.focusNodeId;
  if (app.dom.focusDepth) app.dom.focusDepth.value = String(state.filters.focusDepth);
  if (app.dom.pathSource) app.dom.pathSource.value = state.filters.pathSourceId;
  if (app.dom.pathTarget) app.dom.pathTarget.value = state.filters.pathTargetId;
}

function resetFocusFilter() {
  state.filters.focusNodeId = '';
}

function resetPathFilter() {
  state.filters.pathSourceId = '';
  state.filters.pathTargetId = '';
}
