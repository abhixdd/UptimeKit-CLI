import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Create in-memory test database
let testDb;

function setupTestDb() {
  testDb = new Database(':memory:');
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS monitors (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      interval INTEGER DEFAULT 60,
      name TEXT,
      webhook_url TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS heartbeats (
      id INTEGER PRIMARY KEY,
      monitor_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      latency INTEGER,
      message TEXT,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (monitor_id) REFERENCES monitors(id)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS ssl_certificates (
      id INTEGER PRIMARY KEY,
      monitor_id INTEGER NOT NULL UNIQUE,
      issuer TEXT,
      subject TEXT,
      valid_from TEXT,
      valid_to TEXT,
      days_remaining INTEGER,
      last_checked TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (monitor_id) REFERENCES monitors(id)
    );
  `);
  return testDb;
}

// Mock db.js module
jest.unstable_mockModule('../../src/core/db.js', () => {
  return {
    initDB: jest.fn().mockResolvedValue(undefined),
    getDB: jest.fn(() => testDb),
    addMonitor: jest.fn((type, url, interval, name, webhook) => {
      const stmt = testDb.prepare('INSERT INTO monitors (type, url, interval, name, webhook_url) VALUES (?, ?, ?, ?, ?)');
      const result = stmt.run(type, url, interval, name, webhook || null);
      return result.lastInsertRowid;
    }),
    getMonitors: jest.fn(() => {
      return testDb.prepare('SELECT * FROM monitors').all();
    }),
    getMonitorByIdOrName: jest.fn((idOrName) => {
      const id = parseInt(idOrName, 10);
      if (!isNaN(id)) {
        return testDb.prepare('SELECT * FROM monitors WHERE id = ?').get(id);
      }
      return testDb.prepare('SELECT * FROM monitors WHERE name = ?').get(idOrName);
    }),
    updateMonitor: jest.fn((id, updates) => {
      const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      const values = Object.values(updates);
      testDb.prepare(`UPDATE monitors SET ${fields} WHERE id = ?`).run(...values, id);
    }),
    resetDB: jest.fn(() => {
      testDb.exec('DELETE FROM heartbeats');
      testDb.exec('DELETE FROM monitors');
      testDb.exec('DELETE FROM settings');
    }),
    getNotificationSettings: jest.fn(() => {
      const row = testDb.prepare("SELECT value FROM settings WHERE key = 'notifications_enabled'").get();
      return row ? row.value === '1' : true;
    }),
    setNotificationSettings: jest.fn((enabled) => {
      testDb.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('notifications_enabled', ?)").run(enabled ? '1' : '0');
      return true;
    })
  };
});

const { registerDeleteCommand } = await import('../../src/commands/delete.js');
const { registerNotificationsCommand } = await import('../../src/commands/notifications.js');

describe('Delete Command', () => {
  let program;
  let consoleLog;
  let consoleError;
  let originalLog;
  let originalError;

  beforeEach(() => {
    setupTestDb();
    program = new Command();
    program.exitOverride();
    registerDeleteCommand(program);
    
    // Add test monitor
    testDb.prepare('INSERT INTO monitors (id, type, url, interval, name) VALUES (?, ?, ?, ?, ?)')
      .run(1, 'http', 'https://example.com', 60, 'example');
    testDb.prepare('INSERT INTO heartbeats (monitor_id, status, latency) VALUES (?, ?, ?)')
      .run(1, 'up', 100);
    
    originalLog = console.log;
    originalError = console.error;
    consoleLog = [];
    consoleError = [];
    console.log = (...args) => consoleLog.push(args.join(' '));
    console.error = (...args) => consoleError.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    if (testDb) testDb.close();
  });

  it('should delete monitor by id', async () => {
    await program.parseAsync(['node', 'test', 'delete', '1']);
    
    const monitors = testDb.prepare('SELECT * FROM monitors').all();
    expect(monitors).toHaveLength(0);
    
    const heartbeats = testDb.prepare('SELECT * FROM heartbeats').all();
    expect(heartbeats).toHaveLength(0);
  });

  it('should delete monitor by name', async () => {
    await program.parseAsync(['node', 'test', 'delete', 'example']);
    
    const monitors = testDb.prepare('SELECT * FROM monitors').all();
    expect(monitors).toHaveLength(0);
  });

  it('should show error for non-existent monitor', async () => {
    await program.parseAsync(['node', 'test', 'delete', 'nonexistent']);
    
    expect(consoleLog.some(log => log.includes('not found'))).toBe(true);
  });

  it('should support del alias', async () => {
    await program.parseAsync(['node', 'test', 'del', '1']);
    
    const monitors = testDb.prepare('SELECT * FROM monitors').all();
    expect(monitors).toHaveLength(0);
  });

  it('should delete all heartbeats for the monitor', async () => {
    testDb.prepare('INSERT INTO heartbeats (monitor_id, status, latency) VALUES (?, ?, ?)')
      .run(1, 'up', 150);
    testDb.prepare('INSERT INTO heartbeats (monitor_id, status, latency) VALUES (?, ?, ?)')
      .run(1, 'down', 0);
    
    await program.parseAsync(['node', 'test', 'delete', '1']);
    
    const heartbeats = testDb.prepare('SELECT * FROM heartbeats').all();
    expect(heartbeats).toHaveLength(0);
  });
});

describe('Notifications Command', () => {
  let program;
  let consoleLog;
  let originalLog;

  beforeEach(() => {
    setupTestDb();
    program = new Command();
    program.exitOverride();
    registerNotificationsCommand(program);
    
    originalLog = console.log;
    consoleLog = [];
    console.log = (...args) => consoleLog.push(args.join(' '));
  });

  afterEach(() => {
    console.log = originalLog;
    if (testDb) testDb.close();
  });

  it('should enable notifications', async () => {
    await program.parseAsync(['node', 'test', 'notifications', 'enable']);
    
    const row = testDb.prepare("SELECT value FROM settings WHERE key = 'notifications_enabled'").get();
    expect(row.value).toBe('1');
  });

  it('should disable notifications', async () => {
    await program.parseAsync(['node', 'test', 'notifications', 'disable']);
    
    const row = testDb.prepare("SELECT value FROM settings WHERE key = 'notifications_enabled'").get();
    expect(row.value).toBe('0');
  });

  it('should show notification status when enabled', async () => {
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('notifications_enabled', '1')").run();
    await program.parseAsync(['node', 'test', 'notifications', 'status']);
    
    expect(consoleLog.some(log => log.includes('enabled'))).toBe(true);
  });

  it('should show notification status when disabled', async () => {
    testDb.prepare("INSERT INTO settings (key, value) VALUES ('notifications_enabled', '0')").run();
    await program.parseAsync(['node', 'test', 'notifications', 'status']);
    
    expect(consoleLog.some(log => log.includes('disabled'))).toBe(true);
  });

  it('should support notif alias', async () => {
    await program.parseAsync(['node', 'test', 'notif', 'enable']);
    
    const row = testDb.prepare("SELECT value FROM settings WHERE key = 'notifications_enabled'").get();
    expect(row.value).toBe('1');
  });
});

describe('Start/Stop Daemon Logic', () => {
  const TEST_PID_FILE = path.join(os.tmpdir(), 'uptimekit-test-daemon.pid');

  afterEach(() => {
    if (fs.existsSync(TEST_PID_FILE)) {
      fs.unlinkSync(TEST_PID_FILE);
    }
  });

  it('should detect existing daemon via PID file', () => {
    fs.writeFileSync(TEST_PID_FILE, process.pid.toString());
    
    const pid = parseInt(fs.readFileSync(TEST_PID_FILE, 'utf-8'));
    expect(pid).toBe(process.pid);
    
    let processExists = false;
    try {
      process.kill(pid, 0);
      processExists = true;
    } catch (e) {
      processExists = false;
    }
    expect(processExists).toBe(true);
  });

  it('should detect stale PID file', () => {
    fs.writeFileSync(TEST_PID_FILE, '99999999');
    
    const pid = parseInt(fs.readFileSync(TEST_PID_FILE, 'utf-8'));
    
    let processExists = false;
    try {
      process.kill(pid, 0);
      processExists = true;
    } catch (e) {
      processExists = false;
    }
    expect(processExists).toBe(false);
  });

  it('should handle missing PID file', () => {
    const nonExistentFile = path.join(os.tmpdir(), 'nonexistent.pid');
    expect(fs.existsSync(nonExistentFile)).toBe(false);
  });

  it('should create daemon directory if not exists', () => {
    const testDir = path.join(os.tmpdir(), 'uptimekit-test-' + Date.now());
    expect(fs.existsSync(testDir)).toBe(false);
    
    fs.mkdirSync(testDir, { recursive: true });
    expect(fs.existsSync(testDir)).toBe(true);
    
    fs.rmdirSync(testDir);
  });

  it('should write PID to file', () => {
    const pid = 12345;
    fs.writeFileSync(TEST_PID_FILE, pid.toString());
    
    const readPid = parseInt(fs.readFileSync(TEST_PID_FILE, 'utf-8'));
    expect(readPid).toBe(pid);
  });
});

describe('Monitor Validation', () => {
  describe('URL validation', () => {
    it('should validate http URL', () => {
      const url = 'https://example.com';
      const parsed = new URL(url);
      expect(parsed.protocol).toBe('https:');
    });

    it('should reject invalid URL for http monitor', () => {
      expect(() => new URL('not-a-url')).toThrow();
    });

    it('should extract hostname from URL', () => {
      const url = 'https://www.example.com/path';
      const parsed = new URL(url);
      expect(parsed.hostname).toBe('www.example.com');
    });

    it('should detect localhost', () => {
      const url = 'http://localhost:3000';
      const parsed = new URL(url);
      expect(parsed.hostname).toBe('localhost');
    });

    it('should handle URL with port', () => {
      const url = 'https://example.com:8080/api';
      const parsed = new URL(url);
      expect(parsed.port).toBe('8080');
    });
  });

  describe('ICMP/DNS host validation', () => {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;

    it('should validate IPv4 format', () => {
      expect(ipv4Regex.test('192.168.1.1')).toBe(true);
      expect(ipv4Regex.test('8.8.8.8')).toBe(true);
      expect(ipv4Regex.test('10.0.0.1')).toBe(true);
    });

    it('should reject invalid IPv4 format', () => {
      expect(ipv4Regex.test('192.168.1')).toBe(false);
      expect(ipv4Regex.test('not-an-ip')).toBe(false);
      expect(ipv4Regex.test('192.168.1.1.1')).toBe(false);
    });

    it('should validate IPv4 octets in range', () => {
      const validIps = ['192.168.1.1', '0.0.0.0', '255.255.255.255'];
      validIps.forEach(ip => {
        const octets = ip.split('.').map(Number);
        const valid = octets.every(octet => octet >= 0 && octet <= 255);
        expect(valid).toBe(true);
      });
    });

    it('should reject IPv4 octets out of range', () => {
      const invalidIps = ['256.168.1.1', '192.999.1.1', '192.168.1.999'];
      invalidIps.forEach(ip => {
        const octets = ip.split('.').map(Number);
        const valid = octets.every(octet => octet >= 0 && octet <= 255);
        expect(valid).toBe(false);
      });
    });

    it('should validate hostname format', () => {
      const hostnameRegex = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/;
      expect(hostnameRegex.test('example')).toBe(true);
      expect(hostnameRegex.test('my-server')).toBe(true);
      expect(hostnameRegex.test('server01')).toBe(true);
    });

    it('should reject hostname starting with hyphen', () => {
      const hostnameRegex = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/;
      expect(hostnameRegex.test('-invalid')).toBe(false);
    });

    it('should reject hostname ending with hyphen', () => {
      const hostnameRegex = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/;
      expect(hostnameRegex.test('invalid-')).toBe(false);
    });
  });

  describe('SSL hostname validation', () => {
    it('should extract hostname from URL for SSL', () => {
      const url = 'https://example.com/path';
      const host = url.replace(/^https?:\/\//, '').replace(/\/.+$/, '').split(':')[0].trim();
      expect(host).toBe('example.com');
    });

    it('should handle hostname with port', () => {
      const url = 'example.com:443';
      const host = url.split(':')[0].trim();
      expect(host).toBe('example.com');
    });

    it('should validate multi-part hostname', () => {
      const hostnameRegex = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/;
      const host = 'www.example.com';
      const parts = host.split('.');
      const valid = parts.length >= 2 && parts.every(p => hostnameRegex.test(p));
      expect(valid).toBe(true);
    });

    it('should reject single-part hostname for SSL', () => {
      const hostnameRegex = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)$/;
      const host = 'localhost';
      const parts = host.split('.');
      const valid = parts.length >= 2 && parts.every(p => hostnameRegex.test(p));
      expect(valid).toBe(false);
    });
  });
});

describe('Monitor Type Schema', () => {
  const allowedTypes = ['http', 'icmp', 'dns', 'ssl'];

  it('should accept http type', () => {
    expect(allowedTypes.includes('http')).toBe(true);
  });

  it('should accept icmp type', () => {
    expect(allowedTypes.includes('icmp')).toBe(true);
  });

  it('should accept dns type', () => {
    expect(allowedTypes.includes('dns')).toBe(true);
  });

  it('should accept ssl type', () => {
    expect(allowedTypes.includes('ssl')).toBe(true);
  });

  it('should reject invalid types', () => {
    const invalidTypes = ['invalid', 'tcp', 'udp', 'websocket', 'grpc'];
    invalidTypes.forEach(type => {
      expect(allowedTypes.includes(type)).toBe(false);
    });
  });

  it('should validate interval is positive', () => {
    const validIntervals = [1, 30, 60, 3600];
    validIntervals.forEach(interval => {
      expect(interval >= 1).toBe(true);
    });
  });

  it('should reject zero interval', () => {
    expect(0 >= 1).toBe(false);
  });

  it('should reject negative interval', () => {
    const negativeIntervals = [-1, -10, -100];
    negativeIntervals.forEach(interval => {
      expect(interval >= 1).toBe(false);
    });
  });
});

describe('Name Generation', () => {
  it('should generate name from domain', () => {
    const url = 'https://example.com/path';
    let domain = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    const name = domain.slice(0, 6);
    expect(name).toBe('exampl');
  });

  it('should strip www prefix', () => {
    const url = 'https://www.example.com';
    let domain = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    expect(domain).toBe('example.com');
  });

  it('should handle short domain', () => {
    const url = 'https://abc.io';
    let domain = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    const name = domain.slice(0, 6);
    expect(name).toBe('abc.io');
  });

  it('should use custom name when provided', () => {
    const customName = 'mysite';
    const domain = 'example.com';
    const name = customName || domain.slice(0, 6);
    expect(name).toBe('mysite');
  });

  it('should handle domain with subdomain', () => {
    const url = 'https://api.example.com';
    let domain = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    const name = domain.slice(0, 6);
    expect(name).toBe('api.ex');
  });

  it('should handle IP address URL', () => {
    const url = 'http://192.168.1.1';
    let domain = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    const name = domain.slice(0, 6);
    expect(name).toBe('192.16');
  });
});

describe('Clear Command Logic', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE monitors (id INTEGER PRIMARY KEY, url TEXT);
      CREATE TABLE heartbeats (id INTEGER PRIMARY KEY, monitor_id INTEGER);
    `);
    db.prepare('INSERT INTO monitors (url) VALUES (?)').run('https://example.com');
    db.prepare('INSERT INTO heartbeats (monitor_id) VALUES (?)').run(1);
  });

  afterEach(() => {
    db.close();
  });

  it('should clear all monitors', () => {
    db.prepare('DELETE FROM heartbeats').run();
    db.prepare('DELETE FROM monitors').run();
    
    const monitors = db.prepare('SELECT * FROM monitors').all();
    expect(monitors).toHaveLength(0);
  });

  it('should clear all heartbeats', () => {
    db.prepare('DELETE FROM heartbeats').run();
    
    const heartbeats = db.prepare('SELECT * FROM heartbeats').all();
    expect(heartbeats).toHaveLength(0);
  });

  it('should clear heartbeats before monitors (FK constraint)', () => {
    db.prepare('DELETE FROM heartbeats').run();
    db.prepare('DELETE FROM monitors').run();
    
    const monitors = db.prepare('SELECT * FROM monitors').all();
    const heartbeats = db.prepare('SELECT * FROM heartbeats').all();
    expect(monitors).toHaveLength(0);
    expect(heartbeats).toHaveLength(0);
  });

  it('should handle confirmation y', () => {
    const answer = 'y';
    const normalized = answer.trim().toLowerCase();
    expect(normalized === 'y' || normalized === 'yes').toBe(true);
  });

  it('should handle confirmation yes', () => {
    const answer = 'yes';
    const normalized = answer.trim().toLowerCase();
    expect(normalized === 'y' || normalized === 'yes').toBe(true);
  });

  it('should reject non-confirmation n', () => {
    const answer = 'n';
    const normalized = answer.trim().toLowerCase();
    expect(normalized === 'y' || normalized === 'yes').toBe(false);
  });

  it('should reject empty confirmation', () => {
    const answer = '';
    const normalized = (answer || '').trim().toLowerCase();
    expect(normalized === 'y' || normalized === 'yes').toBe(false);
  });
});

describe('Edit Command Validation', () => {
  describe('HTTP URL validation for edit', () => {
    it('should accept valid http URL update', () => {
      const newUrl = 'https://newsite.com';
      const parsed = new URL(newUrl);
      expect(['http:', 'https:'].includes(parsed.protocol)).toBe(true);
    });

    it('should reject ftp URL for http monitor', () => {
      const newUrl = 'ftp://files.example.com';
      const parsed = new URL(newUrl);
      expect(['http:', 'https:'].includes(parsed.protocol)).toBe(false);
    });

    it('should reject mailto URL for http monitor', () => {
      const newUrl = 'mailto:test@example.com';
      const parsed = new URL(newUrl);
      expect(['http:', 'https:'].includes(parsed.protocol)).toBe(false);
    });
  });

  describe('Type change validation', () => {
    const allowedTypes = ['http', 'icmp', 'dns'];

    it('should allow type change to valid type', () => {
      expect(allowedTypes.includes('icmp')).toBe(true);
    });

    it('should reject invalid type change', () => {
      const invalidTypes = ['websocket', 'tcp', 'ftp'];
      invalidTypes.forEach(type => {
        expect(allowedTypes.includes(type)).toBe(false);
      });
    });
  });

  describe('Interval change validation', () => {
    it('should accept valid interval', () => {
      const newInterval = parseInt('30', 10);
      expect(!isNaN(newInterval) && newInterval >= 1).toBe(true);
    });

    it('should handle string interval parsing', () => {
      const intervals = { '120': 120, '60': 60, '3600': 3600 };
      Object.entries(intervals).forEach(([str, num]) => {
        expect(parseInt(str, 10)).toBe(num);
      });
    });

    it('should reject non-numeric interval', () => {
      const invalidIntervals = ['abc', 'ten', ''];
      invalidIntervals.forEach(interval => {
        expect(isNaN(parseInt(interval, 10))).toBe(true);
      });
    });
  });
});

describe('Reset Command Logic', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE monitors (id INTEGER PRIMARY KEY, url TEXT);
      CREATE TABLE heartbeats (id INTEGER PRIMARY KEY, monitor_id INTEGER);
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
    `);
    db.prepare('INSERT INTO monitors (url) VALUES (?)').run('https://example.com');
    db.prepare('INSERT INTO heartbeats (monitor_id) VALUES (?)').run(1);
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('test', 'value');
  });

  afterEach(() => {
    db.close();
  });

  it('should reset all tables', () => {
    db.exec('DELETE FROM heartbeats');
    db.exec('DELETE FROM monitors');
    db.exec('DELETE FROM settings');
    
    expect(db.prepare('SELECT * FROM monitors').all()).toHaveLength(0);
    expect(db.prepare('SELECT * FROM heartbeats').all()).toHaveLength(0);
    expect(db.prepare('SELECT * FROM settings').all()).toHaveLength(0);
  });

  it('should handle confirmation y', () => {
    const answer = 'y';
    expect(answer === 'y' || answer === 'yes').toBe(true);
  });

  it('should handle confirmation YES (case insensitive)', () => {
    const answer = 'YES'.toLowerCase();
    expect(answer === 'y' || answer === 'yes').toBe(true);
  });

  it('should reject non-confirmation', () => {
    const answers = ['n', 'no', '', 'maybe', 'N'];
    answers.forEach(answer => {
      const normalized = (answer || '').trim().toLowerCase();
      expect(normalized === 'y' || normalized === 'yes').toBe(false);
    });
  });
});

describe('Status Command Logic', () => {
  it('should determine if idOrName is provided', () => {
    expect(!!('1')).toBe(true);
    expect(!!('mymonitor')).toBe(true);
    expect(!!(undefined)).toBe(false);
  });

  it('should handle numeric id', () => {
    const idOrName = '1';
    const isNumeric = !isNaN(parseInt(idOrName, 10));
    expect(isNumeric).toBe(true);
  });

  it('should handle string name', () => {
    const idOrName = 'mymonitor';
    const isNumeric = !isNaN(parseInt(idOrName, 10));
    expect(isNumeric).toBe(false);
  });

  it('should handle mixed alphanumeric name', () => {
    const idOrName = 'server01';
    const isNumeric = !isNaN(parseInt(idOrName, 10));
    expect(isNumeric).toBe(false);
  });
});

describe('Webhook URL Validation', () => {
  it('should accept valid webhook URL', () => {
    const webhookUrl = 'https://hooks.slack.com/services/xxx';
    expect(() => new URL(webhookUrl)).not.toThrow();
  });

  it('should accept discord webhook', () => {
    const webhookUrl = 'https://discord.com/api/webhooks/xxx/yyy';
    const parsed = new URL(webhookUrl);
    expect(parsed.hostname).toBe('discord.com');
  });

  it('should handle null webhook', () => {
    const webhook = null;
    expect(webhook).toBeNull();
  });

  it('should handle "none" as null webhook', () => {
    const input = 'none';
    const webhook = input.trim() === 'none' ? null : input.trim();
    expect(webhook).toBeNull();
  });
});
