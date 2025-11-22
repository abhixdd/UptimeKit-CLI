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
      FOREIGN KEY (monitor_id) REFERENCES monitors (id)
    );
  `);

  // just in case if anyone is running on older verison
  try {
    const cols = db.prepare("PRAGMA table_info('monitors')").all();
    const hasName = cols.some(c => c.name === 'name');
    if (!hasName) {
      db.prepare('ALTER TABLE monitors ADD COLUMN name TEXT').run();
    }
  } catch (err) {
    // meh, probably fine
  }
}

export function getDB() {
  if (!db) {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    db = new Database(DB_PATH);
  }
  return db;
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
  const monitors = getMonitors();
  const stats = monitors.map(monitor => {
    const heartbeats = getDB().prepare('SELECT status, timestamp, latency FROM heartbeats WHERE monitor_id = ? ORDER BY timestamp DESC').all(monitor.id);

    const totalChecks = heartbeats.length;
    const successChecks = heartbeats.filter(h => h.status === 'up').length;
    const uptime = totalChecks > 0 ? ((successChecks / totalChecks) * 100).toFixed(2) : 0;

    // sqlite dates are weird, gotta fix the format
    const parseDBTimestamp = (ts) => {
      if (!ts) return null;
      return new Date(ts.replace(' ', 'T') + 'Z');
    };

    const lastHeartbeat = heartbeats[0];
    const currentStatus = lastHeartbeat ? lastHeartbeat.status : 'unknown';
    const currentLatency = lastHeartbeat ? lastHeartbeat.latency : 0;
    const lastCheckTime = lastHeartbeat ? formatDistanceToNow(parseDBTimestamp(lastHeartbeat.timestamp), { addSuffix: true }) : 'Never';

    let lastDowntimeText = 'No downtime';

    if (heartbeats.length > 0) {
      if (currentStatus === 'down') {
        let startTimestamp = null;
        for (let i = 0; i < heartbeats.length; i++) {
          const h = heartbeats[i];
          const next = heartbeats[i + 1];
          if (h.status === 'down' && (!next || next.status === 'up')) {
            startTimestamp = h.timestamp;
            break;
          }
        }
        if (!startTimestamp && lastHeartbeat) startTimestamp = lastHeartbeat.timestamp;
        if (startTimestamp) {
          lastDowntimeText = `Down for ${formatDistanceToNow(parseDBTimestamp(startTimestamp), { addSuffix: false })}`;
        }
      } else {
        const lastDown = heartbeats.find(h => h.status === 'down');
        if (lastDown) {
          lastDowntimeText = formatDistanceToNow(parseDBTimestamp(lastDown.timestamp), { addSuffix: true });
        }
      }
    }

    return {
      ...monitor,
      uptime: uptime,
      lastDowntime: lastDowntimeText,
      status: currentStatus,
      latency: currentLatency,
      lastCheck: lastCheckTime
    };
  });

  return stats;
}
