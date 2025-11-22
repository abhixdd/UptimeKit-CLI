import { initDB, getMonitors, logHeartbeat } from '../core/db.js';
import axios from 'axios';
import ping from 'ping';
import dns from 'dns/promises';

const activeMonitors = new Map();

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
      const res = await ping.promise.probe(monitor.url, {
        timeout: 5,
        extra: ['-n', '1']
      });
      status = res.alive ? 'up' : 'down';
      latency = res.time === 'unknown' ? 0 : parseFloat(res.time) || 0;
    } else if (monitor.type === 'dns') {
      await dns.resolve(monitor.url);
      status = 'up';
      latency = Date.now() - start;
    }
  } catch (error) {
    status = 'down';
    latency = Date.now() - start;
  }

  try {
    logHeartbeat(monitor.id, status, Math.round(latency));
  } catch (err) {
    console.error('Failed to log heartbeat:', err);
  }
}

function startMonitorLoop(monitor) {
  checkMonitor(monitor);

  const intervalId = setInterval(() => {
    checkMonitor(monitor);
  }, monitor.interval * 1000);

  activeMonitors.set(monitor.id, {
    intervalId,
    monitor
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
          startMonitorLoop(monitor);
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
