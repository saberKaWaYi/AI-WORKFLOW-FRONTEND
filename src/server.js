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
const collectorApi = process.env.COLLECTOR_API_URL || "http://localhost:8000/api";

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

async function proxy(url, res) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const body = await response.text();
  res.status(response.status);
  res.setHeader("Content-Type", response.headers.get("content-type") || "application/json; charset=utf-8");
  res.send(body);
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/businesses", (_req, res) => proxy(`${collectorApi}/businesses`, res));
app.get("/api/network/:business", (req, res) => proxy(`${collectorApi}/network/${req.params.business}`, res));
app.get("/api/nodes", (req, res) => {
  const { business_name, name } = req.query;
  if (!business_name || !name) return res.status(400).json({ message: "business_name and name are required" });
  return proxy(`${collectorApi}/nodes?${new URLSearchParams({ business_name, name })}`, res);
});

app.use("/api/auth", createAuthRouter({ sessionManager }));
app.use("/api/admin", createAdminRouter({ sessionManager }));

await redis.connect();
await initSchema();
await ensureUltimateUser();
app.listen(port, () => console.log(`listening on ${port}`));
