import { initDB, getMonitors, logHeartbeat, getNotificationSettings, upsertSSLCertificate } from '../core/db.js';
import { notifyMonitorDown, notifyMonitorUp, notifySSLExpiring, notifySSLExpired, notifySSLValid } from '../core/notifier.js';
import axios from 'axios';
import ping from 'ping';
import dns from 'dns/promises';
import tls from 'tls';
import { URL } from 'url';

const activeMonitors = new Map();

// SSL Certificate checking function
async function checkSSLCertificate(hostname, port = 443) {
  return new Promise((resolve, reject) => {
    const options = {
      host: hostname,
      port: port,
      servername: hostname,
      rejectUnauthorized: false,
      timeout: 10000
    };

    const socket = tls.connect(options, () => {
      try {
        const cert = socket.getPeerCertificate();
        socket.end();

        if (!cert || Object.keys(cert).length === 0) {
          reject(new Error('No certificate found'));
          return;
        }

        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const now = new Date();
        const daysRemaining = Math.floor((validTo - now) / (1000 * 60 * 60 * 24));

        resolve({
          issuer: cert.issuer ? (cert.issuer.O || cert.issuer.CN || 'Unknown') : 'Unknown',
          subject: cert.subject ? (cert.subject.CN || cert.subject.O || hostname) : hostname,
          validFrom: validFrom.toISOString(),
          validTo: validTo.toISOString(),
          daysRemaining: daysRemaining,
          serialNumber: cert.serialNumber || 'Unknown',
          fingerprint: cert.fingerprint || 'Unknown',
          isValid: now >= validFrom && now <= validTo && daysRemaining > 0
        });
      } catch (err) {
        socket.end();
        reject(err);
      }
    });

    socket.on('error', (err) => {
      reject(err);
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('Connection timeout'));
    });
  });
}

async function checkMonitor(monitor) {
  const start = Date.now();
  let status = 'down';
  let latency = 0;

  try {
    if (monitor.type === 'http') {
      const res = await axios.get(monitor.url, { timeout: 5000, validateStatus: () => true });
      if (res.status >= 200 && res.status < 300) {
        status = 'up';
      }
      latency = Date.now() - start;
    } else if (monitor.type === 'icmp') {
      const isWindows = process.platform === 'win32';
      const res = await ping.promise.probe(monitor.url, {
        timeout: 5,
        extra: [isWindows ? '-n' : '-c', '1']
      });
      status = res.alive ? 'up' : 'down';
      latency = res.time === 'unknown' ? 0 : parseFloat(res.time) || 0;
    } else if (monitor.type === 'dns') {
      await dns.resolve(monitor.url);
      status = 'up';
      latency = Date.now() - start;
    } else if (monitor.type === 'ssl') {
      // SSL certificate monitoring
      let hostname = monitor.url;
      let port = 443;
      
      try {
        if (hostname.includes('://')) {
          const parsed = new URL(hostname);
          hostname = parsed.hostname;
          port = parsed.port ? parseInt(parsed.port) : 443;
        } else if (hostname.includes(':')) {
          const parts = hostname.split(':');
          hostname = parts[0];
          port = parseInt(parts[1]) || 443;
        }
      } catch (e) {
       console.error('Error parsing SSL monitor URL:', e);
      }
      
      const certInfo = await checkSSLCertificate(hostname, port);
      latency = Date.now() - start;
      
      upsertSSLCertificate(monitor.id, certInfo);
  
      status = certInfo.isValid ? 'up' : 'down';
      
      monitor._sslCertInfo = certInfo;
    }
  } catch (error) {
    status = 'down';
    latency = Date.now() - start;
  }

  // Get previous status to detect changes
  const monitorData = activeMonitors.get(monitor.id);
  const previousStatus = monitorData?.lastStatus;

  // Log heartbeat
  try {
    logHeartbeat(monitor.id, status, Math.round(latency));
  } catch (err) {
    console.error('Failed to log heartbeat:', err);
  }

  // Send notifications on status change
  if (previousStatus && previousStatus !== status) {
    const notificationsEnabled = getNotificationSettings();
    if (notificationsEnabled) {
      if (monitor.type === 'ssl') {
        // SSL-specific notifications
        if (status === 'down') {
          notifySSLExpired(monitor);
        } else if (status === 'up') {
          notifySSLValid(monitor);
        }
      } else {
        // Regular monitor notifications
        if (status === 'down') {
          notifyMonitorDown(monitor);
        } else if (status === 'up') {
          notifyMonitorUp(monitor);
        }
      }
    }
  }

  if (monitor.type === 'ssl' && monitor._sslCertInfo && status === 'up') {
    const notificationsEnabled = getNotificationSettings();
    if (notificationsEnabled) {
      const days = monitor._sslCertInfo.daysRemaining;
      const monitorData = activeMonitors.get(monitor.id);
      const lastNotifiedDays = monitorData?.lastSSLNotifiedDays;
      
      const thresholds = [30, 14, 7, 3, 1];
      for (const threshold of thresholds) {
        if (days <= threshold && (lastNotifiedDays === undefined || lastNotifiedDays > threshold)) {
          notifySSLExpiring(monitor, days);
          if (monitorData) {
            monitorData.lastSSLNotifiedDays = days;
          }
          break;
        }
      }
    }
  }

  // Update last status
  if (monitorData) {
    monitorData.lastStatus = status;
  }
}

function startMonitorLoop(monitor, initialStatus = null) {
  checkMonitor(monitor);

  const intervalId = setInterval(() => {
    checkMonitor(monitor);
  }, monitor.interval * 1000);

  activeMonitors.set(monitor.id, {
    intervalId,
    monitor,
    lastStatus: initialStatus // Track last known status
  });
}

async function refreshMonitors() {
  try {
    const monitors = getMonitors();
    const currentIds = new Set(monitors.map(m => m.id));

    // Remove deleted monitors
    for (const [id, data] of activeMonitors) {
      if (!currentIds.has(id)) {
        clearInterval(data.intervalId);
        activeMonitors.delete(id);
      }
    }

    // Add new or update existing monitors
    for (const monitor of monitors) {
      if (!activeMonitors.has(monitor.id)) {
        startMonitorLoop(monitor);
      } else {
        const current = activeMonitors.get(monitor.id);
        if (current.monitor.interval !== monitor.interval || current.monitor.url !== monitor.url || current.monitor.type !== monitor.type) {
          clearInterval(current.intervalId);
          startMonitorLoop(monitor, current.lastStatus);
        }
      }
    }
  } catch (err) {
    console.error('Error refreshing monitors:', err);
  }
}

async function start() {
  await initDB();
  console.log('Daemon started. Monitoring...');

  refreshMonitors();
  // Check for new monitors every 10 seconds
  setInterval(refreshMonitors, 10000);
}

start();
