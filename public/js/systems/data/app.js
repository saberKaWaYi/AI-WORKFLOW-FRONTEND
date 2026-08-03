import { DATA_TEXT, state } from '../../core/state.js';
import { formatText } from '../../core/utils.js';
import { navigateToDataMain, navigateToDetail } from '../../core/router.js';
import { compareNodes } from './character-utils.js';
import { getDataIndex, initConfigPanel, loadBusinesses, restoreConfigFromState, syncFilterUiValues } from './config-panel.js';
import { initListView, renderList, matchesQuery, closeListPanel } from '../../views/list-view.js';
import { initGraphView, renderGraph, setGraphActive, refreshGraphLayout } from '../../views/graph-view.js';
import { initDetailView, showDetail, hideDetail } from '../../views/detail-view.js';

let dom = {};
let currentRoute = { system: 'data', page: 'main' };

export function initDataApp(elements) {
  dom = elements;

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
  const nodes = [...(state.data.nodes || [])]
    .filter((node) => matchesQuery(node, state.filters.query))
    .sort((a, b) => compareNodes(a, b, state.dataLanguage));

  updateStats(nodes);
  renderList(nodes, { language: state.dataLanguage, index });
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
