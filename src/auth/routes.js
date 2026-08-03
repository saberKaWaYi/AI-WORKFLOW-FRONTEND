import bcrypt from "bcryptjs";
import { Router } from "express";
import { createUser, findUserById, findUserByLogin, parseStoredSystems, touchLastLogin } from "../db.js";
import { ALL_SYSTEMS, DEFAULT_USER_SYSTEMS, ROLES, canAccess, cleanText, validateEmail, validateUsername } from "./roles.js";

function parseEntrySystem(value) {
  const system = cleanText(value, 32);
  return ALL_SYSTEMS.includes(system) ? system : null;
}

export function createAuthRouter({ sessionManager }) {
  const router = Router();
  const sessionTtl = Number(process.env.SESSION_TTL_SECONDS || 604800);
  const guestSessionTtl = Number(process.env.GUEST_SESSION_TTL_SECONDS || 86400);

  router.get("/me", async (req, res) => {
    const session = await sessionManager.readSession(req);
    if (session?.type === "user" && session.userId) {
      const user = await findUserById(session.userId);
      if (!user || !user.is_active || user.deleted_at) {
        await sessionManager.destroySession(req, res);
        return res.json({ user: null });
      }
    }
    res.json({ user: sessionManager.publicUser(session) });
  });

  router.post("/guest", async (req, res) => {
    const system = parseEntrySystem(req.body.entrySystem);
    if (!system) return res.status(400).json({ message: "entrySystem is required" });
    if (!canAccess(ROLES.GUEST, [], system)) return res.status(403).json({ message: "无权进入该系统" });

    const user = await sessionManager.writeSession(res, sessionManager.buildGuestPayload(), guestSessionTtl);
    res.status(201).json({ user });
  });

  router.post("/register", async (req, res) => {
    const username = cleanText(req.body.username, 64);
    const email = cleanText(req.body.email, 255).toLowerCase();
    const displayName = cleanText(req.body.displayName || username, 80);
    const password = String(req.body.password || "");
    const system = parseEntrySystem(req.body.entrySystem);

    if (!system) return res.status(400).json({ message: "entrySystem is required" });
    if (system !== "data") return res.status(403).json({ message: "仅可在数据展示系统注册" });
    if (!validateUsername(username)) return res.status(400).json({ message: "用户名需为 2-64 位，可包含字母、数字、下划线或中文" });
    if (!validateEmail(email)) return res.status(400).json({ message: "邮箱格式不正确" });
    if (password.length < 8) return res.status(400).json({ message: "密码至少需要 8 位" });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser({
      username,
      email,
      passwordHash,
      displayName,
      role: ROLES.USER,
      allowedSystems: DEFAULT_USER_SYSTEMS
    });
    const publicUser = await sessionManager.writeSession(res, sessionManager.buildUserPayload(user), sessionTtl);
    res.status(201).json({ user: publicUser });
  });

  router.post("/login", async (req, res) => {
    const login = cleanText(req.body.login, 255);
    const password = String(req.body.password || "");
    const system = parseEntrySystem(req.body.entrySystem);

    if (!system) return res.status(400).json({ message: "entrySystem is required" });

    const user = await findUserByLogin(login);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: "账号或密码错误" });
    }
    if (!user.is_active) return res.status(403).json({ message: "账号已被禁用" });
    if (!canAccess(user.role, parseStoredSystems(user), system)) {
      return res.status(403).json({ message: "无权进入该系统" });
    }

    await touchLastLogin(user.id);
    const publicUser = await sessionManager.writeSession(res, sessionManager.buildUserPayload(user), sessionTtl);
    res.json({ user: publicUser });
  });

  router.post("/logout", async (req, res) => {
    await sessionManager.destroySession(req, res);
    res.json({ ok: true });
  });

  return router;
}
