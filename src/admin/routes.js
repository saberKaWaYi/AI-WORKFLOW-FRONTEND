import bcrypt from "bcryptjs";
import { Router } from "express";
import { createUser, findUserById, listUsers, parseStoredSystems, serializeUserRow, softDeleteUser, updateUser } from "../db.js";
import {
  ROLES,
  canAssignRole,
  canDeleteUser,
  canEditUser,
  cleanText,
  normalizeSystemsForRole,
  sanitizeAssignableSystems,
  validateEmail,
  validateUsername
} from "../auth/roles.js";
import { requireAdmin } from "./middleware.js";

function toPublicUser(user) {
  const row = serializeUserRow(user);
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    allowedSystems: row.allowed_systems,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at
  };
}

function parseUserPayload(body, fallbackRole) {
  const role = body.role !== undefined ? cleanText(body.role, 32) : fallbackRole;
  const allowedSystems = body.allowedSystems !== undefined
    ? sanitizeAssignableSystems(body.allowedSystems)
    : undefined;

  return {
    role,
    allowedSystems,
    normalizedSystems: normalizeSystemsForRole(role, allowedSystems)
  };
}

export function createAdminRouter({ sessionManager }) {
  const router = Router();
  const guard = requireAdmin(sessionManager);

  router.get("/users", guard, async (_req, res) => {
    res.json({ users: (await listUsers()).map(toPublicUser) });
  });

  router.post("/users", guard, async (req, res) => {
    const username = cleanText(req.body.username, 64);
    const displayName = cleanText(req.body.displayName || username, 80);
    const email = cleanText(req.body.email, 255).toLowerCase();
    const password = String(req.body.password || "");
    const { role, allowedSystems, normalizedSystems } = parseUserPayload(req.body, ROLES.USER);

    if (!canAssignRole(req.adminUser.role, role)) return res.status(403).json({ message: "无权创建该角色用户" });
    if (!validateUsername(username)) return res.status(400).json({ message: "用户名需为 2-64 位，可包含字母、数字、下划线或中文" });
    if (password.length < 8) return res.status(400).json({ message: "密码至少需要 8 位" });
    if (!validateEmail(email)) return res.status(400).json({ message: "邮箱格式不正确" });
    if (role === ROLES.USER && allowedSystems !== undefined && !allowedSystems.length) {
      return res.status(400).json({ message: "请至少选择一个系统权限" });
    }

    const user = await createUser({
      username,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      displayName,
      role,
      allowedSystems: normalizedSystems
    });
    res.status(201).json({ user: toPublicUser(user) });
  });

  router.patch("/users/:id", guard, async (req, res) => {
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ message: "Invalid user id" });

    const target = await findUserById(userId);
    if (!target) return res.status(404).json({ message: "User not found" });
    if (req.adminUser.id === target.id) return res.status(403).json({ message: "不能操作自己" });
    if (!canEditUser(req.adminUser, target)) return res.status(403).json({ message: "无权编辑该用户" });

    const nextRole = req.body.role !== undefined ? cleanText(req.body.role, 32) : target.role;
    const nextActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : undefined;
    const nextSystems = req.body.allowedSystems !== undefined ? sanitizeAssignableSystems(req.body.allowedSystems) : undefined;

    if (nextRole !== target.role && !canAssignRole(req.adminUser.role, nextRole)) {
      return res.status(403).json({ message: "无权设置该用户角色" });
    }
    if (target.role === ROLES.ULTIMATE && req.adminUser.id === target.id) {
      if (nextActive === false) return res.status(400).json({ message: "不能禁用当前终极用户" });
      if (nextRole !== ROLES.ULTIMATE) return res.status(400).json({ message: "不能降级当前终极用户" });
    }
    if (nextRole === ROLES.USER && nextSystems !== undefined && !nextSystems.length) {
      return res.status(400).json({ message: "请至少选择一个系统权限" });
    }

    const currentSystems = sanitizeAssignableSystems(parseStoredSystems(target));
    const allowedSystems = normalizeSystemsForRole(nextRole, nextSystems ?? currentSystems);
    const email = req.body.email !== undefined ? cleanText(req.body.email, 255).toLowerCase() : undefined;
    if (email !== undefined && !validateEmail(email)) return res.status(400).json({ message: "邮箱格式不正确" });

    const updated = await updateUser(userId, {
      role: nextRole !== target.role ? nextRole : undefined,
      allowedSystems,
      isActive: nextActive,
      displayName: req.body.displayName !== undefined ? cleanText(req.body.displayName, 80) : undefined,
      email
    });
    res.json({ user: toPublicUser(updated) });
  });

  router.delete("/users/:id", guard, async (req, res) => {
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ message: "Invalid user id" });

    const target = await findUserById(userId);
    if (!target) return res.status(404).json({ message: "User not found" });
    if (req.adminUser.id === target.id) return res.status(403).json({ message: "不能操作自己" });
    if (!canDeleteUser(req.adminUser, target)) return res.status(403).json({ message: "无权删除该用户" });

    if (!(await softDeleteUser(userId))) return res.status(404).json({ message: "User not found" });
    res.json({ ok: true });
  });

  return router;
}
