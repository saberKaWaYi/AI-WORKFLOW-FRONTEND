import { api } from './core/api.js';
import { initRouter, onRouteChange, parseRoute } from './core/router.js';
import { restoreDataState, state } from './core/state.js';
import { bindThemeToggles, initAllThemes, resetThemeByName } from './core/theme.js';
import { initAuthForm, refreshAuthPanel } from './auth/auth-form.js';
import { initPortal, showPortal, setSelectedSystem, canAccessSystem, getSelectedSystem } from './auth/portal.js';
import {
  initTextShell, renderTextShell, hideTextShell,
  initVideoShell, renderVideoShell, hideVideoShell,
  initAdminShell, renderAdminShell, hideAdminShell
} from './systems/shells.js';

const qs = (selector, root = document) => root.querySelector(selector);
const dom = {};
let renderDataRoute = () => {};
let bootDataApp = async () => {};

async function boot() {
  initDom();
  initAllThemes();
  bindThemeToggles();
  initRouter();

  initPortal(
    {
      portalScreen: dom.portalScreen,
      authPanelScreen: dom.authPanelScreen,
      portalCards: document.querySelectorAll('[data-system-card]'),
      authBack: dom.authBack,
      authSystemTitle: dom.authSystemTitle,
      authSystemSubtitle: dom.authSystemSubtitle
    },
    (systemId) => {
      setSelectedSystem(systemId);
      refreshAuthPanel();
    }
  );

  initAuthForm(
    {
      authTabsWrap: dom.authTabsWrap,
      authTabs: document.querySelectorAll('[data-auth-tab]'),
      loginForm: dom.loginForm,
      registerForm: dom.registerForm,
      guestBtn: dom.guestBtn,
      authMessage: dom.authMessage
    },
    enterApp
  );

  bindShellEvents();
  initTextShell({ shell: dom.textShell, main: dom.textMain, title: dom.textTitle, subtitle: dom.textSubtitle, greeting: dom.textGreeting });
  initVideoShell({ shell: dom.videoShell, main: dom.videoMain, title: dom.videoTitle, subtitle: dom.videoSubtitle, greeting: dom.videoGreeting });
  initAdminShell({ shell: dom.adminShell, main: dom.adminMain, title: dom.adminTitle, subtitle: dom.adminSubtitle, greeting: dom.adminGreeting });

  await loadDataApp();
  onRouteChange(handleRoute);

  const me = await api('/api/auth/me');
  if (me.user) {
    const systemId = getSelectedSystem();
    if (!canAccessSystem(me.user, systemId)) throw new Error(`无权访问系统: ${systemId}`);
    state.page = systemId;
    enterApp(me.user, systemId);
  }
}

async function loadDataApp() {
  const data = await import('./systems/data/app.js');
  await data.initDataApp({
    grid: dom.grid,
    floatingPanel: dom.floatingPanel,
    floatingTitle: dom.floatingTitle,
    floatingContent: dom.floatingContent,
    graphWrap: dom.graphWrap,
    canvas: dom.canvas,
    tooltip: dom.tooltip,
    detailView: dom.detailView,
    emptyPage: dom.emptyPage,
    mainHeader: dom.mainHeader,
    status: dom.status,
    total: dom.total,
    visible: dom.visible,
    edges: dom.edges,
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
  });
  renderDataRoute = data.renderDataRoute;
  bootDataApp = data.bootDataApp;
}

function initDom() {
  Object.assign(dom, {
    authFlow: qs('[data-theme-scope="auth"]'),
    portalScreen: qs('[data-portal-screen]'),
    authPanelScreen: qs('[data-auth-panel-screen]'),
    authBack: qs('[data-auth-back]'),
    authTabsWrap: qs('[data-auth-tabs]'),
    authSystemTitle: qs('[data-auth-system-title]'),
    authSystemSubtitle: qs('[data-auth-system-subtitle]'),
    loginForm: qs('[data-auth-form="login"]'),
    registerForm: qs('[data-auth-form="register"]'),
    guestBtn: qs('[data-guest]'),
    authMessage: qs('[data-auth-message]'),
    appRoot: qs('[data-app-root]'),
    dataShell: qs('[data-shell="data"]'),
    textShell: qs('[data-shell="text"]'),
    videoShell: qs('[data-shell="video"]'),
    adminShell: qs('[data-shell="admin"]'),
    grid: qs('#characterGrid'),
    floatingPanel: qs('[data-floating-panel]'),
    floatingTitle: qs('[data-floating-title]'),
    floatingContent: qs('[data-floating-content]'),
    graphWrap: qs('[data-view="graph"]'),
    canvas: qs('#graphCanvas'),
    tooltip: qs('#tooltip'),
    detailView: qs('[data-detail-view]'),
    emptyPage: qs('[data-empty-page]'),
    mainHeader: qs('[data-main-header]'),
    status: qs('[data-status]'),
    total: qs('[data-total]'),
    visible: qs('[data-visible]'),
    edges: qs('[data-edges]'),
    dataSource: qs('[data-data-source]'),
    dataLanguage: qs('[data-data-language]'),
    displayType: qs('[data-display-type]'),
    graphFilterSection: qs('[data-graph-filter-section]'),
    cardsFilterSection: qs('[data-cards-filter-section]'),
    search: qs('[data-search]'),
    focusNode: qs('[data-focus-node]'),
    focusDepth: qs('[data-focus-depth]'),
    pathSource: qs('[data-path-source]'),
    pathTarget: qs('[data-path-target]'),
    sizeMode: qs('[data-size-mode]'),
    layout: qs('[data-layout]'),
    textMain: qs('[data-text-main]'),
    textTitle: qs('[data-text-title]'),
    textSubtitle: qs('[data-text-subtitle]'),
    textGreeting: qs('[data-text-greeting]'),
    videoMain: qs('[data-video-main]'),
    videoTitle: qs('[data-video-title]'),
    videoSubtitle: qs('[data-video-subtitle]'),
    videoGreeting: qs('[data-video-greeting]'),
    adminMain: qs('[data-admin-main]'),
    adminTitle: qs('[data-admin-title]'),
    adminSubtitle: qs('[data-admin-subtitle]'),
    adminGreeting: qs('[data-admin-greeting]')
  });
}

function bindShellEvents() {
  document.querySelectorAll('[data-logout]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api('/api/auth/logout', { method: 'POST' });
      state.user = null;
      sessionStorage.removeItem('entrySystem');
      dom.appRoot.classList.add('is-hidden');
      hideAllShells();
      dom.authFlow.classList.remove('is-hidden');
      resetThemeByName('auth');
      showPortal();
    });
  });

  document.querySelectorAll('[data-sidebar-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('[data-app-shell]').classList.toggle('sidebar-collapsed');
    });
  });
}

function renderSystem(systemId, route) {
  [dom.dataShell, dom.textShell, dom.videoShell, dom.adminShell].forEach((shell) => shell.classList.add('is-hidden'));

  if (systemId === 'data') {
    dom.dataShell.classList.remove('is-hidden');
    bootDataApp().then(() => renderDataRoute(route || parseRoute()));
    return;
  }
  if (systemId === 'text') renderTextShell();
  else if (systemId === 'video') renderVideoShell();
  else if (systemId === 'admin') renderAdminShell();
}

function enterApp(user, systemId) {
  state.user = user;
  state.page = systemId;
  restoreDataState();
  resetThemeByName(systemId);

  dom.authFlow.classList.add('is-hidden');
  dom.portalScreen.classList.add('is-hidden');
  dom.authPanelScreen.classList.add('is-hidden');
  dom.appRoot.classList.remove('is-hidden');

  hideAllShells();
  const nextHash = `#/${systemId}`;
  if (location.hash !== nextHash) {
    location.hash = nextHash;
    return;
  }
  renderSystem(systemId);
}

function hideAllShells() {
  [dom.dataShell, dom.textShell, dom.videoShell, dom.adminShell].forEach((shell) => shell.classList.add('is-hidden'));
  hideTextShell();
  hideVideoShell();
  hideAdminShell();
}

function handleRoute(route) {
  if (!state.user) return;
  if (!canAccessSystem(state.user, route.system)) throw new Error(`无权访问系统: ${route.system}`);
  renderSystem(route.system, route);
}

boot();
