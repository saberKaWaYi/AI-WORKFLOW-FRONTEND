import { resetThemeByName } from '../core/theme.js';

export const ROLES = {
  ULTIMATE: 'ultimate',
  SUPER: 'super',
  USER: 'user',
  GUEST: 'guest'
};

export const ALL_SYSTEMS = ['data', 'text', 'video', 'admin'];
export const ASSIGNABLE_SYSTEMS = ['data', 'text', 'video'];

export const SYSTEMS = {
  data: { id: 'data', title: '数据展示', subtitle: '角色关系网络可视化' },
  text: { id: 'text', title: '文本 AI 任务链', subtitle: '文本生成与编排工作流' },
  video: { id: 'video', title: '视频 AI 任务链', subtitle: '视频生成与剪辑工作流' },
  admin: { id: 'admin', title: '系统管理', subtitle: '账号与权限管理' }
};

export const SYSTEM_LABELS = {
  data: '数据展示',
  text: '文本 AI',
  video: '视频 AI',
  admin: '系统管理'
};

export const ROLE_LABELS = {
  [ROLES.ULTIMATE]: '终极用户',
  [ROLES.SUPER]: '超级用户',
  [ROLES.USER]: '普通用户',
  [ROLES.GUEST]: '游客'
};

const AUTH_SYSTEM_CLASSES = ['system-data', 'system-text', 'system-video', 'system-admin'];

let selectedSystem = null;
let dom = {};
let onSystemAuth = null;

export function initPortal(elements, onAuth) {
  dom = elements;
  onSystemAuth = onAuth;
  dom.portalCards?.forEach((card) => card.addEventListener('click', () => openAuth(card.dataset.systemCard)));
  dom.authBack?.addEventListener('click', showPortal);
}

export function showPortal() {
  selectedSystem = null;
  resetThemeByName('auth');
  dom.portalScreen.classList.remove('is-hidden');
  dom.authPanelScreen.classList.add('is-hidden');
  dom.authPanelScreen.classList.remove(...AUTH_SYSTEM_CLASSES);
}

export function openAuth(systemId) {
  selectedSystem = SYSTEMS[systemId];
  if (!selectedSystem) throw new Error(`未知系统: ${systemId}`);
  setSelectedSystem(systemId);
  resetThemeByName('auth');
  dom.portalScreen.classList.add('is-hidden');
  dom.authPanelScreen.classList.remove('is-hidden');
  dom.authPanelScreen.classList.remove(...AUTH_SYSTEM_CLASSES);
  dom.authPanelScreen.classList.add(`system-${systemId}`);
  dom.authSystemTitle.textContent = selectedSystem.title;
  dom.authSystemSubtitle.textContent = selectedSystem.subtitle;
  onSystemAuth?.(systemId);
}

export function getSelectedSystem() {
  const systemId = selectedSystem?.id || sessionStorage.getItem('entrySystem');
  if (!systemId) throw new Error('未选择系统');
  return systemId;
}

export function setSelectedSystem(systemId) {
  selectedSystem = SYSTEMS[systemId];
  if (!selectedSystem) throw new Error(`未知系统: ${systemId}`);
  sessionStorage.setItem('entrySystem', systemId);
}

export function canAccessSystem(user, systemId) {
  if (!user || !systemId) return false;
  if (user.role === ROLES.ULTIMATE || user.role === ROLES.SUPER) return true;
  if (user.role === ROLES.GUEST) return systemId === 'data';
  return Array.isArray(user.allowedSystems) && user.allowedSystems.includes(systemId);
}

export function isAdminUser(user) {
  return user?.role === ROLES.ULTIMATE || user?.role === ROLES.SUPER;
}
