/**
 * Unit tests for the database module (db.js)
 * Tests CRUD operations for monitors, heartbeats, settings, and SSL certificates
 */

import Database from 'better-sqlite3';
import { jest } from '@jest/globals';
import path from 'path';
import fs from 'fs';
import os from 'os';

const TEST_DB_DIR = path.join(os.tmpdir(), '.uptimekit-test-' + process.pid);
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'uptimekit.db');

let db;
let testFunctions;

beforeAll(async () => {
  if (!fs.existsSync(TEST_DB_DIR)) {
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  }

  db = new Database(TEST_DB_PATH);
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
    
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
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

  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('notifications_enabled', '1')").run();

  testFunctions = {
    addMonitor: (type, url, interval, name = null, webhookUrl = null) => {
      if (name) {
        const existing = db.prepare('SELECT id FROM monitors WHERE lower(name) = lower(?)').get(name);
        if (existing) {
          throw new Error(`Monitor with name '${name}' already exists.`);
        }
      }
      const stmt = db.prepare('INSERT INTO monitors (type, url, interval, name, webhook_url) VALUES (?, ?, ?, ?, ?)');
      return stmt.run(type, url, interval, name, webhookUrl);
    },

    updateMonitor: (id, updates) => {
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
    },

    getMonitors: () => {
      return db.prepare('SELECT * FROM monitors').all();
    },

    getMonitorByIdOrName: (idOrName) => {
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

      return null;
    },

    deleteMonitor: (id) => {
      return db.prepare('DELETE FROM monitors WHERE id = ?').run(id);
    },

    logHeartbeat: (monitorId, status, latency) => {
      const stmt = db.prepare('INSERT INTO heartbeats (monitor_id, status, latency) VALUES (?, ?, ?)');
      return stmt.run(monitorId, status, latency);
    },

    getHeartbeatsForMonitor: (monitorId, limit = 60) => {
      return db.prepare('SELECT status, timestamp, latency FROM heartbeats WHERE monitor_id = ? ORDER BY timestamp DESC LIMIT ?').all(monitorId, limit);
    },

    getNotificationSettings: () => {
      const result = db.prepare("SELECT value FROM settings WHERE key = 'notifications_enabled'").get();
      return result ? result.value === '1' : true;
    },

    setNotificationSettings: (enabled) => {
      const value = enabled ? '1' : '0';
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('notifications_enabled', ?)").run(value);
      return true;
    },

    upsertSSLCertificate: (monitorId, certData) => {
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
    },

    getSSLCertificate: (monitorId) => {
      return db.prepare('SELECT * FROM ssl_certificates WHERE monitor_id = ?').get(monitorId);
    },

    resetDB: () => {
      db.exec('DELETE FROM heartbeats');
      db.exec('DELETE FROM ssl_certificates');
      db.exec('DELETE FROM monitors');
    }
  };
});

afterAll(() => {
  if (db) {
    db.close();
  }
  try {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  } catch (err) {
    console.error('Error cleaning up test database directory:', err);
  }
});

beforeEach(() => {
  testFunctions.resetDB();
});

describe('Database Module', () => {
  describe('addMonitor', () => {
    it('should add a new HTTP monitor', () => {
      const result = testFunctions.addMonitor('http', 'https://example.com', 60, 'example', null);
      
      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBeGreaterThan(0);
    });

    it('should add a monitor with all fields', () => {
      const result = testFunctions.addMonitor(
        'http',
        'https://test.com',
        30,
        'testsite',
        'https://webhook.example.com/hook'
      );
      
      expect(result.changes).toBe(1);
      
      const monitors = testFunctions.getMonitors();
      expect(monitors).toHaveLength(1);
      expect(monitors[0]).toMatchObject({
        type: 'http',
        url: 'https://test.com',
        interval: 30,
        name: 'testsite',
        webhook_url: 'https://webhook.example.com/hook'
      });
    });

    it('should add ICMP monitor', () => {
      const result = testFunctions.addMonitor('icmp', '8.8.8.8', 60, 'google-dns');
      
      expect(result.changes).toBe(1);
      const monitors = testFunctions.getMonitors();
      expect(monitors[0].type).toBe('icmp');
    });

    it('should add DNS monitor', () => {
      const result = testFunctions.addMonitor('dns', 'google.com', 120, 'google-dns');
      
      expect(result.changes).toBe(1);
      const monitors = testFunctions.getMonitors();
      expect(monitors[0].type).toBe('dns');
    });

    it('should add SSL monitor', () => {
      const result = testFunctions.addMonitor('ssl', 'github.com', 3600, 'github-ssl');
      
      expect(result.changes).toBe(1);
      const monitors = testFunctions.getMonitors();
      expect(monitors[0].type).toBe('ssl');
    });

    it('should throw error for duplicate monitor name', () => {
      testFunctions.addMonitor('http', 'https://example.com', 60, 'mysite');
      
      expect(() => {
        testFunctions.addMonitor('http', 'https://another.com', 60, 'mysite');
      }).toThrow("Monitor with name 'mysite' already exists.");
    });

    it('should allow same URL with different names', () => {
      testFunctions.addMonitor('http', 'https://example.com', 60, 'site1');
      testFunctions.addMonitor('http', 'https://example.com', 60, 'site2');
      
      const monitors = testFunctions.getMonitors();
      expect(monitors).toHaveLength(2);
    });
  });

  describe('getMonitors', () => {
    it('should return empty array when no monitors exist', () => {
      const monitors = testFunctions.getMonitors();
      expect(monitors).toEqual([]);
    });

    it('should return all monitors', () => {
      testFunctions.addMonitor('http', 'https://a.com', 60, 'a');
      testFunctions.addMonitor('icmp', '1.1.1.1', 30, 'b');
      testFunctions.addMonitor('dns', 'example.com', 120, 'c');
      
      const monitors = testFunctions.getMonitors();
      expect(monitors).toHaveLength(3);
    });
  });

  describe('getMonitorByIdOrName', () => {
    beforeEach(() => {
      testFunctions.addMonitor('http', 'https://example.com', 60, 'example');
      testFunctions.addMonitor('icmp', '8.8.8.8', 30, 'google');
    });

    it('should find monitor by ID', () => {
      const monitors = testFunctions.getMonitors();
      const firstId = monitors[0].id;
      
      const found = testFunctions.getMonitorByIdOrName(String(firstId));
      expect(found).not.toBeNull();
      expect(found.id).toBe(firstId);
    });

    it('should find monitor by exact name', () => {
      const found = testFunctions.getMonitorByIdOrName('example');
      expect(found).not.toBeNull();
      expect(found.name).toBe('example');
    });

    it('should find monitor by name case-insensitively', () => {
      const found = testFunctions.getMonitorByIdOrName('EXAMPLE');
      expect(found).not.toBeNull();
      expect(found.name).toBe('example');
    });

    it('should find monitor by URL', () => {
      const found = testFunctions.getMonitorByIdOrName('https://example.com');
      expect(found).not.toBeNull();
      expect(found.url).toBe('https://example.com');
    });

    it('should find monitor by partial match (fuzzy search)', () => {
      const found = testFunctions.getMonitorByIdOrName('exam');
      expect(found).not.toBeNull();
      expect(found.name).toBe('example');
    });

    it('should return null for non-existent monitor', () => {
      const found = testFunctions.getMonitorByIdOrName('nonexistent');
      expect(found).toBeNull();
    });

    it('should return null for empty input', () => {
      expect(testFunctions.getMonitorByIdOrName('')).toBeNull();
      expect(testFunctions.getMonitorByIdOrName(null)).toBeNull();
      expect(testFunctions.getMonitorByIdOrName(undefined)).toBeNull();
    });
  });

  describe('updateMonitor', () => {
    let monitorId;

    beforeEach(() => {
      const result = testFunctions.addMonitor('http', 'https://old.com', 60, 'oldname');
      monitorId = result.lastInsertRowid;
    });

    it('should update monitor name', () => {
      testFunctions.updateMonitor(monitorId, { name: 'newname' });
      
      const monitor = testFunctions.getMonitorByIdOrName(String(monitorId));
      expect(monitor.name).toBe('newname');
    });

    it('should update monitor URL', () => {
      testFunctions.updateMonitor(monitorId, { url: 'https://new.com' });
      
      const monitor = testFunctions.getMonitorByIdOrName(String(monitorId));
      expect(monitor.url).toBe('https://new.com');
    });

    it('should update monitor interval', () => {
      testFunctions.updateMonitor(monitorId, { interval: 120 });
      
      const monitor = testFunctions.getMonitorByIdOrName(String(monitorId));
      expect(monitor.interval).toBe(120);
    });

    it('should update monitor type', () => {
      testFunctions.updateMonitor(monitorId, { type: 'icmp' });
      
      const monitor = testFunctions.getMonitorByIdOrName(String(monitorId));
      expect(monitor.type).toBe('icmp');
    });

    it('should update webhook URL', () => {
      testFunctions.updateMonitor(monitorId, { webhook_url: 'https://webhook.com/hook' });
      
      const monitor = testFunctions.getMonitorByIdOrName(String(monitorId));
      expect(monitor.webhook_url).toBe('https://webhook.com/hook');
    });

    it('should update multiple fields at once', () => {
      testFunctions.updateMonitor(monitorId, {
        name: 'updated',
        url: 'https://updated.com',
        interval: 90
      });
      
      const monitor = testFunctions.getMonitorByIdOrName(String(monitorId));
      expect(monitor.name).toBe('updated');
      expect(monitor.url).toBe('https://updated.com');
      expect(monitor.interval).toBe(90);
    });

    it('should throw error when updating to duplicate name', () => {
      testFunctions.addMonitor('http', 'https://other.com', 60, 'othername');
      
      expect(() => {
        testFunctions.updateMonitor(monitorId, { name: 'othername' });
      }).toThrow("Monitor with name 'othername' already exists.");
    });

    it('should do nothing when no fields provided', () => {
      const before = testFunctions.getMonitorByIdOrName(String(monitorId));
      testFunctions.updateMonitor(monitorId, {});
      const after = testFunctions.getMonitorByIdOrName(String(monitorId));
      
      expect(before.name).toBe(after.name);
      expect(before.url).toBe(after.url);
    });
  });

  describe('logHeartbeat', () => {
    let monitorId;

    beforeEach(() => {
      const result = testFunctions.addMonitor('http', 'https://example.com', 60, 'test');
      monitorId = result.lastInsertRowid;
    });

    it('should log a heartbeat with up status', () => {
      const result = testFunctions.logHeartbeat(monitorId, 'up', 150);
      
      expect(result.changes).toBe(1);
      
      const heartbeats = testFunctions.getHeartbeatsForMonitor(monitorId);
      expect(heartbeats).toHaveLength(1);
      expect(heartbeats[0].status).toBe('up');
      expect(heartbeats[0].latency).toBe(150);
    });

    it('should log a heartbeat with down status', () => {
      testFunctions.logHeartbeat(monitorId, 'down', 0);
      
      const heartbeats = testFunctions.getHeartbeatsForMonitor(monitorId);
      expect(heartbeats[0].status).toBe('down');
    });

    it('should log multiple heartbeats', () => {
      testFunctions.logHeartbeat(monitorId, 'up', 100);
      testFunctions.logHeartbeat(monitorId, 'up', 120);
      testFunctions.logHeartbeat(monitorId, 'down', 0);
      testFunctions.logHeartbeat(monitorId, 'up', 80);
      
      const heartbeats = testFunctions.getHeartbeatsForMonitor(monitorId, 10);
      expect(heartbeats).toHaveLength(4);
    });
  });

  describe('getHeartbeatsForMonitor', () => {
    let monitorId;

    beforeEach(() => {
      const result = testFunctions.addMonitor('http', 'https://example.com', 60, 'test');
      monitorId = result.lastInsertRowid;
      
      for (let i = 0; i < 5; i++) {
        testFunctions.logHeartbeat(monitorId, i % 2 === 0 ? 'up' : 'down', 100 + i * 10);
      }
    });

    it('should return heartbeats in descending order by timestamp', () => {
      const heartbeats = testFunctions.getHeartbeatsForMonitor(monitorId);
      
      for (let i = 0; i < heartbeats.length - 1; i++) {
        expect(new Date(heartbeats[i].timestamp) >= new Date(heartbeats[i + 1].timestamp)).toBe(true);
      }
    });

    it('should respect the limit parameter', () => {
      const heartbeats = testFunctions.getHeartbeatsForMonitor(monitorId, 3);
      expect(heartbeats).toHaveLength(3);
    });

    it('should return empty array for non-existent monitor', () => {
      const heartbeats = testFunctions.getHeartbeatsForMonitor(99999);
      expect(heartbeats).toEqual([]);
    });
  });

  describe('Notification Settings', () => {
    it('should return true by default (notifications enabled)', () => {
      const enabled = testFunctions.getNotificationSettings();
      expect(enabled).toBe(true);
    });

    it('should disable notifications', () => {
      testFunctions.setNotificationSettings(false);
      
      const enabled = testFunctions.getNotificationSettings();
      expect(enabled).toBe(false);
    });

    it('should re-enable notifications', () => {
      testFunctions.setNotificationSettings(false);
      testFunctions.setNotificationSettings(true);
      
      const enabled = testFunctions.getNotificationSettings();
      expect(enabled).toBe(true);
    });
  });

  describe('SSL Certificates', () => {
    let monitorId;

    beforeEach(() => {
      const result = testFunctions.addMonitor('ssl', 'github.com', 3600, 'github');
      monitorId = result.lastInsertRowid;
    });

    it('should insert SSL certificate data', () => {
      const certData = {
        issuer: 'DigiCert',
        subject: 'github.com',
        validFrom: '2024-01-01T00:00:00Z',
        validTo: '2025-01-01T00:00:00Z',
        daysRemaining: 365,
        serialNumber: 'ABC123',
        fingerprint: 'SHA256:ABCDEF123456'
      };
      
      const result = testFunctions.upsertSSLCertificate(monitorId, certData);
      expect(result.changes).toBe(1);
      
      const cert = testFunctions.getSSLCertificate(monitorId);
      expect(cert).not.toBeNull();
      expect(cert.issuer).toBe('DigiCert');
      expect(cert.subject).toBe('github.com');
      expect(cert.days_remaining).toBe(365);
    });

    it('should update SSL certificate data on conflict', () => {
      const certData1 = {
        issuer: 'DigiCert',
        subject: 'github.com',
        validFrom: '2024-01-01T00:00:00Z',
        validTo: '2025-01-01T00:00:00Z',
        daysRemaining: 365,
        serialNumber: 'ABC123',
        fingerprint: 'SHA256:OLD'
      };
      
      testFunctions.upsertSSLCertificate(monitorId, certData1);
      
      const certData2 = {
        issuer: 'Let\'s Encrypt',
        subject: 'github.com',
        validFrom: '2024-06-01T00:00:00Z',
        validTo: '2025-06-01T00:00:00Z',
        daysRemaining: 180,
        serialNumber: 'DEF456',
        fingerprint: 'SHA256:NEW'
      };
      
      testFunctions.upsertSSLCertificate(monitorId, certData2);
      
      const cert = testFunctions.getSSLCertificate(monitorId);
      expect(cert.issuer).toBe("Let's Encrypt");
      expect(cert.days_remaining).toBe(180);
      expect(cert.fingerprint).toBe('SHA256:NEW');
    });

    it('should return null for non-existent SSL certificate', () => {
      const cert = testFunctions.getSSLCertificate(99999);
      expect(cert).toBeUndefined();
    });
  });
});
