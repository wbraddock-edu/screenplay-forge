import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@shared/schema";
import path from "path";
import fs from "fs";

const dataDir = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.DATA_DIR || ".";
try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}
const dbPath = path.join(dataDir, "data.db");
console.log(`Database path: ${dbPath}`);
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

// ── Create Tables (Screenplay Forge) ──

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS auth_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_key TEXT NOT NULL UNIQUE,
    user_id INTEGER,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    state_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS support_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_email TEXT NOT NULL,
    category TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    error_context TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    priority TEXT NOT NULL DEFAULT 'normal',
    created_at TEXT NOT NULL
  )
`);

// ── Subscription column migrations ──
const userColumns = sqlite.pragma("table_info(users)") as any[];
const colNames = new Set(userColumns.map((c: any) => c.name));

const newCols: [string, string][] = [
  ["trial_started_at", "TEXT"],
  ["subscription_status", "TEXT"],
  ["stripe_customer_id", "TEXT"],
  ["stripe_subscription_id", "TEXT"],
  ["subscription_plan", "TEXT"],
  ["subscription_expires_at", "TEXT"],
  ["role", "TEXT DEFAULT 'user'"],
  ["api_provider", "TEXT"],
  ["api_key", "TEXT"],
];

for (const [col, type] of newCols) {
  if (!colNames.has(col)) {
    try { sqlite.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`); } catch {}
  }
}

// ── Admin role setup ──
const ADMIN_EMAIL = "designholistically@gmail.com";
try {
  sqlite.prepare(`UPDATE users SET role = 'admin' WHERE email = ? AND (role IS NULL OR role != 'admin')`).run(ADMIN_EMAIL);
} catch {}

export const db = drizzle(sqlite, { schema });
export { sqlite };
