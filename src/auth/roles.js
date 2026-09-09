export const ROLES = {
  ULTIMATE: "ultimate",
  SUPER: "super",
  USER: "user",
  GUEST: "guest"
};

/** 管理入口：不是业务系统，不参与分配，能否进入由角色决定。 */
export const ADMIN_SYSTEM = "admin";

/** 全部系统标识 = 业务系统 + 管理入口，顺序与前端保持一致。 */
export const ALL_SYSTEMS = ["data", "text", "image", "voice", "video", ADMIN_SYSTEM];

/** 可分配给普通用户的业务系统；新增业务系统只需加进 ALL_SYSTEMS。 */
export const ASSIGNABLE_SYSTEMS = ALL_SYSTEMS.filter((system) => system !== ADMIN_SYSTEM);
export const DEFAULT_USER_SYSTEMS = ["data"];
export const GUEST_SYSTEMS = ["data"];

export const ADMIN_ROLES = new Set([ROLES.ULTIMATE, ROLES.SUPER]);
export const ASSIGNABLE_ROLES = new Set([ROLES.SUPER, ROLES.USER]);

export const ROLE_LABELS = {
  [ROLES.ULTIMATE]: "Ultimate",
  [ROLES.SUPER]: "Super",
  [ROLES.USER]: "User",
  [ROLES.GUEST]: "Guest"
};

export const SYSTEM_LABELS = {
  data: "Data",
  text: "Text AI",
  image: "Image AI",
  voice: "Audio AI",
  video: "Video AI",
  admin: "Admin"
};

export const cleanText = (value, max) => String(value || "").trim().slice(0, max);
export const validateUsername = (value) => /^[a-zA-Z0-9_\u4e00-\u9fff]{2,64}$/.test(value);
export const validateEmail = (value) => !value || /^\S+@\S+\.\S+$/.test(value);

export function resolveAllowedSystems(role, allowedSystems = []) {
  if (role === ROLES.ULTIMATE || role === ROLES.SUPER) return [...ALL_SYSTEMS];
  if (role === ROLES.GUEST) return [...GUEST_SYSTEMS];
  if (!Array.isArray(allowedSystems)) throw new Error("allowedSystems must be an array");
  return allowedSystems;
}

export function canAccess(role, allowedSystems, entrySystem) {
  if (!entrySystem) return false;
  return resolveAllowedSystems(role, allowedSystems).includes(entrySystem);
}

export function isAdminRole(role) {
  return ADMIN_ROLES.has(role);
}

export function sanitizeAssignableSystems(systems) {
  if (!Array.isArray(systems)) throw new Error("allowedSystems must be an array");
  return [...new Set(systems.filter((item) => ASSIGNABLE_SYSTEMS.includes(item)))];
}

export function normalizeSystemsForRole(role, systems = DEFAULT_USER_SYSTEMS) {
  if (role === ROLES.ULTIMATE || role === ROLES.SUPER) return [...ALL_SYSTEMS];
  if (role === ROLES.GUEST) return [...GUEST_SYSTEMS];
  const normalized = sanitizeAssignableSystems(systems);
  return normalized.length ? normalized : [...DEFAULT_USER_SYSTEMS];
}

export function canAssignRole(operatorRole, targetRole) {
  if (targetRole === ROLES.ULTIMATE) return false;
  if (targetRole === ROLES.SUPER) return operatorRole === ROLES.ULTIMATE;
  return targetRole === ROLES.USER;
}

/**
 * 判断操作者是否有权处置目标用户。
 * 编辑与删除采用同一套规则，故共用实现。
 */
export function canManageUser(operator, target) {
  if (!operator || !target) return false;
  if (operator.id === target.id) return false;
  if (target.role === ROLES.ULTIMATE) return false;
  if (operator.role === ROLES.ULTIMATE) return true;
  if (operator.role === ROLES.SUPER) return target.role === ROLES.USER;
  return false;
}

export const canEditUser = canManageUser;
export const canDeleteUser = canManageUser;
