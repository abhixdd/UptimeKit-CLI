/**
 * Unit tests for the group functionality in the database module (db.js)
 * Tests CRUD operations for monitor groups
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';

const TEST_DB_DIR = path.join(os.tmpdir(), '.uptimekit-group-test-' + process.pid);
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
      group_name TEXT,
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
    CREATE INDEX IF NOT EXISTS idx_monitors_group_name ON monitors(group_name);
  `);

  testFunctions = {
    addMonitor: (type, url, interval, name = null, webhookUrl = null, groupName = null) => {
      if (name) {
        const existing = db.prepare('SELECT id FROM monitors WHERE lower(name) = lower(?)').get(name);
        if (existing) {
          throw new Error(`Monitor with name '${name}' already exists.`);
        }
      }
      const stmt = db.prepare('INSERT INTO monitors (type, url, interval, name, webhook_url, group_name) VALUES (?, ?, ?, ?, ?, ?)');
      return stmt.run(type, url, interval, name, webhookUrl, groupName);
    },

    updateMonitor: (id, updates) => {
      const { name, url, type, interval, webhook_url, group_name } = updates;

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
      if (group_name !== undefined) { fields.push('group_name = ?'); values.push(group_name); }

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

      return null;
    },

    deleteMonitor: (id) => {
      db.prepare('DELETE FROM heartbeats WHERE monitor_id = ?').run(id);
      db.prepare('DELETE FROM ssl_certificates WHERE monitor_id = ?').run(id);
      return db.prepare('DELETE FROM monitors WHERE id = ?').run(id);
    },

    logHeartbeat: (monitorId, status, latency) => {
      const stmt = db.prepare('INSERT INTO heartbeats (monitor_id, status, latency) VALUES (?, ?, ?)');
      return stmt.run(monitorId, status, latency);
    },

    // Group management functions
    getGroups: () => {
      return db.prepare(`
        SELECT group_name, COUNT(*) as count 
        FROM monitors 
        WHERE group_name IS NOT NULL AND group_name != '' 
        GROUP BY group_name 
        ORDER BY group_name
      `).all();
    },

    groupExists: (groupName) => {
      const result = db.prepare('SELECT 1 FROM monitors WHERE lower(group_name) = lower(?) LIMIT 1').get(groupName);
      return !!result;
    },

    renameGroup: (oldName, newName) => {
      if (!testFunctions.groupExists(oldName)) {
        throw new Error(`Group '${oldName}' does not exist.`);
      }
      
      const existingNew = db.prepare('SELECT 1 FROM monitors WHERE lower(group_name) = lower(?) AND lower(group_name) != lower(?) LIMIT 1').get(newName, oldName);
      if (existingNew) {
        throw new Error(`Group '${newName}' already exists.`);
      }
      
      const stmt = db.prepare('UPDATE monitors SET group_name = ? WHERE lower(group_name) = lower(?)');
      return stmt.run(newName, oldName);
    },

    deleteGroup: (groupName, deleteMonitors = false) => {
      if (!testFunctions.groupExists(groupName)) {
        throw new Error(`Group '${groupName}' does not exist.`);
      }
      
      if (deleteMonitors) {
        db.prepare(`
          DELETE FROM heartbeats 
          WHERE monitor_id IN (SELECT id FROM monitors WHERE lower(group_name) = lower(?))
        `).run(groupName);
        
        db.prepare(`
          DELETE FROM ssl_certificates 
          WHERE monitor_id IN (SELECT id FROM monitors WHERE lower(group_name) = lower(?))
        `).run(groupName);
        
        return db.prepare('DELETE FROM monitors WHERE lower(group_name) = lower(?)').run(groupName);
      } else {
        return db.prepare('UPDATE monitors SET group_name = NULL WHERE lower(group_name) = lower(?)').run(groupName);
      }
    },

    getMonitorsByGroup: (groupName) => {
      if (groupName === null || groupName === 'ungrouped') {
        return db.prepare("SELECT * FROM monitors WHERE group_name IS NULL OR group_name = ''").all();
      }
      return db.prepare('SELECT * FROM monitors WHERE lower(group_name) = lower(?)').all(groupName);
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

describe('Group Management', () => {
  describe('addMonitor with group', () => {
    it('should add a monitor with a group', () => {
      const result = testFunctions.addMonitor('http', 'https://dev.example.com', 60, 'dev-api', null, 'dev');
      
      expect(result.changes).toBe(1);
      
      const monitors = testFunctions.getMonitors();
      expect(monitors).toHaveLength(1);
      expect(monitors[0].group_name).toBe('dev');
    });

    it('should add a monitor without a group (null)', () => {
      const result = testFunctions.addMonitor('http', 'https://example.com', 60, 'ungrouped-api', null, null);
      
      expect(result.changes).toBe(1);
      
      const monitors = testFunctions.getMonitors();
      expect(monitors[0].group_name).toBeNull();
    });

    it('should allow multiple monitors in the same group', () => {
      testFunctions.addMonitor('http', 'https://api1.dev.com', 60, 'dev-api1', null, 'dev');
      testFunctions.addMonitor('http', 'https://api2.dev.com', 60, 'dev-api2', null, 'dev');
      testFunctions.addMonitor('http', 'https://api3.dev.com', 60, 'dev-api3', null, 'dev');
      
      const monitors = testFunctions.getMonitorsByGroup('dev');
      expect(monitors).toHaveLength(3);
    });

    it('should allow same monitor name pattern in different groups', () => {
      testFunctions.addMonitor('http', 'https://dev.api.com', 60, 'dev-api', null, 'dev');
      testFunctions.addMonitor('http', 'https://prod.api.com', 60, 'prod-api', null, 'prod');
      
      const devMonitors = testFunctions.getMonitorsByGroup('dev');
      const prodMonitors = testFunctions.getMonitorsByGroup('prod');
      
      expect(devMonitors).toHaveLength(1);
      expect(prodMonitors).toHaveLength(1);
    });
  });

  describe('updateMonitor with group', () => {
    let monitorId;

    beforeEach(() => {
      const result = testFunctions.addMonitor('http', 'https://example.com', 60, 'test-api', null, 'dev');
      monitorId = result.lastInsertRowid;
    });

    it('should update monitor group', () => {
      testFunctions.updateMonitor(monitorId, { group_name: 'prod' });
      
      const monitor = testFunctions.getMonitorByIdOrName(String(monitorId));
      expect(monitor.group_name).toBe('prod');
    });

    it('should remove monitor from group (set to null)', () => {
      testFunctions.updateMonitor(monitorId, { group_name: null });
      
      const monitor = testFunctions.getMonitorByIdOrName(String(monitorId));
      expect(monitor.group_name).toBeNull();
    });

    it('should update group along with other fields', () => {
      testFunctions.updateMonitor(monitorId, {
        name: 'renamed-api',
        group_name: 'staging'
      });
      
      const monitor = testFunctions.getMonitorByIdOrName(String(monitorId));
      expect(monitor.name).toBe('renamed-api');
      expect(monitor.group_name).toBe('staging');
    });
  });

  describe('getGroups', () => {
    it('should return empty array when no groups exist', () => {
      const groups = testFunctions.getGroups();
      expect(groups).toEqual([]);
    });

    it('should return empty array when monitors have no groups', () => {
      testFunctions.addMonitor('http', 'https://a.com', 60, 'a', null, null);
      testFunctions.addMonitor('http', 'https://b.com', 60, 'b', null, null);
      
      const groups = testFunctions.getGroups();
      expect(groups).toEqual([]);
    });

    it('should return groups with counts', () => {
      testFunctions.addMonitor('http', 'https://dev1.com', 60, 'dev1', null, 'dev');
      testFunctions.addMonitor('http', 'https://dev2.com', 60, 'dev2', null, 'dev');
      testFunctions.addMonitor('http', 'https://prod1.com', 60, 'prod1', null, 'prod');
      
      const groups = testFunctions.getGroups();
      
      expect(groups).toHaveLength(2);
      expect(groups.find(g => g.group_name === 'dev').count).toBe(2);
      expect(groups.find(g => g.group_name === 'prod').count).toBe(1);
    });

    it('should return groups in alphabetical order', () => {
      testFunctions.addMonitor('http', 'https://z.com', 60, 'z', null, 'zebra');
      testFunctions.addMonitor('http', 'https://a.com', 60, 'a', null, 'alpha');
      testFunctions.addMonitor('http', 'https://m.com', 60, 'm', null, 'mid');
      
      const groups = testFunctions.getGroups();
      
      expect(groups[0].group_name).toBe('alpha');
      expect(groups[1].group_name).toBe('mid');
      expect(groups[2].group_name).toBe('zebra');
    });

    it('should not include monitors with empty string group', () => {
      testFunctions.addMonitor('http', 'https://a.com', 60, 'a', null, '');
      testFunctions.addMonitor('http', 'https://b.com', 60, 'b', null, 'valid');
      
      const groups = testFunctions.getGroups();
      
      expect(groups).toHaveLength(1);
      expect(groups[0].group_name).toBe('valid');
    });
  });

  describe('groupExists', () => {
    beforeEach(() => {
      testFunctions.addMonitor('http', 'https://dev.com', 60, 'dev-api', null, 'dev');
    });

    it('should return true for existing group', () => {
      expect(testFunctions.groupExists('dev')).toBe(true);
    });

    it('should return true for existing group (case-insensitive)', () => {
      expect(testFunctions.groupExists('DEV')).toBe(true);
      expect(testFunctions.groupExists('Dev')).toBe(true);
    });

    it('should return false for non-existing group', () => {
      expect(testFunctions.groupExists('prod')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(testFunctions.groupExists('')).toBe(false);
    });
  });

  describe('renameGroup', () => {
    beforeEach(() => {
      testFunctions.addMonitor('http', 'https://dev1.com', 60, 'dev1', null, 'dev');
      testFunctions.addMonitor('http', 'https://dev2.com', 60, 'dev2', null, 'dev');
    });

    it('should rename a group', () => {
      const result = testFunctions.renameGroup('dev', 'development');
      
      expect(result.changes).toBe(2);
      
      const monitors = testFunctions.getMonitorsByGroup('development');
      expect(monitors).toHaveLength(2);
      
      const oldGroupMonitors = testFunctions.getMonitorsByGroup('dev');
      expect(oldGroupMonitors).toHaveLength(0);
    });

    it('should handle case-insensitive rename of same group', () => {
      const result = testFunctions.renameGroup('dev', 'DEV');
      
      expect(result.changes).toBe(2);
      
      const monitors = testFunctions.getMonitorsByGroup('DEV');
      expect(monitors).toHaveLength(2);
      expect(monitors[0].group_name).toBe('DEV');
    });

    it('should throw error when renaming non-existent group', () => {
      expect(() => {
        testFunctions.renameGroup('nonexistent', 'newname');
      }).toThrow("Group 'nonexistent' does not exist.");
    });

    it('should throw error when new name already exists', () => {
      testFunctions.addMonitor('http', 'https://prod.com', 60, 'prod1', null, 'prod');
      
      expect(() => {
        testFunctions.renameGroup('dev', 'prod');
      }).toThrow("Group 'prod' already exists.");
    });
  });

  describe('deleteGroup', () => {
    beforeEach(() => {
      const result1 = testFunctions.addMonitor('http', 'https://dev1.com', 60, 'dev1', null, 'dev');
      const result2 = testFunctions.addMonitor('http', 'https://dev2.com', 60, 'dev2', null, 'dev');
      
      // Add some heartbeats to test cascading
      testFunctions.logHeartbeat(result1.lastInsertRowid, 'up', 100);
      testFunctions.logHeartbeat(result2.lastInsertRowid, 'up', 150);
    });

    it('should ungroup monitors when deleteMonitors is false', () => {
      const result = testFunctions.deleteGroup('dev', false);
      
      expect(result.changes).toBe(2);
      
      // Monitors should still exist but without group
      const monitors = testFunctions.getMonitors();
      expect(monitors).toHaveLength(2);
      expect(monitors[0].group_name).toBeNull();
      expect(monitors[1].group_name).toBeNull();
      
      // Group should no longer exist
      expect(testFunctions.groupExists('dev')).toBe(false);
    });

    it('should delete monitors when deleteMonitors is true', () => {
      const result = testFunctions.deleteGroup('dev', true);
      
      expect(result.changes).toBe(2);
      
      // Monitors should be deleted
      const monitors = testFunctions.getMonitors();
      expect(monitors).toHaveLength(0);
    });

    it('should delete heartbeats when deleting monitors', () => {
      testFunctions.deleteGroup('dev', true);
      
      // All heartbeats should be deleted
      const heartbeats = db.prepare('SELECT * FROM heartbeats').all();
      expect(heartbeats).toHaveLength(0);
    });

    it('should throw error when deleting non-existent group', () => {
      expect(() => {
        testFunctions.deleteGroup('nonexistent', false);
      }).toThrow("Group 'nonexistent' does not exist.");
    });

    it('should handle case-insensitive group deletion', () => {
      const result = testFunctions.deleteGroup('DEV', false);
      expect(result.changes).toBe(2);
    });
  });

  describe('getMonitorsByGroup', () => {
    beforeEach(() => {
      testFunctions.addMonitor('http', 'https://dev1.com', 60, 'dev1', null, 'dev');
      testFunctions.addMonitor('http', 'https://dev2.com', 60, 'dev2', null, 'dev');
      testFunctions.addMonitor('http', 'https://prod1.com', 60, 'prod1', null, 'prod');
      testFunctions.addMonitor('http', 'https://ungrouped.com', 60, 'ungrouped1', null, null);
    });

    it('should return monitors for a specific group', () => {
      const monitors = testFunctions.getMonitorsByGroup('dev');
      
      expect(monitors).toHaveLength(2);
      expect(monitors.every(m => m.group_name === 'dev')).toBe(true);
    });

    it('should return monitors case-insensitively', () => {
      const monitors = testFunctions.getMonitorsByGroup('DEV');
      expect(monitors).toHaveLength(2);
    });

    it('should return ungrouped monitors when group is null', () => {
      const monitors = testFunctions.getMonitorsByGroup(null);
      
      expect(monitors).toHaveLength(1);
      expect(monitors[0].name).toBe('ungrouped1');
    });

    it('should return ungrouped monitors when group is "ungrouped"', () => {
      const monitors = testFunctions.getMonitorsByGroup('ungrouped');
      
      expect(monitors).toHaveLength(1);
      expect(monitors[0].name).toBe('ungrouped1');
    });

    it('should return empty array for non-existent group', () => {
      const monitors = testFunctions.getMonitorsByGroup('staging');
      expect(monitors).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters in group names', () => {
      testFunctions.addMonitor('http', 'https://a.com', 60, 'a', null, 'dev-env_1');
      
      const groups = testFunctions.getGroups();
      expect(groups[0].group_name).toBe('dev-env_1');
      
      const monitors = testFunctions.getMonitorsByGroup('dev-env_1');
      expect(monitors).toHaveLength(1);
    });

    it('should handle unicode characters in group names', () => {
      testFunctions.addMonitor('http', 'https://a.com', 60, 'a', null, 'développement');
      
      const groups = testFunctions.getGroups();
      expect(groups[0].group_name).toBe('développement');
    });

    it('should handle very long group names', () => {
      const longName = 'a'.repeat(100);
      testFunctions.addMonitor('http', 'https://a.com', 60, 'a', null, longName);
      
      const groups = testFunctions.getGroups();
      expect(groups[0].group_name).toBe(longName);
    });

    it('should handle groups with spaces', () => {
      testFunctions.addMonitor('http', 'https://a.com', 60, 'a', null, 'dev environment');
      
      const monitors = testFunctions.getMonitorsByGroup('dev environment');
      expect(monitors).toHaveLength(1);
    });

    it('should handle renaming to same name with different case', () => {
      testFunctions.addMonitor('http', 'https://a.com', 60, 'a', null, 'dev');
      
      const result = testFunctions.renameGroup('dev', 'Dev');
      expect(result.changes).toBe(1);
      
      const monitors = testFunctions.getMonitorsByGroup('Dev');
      expect(monitors[0].group_name).toBe('Dev');
    });

    it('should properly clean up when deleting group with SSL certificates', () => {
      const result = testFunctions.addMonitor('ssl', 'github.com', 3600, 'ssl-mon', null, 'ssl-group');
      const monitorId = result.lastInsertRowid;
      
      // Add SSL certificate
      db.prepare(`
        INSERT INTO ssl_certificates (monitor_id, issuer, subject, valid_from, valid_to, days_remaining, serial_number, fingerprint)
        VALUES (?, 'DigiCert', 'github.com', '2024-01-01', '2025-01-01', 365, 'ABC123', 'SHA256:XYZ')
      `).run(monitorId);
      
      testFunctions.deleteGroup('ssl-group', true);
      
      const certs = db.prepare('SELECT * FROM ssl_certificates WHERE monitor_id = ?').all(monitorId);
      expect(certs).toHaveLength(0);
    });
  });

  describe('Migration Scenario', () => {
    it('should handle existing monitors without group_name (null)', () => {
      // Simulate existing monitors without groups
      testFunctions.addMonitor('http', 'https://old1.com', 60, 'old1', null, null);
      testFunctions.addMonitor('http', 'https://old2.com', 60, 'old2', null, null);
      
      // Add new monitors with groups
      testFunctions.addMonitor('http', 'https://new1.com', 60, 'new1', null, 'dev');
      
      const allMonitors = testFunctions.getMonitors();
      expect(allMonitors).toHaveLength(3);
      
      const groups = testFunctions.getGroups();
      expect(groups).toHaveLength(1);
      
      const ungrouped = testFunctions.getMonitorsByGroup(null);
      expect(ungrouped).toHaveLength(2);
    });

    it('should allow updating existing monitor to add group', () => {
      const result = testFunctions.addMonitor('http', 'https://existing.com', 60, 'existing', null, null);
      const monitorId = result.lastInsertRowid;
      
      testFunctions.updateMonitor(monitorId, { group_name: 'newly-grouped' });
      
      const monitor = testFunctions.getMonitorByIdOrName(String(monitorId));
      expect(monitor.group_name).toBe('newly-grouped');
    });
  });
});
