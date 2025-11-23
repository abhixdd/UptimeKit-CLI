import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { mkdirp } from 'mkdirp';
import { formatDistanceToNow } from 'date-fns';

const DB_DIR = path.join(os.homedir(), '.uptimekit');
const DB_PATH = path.join(DB_DIR, 'uptimekit.db');

let db;

export async function initDB() {
  if (!fs.existsSync(DB_DIR)) {
    await mkdirp(DB_DIR);
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS monitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      port INTEGER,
      interval INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS heartbeats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      latency INTEGER,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (monitor_id) REFERENCES monitors (id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_heartbeats_monitor_id ON heartbeats(monitor_id);
    CREATE INDEX IF NOT EXISTS idx_heartbeats_timestamp ON heartbeats(timestamp);
  `);

  // Migration: Ensure 'name' column exists
  try {
    const cols = db.prepare("PRAGMA table_info('monitors')").all();
    const hasName = cols.some(c => c.name === 'name');
    if (!hasName) {
      db.prepare('ALTER TABLE monitors ADD COLUMN name TEXT').run();
    }
  } catch (err) {
    console.error('Database migration error:', err);
  }

  // Prune old data on startup
  pruneOldHeartbeats();
}

export function getDB() {
  if (!db) {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function pruneOldHeartbeats() {
  try {
    const db = getDB();
    db.prepare("DELETE FROM heartbeats WHERE timestamp < datetime('now', '-30 days')").run();
  } catch (err) {
    console.error('Failed to prune old heartbeats:', err);
  }
}

export function resetDB() {
  const db = getDB();
  db.exec(`
    DROP TABLE IF EXISTS heartbeats;
    DROP TABLE IF EXISTS monitors;
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS monitors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      port INTEGER,
      interval INTEGER NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS heartbeats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      latency INTEGER,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (monitor_id) REFERENCES monitors (id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_heartbeats_monitor_id ON heartbeats(monitor_id);
    CREATE INDEX IF NOT EXISTS idx_heartbeats_timestamp ON heartbeats(timestamp);
  `);
}

export function addMonitor(type, url, interval, name = null) {
  const db = getDB();
  if (name) {
    const existing = db.prepare('SELECT id FROM monitors WHERE lower(name) = lower(?)').get(name);
    if (existing) {
      throw new Error(`Monitor with name '${name}' already exists.`);
    }
  }
  const stmt = db.prepare('INSERT INTO monitors (type, url, interval, name) VALUES (?, ?, ?, ?)');
  return stmt.run(type, url, interval, name);
}

export function getMonitors() {
  return getDB().prepare('SELECT * FROM monitors').all();
}

export function getMonitorByIdOrName(idOrName) {
  const db = getDB();
  const s = String(idOrName || '').trim();
  if (!s) return null;

  if (/^[0-9]+$/.test(s)) {
    const byId = db.prepare('SELECT * FROM monitors WHERE id = ?').get(Number(s));
    if (byId) return byId;
  }

  const byName = db.prepare('SELECT * FROM monitors WHERE lower(name) = lower(?)').get(s);
  if (byName) return byName;

  const byUrl = db.prepare('SELECT * FROM monitors WHERE lower(url) = lower(?)').get(s);
  if (byUrl) return byUrl;

  const likePattern = `%${s}%`;
  const fuzzy = db.prepare('SELECT * FROM monitors WHERE lower(name) LIKE lower(?) OR lower(url) LIKE lower(?) LIMIT 1').get(likePattern, likePattern);
  if (fuzzy) return fuzzy;

  const byHost = db.prepare('SELECT * FROM monitors WHERE lower(url) LIKE lower(?) LIMIT 1').get(`%${s}%`);
  return byHost || null;
}

export function getHeartbeatsForMonitor(monitorId, limit = 60) {
  return getDB().prepare('SELECT status, timestamp, latency FROM heartbeats WHERE monitor_id = ? ORDER BY timestamp DESC LIMIT ?').all(monitorId, limit);
}

export function logHeartbeat(monitorId, status, latency) {
  const stmt = getDB().prepare('INSERT INTO heartbeats (monitor_id, status, latency) VALUES (?, ?, ?)');
  return stmt.run(monitorId, status, latency);
}

export function getStats() {
  const db = getDB();

  // Single optimized query to get latest status and aggregate stats for all monitors
  const sql = `
    SELECT 
      m.*,
      COUNT(h.id) as total_checks,
      SUM(CASE WHEN h.status = 'up' THEN 1 ELSE 0 END) as success_checks,
      AVG(h.latency) as avg_latency,
      (SELECT status FROM heartbeats WHERE monitor_id = m.id ORDER BY timestamp DESC LIMIT 1) as current_status,
      (SELECT latency FROM heartbeats WHERE monitor_id = m.id ORDER BY timestamp DESC LIMIT 1) as current_latency,
      (SELECT timestamp FROM heartbeats WHERE monitor_id = m.id ORDER BY timestamp DESC LIMIT 1) as last_check_ts,
      (SELECT timestamp FROM heartbeats WHERE monitor_id = m.id AND status = 'down' ORDER BY timestamp DESC LIMIT 1) as last_down_ts
    FROM monitors m
    LEFT JOIN heartbeats h ON m.id = h.monitor_id
    GROUP BY m.id
  `;

  const rows = db.prepare(sql).all();

  return rows.map(row => {
    const uptime = row.total_checks > 0
      ? ((row.success_checks / row.total_checks) * 100).toFixed(2)
      : 0;

    // Helper to parse SQLite UTC string to Date object
    const parseDBTimestamp = (ts) => {
      if (!ts) return null;
      return new Date(ts.replace(' ', 'T') + 'Z');
    };

    const lastCheckTime = row.last_check_ts
      ? formatDistanceToNow(parseDBTimestamp(row.last_check_ts), { addSuffix: true })
      : 'Never';

    let lastDowntimeText = 'No downtime';
    if (row.last_down_ts) {
      lastDowntimeText = formatDistanceToNow(parseDBTimestamp(row.last_down_ts), { addSuffix: true });
    }

    // If currently down, try to calculate how long it's been down
    if (row.current_status === 'down' && row.last_down_ts) {

      lastDowntimeText = `Since ${formatDistanceToNow(parseDBTimestamp(row.last_down_ts), { addSuffix: true })}`;
    }

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      url: row.url,
      interval: row.interval,
      uptime: uptime,
      lastDowntime: lastDowntimeText,
      status: row.current_status || 'unknown',
      latency: Math.round(row.current_latency || 0),
      lastCheck: lastCheckTime
    };
  });
}
