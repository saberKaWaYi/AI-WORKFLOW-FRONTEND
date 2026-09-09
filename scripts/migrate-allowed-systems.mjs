/**
 * 迁移：为已有账号补齐新增的业务系统（image / voice）。
 *
 * 背景：早期 allowed_systems 存的是 ["data","text","video","admin"]，
 * 新增图片生成、语音生成两个业务系统后，库里的旧值缺少它们。
 * 运行时对 ultimate / super 会绕过存储值（resolveAllowedSystems），所以功能上无感；
 * 但一旦降级为普通用户，权限会以存储值为准，新系统就丢了，管理面板显示的也是存储值。
 * 故把具备全量权限角色的存储值对齐到当前 ALL_SYSTEMS。
 *
 * 幂等：重复执行不会重复写入，仅在值不一致时更新。
 *
 * 用法：
 *   node scripts/migrate-allowed-systems.mjs            # 执行
 *   node scripts/migrate-allowed-systems.mjs --dry-run  # 只看将要改什么
 */
import mysql from 'mysql2/promise';
import { ALL_SYSTEMS, ASSIGNABLE_SYSTEMS, ROLES } from '../src/auth/roles.js';

/** 拥有全量系统权限的角色：其存储值应始终等于 ALL_SYSTEMS。 */
const FULL_ACCESS_ROLES = [ROLES.ULTIMATE, ROLES.SUPER];

const DRY_RUN = process.argv.includes('--dry-run');
const TARGET_JSON = JSON.stringify(ALL_SYSTEMS);

function readDbConfig() {
  const url = process.env.MYSQL_URL;
  if (!url) throw new Error('缺少环境变量 MYSQL_URL');
  const match = url.match(/^mysql:\/\/([^:]+):([^@]+)@([^:]+):([0-9]+)\/([^?]+)/);
  if (!match) throw new Error('MYSQL_URL 格式不正确');
  return { user: match[1], password: match[2], host: match[3], port: Number(match[4]), database: match[5] };
}

const config = readDbConfig();
const conn = await mysql.createConnection(config);

const [rows] = await conn.query(
  `SELECT id, username, role, allowed_systems, deleted_at FROM users WHERE role IN (?, ?) ORDER BY id`,
  FULL_ACCESS_ROLES
);

const stored = (row) => {
  const value = row.allowed_systems;
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(JSON.parse(value));
  return JSON.stringify([]);
};

const pending = rows.filter((row) => stored(row) !== TARGET_JSON);

console.log(`目标值: ${TARGET_JSON}`);
console.log(`可分配业务系统: ${JSON.stringify(ASSIGNABLE_SYSTEMS)}`);
console.log(`\n全量权限角色 ${FULL_ACCESS_ROLES.join(' / ')} 共 ${rows.length} 个账号，其中需要更新 ${pending.length} 个\n`);

for (const row of rows) {
  const flag = stored(row) !== TARGET_JSON ? 'UPDATE' : '  ok  ';
  console.log(` [${flag}] #${String(row.id).padEnd(4)} ${String(row.username).padEnd(28)} ${row.role.padEnd(9)} ${stored(row)}`);
}

if (DRY_RUN) {
  console.log('\n[dry-run] 未做任何修改。');
  await conn.end();
  process.exit(0);
}

if (!pending.length) {
  console.log('\n无需更新。');
  await conn.end();
  process.exit(0);
}

const [result] = await conn.query(
  `UPDATE users SET allowed_systems = ? WHERE role IN (?, ?)`,
  [TARGET_JSON, ...FULL_ACCESS_ROLES]
);
console.log(`\n已更新 ${result.affectedRows} 行。`);

const [after] = await conn.query(
  `SELECT id, username, role, allowed_systems FROM users WHERE role IN (?, ?) ORDER BY id`,
  FULL_ACCESS_ROLES
);
console.log('\n=== 更新后 ===');
for (const row of after) {
  console.log(` #${String(row.id).padEnd(4)} ${String(row.username).padEnd(28)} ${row.role.padEnd(9)} ${stored(row)}`);
}

await conn.end();
