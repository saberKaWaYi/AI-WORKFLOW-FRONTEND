import { resetThemeByName } from '../core/theme.js';
import { ALL_SYSTEM_IDS, SYSTEM_IDS, STORAGE_KEYS } from '../core/constants.js';

/**
 * 角色定义需与后端 src/auth/roles.js 保持一致。
 * 前后端运行在不同环境，无法共享同一份模块，故此处独立声明。
 */
export const ROLES = {
  ULTIMATE: 'ultimate',
  SUPER: 'super',
  USER: 'user',
  GUEST: 'guest'
};

export const ALL_SYSTEMS = ALL_SYSTEM_IDS;

/**
 * 可分配给普通用户的业务系统。
 * 由全部系统派生并排除管理入口 —— 新增业务系统只需加进 ALL_SYSTEM_IDS，此处无需改动。
 */
export const ASSIGNABLE_SYSTEMS = ALL_SYSTEM_IDS.filter((id) => id !== SYSTEM_IDS.ADMIN);

/**
 * 系统元数据：title 用于页面大标题与门户卡片，shortTitle 用于表格与标签等紧凑场景。
 * 顺序即门户与管理面板的展示顺序；文案为唯一出处，管理面板的 SYSTEM_LABELS 由此派生。
 */
export const SYSTEMS = {
  [SYSTEM_IDS.DATA]: { id: SYSTEM_IDS.DATA, title: '数据展示', shortTitle: '数据展示', subtitle: '角色关系网络可视化' },
  [SYSTEM_IDS.TEXT]: { id: SYSTEM_IDS.TEXT, title: '文本AI任务链', shortTitle: '文本AI', subtitle: '文本生成与编排工作流' },
  [SYSTEM_IDS.IMAGE]: { id: SYSTEM_IDS.IMAGE, title: '图片AI任务链', shortTitle: '图片AI', subtitle: '图片生成与编辑工作流' },
  [SYSTEM_IDS.VOICE]: { id: SYSTEM_IDS.VOICE, title: '音频AI任务链', shortTitle: '音频AI', subtitle: '音频生成与配音工作流' },
  [SYSTEM_IDS.VIDEO]: { id: SYSTEM_IDS.VIDEO, title: '视频AI任务链', shortTitle: '视频AI', subtitle: '视频生成与剪辑工作流' },
  [SYSTEM_IDS.ADMIN]: { id: SYSTEM_IDS.ADMIN, title: '系统管理', shortTitle: '系统管理', subtitle: '账号与权限管理' }
};

/** 紧凑场景下的系统短标签，由 SYSTEMS 派生，避免同一文案维护两份。 */
export const SYSTEM_LABELS = Object.fromEntries(
  Object.entries(SYSTEMS).map(([id, system]) => [id, system.shortTitle])
);

export const ROLE_LABELS = {
  [ROLES.ULTIMATE]: '终极用户',
  [ROLES.SUPER]: '超级用户',
  [ROLES.USER]: '普通用户',
  [ROLES.GUEST]: '游客'
};

const AUTH_SYSTEM_CLASSES = ALL_SYSTEM_IDS.map((id) => `system-${id}`);

let selectedSystem = null;
let dom = {};
let onSystemAuth = null;

export function initPortal(elements, onAuth) {
  dom = elements;
  onSystemAuth = onAuth;
  dom.systemCards?.forEach((card) => card.addEventListener('click', () => openAuth(card.dataset.systemCard)));
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
  const systemId = selectedSystem?.id || sessionStorage.getItem(STORAGE_KEYS.ENTRY_SYSTEM);
  if (!systemId) throw new Error('未选择系统');
  return systemId;
}

/**
 * 恢复会话时决定进入哪个系统，不抛异常。
 * 顺序：本次已选 -> 会话记忆 -> 用户可访问的第一个系统 -> 数据系统。
 * 用于刷新或直接打开带 hash 的链接等拿不到"已选系统"的场景。
 */
export function getPreferredSystem(user) {
  const remembered = selectedSystem?.id || sessionStorage.getItem(STORAGE_KEYS.ENTRY_SYSTEM);
  if (remembered && canAccessSystem(user, remembered)) return remembered;
  return (user.allowedSystems || []).find((id) => canAccessSystem(user, id)) || SYSTEM_IDS.DATA;
}

export function setSelectedSystem(systemId) {
  selectedSystem = SYSTEMS[systemId];
  if (!selectedSystem) throw new Error(`未知系统: ${systemId}`);
  sessionStorage.setItem(STORAGE_KEYS.ENTRY_SYSTEM, systemId);
}

export function canAccessSystem(user, systemId) {
  if (!user || !systemId) return false;
  if (user.role === ROLES.ULTIMATE || user.role === ROLES.SUPER) return true;
  if (user.role === ROLES.GUEST) return systemId === SYSTEM_IDS.DATA;
  return Array.isArray(user.allowedSystems) && user.allowedSystems.includes(systemId);
}

export function isAdminUser(user) {
  return user?.role === ROLES.ULTIMATE || user?.role === ROLES.SUPER;
}
