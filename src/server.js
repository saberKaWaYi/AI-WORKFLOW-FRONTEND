import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import { createClient } from "redis";
import { initSchema } from "./db.js";
import { createAdminRouter } from "./admin/routes.js";
import { createAuthRouter } from "./auth/routes.js";
import { createSessionManager } from "./auth/session.js";
import { ensureUltimateUser } from "./auth/seed.js";

dotenv.config();

const port = Number(process.env.APP_PORT || 3000);
const collectorApi = (process.env.COLLECTOR_API_URL || "http://localhost:8000/api").replace(/\/+$/, "");
const collectorTimeoutMs = Math.max(1000, Number(process.env.COLLECTOR_TIMEOUT_MS) || 15000);

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 16) {
  throw new Error("SESSION_SECRET must be at least 16 characters");
}
if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");
if (!process.env.MYSQL_URL) throw new Error("MYSQL_URL is required");

const redis = createClient({ url: process.env.REDIS_URL });
const sessionManager = createSessionManager({
  redis,
  sessionSecret: process.env.SESSION_SECRET,
  sessionTtl: Number(process.env.SESSION_TTL_SECONDS || 604800),
  guestSessionTtl: Number(process.env.GUEST_SESSION_TTL_SECONDS || 86400)
});

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public"), {
  extensions: ["html"],
  setHeaders(res, filePath) {
    if (filePath.endsWith(".js")) res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  }
}));

async function proxy(url, res, timeoutMs = collectorTimeoutMs) {
  try {
    const headers = { Accept: "application/json" };
    // P1：向后端透传 API Key（调用方需配置 COLLECTOR_API_KEY 环境变量）
    const apiKey = process.env.COLLECTOR_API_KEY;
    if (apiKey) headers["X-API-Key"] = apiKey;
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs)
    });
    const body = Buffer.from(await response.arrayBuffer());
    res.status(response.status);
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.send(body);
  } catch (error) {
    console.error("collector proxy failed", error);
    return res.status(502).json({ message: "Data service is temporarily unavailable" });
  }
}

// P1 访问控制：数据接口必须已登录（type === "user"），游客/未登录直接 401。
// 修复此前"登录系统形同虚设"的漏洞——数据代理注册在登录校验之前、且不校验 session。
async function requireUser(req, res, next) {
  const session = await sessionManager.readSession(req);
  if (!session || session.type !== "user") {
    return res.status(401).json({ message: "请先登录后再访问数据" });
  }
  next();
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/businesses", requireUser, (_req, res) => proxy(`${collectorApi}/businesses`, res));
app.get("/api/network/:business", (req, res) => proxy(`${collectorApi}/network/${encodeURIComponent(req.params.business)}`, res));
app.get("/api/nodes", (req, res) => {
  const { business_name, name } = req.query;
  if (!business_name || !name) return res.status(400).json({ message: "business_name and name are required" });
  return proxy(`${collectorApi}/nodes?${new URLSearchParams({ business_name, name })}`, res);
});
app.get("/api/nodes/semantic-search", (req, res) => {
  const { business_name, text } = req.query;
  if (!business_name || !text) return res.status(400).json({ message: "business_name and text are required" });
  const url = `${collectorApi}/nodes/semantic-search?${new URLSearchParams({ business_name, text })}`;
  return proxy(url, res, Math.max(collectorTimeoutMs, 300000));
});

app.use("/api/auth", createAuthRouter({ sessionManager }));
app.use("/api/admin", createAdminRouter({ sessionManager }));

await redis.connect();
await initSchema();
await ensureUltimateUser();
app.listen(port, () => console.log(`listening on ${port}`));
