import { DATA_TEXT, state } from '../../core/state.js';
import { api } from '../../core/api.js';
import { formatText } from '../../core/utils.js';
import { navigateToDataMain, navigateToDetail } from '../../core/router.js';
import { compareNodes } from './character-utils.js';
import { getDataIndex, initConfigPanel, loadBusinesses, restoreConfigFromState, syncFilterUiValues } from './config-panel.js';
import { initListView, renderList, matchesQuery, closeListPanel } from '../../views/list-view.js';
import { initGraphView, renderGraph, setGraphActive, refreshGraphLayout } from '../../views/graph-view.js';
import { initDetailView, showDetail, hideDetail } from '../../views/detail-view.js';

let dom = {};
let currentRoute = { system: 'data', page: 'main' };
let semanticSearchBound = false;

export function initDataApp(elements) {
  dom = elements;
  bindSemanticSearch();

  initListView(
    dom.grid,
    { panel: dom.floatingPanel, title: dom.floatingTitle, content: dom.floatingContent },
    (characterId) => navigateToDetail(characterId, 'cards')
  );
  initGraphView(dom.canvas, dom.tooltip, (characterId) => navigateToDetail(characterId, 'graph'));
  initDetailView(dom.detailView, () => navigateToDataMain());
  initConfigPanel(
    {
      dataSource: dom.dataSource,
      dataLanguage: dom.dataLanguage,
      displayType: dom.displayType,
      graphFilterSection: dom.graphFilterSection,
      cardsFilterSection: dom.cardsFilterSection,
      search: dom.search,
      focusNode: dom.focusNode,
      focusDepth: dom.focusDepth,
      pathSource: dom.pathSource,
      pathTarget: dom.pathTarget,
      sizeMode: dom.sizeMode,
      layout: dom.layout
    },
    (options) => renderDataPage(options)
  );

  syncFilterUiValues();
  return loadBusinesses();
}

export async function bootDataApp() {
  await restoreConfigFromState();
  renderDataPage();
}

export function renderDataRoute(route) {
  currentRoute = route;
  renderDataPage();
}

function renderDataPage(options = {}) {
  if (state.semanticSearch.businessName && state.semanticSearch.businessName !== state.dataSource) {
    resetSemanticSearch();
  }
  syncSemanticSearchUi();

  if (currentRoute.page === 'detail') {
    renderDetailRoute();
    return;
  }

  hideDetail();
  setGraphActive(false);
  closeListPanel();

  dom.emptyPage?.classList.remove('is-hidden');
  dom.mainHeader?.classList.add('is-hidden');
  dom.grid?.classList.add('is-hidden');
  dom.graphWrap?.classList.add('is-hidden');

  if (!state.dataLoaded || !state.view) {
    dom.status.textContent = '';
    dom.total.textContent = '0';
    dom.visible.textContent = '0';
    dom.edges.textContent = '0';
    return;
  }

  dom.emptyPage?.classList.add('is-hidden');
  dom.mainHeader?.classList.remove('is-hidden');

  if (state.view === 'cards') {
    dom.grid?.classList.remove('is-hidden');
    renderCardsMain();
  } else if (state.view === 'graph') {
    dom.graphWrap?.classList.remove('is-hidden');
    renderGraphMain(options);
  }
}

function renderCardsMain() {
  const index = getDataIndex();
  const semanticScores = new Map();
  let nodes;

  if (state.semanticSearch.active) {
    const nodesByLowerId = new Map(
      [...index.nodeById.entries()].map(([nodeId, node]) => [nodeId.toLowerCase(), node])
    );
    nodes = state.semanticSearch.results
      .map((result) => {
        const node = index.nodeById.get(result.name_en) || nodesByLowerId.get(result.name_en.toLowerCase());
        if (node) semanticScores.set(node.vid, Number(result.score));
        return node;
      })
      .filter(Boolean)
      .filter((node) => matchesQuery(node, state.filters.query));
  } else {
    nodes = [...(state.data.nodes || [])]
      .filter((node) => matchesQuery(node, state.filters.query))
      .sort((a, b) => compareNodes(a, b, state.dataLanguage));
  }

  updateStats(nodes);
  renderList(nodes, {
    language: state.dataLanguage,
    index,
    semanticScores: state.semanticSearch.active ? semanticScores : null
  });
}

function bindSemanticSearch() {
  if (semanticSearchBound) return;
  semanticSearchBound = true;
  dom.semanticSearchForm?.addEventListener('submit', handleSemanticSearch);
  dom.semanticClear?.addEventListener('click', () => {
    resetSemanticSearch();
    renderDataPage();
  });
}

async function handleSemanticSearch(event) {
  event.preventDefault();
  const query = dom.semanticSearch?.value.trim() || '';
  if (!query || !state.dataSource || state.displayType !== 'cards') return;

  state.semanticSearch = {
    businessName: state.dataSource,
    query,
    loading: true,
    active: false,
    results: [],
    error: ''
  };
  state.filters.query = '';
  if (dom.search) dom.search.value = '';
  syncSemanticSearchUi();

  try {
    const params = new URLSearchParams({ business_name: state.dataSource, text: query });
    const response = await api(`/api/nodes/semantic-search?${params}`);
    state.semanticSearch.results = Array.isArray(response?.data) ? response.data : [];
    state.semanticSearch.active = true;
  } catch (error) {
    state.semanticSearch.error = error.message || '语义搜索失败';
  } finally {
    state.semanticSearch.loading = false;
    syncSemanticSearchUi();
    renderDataPage();
  }
}

function resetSemanticSearch() {
  state.semanticSearch = {
    businessName: '',
    query: '',
    loading: false,
    active: false,
    results: [],
    error: ''
  };
  if (dom.semanticSearch) dom.semanticSearch.value = '';
  syncSemanticSearchUi();
}

function syncSemanticSearchUi() {
  if (dom.semanticSubmit) {
    dom.semanticSubmit.disabled = state.semanticSearch.loading;
    dom.semanticSubmit.textContent = state.semanticSearch.loading ? '搜索中…' : '搜索';
  }
  dom.semanticClear?.classList.toggle('is-hidden', !state.semanticSearch.active && !state.semanticSearch.error);
  if (!dom.semanticStatus) return;
  if (state.semanticSearch.loading) {
    dom.semanticStatus.textContent = '正在进行混合检索与重排序…';
    dom.semanticStatus.classList.remove('is-error');
  } else if (state.semanticSearch.error) {
    dom.semanticStatus.textContent = state.semanticSearch.error;
    dom.semanticStatus.classList.add('is-error');
  } else if (state.semanticSearch.active) {
    dom.semanticStatus.textContent = `找到 ${state.semanticSearch.results.length} 个结果，已按语义分数排序。`;
    dom.semanticStatus.classList.remove('is-error');
  } else {
    dom.semanticStatus.textContent = '';
    dom.semanticStatus.classList.remove('is-error');
  }
}

function renderGraphMain(options) {
  const index = getDataIndex();
  const result = renderGraph({
    active: true,
    data: state.data,
    filters: state.filters,
    index,
    language: state.dataLanguage
  });
  setGraphActive(true);
  if (options.layoutOnly) refreshGraphLayout();
  updateStats(result.nodes);
}

function renderDetailRoute() {
  dom.emptyPage?.classList.add('is-hidden');
  dom.mainHeader?.classList.add('is-hidden');
  dom.grid?.classList.add('is-hidden');
  dom.graphWrap?.classList.add('is-hidden');
  setGraphActive(false);

  showDetail(currentRoute.characterId, {
    index: getDataIndex(),
    sourceView: state.detail.sourceView || state.displayType || 'cards',
    onReady: () => {}
  });
}

function updateStats(visibleNodes) {
  const allNodes = state.data.nodes || [];
  dom.total.textContent = allNodes.length;
  dom.visible.textContent = visibleNodes.length;
  dom.edges.textContent = state.data.edges?.length || 0;
  dom.status.textContent = allNodes.length
    ? formatText(DATA_TEXT.loadedStatus, { nodes: allNodes.length, edges: state.data.edges?.length || 0 })
    : DATA_TEXT.emptyHint;
}
