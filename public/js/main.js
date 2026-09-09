import { api } from './core/api.js';
import { initRouter, onRouteChange, parseRoute } from './core/router.js';
import { restoreDataState, state } from './core/state.js';
import { collectDom, hideElement, showElement } from './core/dom.js';
import { SYSTEM_IDS, STORAGE_KEYS } from './core/constants.js';
import { bindThemeToggles, initAllThemes, resetThemeByName } from './core/theme.js';
import { initAuthForm, refreshAuthPanel } from './auth/auth-form.js';
import { canAccessSystem, getPreferredSystem, initPortal, setSelectedSystem, showPortal } from './auth/portal.js';
import { hideAllShells, initShells, renderShell } from './systems/shells.js';

const dom = collectDom();
let renderDataRoute = () => {};
let bootDataApp = async () => {};

async function boot() {
  initThemes();
  initRouter();
  initPortalAndAuth();
  initShells(dom);
  bindGlobalEvents();

  await loadDataApp();
  onRouteChange(handleRoute);
  await resumeSession();
}

function initThemes() {
  initAllThemes();
  bindThemeToggles();
}

function initPortalAndAuth() {
  initPortal(
    {
      portalScreen: dom.portalScreen,
      authPanelScreen: dom.authPanelScreen,
      systemCards: dom.systemCards,
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
      authTabs: dom.authTabs,
      loginForm: dom.loginForm,
      registerForm: dom.registerForm,
      guestBtn: dom.guestBtn,
      authMessage: dom.authMessage
    },
    enterApp
  );
}

async function loadDataApp() {
  const dataApp = await import('./systems/data/app.js');
  await dataApp.initDataApp(dom);
  renderDataRoute = dataApp.renderDataRoute;
  bootDataApp = dataApp.bootDataApp;
}

async function resumeSession() {
  const me = await api('/api/auth/me');
  if (me?.user) enterApp(me.user, getPreferredSystem(me.user));
}

function bindGlobalEvents() {
  dom.logoutButtons.forEach((btn) => {
    btn.addEventListener('click', logout);
  });

  dom.sidebarToggles.forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('[data-app-shell]').classList.toggle('sidebar-collapsed');
    });
  });
}

async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  state.user = null;
  sessionStorage.removeItem(STORAGE_KEYS.ENTRY_SYSTEM);

  hideElement(dom.appRoot);
  hideAllShells();
  showElement(dom.authFlow);
  resetThemeByName('auth');
  showPortal();
}

function enterApp(user, systemId) {
  assertSystemAccess(user, systemId);

  state.user = user;
  state.page = systemId;
  restoreDataState();
  resetThemeByName(systemId);

  hideElement(dom.authFlow);
  hideElement(dom.portalScreen);
  hideElement(dom.authPanelScreen);
  showElement(dom.appRoot);
  hideAllShells();

  const nextHash = `#/${systemId}`;
  if (location.hash !== nextHash) {
    location.hash = nextHash;
    return;
  }
  renderSystem(systemId);
}

function handleRoute(route) {
  if (!state.user) return;
  assertSystemAccess(state.user, route.system);
  renderSystem(route.system, route);
}

function assertSystemAccess(user, systemId) {
  if (!canAccessSystem(user, systemId)) throw new Error(`无权访问系统: ${systemId}`);
}

function renderSystem(systemId, route) {
  hideAllShells();

  if (systemId === SYSTEM_IDS.DATA) {
    showElement(dom.dataShell);
    bootDataApp().then(() => renderDataRoute(route || parseRoute()));
    return;
  }
  renderShell(systemId);
}

boot();
