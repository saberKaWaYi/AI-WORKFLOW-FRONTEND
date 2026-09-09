/**
 * DOM 查询层：集中管理所有选择器，避免选择器字符串散落在各业务模块。
 *
 * - ELEMENT_SELECTORS   -> querySelector，返回单个元素（可能为 null）
 * - COLLECTION_SELECTORS -> querySelectorAll，返回元素数组
 */

const ELEMENT_SELECTORS = {
  // 认证流程
  authFlow: '[data-theme-scope="auth"]',
  portalScreen: '[data-portal-screen]',
  authPanelScreen: '[data-auth-panel-screen]',
  authBack: '[data-auth-back]',
  authTabsWrap: '[data-auth-tabs]',
  authSystemTitle: '[data-auth-system-title]',
  authSystemSubtitle: '[data-auth-system-subtitle]',
  loginForm: '[data-auth-form="login"]',
  registerForm: '[data-auth-form="register"]',
  guestBtn: '[data-guest]',
  authMessage: '[data-auth-message]',

  // 应用外壳
  appRoot: '[data-app-root]',
  dataShell: '[data-shell="data"]',
  textShell: '[data-shell="text"]',
  videoShell: '[data-shell="video"]',
  imageShell: '[data-shell="image"]',
  voiceShell: '[data-shell="voice"]',
  adminShell: '[data-shell="admin"]',

  // 数据系统：列表视图
  cardGrid: '#nodeGrid',
  floatingPanel: '[data-floating-panel]',
  floatingTitle: '[data-floating-title]',
  floatingContent: '[data-floating-content]',

  // 数据系统：拓扑视图
  graphWrap: '[data-view="graph"]',
  graphCanvas: '#graphCanvas',
  graphTooltip: '#tooltip',

  // 数据系统：详情与页面框架
  detailView: '[data-detail-view]',
  emptyPage: '[data-empty-page]',
  mainHeader: '[data-main-header]',

  // 数据系统：统计
  statusText: '[data-status]',
  totalCount: '[data-total]',
  visibleCount: '[data-visible]',
  edgeCount: '[data-edges]',

  // 数据系统：配置面板
  dataSource: '[data-data-source]',
  dataLanguage: '[data-data-language]',
  displayType: '[data-display-type]',
  graphFilterSection: '[data-graph-filter-section]',
  cardsFilterSection: '[data-cards-filter-section]',
  search: '[data-search]',

  // 数据系统：语义搜索
  semanticSearchForm: '[data-semantic-search-form]',
  semanticSearch: '[data-semantic-search]',
  semanticSubmit: '[data-semantic-submit]',
  semanticClear: '[data-semantic-clear]',
  semanticStatus: '[data-semantic-status]',

  // 数据系统：图过滤
  focusNode: '[data-focus-node]',
  focusDepth: '[data-focus-depth]',
  pathSource: '[data-path-source]',
  pathTarget: '[data-path-target]',
  sizeMode: '[data-size-mode]',
  layout: '[data-layout]',

  // 文本系统
  textMain: '[data-text-main]',
  textTitle: '[data-text-title]',
  textSubtitle: '[data-text-subtitle]',
  textGreeting: '[data-text-greeting]',

  // 视频系统
  videoMain: '[data-video-main]',
  videoTitle: '[data-video-title]',
  videoSubtitle: '[data-video-subtitle]',
  videoGreeting: '[data-video-greeting]',

  // 图片生成系统
  imageMain: '[data-image-main]',
  imageTitle: '[data-image-title]',
  imageSubtitle: '[data-image-subtitle]',
  imageGreeting: '[data-image-greeting]',

  // 语音生成系统
  voiceMain: '[data-voice-main]',
  voiceTitle: '[data-voice-title]',
  voiceSubtitle: '[data-voice-subtitle]',
  voiceGreeting: '[data-voice-greeting]',

  // 管理系统
  adminMain: '[data-admin-main]',
  adminTitle: '[data-admin-title]',
  adminSubtitle: '[data-admin-subtitle]',
  adminGreeting: '[data-admin-greeting]'
};

const COLLECTION_SELECTORS = {
  systemCards: '[data-system-card]',
  authTabs: '[data-auth-tab]',
  logoutButtons: '[data-logout]',
  sidebarToggles: '[data-sidebar-toggle]'
};

export function collectDom(root = document) {
  const dom = {};

  for (const [key, selector] of Object.entries(ELEMENT_SELECTORS)) {
    dom[key] = root.querySelector(selector);
  }
  for (const [key, selector] of Object.entries(COLLECTION_SELECTORS)) {
    dom[key] = [...root.querySelectorAll(selector)];
  }

  return dom;
}

export function showElement(el) {
  el?.classList.remove('is-hidden');
}

export function hideElement(el) {
  el?.classList.add('is-hidden');
}

export function setHidden(el, hidden) {
  if (hidden) hideElement(el);
  else showElement(el);
}
