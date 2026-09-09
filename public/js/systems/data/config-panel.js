import { api } from '../../core/api.js';
import { DISPLAY_TYPES, LANGUAGES } from '../../core/constants.js';
import { saveDataState, state } from '../../core/state.js';
import { escapeHtml } from '../../core/utils.js';
import { normalizeData, rebuildIndexes, createIndex } from './network-index.js';
import { compareNodes, getName } from './node-fields.js';

let dom = {};
let index = createIndex();
let filtersBound = false;
let onConfigChange = null;

export function getDataIndex() {
  return index;
}

export function initConfigPanel(elements, onChange) {
  dom = elements;
  onConfigChange = onChange;

  dom.dataSource?.addEventListener('change', handleDataSourceChange);
  dom.dataLanguage?.addEventListener('change', handleLanguageChange);
  dom.displayType?.addEventListener('change', handleDisplayTypeChange);

  if (!filtersBound) {
    bindFilters();
    filtersBound = true;
  }
}

export async function loadBusinesses() {
  const result = await api('/api/businesses');
  state.businesses = result.businesses;
  populateDataSourceOptions(state.businesses);
}

async function loadNetwork(sourceKey) {
  const data = await api(`/api/network/${encodeURIComponent(sourceKey)}`);
  state.data = normalizeData(data);
  populateLanguageOptions();
  syncLanguageControls();
}

export async function restoreConfigFromState() {
  if (!state.dataSource) return;
  dom.dataSource.value = state.dataSource;

  await loadNetwork(state.dataSource);

  if (state.dataLanguage) {
    dom.dataLanguage.value = state.dataLanguage;
    syncLanguageControls();
  }
  if (state.displayType) {
    dom.displayType.value = state.displayType;
    state.view = state.view || state.displayType;
    finishDisplaySetup();
  }
}

function populateDataSourceOptions(businesses) {
  if (!dom.dataSource) return;
  dom.dataSource.innerHTML = '<option value="">请选择</option>';
  businesses.forEach((key) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    dom.dataSource.appendChild(option);
  });
}

async function handleDataSourceChange(event) {
  const sourceKey = event.target.value;
  state.dataSource = sourceKey;
  state.dataLanguage = '';
  state.displayType = '';
  state.dataLoaded = false;
  state.view = null;
  resetDataControls();

  if (!sourceKey) {
    saveDataState();
    onConfigChange?.();
    return;
  }

  await loadNetwork(sourceKey);
  saveDataState();
  onConfigChange?.();
}

function resetDataControls() {
  if (dom.dataLanguage) {
    dom.dataLanguage.setAttribute('disabled', '');
    dom.dataLanguage.innerHTML = '<option value="">请先选择数据源</option>';
  }
  if (dom.displayType) {
    dom.displayType.setAttribute('disabled', '');
    dom.displayType.value = '';
  }
  dom.graphFilterSection?.classList.add('is-hidden');
  dom.cardsFilterSection?.classList.add('is-hidden');
}

function populateLanguageOptions() {
  if (!dom.dataLanguage) return;

  dom.dataLanguage.innerHTML = '';
  const { has_chinese, has_english } = state.data;

  if (has_chinese) {
    const option = document.createElement('option');
    option.value = LANGUAGES.ZH;
    option.textContent = '中文';
    dom.dataLanguage.appendChild(option);
  }
  if (has_english) {
    const option = document.createElement('option');
    option.value = LANGUAGES.EN;
    option.textContent = 'English';
    dom.dataLanguage.appendChild(option);
  }

  dom.dataLanguage.insertAdjacentHTML('afterbegin', '<option value="">请选择</option>');
  dom.dataLanguage.value = '';
}

function handleLanguageChange(event) {
  state.dataLanguage = event.target.value;
  syncLanguageControls();
  saveDataState();
  onConfigChange?.();
}

function syncLanguageControls() {
  if (dom.dataLanguage?.options.length > 1) dom.dataLanguage.removeAttribute('disabled');
  if (dom.dataLanguage && !state.dataLanguage) dom.dataLanguage.value = '';

  if (state.dataLanguage) dom.displayType?.removeAttribute('disabled');
  else dom.displayType?.setAttribute('disabled', '');

  rebuildNodeSelects();
}

function handleDisplayTypeChange(event) {
  state.displayType = event.target.value;
  state.view = state.displayType || null;
  finishDisplaySetup();
  saveDataState();
  onConfigChange?.();
}

function finishDisplaySetup() {
  syncDisplayFilterControls();

  if (state.displayType && state.data.nodes.length > 0) {
    state.dataLoaded = true;
    rebuildIndexes(state.data, index);
    rebuildNodeSelects();
  }
}

function syncDisplayFilterControls() {
  const ready = Boolean(state.dataSource && state.dataLanguage && state.displayType);
  dom.graphFilterSection?.classList.toggle('is-hidden', !ready || state.displayType !== DISPLAY_TYPES.GRAPH);
  dom.cardsFilterSection?.classList.toggle('is-hidden', !ready || state.displayType !== DISPLAY_TYPES.CARDS);
}

function rebuildNodeSelects() {
  const nodes = [...(state.data.nodes || [])].sort((a, b) => compareNodes(a, b, state.dataLanguage));
  renderNodeSelect(dom.focusNode, state.filters.focusNodeId, nodes);
  renderNodeSelect(dom.pathSource, state.filters.pathSourceId, nodes);
  renderNodeSelect(dom.pathTarget, state.filters.pathTargetId, nodes);
}

function renderNodeSelect(select, selectedValue, nodes) {
  if (!select) return;
  select.innerHTML = [
    `<option value="">不限</option>`,
    ...nodes.map((node) => `<option value="${escapeHtml(node.vid)}">${escapeHtml(getName(node, state.dataLanguage))} (${escapeHtml(node.vid)})</option>`)
  ].join('');
  select.value = selectedValue;
}

function bindFilters() {
  dom.search?.addEventListener('input', (event) => {
    state.filters.query = event.target.value.trim().toLowerCase();
    saveDataState();
    onConfigChange?.();
  });

  dom.focusNode?.addEventListener('change', (event) => {
    state.filters.focusNodeId = event.target.value;
    if (state.filters.focusNodeId) resetPathFilter();
    syncFilterControls();
    saveDataState();
    onConfigChange?.();
  });

  dom.focusDepth?.addEventListener('change', (event) => {
    state.filters.focusDepth = Number(event.target.value) || 1;
    if (state.filters.focusNodeId) resetPathFilter();
    syncFilterControls();
    saveDataState();
    onConfigChange?.();
  });

  dom.pathSource?.addEventListener('change', (event) => {
    state.filters.pathSourceId = event.target.value;
    if (state.filters.pathSourceId || state.filters.pathTargetId) resetFocusFilter();
    syncFilterControls();
    saveDataState();
    onConfigChange?.();
  });

  dom.pathTarget?.addEventListener('change', (event) => {
    state.filters.pathTargetId = event.target.value;
    if (state.filters.pathSourceId || state.filters.pathTargetId) resetFocusFilter();
    syncFilterControls();
    saveDataState();
    onConfigChange?.();
  });

  dom.sizeMode?.addEventListener('change', (event) => {
    state.filters.sizeMode = event.target.value;
    saveDataState();
    onConfigChange?.();
  });

  dom.layout?.addEventListener('change', (event) => {
    state.filters.layout = event.target.value;
    saveDataState();
    onConfigChange?.({ layoutOnly: true });
  });
}

function syncFilterControls() {
  if (dom.focusNode) dom.focusNode.value = state.filters.focusNodeId;
  if (dom.focusDepth) dom.focusDepth.value = String(state.filters.focusDepth);
  if (dom.pathSource) dom.pathSource.value = state.filters.pathSourceId;
  if (dom.pathTarget) dom.pathTarget.value = state.filters.pathTargetId;
}

function resetFocusFilter() {
  state.filters.focusNodeId = '';
}

function resetPathFilter() {
  state.filters.pathSourceId = '';
  state.filters.pathTargetId = '';
}

export function syncFilterUiValues() {
  if (dom.search) dom.search.value = state.filters.query;
  syncFilterControls();
}
