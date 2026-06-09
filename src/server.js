import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import cookie from "cookie";
import dotenv from "dotenv";
import express from "express";
import { createClient } from "redis";
import { createUser, findUserByLogin, initSchema, touchLastLogin } from "./db.js";

dotenv.config();

const app = express();
const port = Number(process.env.APP_PORT || 3000);
const sessionCookie = "dc_session";
const sessionTtl = Number(process.env.SESSION_TTL_SECONDS || 604800);
const guestSessionTtl = Number(process.env.GUEST_SESSION_TTL_SECONDS || 86400);

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) throw new Error("SESSION_SECRET must be at least 16 characters");
if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");

const redis = createClient({ url: process.env.REDIS_URL });
redis.on("error", (e) => console.error("Redis error", e));

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public"), { extensions: ["html"] }));

const sign = (v) => crypto.createHmac("sha256", process.env.SESSION_SECRET).update(v).digest("base64url");
const sessionKey = (id) => `session:${id}`;

function unpackSessionId(raw) {
  if (!raw) return null;
  const [id, signature] = raw.split(".");
  if (!id || !signature) return null;
  const expected = sign(id);
  const actual = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  return actual.length === expectedBuf.length && crypto.timingSafeEqual(actual, expectedBuf) ? id : null;
}

async function readSession(req) {
  const id = unpackSessionId(cookie.parse(req.headers.cookie || "")[sessionCookie]);
  if (!id) return null;
  const raw = await redis.get(sessionKey(id));
  return raw ? { id, ...JSON.parse(raw) } : null;
}

const cleanText = (v, max) => String(v || "").trim().slice(0, max);
const validateUsername = (v) => /^[a-zA-Z0-9_]{3,64}$/.test(v);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/network/:dataset", async (req, res, next) => {
  const { dataset } = req.params;
  if (!["genshin", "scp", "backrooms"].includes(dataset)) return res.status(404).json({ message: "Dataset not found" });
  try {
    const url = process.env[`NETWORK_API_URL_${dataset.toUpperCase()}`] || `${process.env.NETWORK_API_URL || "http://localhost:8000/api/network"}/${dataset}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (e) {
    console.error("Network API error:", e.message);
    next(e);
  }
});

app.get("/api/auth/me", async (req, res) => {
  const session = await readSession(req);
  res.json({ user: session ? { type: session.type, username: session.username || null, displayName: session.displayName, role: session.role || "guest" } : null });
});

app.post("/api/auth/guest", async (_req, res) => {
  const displayName = `Guest-${crypto.randomInt(1000, 9999)}`;
  const id = crypto.randomBytes(32).toString("base64url");
  await redis.set(sessionKey(id), JSON.stringify({ type: "guest", displayName, createdAt: new Date().toISOString() }), { EX: guestSessionTtl });
  res.setHeader("Set-Cookie", cookie.serialize(sessionCookie, `${id}.${sign(id)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: guestSessionTtl }));
  res.status(201).json({ user: { type: "guest", displayName, role: "guest" } });
});

app.post("/api/auth/register", async (req, res) => {
  const username = cleanText(req.body.username, 64);
  const email = cleanText(req.body.email, 255).toLowerCase();
  const displayName = cleanText(req.body.displayName || username, 80);
  const password = String(req.body.password || "");

  if (!validateUsername(username)) return res.status(400).json({ message: "Username must be 3-64 letters, numbers, or underscores" });
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: "Email format is invalid" });
  if (password.length < 8) return res.status(400).json({ message: "Password must be at least 8 characters" });

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await createUser({ username, email, passwordHash, displayName });
    const id = crypto.randomBytes(32).toString("base64url");
    await redis.set(sessionKey(id), JSON.stringify({ type: "user", userId: user.id, username: user.username, displayName: user.display_name, role: user.role, createdAt: new Date().toISOString() }), { EX: sessionTtl });
    res.setHeader("Set-Cookie", cookie.serialize(sessionCookie, `${id}.${sign(id)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: sessionTtl }));
    res.status(201).json({ user: { type: "user", username: user.username, displayName: user.display_name, role: user.role } });
  } catch (e) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Username or email already exists" });
    throw e;
  }
});

app.post("/api/auth/login", async (req, res) => {
  const login = cleanText(req.body.login, 255);
  const password = String(req.body.password || "");
  const user = await findUserByLogin(login);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ message: "Account or password is incorrect" });
  await touchLastLogin(user.id);
  const id = crypto.randomBytes(32).toString("base64url");
  await redis.set(sessionKey(id), JSON.stringify({ type: "user", userId: user.id, username: user.username, displayName: user.display_name, role: user.role, createdAt: new Date().toISOString() }), { EX: sessionTtl });
  res.setHeader("Set-Cookie", cookie.serialize(sessionCookie, `${id}.${sign(id)}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: sessionTtl }));
  res.json({ user: { type: "user", username: user.username, displayName: user.display_name, role: user.role } });
});

app.post("/api/auth/logout", async (req, res) => {
  const session = await readSession(req);
  if (session?.id) await redis.del(sessionKey(session.id));
  res.setHeader("Set-Cookie", cookie.serialize(sessionCookie, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 }));
  res.json({ ok: true });
});

app.use((_err, _req, res, _next) => res.status(500).json({ message: "Service is temporarily unavailable" }));

await redis.connect();
await initSchema();
app.listen(port, () => console.log(`AI-WORKFLOW-FRONTEND listening on ${port}`));
