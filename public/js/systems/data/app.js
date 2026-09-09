import { DATA_TEXT, state } from '../../core/state.js';
import { api } from '../../core/api.js';
import { DETAIL_SOURCE_VIEWS, DISPLAY_TYPES, SYSTEM_IDS } from '../../core/constants.js';
import { formatText } from '../../core/utils.js';
import { navigateToDataMain, navigateToDetail } from '../../core/router.js';
import { compareNodes } from './node-fields.js';
import { getDataIndex, initConfigPanel, loadBusinesses, restoreConfigFromState, syncFilterUiValues } from './config-panel.js';
import { findNodeByKey } from './network-index.js';
import { initListView, renderList, matchesQuery, closeListPanel } from '../../views/list-view.js';
import { initGraphView, renderGraph, setGraphActive, refreshGraphLayout } from '../../views/graph-view.js';
import { initDetailView, showDetail, hideDetail } from '../../views/detail-view.js';

let dom = {};
let currentRoute = { system: SYSTEM_IDS.DATA, page: 'main' };
let semanticSearchBound = false;

/** 数据系统所需的 DOM 元素，从完整 dom 集合中显式挑选，明确依赖范围。 */
const DATA_DOM_KEYS = [
  'cardGrid',
  'floatingPanel',
  'floatingTitle',
  'floatingContent',
  'graphWrap',
  'graphCanvas',
  'graphTooltip',
  'detailView',
  'emptyPage',
  'mainHeader',
  'statusText',
  'totalCount',
  'visibleCount',
  'edgeCount',
  'dataSource',
  'dataLanguage',
  'displayType',
  'graphFilterSection',
  'cardsFilterSection',
  'search',
  'semanticSearchForm',
  'semanticSearch',
  'semanticSubmit',
  'semanticClear',
  'semanticStatus',
  'focusNode',
  'focusDepth',
  'pathSource',
  'pathTarget',
  'sizeMode',
  'layout'
];

const CONFIG_PANEL_KEYS = [
  'dataSource',
  'dataLanguage',
  'displayType',
  'graphFilterSection',
  'cardsFilterSection',
  'search',
  'focusNode',
  'focusDepth',
  'pathSource',
  'pathTarget',
  'sizeMode',
  'layout'
];

function pickKeys(source, keys) {
  return Object.fromEntries(keys.map((key) => [key, source[key]]));
}

export function initDataApp(elements) {
  dom = pickKeys(elements, DATA_DOM_KEYS);
  bindSemanticSearch();

  initListView(
    dom.cardGrid,
    { panel: dom.floatingPanel, title: dom.floatingTitle, content: dom.floatingContent },
    (nodeId) => navigateToDetail(nodeId, DETAIL_SOURCE_VIEWS.CARDS)
  );
  initGraphView(dom.graphCanvas, dom.graphTooltip, (nodeId) => navigateToDetail(nodeId, DETAIL_SOURCE_VIEWS.GRAPH));
  initDetailView(dom.detailView, () => navigateToDataMain());
  initConfigPanel(
    pickKeys(dom, CONFIG_PANEL_KEYS),
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
  dom.cardGrid?.classList.add('is-hidden');
  dom.graphWrap?.classList.add('is-hidden');

  if (!state.dataLoaded || !state.view) {
    dom.statusText.textContent = '';
    dom.totalCount.textContent = '0';
    dom.visibleCount.textContent = '0';
    dom.edgeCount.textContent = '0';
    return;
  }

  dom.emptyPage?.classList.add('is-hidden');
  dom.mainHeader?.classList.remove('is-hidden');

  if (state.view === DISPLAY_TYPES.CARDS) {
    dom.cardGrid?.classList.remove('is-hidden');
    renderCardsMain();
  } else if (state.view === DISPLAY_TYPES.GRAPH) {
    dom.graphWrap?.classList.remove('is-hidden');
    renderGraphMain(options);
  }
}

function renderCardsMain() {
  const index = getDataIndex();
  const semanticScores = new Map();
  let nodes;

  if (state.semanticSearch.active) {
    nodes = state.semanticSearch.results
      // 结果只带名称（部分业务的名称恰好等于节点 id），故先按英文名、再按中文名反查
      .map((result) => {
        const node = findNodeByKey(index, result.name_en) || findNodeByKey(index, result.name_zh);
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
  if (!query || !state.dataSource || state.displayType !== DISPLAY_TYPES.CARDS) return;

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
  dom.cardGrid?.classList.add('is-hidden');
  dom.graphWrap?.classList.add('is-hidden');
  setGraphActive(false);

  showDetail(currentRoute.nodeId, {
    index: getDataIndex(),
    sourceView: state.detail.sourceView || state.displayType || DETAIL_SOURCE_VIEWS.CARDS,
    onReady: () => {}
  });
}

function updateStats(visibleNodes) {
  const allNodes = state.data.nodes || [];
  dom.totalCount.textContent = allNodes.length;
  dom.visibleCount.textContent = visibleNodes.length;
  dom.edgeCount.textContent = state.data.edges?.length || 0;
  dom.statusText.textContent = allNodes.length
    ? formatText(DATA_TEXT.loadedStatus, { nodes: allNodes.length, edges: state.data.edges?.length || 0 })
    : DATA_TEXT.emptyHint;
}
