import { api } from '../core/api.js';
import { state } from '../core/state.js';
import { getSelectedSystem, setSelectedSystem } from './portal.js';

let dom = {};
let onAuthenticated = null;

export function initAuthForm(elements, onAuth) {
  dom = elements;
  onAuthenticated = onAuth;

  dom.authTabs?.forEach((tab) => {
    tab.addEventListener('click', () => selectAuthTab(tab.dataset.authTab));
  });
  dom.loginForm?.addEventListener('submit', onLogin);
  dom.registerForm?.addEventListener('submit', onRegister);
  dom.guestBtn?.addEventListener('click', onGuest);
}

function selectAuthTab(name) {
  dom.authTabs?.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.authTab === name));
  dom.loginForm?.classList.toggle('is-hidden', name !== 'login');
  dom.registerForm?.classList.toggle('is-hidden', name !== 'register');
  showAuthMessage('');
}

function updateAuthOptions() {
  const systemId = getSelectedSystem();
  const isDataSystem = systemId === 'data';

  dom.authTabsWrap?.classList.toggle('is-hidden', !isDataSystem);
  dom.guestBtn?.classList.toggle('is-hidden', !isDataSystem);

  if (!isDataSystem) {
    selectAuthTab('login');
  }
}

export function refreshAuthPanel() {
  updateAuthOptions();
}

async function onLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = { ...Object.fromEntries(form), entrySystem: getSelectedSystem() };
  await submitAuth(() => api('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }));
}

async function onRegister(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = { ...Object.fromEntries(form), entrySystem: getSelectedSystem() };
  await submitAuth(() => api('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }));
}

async function onGuest() {
  const payload = { entrySystem: getSelectedSystem() };
  await submitAuth(() => api('/api/auth/guest', { method: 'POST', body: JSON.stringify(payload) }));
}

async function submitAuth(action) {
  showAuthMessage('');
  const systemId = getSelectedSystem();
  setSelectedSystem(systemId);
  state.page = systemId;
  const result = await action();
  onAuthenticated?.(result.user, systemId);
}

function showAuthMessage(message) {
  if (dom.authMessage) dom.authMessage.textContent = message;
}
