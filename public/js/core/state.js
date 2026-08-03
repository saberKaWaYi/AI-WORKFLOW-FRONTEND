export const state = {
  user: null,
  page: 'data',
  view: null,
  businesses: [],
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
  },
  detail: {
    loading: false,
    data: null,
    characterId: '',
    sourceView: ''
  }
};

export const DATA_TEXT = {
  empty: '没有找到匹配数据',
  noRelated: '暂无相关角色',
  relatedTitle: '相关角色',
  selectAll: '不限',
  loadedStatus: '已加载 {nodes} 个节点与 {edges} 条关系。',
  inDegree: '入度',
  outDegree: '出度',
  totalDegree: '总计',
  relationLabel: '关系',
  relationTitle: '{source} 到 {target} 的关系',
  unknown: '未知',
  emptyHint: '请从左侧选择数据源并配置展示方式',
  detailLoading: '加载中…',
  back: '返回'
};

const STORAGE_KEY = 'ai-workflow-data-state';

export function saveDataState() {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
    dataSource: state.dataSource,
    dataLanguage: state.dataLanguage,
    displayType: state.displayType,
    view: state.view,
    filters: state.filters
  }));
}

export function restoreDataState() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  const saved = JSON.parse(raw);
  Object.assign(state.filters, saved.filters || {});
  if (saved.dataSource) state.dataSource = saved.dataSource;
  if (saved.dataLanguage) state.dataLanguage = saved.dataLanguage;
  if (saved.displayType) {
    state.displayType = saved.displayType;
    state.view = saved.view || saved.displayType;
  }
}
