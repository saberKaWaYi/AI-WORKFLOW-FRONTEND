import crypto from "node:crypto";
import cookie from "cookie";
import { parseStoredSystems } from "../db.js";
import { resolveAllowedSystems, ROLES } from "./roles.js";

export function createSessionManager({ redis, sessionSecret, sessionTtl, guestSessionTtl }) {
  const sign = (value) => crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
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
    const id = unpackSessionId(cookie.parse(req.headers.cookie || "").dc_session);
    if (!id) return null;
    const raw = await redis.get(sessionKey(id));
    return raw ? { id, ...JSON.parse(raw) } : null;
  }

  function buildUserPayload(user) {
    return {
      type: "user",
      userId: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      allowedSystems: resolveAllowedSystems(user.role, parseStoredSystems(user))
    };
  }

  function buildGuestPayload() {
    return {
      type: "guest",
      displayName: `Guest-${crypto.randomInt(1000, 9999)}`,
      role: ROLES.GUEST,
      allowedSystems: resolveAllowedSystems(ROLES.GUEST)
    };
  }

  function publicUser(session) {
    if (!session) return null;
    return {
      type: session.type,
      username: session.username ?? null,
      displayName: session.displayName,
      role: session.role,
      allowedSystems: session.allowedSystems
    };
  }

  async function writeSession(res, payload, ttl) {
    const id = crypto.randomBytes(32).toString("base64url");
    await redis.set(sessionKey(id), JSON.stringify({ ...payload, createdAt: new Date().toISOString() }), { EX: ttl });
    res.setHeader(
      "Set-Cookie",
      cookie.serialize("dc_session", `${id}.${sign(id)}`, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ttl
      })
    );
    return publicUser(payload);
  }

  async function destroySession(req, res) {
    const session = await readSession(req);
    if (session?.id) await redis.del(sessionKey(session.id));
    res.setHeader(
      "Set-Cookie",
      cookie.serialize("dc_session", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0
      })
    );
  }

  return { readSession, writeSession, destroySession, buildUserPayload, buildGuestPayload, publicUser };
}
