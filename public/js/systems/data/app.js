import { DATA_TEXT, saveDataState, state } from '../../core/state.js';
import { api } from '../../core/api.js';
import { DETAIL_SOURCE_VIEWS, DISPLAY_TYPES, SYSTEM_IDS } from '../../core/constants.js';
import { formatText } from '../../core/utils.js';
import { navigateToDataMain, navigateToDetail, ROUTE_PAGES } from '../../core/router.js';
import { compareNodes } from './node-fields.js';
import { logViolations, renderContractErrors } from './contract.js';
import { getDataIndex, initConfigPanel, loadBusinesses, restoreConfigFromState, syncFilterUiValues } from './config-panel.js';
import { findNodeByKey } from './network-index.js';
import { initListView, renderList, matchesQuery, closeListPanel } from '../../views/list-view.js';
import { initGraphView, renderGraph, setGraphActive, refreshGraphLayout } from '../../views/graph-view.js';
import { initDetailView, showDetail, hideDetail } from '../../views/detail-view.js';
import { renderStoriesPage, renderStoryDetail } from '../../views/story-view.js';

let dom = {};
let currentRoute = { system: SYSTEM_IDS.DATA, page: 'main' };
let semanticSearchBound = false;
// 每次提交搜索自增一次。旧轮询发现令牌变了就自行退出，避免慢结果覆盖新搜索。
let semanticSearchToken = 0;

// 异步任务轮询参数：后端 task 服务每 5 秒捞一次，这里保持一致节奏。
const SEMANTIC_POLL_INTERVAL_MS = 5000;
const SEMANTIC_MAX_WAIT_MS = 300000;

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
  'contractErrors',
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

/**
 * 启动数据系统。
 *
 * `route.business` 是跨系统跳转带过来的目标业务（`?biz=`）。必须在
 * `restoreConfigFromState()` **之前**落进 state，否则会用上一次的业务去加载网络，
 * 详情页随后按错的 business_name 查库，必然查不到。
 */
export async function bootDataApp(route = {}) {
  if (route.business && route.business !== state.dataSource) {
    await applyBusiness(route.business);
  }
  await restoreConfigFromState();
  renderDataPage();
}

/** 切换数据源。只置状态，网络加载与控件同步交给 restoreConfigFromState 统一做。 */
async function applyBusiness(business) {
  state.dataSource = business;
  state.dataLanguage = '';
  state.displayType = 'cards';
  state.dataLoaded = false;
  state.view = null;
  state.filters.query = '';
  saveDataState();
}

export function renderDataRoute(route) {
  currentRoute = route;
  if (route.page === ROUTE_PAGES.STORIES) {
    renderStoriesRoute();
    return;
  }
  if (route.page === ROUTE_PAGES.STORY) {
    renderStoryRoute(route.storyKey);
    return;
  }
  renderDataPage();
}

/** 剧情库总览页（#/data/stories）：浏览当前业务剧情表的全部剧情，按 category 分组。 */
function renderStoriesRoute() {
  hideDetail();
  setGraphActive(false);
  closeListPanel();
  dom.emptyPage?.classList.add('is-hidden');
  dom.mainHeader?.classList.add('is-hidden');
  dom.cardGrid?.classList.add('is-hidden');
  dom.graphWrap?.classList.add('is-hidden');
  renderStoriesPage(dom.detailView, state.dataSource);
}

/** 单条剧情详情页（#/data/story/<key>）。 */
function renderStoryRoute(storyKey) {
  hideDetail();
  setGraphActive(false);
  closeListPanel();
  dom.emptyPage?.classList.add('is-hidden');
  dom.mainHeader?.classList.add('is-hidden');
  dom.cardGrid?.classList.add('is-hidden');
  dom.graphWrap?.classList.add('is-hidden');
  renderStoryDetail(dom.detailView, state.dataSource, storyKey);
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
  renderNetworkContractErrors();

  if (state.view === DISPLAY_TYPES.CARDS) {
    dom.cardGrid?.classList.remove('is-hidden');
    renderCardsMain();
  } else if (state.view === DISPLAY_TYPES.GRAPH) {
    dom.graphWrap?.classList.remove('is-hidden');
    renderGraphMain(options);
  }
}

/** nebula 是通用契约，违约要摆在页面最显眼的位置，而不是只写进控制台。 */
function renderNetworkContractErrors() {
  if (!dom.contractErrors) return;
  const violations = state.data?.contractViolations || [];
  dom.contractErrors.innerHTML = renderContractErrors(violations, `nebula 图 ${state.dataSource}`);
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

  // 本次搜索的令牌：期间若发起新搜索，本次结果作废。
  const token = ++semanticSearchToken;

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
    // 后端已改为异步：这里只领一个任务号，真正的搜索在后台服务跑。
    const submitted = await api(`/api/nodes/semantic-search?${params}`);
    const messageId = submitted?.message_id;
    if (!messageId) throw new Error('未能取得任务编号');
    const results = await waitSemanticSearchResult(messageId, token);
    if (token !== semanticSearchToken) return;
    state.semanticSearch.results = results;
    state.semanticSearch.active = true;
  } catch (error) {
    if (token !== semanticSearchToken) return;
    state.semanticSearch.error = error.message || '语义搜索失败';
  } finally {
    if (token !== semanticSearchToken) return;
    state.semanticSearch.loading = false;
    syncSemanticSearchUi();
    renderDataPage();
  }
}

/** 凭任务号轮询结果：每 5 秒查一次，直到成功、失败或超时。
 *
 * 后端任务未落库时该接口会按 pending 返回（不报 404），所以这里无需处理首次查不到的情况。
 */
async function waitSemanticSearchResult(messageId, token) {
  const startedAt = Date.now();

  for (;;) {
    if (token !== semanticSearchToken) return [];
    if (Date.now() - startedAt > SEMANTIC_MAX_WAIT_MS) {
      throw new Error('搜索任务超时，请稍后重试');
    }
    await new Promise((resolve) => setTimeout(resolve, SEMANTIC_POLL_INTERVAL_MS));
    const task = await api(`/api/tasks/${encodeURIComponent(messageId)}`);
    if (task?.status === 'success') return Array.isArray(task.result) ? task.result : [];
    if (task?.status === 'failed') throw new Error(task.fail_reason || '搜索任务执行失败');
  }
}

function resetSemanticSearch() {
  // 令牌自增后，仍在轮询的旧任务会自行退出，避免清除后又冒出结果。
  semanticSearchToken += 1;
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
    dom.semanticStatus.textContent = '搜索任务已提交，正在后台检索…';
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
