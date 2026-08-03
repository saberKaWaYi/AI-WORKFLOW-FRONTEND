import mysql from "mysql2/promise";
import { ROLES, normalizeSystemsForRole, resolveAllowedSystems } from "./auth/roles.js";

let pool;

const ACTIVE_USER_SQL = "deleted_at IS NULL";

function parseDatabaseUrl(url) {
  const match = url.match(/^mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
  if (!match) throw new Error("Invalid MYSQL_URL format");
  return { user: match[1], password: match[2], host: match[3], port: parseInt(match[4]), database: match[5] };
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") throw new Error("allowed_systems must be JSON array");
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("allowed_systems must be JSON array");
  return parsed;
}

export function parseStoredSystems(user) {
  if (!user) return [];
  return parseJsonArray(user.allowed_systems);
}

export function serializeUserRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    display_name: row.display_name,
    role: row.role,
    allowed_systems: resolveAllowedSystems(row.role, parseStoredSystems(row)),
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login_at: row.last_login_at,
    deleted_at: row.deleted_at
  };
}

export async function initSchema() {
  const config = parseDatabaseUrl(process.env.MYSQL_URL);
  const conn = await mysql.createConnection({ host: config.host, port: config.port, user: config.user, password: config.password });
  await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.end();

  pool = mysql.createPool(`${process.env.MYSQL_URL}?connectionLimit=10&charset=utf8mb4`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(64) NOT NULL UNIQUE,
      email VARCHAR(255) NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      display_name VARCHAR(80) NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'user',
      allowed_systems JSON NOT NULL DEFAULT ('["data"]'),
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      last_login_at TIMESTAMP NULL,
      deleted_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_users_username (username),
      INDEX idx_users_email (email),
      INDEX idx_users_role (role),
      INDEX idx_users_deleted_at (deleted_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function findUserByLogin(login) {
  const [rows] = await pool.execute(
    `SELECT * FROM users WHERE ${ACTIVE_USER_SQL} AND (username = ? OR email = ?) LIMIT 1`,
    [login, login]
  );
  return rows[0] || null;
}

export async function findUserByUsername(username) {
  const [rows] = await pool.execute(
    `SELECT * FROM users WHERE ${ACTIVE_USER_SQL} AND username = ? LIMIT 1`,
    [username]
  );
  return rows[0] || null;
}

export async function findUserByEmail(email) {
  if (!email) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM users WHERE ${ACTIVE_USER_SQL} AND email = ? LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

export async function findUserByRole(role) {
  const [rows] = await pool.execute(
    `SELECT * FROM users WHERE ${ACTIVE_USER_SQL} AND role = ? ORDER BY id ASC LIMIT 1`,
    [role]
  );
  return rows[0] || null;
}

export async function findUserById(id) {
  const [rows] = await pool.execute(
    `SELECT * FROM users WHERE ${ACTIVE_USER_SQL} AND id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function listUsers() {
  const [rows] = await pool.execute(
    `SELECT id, username, email, display_name, role, allowed_systems, is_active, created_at, updated_at, last_login_at
     FROM users WHERE ${ACTIVE_USER_SQL} ORDER BY id ASC`
  );
  return rows.map(serializeUserRow);
}

export async function createUser({ username, email, passwordHash, displayName, role = ROLES.USER, allowedSystems = ["data"] }) {
  const systemsJson = JSON.stringify(normalizeSystemsForRole(role, allowedSystems));
  const [result] = await pool.execute(
    "INSERT INTO users (username, email, password_hash, display_name, role, allowed_systems) VALUES (?, ?, ?, ?, ?, ?)",
    [username, email || null, passwordHash, displayName, role, systemsJson]
  );
  return findUserById(result.insertId);
}

export async function updateUser(id, { username, role, allowedSystems, isActive, displayName, email }) {
  const fields = [];
  const values = [];

  if (username !== undefined) { fields.push("username = ?"); values.push(username); }
  if (role !== undefined) { fields.push("role = ?"); values.push(role); }
  if (allowedSystems !== undefined) { fields.push("allowed_systems = ?"); values.push(JSON.stringify(allowedSystems)); }
  if (isActive !== undefined) { fields.push("is_active = ?"); values.push(isActive ? 1 : 0); }
  if (displayName !== undefined) { fields.push("display_name = ?"); values.push(displayName); }
  if (email !== undefined) { fields.push("email = ?"); values.push(email || null); }

  if (!fields.length) return findUserById(id);

  values.push(id);
  await pool.execute(`UPDATE users SET ${fields.join(", ")} WHERE id = ? AND ${ACTIVE_USER_SQL}`, values);
  return findUserById(id);
}

export async function touchLastLogin(userId) {
  await pool.execute(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ? AND ${ACTIVE_USER_SQL}`, [userId]);
}

export async function softDeleteUser(id) {
  const [result] = await pool.execute(
    `UPDATE users SET
      deleted_at = CURRENT_TIMESTAMP,
      is_active = 0,
      username = CONCAT(username, '#deleted#', id),
      email = CASE WHEN email IS NULL THEN NULL ELSE CONCAT(email, '#deleted#', id) END
     WHERE id = ? AND ${ACTIVE_USER_SQL}`,
    [id]
  );
  return result.affectedRows > 0;
}
