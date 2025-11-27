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
      webhook_url TEXT,
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

    // Migration: Ensure 'webhook_url' column exists
    const hasWebhook = cols.some(c => c.name === 'webhook_url');
    if (!hasWebhook) {
      db.prepare('ALTER TABLE monitors ADD COLUMN webhook_url TEXT').run();
    }
  } catch (err) {
    console.error('Database migration error:', err);
  }

  // Migration: Ensure 'settings' table exists
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Set default notification setting (enabled by default)
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('notifications_enabled', '1')").run();
  } catch (err) {
    console.error('Settings table migration error:', err);
  }

  // Migration: Ensure 'ssl_certificates' table exists
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS ssl_certificates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        monitor_id INTEGER NOT NULL UNIQUE,
        issuer TEXT,
        subject TEXT,
        valid_from TEXT,
        valid_to TEXT,
        days_remaining INTEGER,
        serial_number TEXT,
        fingerprint TEXT,
        last_checked TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (monitor_id) REFERENCES monitors (id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ssl_certificates_monitor_id ON ssl_certificates(monitor_id);
    `);
  } catch (err) {
    console.error('SSL certificates table migration error:', err);
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
    DROP TABLE IF EXISTS ssl_certificates;
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
      webhook_url TEXT,
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

    CREATE TABLE IF NOT EXISTS ssl_certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      monitor_id INTEGER NOT NULL UNIQUE,
      issuer TEXT,
      subject TEXT,
      valid_from TEXT,
      valid_to TEXT,
      days_remaining INTEGER,
      serial_number TEXT,
      fingerprint TEXT,
      last_checked TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (monitor_id) REFERENCES monitors (id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_heartbeats_monitor_id ON heartbeats(monitor_id);
    CREATE INDEX IF NOT EXISTS idx_heartbeats_timestamp ON heartbeats(timestamp);
    CREATE INDEX IF NOT EXISTS idx_ssl_certificates_monitor_id ON ssl_certificates(monitor_id);
  `);
}

export function addMonitor(type, url, interval, name = null, webhookUrl = null) {
  const db = getDB();
  if (name) {
    const existing = db.prepare('SELECT id FROM monitors WHERE lower(name) = lower(?)').get(name);
    if (existing) {
      throw new Error(`Monitor with name '${name}' already exists.`);
    }
  }
  const stmt = db.prepare('INSERT INTO monitors (type, url, interval, name, webhook_url) VALUES (?, ?, ?, ?, ?)');
  return stmt.run(type, url, interval, name, webhookUrl);
}

export function updateMonitor(id, updates) {
  const db = getDB();
  const { name, url, type, interval, webhook_url } = updates;

  if (name) {
    const existing = db.prepare('SELECT id FROM monitors WHERE lower(name) = lower(?) AND id != ?').get(name, id);
    if (existing) {
      throw new Error(`Monitor with name '${name}' already exists.`);
    }
  }

  const fields = [];
  const values = [];

  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (url !== undefined) { fields.push('url = ?'); values.push(url); }
  if (type !== undefined) { fields.push('type = ?'); values.push(type); }
  if (interval !== undefined) { fields.push('interval = ?'); values.push(interval); }
  if (webhook_url !== undefined) { fields.push('webhook_url = ?'); values.push(webhook_url); }

  if (fields.length === 0) return;

  values.push(id);
  const sql = `UPDATE monitors SET ${fields.join(', ')} WHERE id = ?`;
  return db.prepare(sql).run(...values);
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
      (SELECT timestamp FROM heartbeats WHERE monitor_id = m.id AND status = 'down' ORDER BY timestamp DESC LIMIT 1) as last_down_ts,
      ssl.issuer as ssl_issuer,
      ssl.subject as ssl_subject,
      ssl.valid_from as ssl_valid_from,
      ssl.valid_to as ssl_valid_to,
      ssl.days_remaining as ssl_days_remaining,
      ssl.serial_number as ssl_serial_number,
      ssl.fingerprint as ssl_fingerprint,
      ssl.last_checked as ssl_last_checked
    FROM monitors m
    LEFT JOIN heartbeats h ON m.id = h.monitor_id
    LEFT JOIN ssl_certificates ssl ON m.id = ssl.monitor_id
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

    // Build SSL info for SSL monitors
    let sslInfo = null;
    if (row.type === 'ssl') {
      sslInfo = {
        issuer: row.ssl_issuer,
        subject: row.ssl_subject,
        validFrom: row.ssl_valid_from,
        validTo: row.ssl_valid_to,
        daysRemaining: row.ssl_days_remaining,
        serialNumber: row.ssl_serial_number,
        fingerprint: row.ssl_fingerprint,
        lastChecked: row.ssl_last_checked
      };
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
      lastCheck: lastCheckTime,
      ssl: sslInfo
    };
  });
}

export function getNotificationSettings() {
  const db = getDB();
  try {
    const result = db.prepare("SELECT value FROM settings WHERE key = 'notifications_enabled'").get();
    return result ? result.value === '1' : true;
  } catch (err) {
    console.error('Failed to get notification settings:', err);
    return true;
  }
}

export function setNotificationSettings(enabled) {
  const db = getDB();
  try {
    const value = enabled ? '1' : '0';
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('notifications_enabled', ?)").run(value);
    return true;
  } catch (err) {
    console.error('Failed to set notification settings:', err);
    return false;
  }
}

// SSL Certificate functions
export function upsertSSLCertificate(monitorId, certData) {
  const db = getDB();
  const { issuer, subject, validFrom, validTo, daysRemaining, serialNumber, fingerprint } = certData;
  
  const stmt = db.prepare(`
    INSERT INTO ssl_certificates (monitor_id, issuer, subject, valid_from, valid_to, days_remaining, serial_number, fingerprint, last_checked)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(monitor_id) DO UPDATE SET
      issuer = excluded.issuer,
      subject = excluded.subject,
      valid_from = excluded.valid_from,
      valid_to = excluded.valid_to,
      days_remaining = excluded.days_remaining,
      serial_number = excluded.serial_number,
      fingerprint = excluded.fingerprint,
      last_checked = CURRENT_TIMESTAMP
  `);
  
  return stmt.run(monitorId, issuer, subject, validFrom, validTo, daysRemaining, serialNumber, fingerprint);
}

export function getSSLCertificate(monitorId) {
  const db = getDB();
  return db.prepare('SELECT * FROM ssl_certificates WHERE monitor_id = ?').get(monitorId);
}

export function getAllSSLCertificates() {
  const db = getDB();
  return db.prepare('SELECT * FROM ssl_certificates').all();
}
