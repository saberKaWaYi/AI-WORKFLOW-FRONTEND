import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import compression from "compression";
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
const textGenerateApi = (process.env.TEXT_GENERATE_API_URL || "http://localhost:8001/api").replace(/\/+$/, "");

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
// 响应 gzip 压缩：大纲正文、拓扑数据这类 JSON 体积能压掉七成以上
app.use(compression());
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public"), {
  extensions: ["html"],
  // no-cache：不带 max-age，浏览器每次拿 etag 回源验证，命中就 304 —— 改完代码刷新即生效，也不用整文件重下
  setHeaders(res, filePath) {
    if (filePath.endsWith(".js")) res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
  }
}));

async function proxy(url, res, options = {}) {
  const { timeoutMs = collectorTimeoutMs, method = "GET", body } = options;
  try {
    const headers = { Accept: "application/json" };
    // P1：向后端透传 API Key（调用方需配置 COLLECTOR_API_KEY 环境变量）
    const apiKey = process.env.COLLECTOR_API_KEY;
    if (apiKey) headers["X-API-Key"] = apiKey;
    if (body != null) headers["Content-Type"] = "application/json";
    const response = await fetch(url, {
      method,
      headers,
      body: body == null ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const payload = Buffer.from(await response.arrayBuffer());
    res.status(response.status);
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    return res.send(payload);
  } catch (error) {
    console.error("collector proxy failed", error);
    return res.status(502).json({ message: "Data service is temporarily unavailable" });
  }
}

// P1 访问控制：数据接口必须已登录（type === "user"），游客/未登录直接 401。
// 修复此前"登录系统形同虚设"的漏洞——数据代理注册在登录校验之前、且不校验 session。
// 会话读一次就挂在 req 上，后面的 handler 直接用 req.session，省掉每请求第二次 Redis 往返。
async function requireUser(req, res, next) {
  const session = await sessionManager.readSession(req);
  if (!session || session.type !== "user") {
    return res.status(401).json({ message: "请先登录后再访问数据" });
  }
  req.session = session;
  next();
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/businesses", requireUser, (_req, res) => proxy(`${collectorApi}/businesses`, res));
app.get("/api/network/:business", requireUser, (req, res) => proxy(`${collectorApi}/network/${encodeURIComponent(req.params.business)}`, res));
app.get("/api/nodes", requireUser, (req, res) => {
  const { business_name, name } = req.query;
  if (!business_name || !name) return res.status(400).json({ message: "business_name and name are required" });
  return proxy(`${collectorApi}/nodes?${new URLSearchParams({ business_name, name })}`, res);
});
// @ 引用：先用 /nodes/list 拿全量做初始下拉，用户输入后再走 /nodes/search 模糊过滤。
app.get("/api/nodes/list", requireUser, (req, res) => {
  const { business_name } = req.query;
  if (!business_name) return res.status(400).json({ message: "business_name is required" });
  return proxy(`${collectorApi}/nodes/list?${new URLSearchParams({ business_name })}`, res);
});
app.get("/api/nodes/search", requireUser, (req, res) => {
  const { business_name, keyword } = req.query;
  if (!business_name || !keyword) return res.status(400).json({ message: "business_name and keyword are required" });
  return proxy(`${collectorApi}/nodes/search?${new URLSearchParams({ business_name, keyword })}`, res);
});
app.get("/api/nodes/semantic-search", requireUser, (req, res) => {
  const { business_name, text } = req.query;
  if (!business_name || !text) return res.status(400).json({ message: "business_name and text are required" });
  const url = `${collectorApi}/nodes/semantic-search?${new URLSearchParams({ business_name, text })}`;
  return proxy(url, res, { timeoutMs: Math.max(collectorTimeoutMs, 300000) });
});

// 剧情表：独立于节点表的第二张 mongo 表（业务需在 profile 里声明 storyModule）。
// 列表可带 ?character= 按角色中文名过滤；详情按 story key 取整篇（含 lines）。
app.get("/api/stories/:business", requireUser, (req, res) => {
  const { character } = req.query;
  const query = character ? `?${new URLSearchParams({ character: String(character) })}` : "";
  return proxy(`${collectorApi}/stories/${encodeURIComponent(req.params.business)}${query}`, res);
});
app.get("/api/stories/:business/detail", requireUser, (req, res) => {
  const { key } = req.query;
  if (!key) return res.status(400).json({ message: "key is required" });
  const query = new URLSearchParams({ key: String(key) });
  return proxy(`${collectorApi}/stories/${encodeURIComponent(req.params.business)}/detail?${query}`, res);
});

// 语义搜索已改为异步：上面的接口只领任务号，结果凭它到这里轮询。
app.get("/api/tasks/:messageId", requireUser, (req, res) => {
  const { messageId } = req.params;
  if (!messageId) return res.status(400).json({ message: "messageId is required" });
  return proxy(`${collectorApi}/tasks/${encodeURIComponent(messageId)}`, res);
});

// 文本系统作者模式：厂商 / 模型下拉框。
// 数据由 TEXT-GENERATE 提供（它连 MySQL 读该用户的 model_providers、从自身配置读模型），
// 本服务只按会话身份转发，不查询数据库。
app.get("/api/text/providers", requireUser, (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ message: "请先登录后再访问数据" });
  return proxy(`${textGenerateApi}/providers?${new URLSearchParams({ user_id: String(userId) })}`, res);
});
app.get("/api/text/models", requireUser, (req, res) => {
  const { provider } = req.query;
  if (!provider) return res.status(400).json({ message: "provider is required" });
  return proxy(`${textGenerateApi}/models?${new URLSearchParams({ provider: String(provider) })}`, res);
});

// 提交一次生成。user_id 由会话注入、前端不传，避免替别人提交任务。
// 生成是异步的（worker 消费子表），这里只返回 task_id，结果靠下面的查询接口轮询。
app.post("/api/text/tasks", requireUser, (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ message: "请先登录后再访问数据" });

  const { provider, model, gen_mode, draft_text, novel_id } = req.body || {};
  if (!provider || !model || !gen_mode || !draft_text) {
    return res.status(400).json({ message: "provider, model, gen_mode and draft_text are required" });
  }

  // novel_id 可选：带上 = 在已有小说上修订大纲；不传 = 新建小说
  return proxy(`${textGenerateApi}/text/tasks`, res, {
    method: "POST",
    body: { user_id: userId, provider, model, gen_mode, draft_text, novel_id: novel_id ?? null }
  });
});

// 查询任务：user_id 由会话注入。TEXT-GENERATE 只返回本人的任务，
// 别人的任务号会得到 404，与"任务不存在"不作区分。
app.get("/api/text/tasks/:taskId", requireUser, (req, res) => {
  const userId = req.session?.userId;
  if (!userId) return res.status(401).json({ message: "请先登录后再访问数据" });

  const { taskId } = req.params;
  if (!taskId) return res.status(400).json({ message: "taskId is required" });
  const query = new URLSearchParams({ user_id: String(userId) });
  return proxy(`${textGenerateApi}/text/tasks/${encodeURIComponent(taskId)}?${query}`, res);
});

// 小说模块（书架）：五个接口全部由会话注入 user_id，前端不传，防越权。
// requireUser 已把会话挂在 req.session 上，这里不再重复读 Redis。
function novelSession(req, res) {
  const userId = req.session?.userId;
  if (!userId) {
    res.status(401).json({ message: "请先登录后再访问数据" });
    return null;
  }
  return userId;
}

app.get("/api/text/novels", requireUser, async (req, res) => {
  const userId = novelSession(req, res);
  if (!userId) return;

  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(req.query.page_size) || 10));
  const query = new URLSearchParams({
    user_id: String(userId),
    page: String(page),
    page_size: String(pageSize)
  });
  return proxy(`${textGenerateApi}/text/novels?${query}`, res);
});

app.get("/api/text/novels/:novelId", requireUser, async (req, res) => {
  const userId = novelSession(req, res);
  if (!userId) return;

  const query = new URLSearchParams({ user_id: String(userId) });
  return proxy(`${textGenerateApi}/text/novels/${encodeURIComponent(req.params.novelId)}?${query}`, res);
});

// 完全重新生成：用原草稿与引用从零重跑，成功后覆盖这本小说的大纲。
// 返回任务号，前端照旧走 /api/text/tasks/:taskId 轮询。
app.post("/api/text/novels/:novelId/regenerate", requireUser, async (req, res) => {
  const userId = novelSession(req, res);
  if (!userId) return;

  const query = new URLSearchParams({ user_id: String(userId) });
  return proxy(`${textGenerateApi}/text/novels/${encodeURIComponent(req.params.novelId)}/regenerate?${query}`, res, {
    method: "POST"
  });
});

app.delete("/api/text/novels/:novelId", requireUser, async (req, res) => {
  const userId = novelSession(req, res);
  if (!userId) return;

  const query = new URLSearchParams({ user_id: String(userId) });
  return proxy(`${textGenerateApi}/text/novels/${encodeURIComponent(req.params.novelId)}?${query}`, res, { method: "DELETE" });
});

// TEXT-GENERATE 侧只有一个 PATCH /text/novels/{id}（title、outline_text 都可以改），
// 这里保留「改名 / 改内容」两个前端路由，内部都收敛成同一个 PATCH。
app.put("/api/text/novels/:novelId/title", requireUser, async (req, res) => {
  const userId = novelSession(req, res);
  if (!userId) return;

  const { title } = req.body || {};
  if (!title || !String(title).trim()) return res.status(400).json({ message: "title is required" });
  const query = new URLSearchParams({ user_id: String(userId) });
  return proxy(`${textGenerateApi}/text/novels/${encodeURIComponent(req.params.novelId)}?${query}`, res, {
    method: "PATCH",
    body: { title: String(title).trim() }
  });
});

app.put("/api/text/novels/:novelId/outline", requireUser, async (req, res) => {
  const userId = novelSession(req, res);
  if (!userId) return;

  const { outline_text } = req.body || {};
  if (!outline_text || !String(outline_text).trim()) return res.status(400).json({ message: "outline_text is required" });
  const query = new URLSearchParams({ user_id: String(userId) });
  return proxy(`${textGenerateApi}/text/novels/${encodeURIComponent(req.params.novelId)}?${query}`, res, {
    method: "PATCH",
    body: { outline_text: String(outline_text) }
  });
});

app.use("/api/auth", createAuthRouter({ sessionManager }));
app.use("/api/admin", createAdminRouter({ sessionManager }));

await redis.connect();
await initSchema();
await ensureUltimateUser();
app.listen(port, () => console.log(`listening on ${port}`));
