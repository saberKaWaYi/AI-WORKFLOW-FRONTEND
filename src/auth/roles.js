export const ROLES = {
  ULTIMATE: "ultimate",
  SUPER: "super",
  USER: "user",
  GUEST: "guest"
};

export const ALL_SYSTEMS = ["data", "text", "video", "admin"];
export const ASSIGNABLE_SYSTEMS = ["data", "text", "video"];
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

export function canEditUser(operator, target) {
  if (!operator || !target) return false;
  if (operator.id === target.id) return false;
  if (target.role === ROLES.ULTIMATE) return false;
  if (operator.role === ROLES.ULTIMATE) return true;
  if (operator.role === ROLES.SUPER) return target.role === ROLES.USER;
  return false;
}

export function canDeleteUser(operator, target) {
  if (!operator || !target) return false;
  if (operator.id === target.id) return false;
  if (target.role === ROLES.ULTIMATE) return false;
  if (operator.role === ROLES.ULTIMATE) return true;
  if (operator.role === ROLES.SUPER) return target.role === ROLES.USER;
  return false;
}
