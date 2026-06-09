import mysql from "mysql2/promise";

let pool;

function parseDatabaseUrl(url) {
  const match = url.match(/^mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/);
  if (!match) throw new Error("Invalid MYSQL_URL format");
  return { user: match[1], password: match[2], host: match[3], port: parseInt(match[4]), database: match[5] };
}

export async function initSchema() {
  if (!process.env.MYSQL_URL) throw new Error("MYSQL_URL is required");
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
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      last_login_at TIMESTAMP NULL,
      INDEX idx_users_username (username),
      INDEX idx_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function findUserByLogin(login) {
  const [rows] = await pool.execute("SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1", [login, login]);
  return rows[0] || null;
}

export async function createUser({ username, email, passwordHash, displayName }) {
  const [result] = await pool.execute("INSERT INTO users (username, email, password_hash, display_name) VALUES (?, ?, ?, ?)", [username, email || null, passwordHash, displayName]);
  const [rows] = await pool.execute("SELECT id, username, email, display_name, role, created_at FROM users WHERE id = ?", [result.insertId]);
  return rows[0];
}

export async function touchLastLogin(userId) {
  await pool.execute("UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?", [userId]);
}
