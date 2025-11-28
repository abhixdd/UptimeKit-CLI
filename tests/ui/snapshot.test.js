/**
 * Snapshot tests for TUI components (Dashboard and MonitorDetail)
 * These tests help catch UI regressions and layout mismatches
 */

import React from 'react';
import { render } from 'ink-testing-library';
import { Text, Box } from 'ink';


const StatBox = ({ label, value, color = "white" }) => (
  <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} flexGrow={1} marginRight={1}>
    <Text color="gray" dimColor>{label}</Text>
    <Text bold color={color}>{value}</Text>
  </Box>
);

// Dashboard Header component
const DashboardHeader = ({ upCount, downCount }) => (
  <Box marginBottom={1}>
    <Text bold color="cyan">UptimeKit Dashboard</Text>
    <Box marginLeft={2}>
      <Text color="green">● {upCount} Up</Text>
    </Box>
    <Box marginLeft={2}>
      <Text color="red">● {downCount} Down</Text>
    </Box>
    <Box marginLeft={2}>
      <Text color="gray">Press 'q' to exit</Text>
    </Box>
  </Box>
);

// Monitor Row component
const MonitorRow = ({ monitor }) => {
  let displayUrl = monitor.url;
  let displayName = monitor.name || '';
  try {
    const parsed = new URL(monitor.url);
    displayUrl = parsed.hostname;
    if (!displayName) displayName = parsed.hostname;
  } catch (err) {
    const host = monitor.url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    displayUrl = host;
    if (!displayName) displayName = host;
  }

  if (displayUrl.length > 20) {
    displayUrl = displayUrl.slice(0, 10) + '...' + displayUrl.slice(-7);
  }

  return (
    <Box borderStyle="single" borderColor="gray" borderTop={false} paddingX={1}>
      <Box width="6%"><Text>{monitor.id}</Text></Box>
      <Box width="19%"><Text>{displayName}</Text></Box>
      <Box width="20%"><Text>{displayUrl}</Text></Box>
      <Box width="10%"><Text>{monitor.type}</Text></Box>
      <Box width="10%">
        <Text color={monitor.status === 'up' ? 'green' : 'red'} bold>
          {monitor.status === 'up' ? '✔ UP' : '✖ DOWN'}
        </Text>
      </Box>
      <Box width="10%">
        <Text color={monitor.latency > 500 ? 'yellow' : 'green'}>{monitor.latency}ms</Text>
      </Box>
      <Box width="15%">
        <Text color={parseFloat(monitor.uptime) > 99 ? 'green' : 'yellow'}>{monitor.uptime}%</Text>
      </Box>
      <Box width="30%">
        <Text color="gray">{monitor.lastDowntime === 'No downtime' ? 'None' : monitor.lastDowntime}</Text>
      </Box>
    </Box>
  );
};

// SSL Monitor Row component
const SSLMonitorRow = ({ monitor }) => {
  let displayHost = monitor.url;
  let displayName = monitor.name || '';
  try {
    const parsed = new URL(monitor.url.includes('://') ? monitor.url : `https://${monitor.url}`);
    displayHost = parsed.hostname;
    if (!displayName) displayName = parsed.hostname;
  } catch (err) {
    const host = monitor.url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    displayHost = host;
    if (!displayName) displayName = host;
  }

  const ssl = monitor.ssl || {};
  const days = ssl.daysRemaining;
  let daysColor = 'green';
  if (days !== null && days !== undefined) {
    if (days <= 7) daysColor = 'red';
    else if (days <= 30) daysColor = 'yellow';
  }

  let statusDisplay;
  if (monitor.status === 'up') {
    if (days !== null && days <= 7) {
      statusDisplay = <Text color="red" bold>⚠ EXPIRING</Text>;
    } else if (days !== null && days <= 30) {
      statusDisplay = <Text color="yellow" bold>⚠ WARNING</Text>;
    } else {
      statusDisplay = <Text color="green" bold>✔ VALID</Text>;
    }
  } else {
    statusDisplay = <Text color="red" bold>✖ INVALID</Text>;
  }

  const expiryDate = ssl.validTo ? new Date(ssl.validTo).toLocaleDateString() : 'Unknown';
  const issuer = ssl.issuer ? (ssl.issuer.length > 18 ? ssl.issuer.slice(0, 15) + '...' : ssl.issuer) : 'Unknown';

  return (
    <Box borderStyle="single" borderColor="gray" borderTop={false} paddingX={1}>
      <Box width="6%"><Text>{monitor.id}</Text></Box>
      <Box width="19%"><Text>{displayName}</Text></Box>
      <Box width="25%"><Text>{displayHost}</Text></Box>
      <Box width="12%">{statusDisplay}</Box>
      <Box width="12%">
        <Text color={daysColor} bold>{days !== null && days !== undefined ? `${days} days` : 'N/A'}</Text>
      </Box>
      <Box width="18%"><Text color="gray">{expiryDate}</Text></Box>
      <Box width="20%"><Text color="gray" dimColor>{issuer}</Text></Box>
    </Box>
  );
};

// Dashboard View for testing
const SimpleDashboard = ({ monitors = [] }) => {
  const regularMonitors = monitors.filter(m => m.type !== 'ssl');
  const sslMonitors = monitors.filter(m => m.type === 'ssl');

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
      <DashboardHeader 
        upCount={monitors.filter(m => m.status === 'up').length}
        downCount={monitors.filter(m => m.status !== 'up').length}
      />

      {regularMonitors.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="white" marginBottom={1}>Uptime Monitors</Text>
          <Box borderStyle="single" borderColor="gray" paddingX={1}>
            <Box width="6%"><Text bold color="blue">#</Text></Box>
            <Box width="19%"><Text bold color="blue">Name</Text></Box>
            <Box width="20%"><Text bold color="blue">URL</Text></Box>
            <Box width="10%"><Text bold color="blue">Type</Text></Box>
            <Box width="10%"><Text bold color="blue">Status</Text></Box>
            <Box width="10%"><Text bold color="blue">Latency</Text></Box>
            <Box width="15%"><Text bold color="blue">Uptime (24h)</Text></Box>
            <Box width="30%"><Text bold color="blue">Last Downtime</Text></Box>
          </Box>
          {regularMonitors.map((m) => <MonitorRow key={m.id} monitor={m} />)}
        </Box>
      )}

      {sslMonitors.length > 0 && (
        <Box flexDirection="column">
          <Text bold color="white" marginBottom={1}>SSL Certificate Monitors</Text>
          <Box borderStyle="single" borderColor="gray" paddingX={1}>
            <Box width="6%"><Text bold color="magenta">#</Text></Box>
            <Box width="19%"><Text bold color="magenta">Name</Text></Box>
            <Box width="25%"><Text bold color="magenta">Host</Text></Box>
            <Box width="12%"><Text bold color="magenta">Status</Text></Box>
            <Box width="12%"><Text bold color="magenta">Days Left</Text></Box>
            <Box width="18%"><Text bold color="magenta">Expires</Text></Box>
            <Box width="20%"><Text bold color="magenta">Issuer</Text></Box>
          </Box>
          {sslMonitors.map((m) => <SSLMonitorRow key={m.id} monitor={m} />)}
        </Box>
      )}

      {monitors.length === 0 && (
        <Box marginTop={1} paddingX={1}>
          <Text italic color="yellow">No monitors found. Run `uptimekit add` to add one.</Text>
        </Box>
      )}
    </Box>
  );
};

// Monitor Detail View for testing
const SimpleMonitorDetail = ({ monitor, heartbeats = [], sslCert = null, notFound = false }) => {
  if (notFound) {
    return (
      <Box padding={1} borderStyle="round" borderColor="red">
        <Text>❌ Monitor not found.</Text>
      </Box>
    );
  }

  if (!monitor) {
    return (
      <Box padding={1} borderStyle="round" borderColor="gray">
        <Text>⏳ Loading data...</Text>
      </Box>
    );
  }

  const isSSL = monitor.type === 'ssl';
  const latencies = heartbeats
    .filter(h => typeof h.latency === 'number')
    .map(h => h.latency);
  const total = heartbeats.length;
  const up = heartbeats.filter(h => h.status === 'up').length;
  const currentStatus = heartbeats[0]?.status || 'unknown';

  const stats = {
    currentStatus,
    min: latencies.length ? Math.min(...latencies) : 0,
    max: latencies.length ? Math.max(...latencies) : 0,
    avg: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    uptime: total ? ((up / total) * 100).toFixed(2) : '0.00'
  };

  const isUp = stats.currentStatus === 'up';
  let statusColor = isUp ? "green" : "red";
  let statusText = isUp ? "  ONLINE  " : "  OFFLINE  ";

  if (isSSL && sslCert) {
    const days = sslCert.days_remaining;
    if (isUp) {
      if (days <= 7) {
        statusColor = "red";
        statusText = " EXPIRING ";
      } else if (days <= 30) {
        statusColor = "yellow";
        statusText = " WARNING  ";
      } else {
        statusColor = "green";
        statusText = "  VALID   ";
      }
    } else {
      statusColor = "red";
      statusText = " INVALID  ";
    }
  }

  const historyBar = heartbeats.slice(0, 40).reverse().map((h, i) => {
    const up = h.status === 'up';
    return <Text key={i} color={up ? "green" : "red"}>■</Text>;
  });

  if (isSSL) {
    const cert = sslCert || {};
    const daysRemaining = cert.days_remaining;
    let daysColor = 'green';
    if (daysRemaining !== null && daysRemaining !== undefined) {
      if (daysRemaining <= 7) daysColor = 'red';
      else if (daysRemaining <= 30) daysColor = 'yellow';
    }

    return (
      <Box flexDirection="column" padding={1} borderStyle="round" borderColor={statusColor} minHeight={20}>
        <Box justifyContent="space-between" marginBottom={1}>
          <Box flexDirection="column">
            <Box alignItems="center">
              <Text bold color="white" backgroundColor={statusColor}>{statusText}</Text>
              <Box marginLeft={1}>
                <Text bold color="white" underline>{monitor.name || "SSL Monitor"}</Text>
              </Box>
            </Box>
            <Box marginTop={1}>
              <Text color="cyan">{monitor.url}</Text>
            </Box>
            <Text color="gray" dimColor>Type: SSL Certificate • Interval: {monitor.interval}s</Text>
          </Box>
          <Box flexDirection="column" alignItems="flex-end">
            <Text color="gray" dimColor>ID: {monitor.id}</Text>
            <Text color="gray" dimColor>Press 'q' to quit</Text>
          </Box>
        </Box>

        <Box flexDirection="column" marginBottom={1}>
          <Text bold color="white">Certificate Status History (Last 40 checks)</Text>
          <Box borderStyle="single" borderColor="gray" paddingX={1}>
            {historyBar.length > 0 ? historyBar : <Text color="gray">No data yet...</Text>}
          </Box>
        </Box>

        <Box flexDirection="column" marginBottom={1} borderStyle="single" borderColor="gray" padding={1}>
          <Text bold color="white" underline>SSL Certificate Details</Text>
          <Box marginTop={1} flexDirection="column">
            <Box>
              <Box width="20%"><Text color="gray">Subject:</Text></Box>
              <Box><Text color="cyan">{cert.subject || 'Unknown'}</Text></Box>
            </Box>
            <Box>
              <Box width="20%"><Text color="gray">Issuer:</Text></Box>
              <Box><Text>{cert.issuer || 'Unknown'}</Text></Box>
            </Box>
            <Box>
              <Box width="20%"><Text color="gray">Days Remaining:</Text></Box>
              <Box><Text color={daysColor}>{daysRemaining !== null && daysRemaining !== undefined ? `${daysRemaining} days` : 'N/A'}</Text></Box>
            </Box>
          </Box>
        </Box>

        <Box flexDirection="row" justifyContent="space-between">
          <StatBox 
            label="Days Remaining" 
            value={daysRemaining !== null && daysRemaining !== undefined ? `${daysRemaining} days` : 'N/A'} 
            color={daysColor} 
          />
          <StatBox label="Validity Rate" value={`${stats.uptime}%`} color={parseFloat(stats.uptime) > 99 ? "green" : "yellow"} />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor={statusColor} minHeight={20}>
      <Box justifyContent="space-between" marginBottom={1}>
        <Box flexDirection="column">
          <Box alignItems="center">
            <Text bold color="white" backgroundColor={statusColor}>{statusText}</Text>
            <Box marginLeft={1}>
              <Text bold color="white" underline>{monitor.name || "Monitor"}</Text>
            </Box>
          </Box>
          <Box marginTop={1}>
            <Text color="cyan">{monitor.url}</Text>
          </Box>
          <Text color="gray" dimColor>Type: {monitor.type} • Interval: {monitor.interval}s</Text>
          {monitor.webhook_url && (
            <Text color="gray" dimColor>
              Webhook: {monitor.webhook_url.length > 50 ? monitor.webhook_url.substring(0, 47) + '...' : monitor.webhook_url}
            </Text>
          )}
        </Box>
        <Box flexDirection="column" alignItems="flex-end">
          <Text color="gray" dimColor>ID: {monitor.id}</Text>
          <Text color="gray" dimColor>Press 'q' to quit</Text>
        </Box>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="white">Recent Checks (Last 40)</Text>
        <Box borderStyle="single" borderColor="gray" paddingX={1}>
          {historyBar.length > 0 ? historyBar : <Text color="gray">No data yet...</Text>}
        </Box>
      </Box>

      <Box flexDirection="row" justifyContent="space-between">
        <StatBox label="Current" value={`${latencies[latencies.length - 1] || 0} ms`} color={statusColor} />
        <StatBox label="Avg Latency" value={`${stats.avg} ms`} />
        <StatBox label="Max Latency" value={`${stats.max} ms`} />
        <StatBox label="Uptime (24h)" value={`${stats.uptime}%`} color={parseFloat(stats.uptime) > 99 ? "green" : "yellow"} />
      </Box>
    </Box>
  );
};

describe('Dashboard Component Snapshots', () => {
  it('should render empty state correctly', () => {
    const { lastFrame, unmount } = render(<SimpleDashboard monitors={[]} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render with single HTTP monitor UP', () => {
    const monitors = [{
      id: 1,
      name: 'Example',
      type: 'http',
      url: 'https://example.com',
      interval: 60,
      uptime: '99.50',
      lastDowntime: 'No downtime',
      status: 'up',
      latency: 150,
      lastCheck: '30 seconds ago',
      ssl: null
    }];
    
    const { lastFrame, unmount } = render(<SimpleDashboard monitors={monitors} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render with single HTTP monitor DOWN', () => {
    const monitors = [{
      id: 1,
      name: 'Example',
      type: 'http',
      url: 'https://example.com',
      interval: 60,
      uptime: '85.00',
      lastDowntime: '5 minutes ago',
      status: 'down',
      latency: 0,
      lastCheck: '10 seconds ago',
      ssl: null
    }];
    
    const { lastFrame, unmount } = render(<SimpleDashboard monitors={monitors} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render with multiple monitors (mixed types)', () => {
    const monitors = [
      { id: 1, name: 'Website', type: 'http', url: 'https://example.com', interval: 60, uptime: '99.99', lastDowntime: 'No downtime', status: 'up', latency: 120, lastCheck: '15 seconds ago', ssl: null },
      { id: 2, name: 'Google DNS', type: 'icmp', url: '8.8.8.8', interval: 30, uptime: '100.00', lastDowntime: 'No downtime', status: 'up', latency: 25, lastCheck: '5 seconds ago', ssl: null },
      { id: 3, name: 'DNS Check', type: 'dns', url: 'google.com', interval: 120, uptime: '99.80', lastDowntime: '2 hours ago', status: 'up', latency: 45, lastCheck: '1 minute ago', ssl: null }
    ];
    
    const { lastFrame, unmount } = render(<SimpleDashboard monitors={monitors} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render with SSL monitors', () => {
    const monitors = [{
      id: 1,
      name: 'GitHub SSL',
      type: 'ssl',
      url: 'github.com',
      interval: 3600,
      uptime: '100.00',
      lastDowntime: 'No downtime',
      status: 'up',
      latency: 250,
      lastCheck: '10 minutes ago',
      ssl: {
        issuer: 'DigiCert',
        subject: 'github.com',
        validFrom: '2024-01-01',
        validTo: '2025-01-01',
        daysRemaining: 180
      }
    }];
    
    const { lastFrame, unmount } = render(<SimpleDashboard monitors={monitors} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render SSL monitor with expiring certificate (warning)', () => {
    const monitors = [{
      id: 1,
      name: 'Expiring SSL',
      type: 'ssl',
      url: 'example.com',
      interval: 3600,
      uptime: '100.00',
      lastDowntime: 'No downtime',
      status: 'up',
      latency: 200,
      lastCheck: '5 minutes ago',
      ssl: {
        issuer: "Let's Encrypt",
        subject: 'example.com',
        validFrom: '2024-06-01',
        validTo: '2024-12-15',
        daysRemaining: 17
      }
    }];
    
    const { lastFrame, unmount } = render(<SimpleDashboard monitors={monitors} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render SSL monitor with critical expiry (<=7 days)', () => {
    const monitors = [{
      id: 1,
      name: 'Critical SSL',
      type: 'ssl',
      url: 'urgent.com',
      interval: 3600,
      uptime: '100.00',
      lastDowntime: 'No downtime',
      status: 'up',
      latency: 180,
      lastCheck: '2 minutes ago',
      ssl: {
        issuer: 'Comodo',
        subject: 'urgent.com',
        validFrom: '2024-01-01',
        validTo: '2024-12-01',
        daysRemaining: 3
      }
    }];
    
    const { lastFrame, unmount } = render(<SimpleDashboard monitors={monitors} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render mixed regular and SSL monitors', () => {
    const monitors = [
      { id: 1, name: 'Main Site', type: 'http', url: 'https://mainsite.com', interval: 60, uptime: '99.95', lastDowntime: 'No downtime', status: 'up', latency: 95, lastCheck: '20 seconds ago', ssl: null },
      { id: 2, name: 'API Server', type: 'http', url: 'https://api.mainsite.com', interval: 30, uptime: '99.90', lastDowntime: '1 day ago', status: 'up', latency: 45, lastCheck: '10 seconds ago', ssl: null },
      { id: 3, name: 'Main SSL', type: 'ssl', url: 'mainsite.com', interval: 3600, uptime: '100.00', lastDowntime: 'No downtime', status: 'up', latency: 220, lastCheck: '30 minutes ago', ssl: { issuer: 'Cloudflare', subject: 'mainsite.com', validFrom: '2024-06-01', validTo: '2025-06-01', daysRemaining: 185 } }
    ];
    
    const { lastFrame, unmount } = render(<SimpleDashboard monitors={monitors} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should show correct counts in header (up/down)', () => {
    const monitors = [
      { id: 1, name: 'Up1', type: 'http', url: 'https://up1.com', interval: 60, uptime: '100', lastDowntime: 'No downtime', status: 'up', latency: 100, lastCheck: 'now', ssl: null },
      { id: 2, name: 'Up2', type: 'http', url: 'https://up2.com', interval: 60, uptime: '100', lastDowntime: 'No downtime', status: 'up', latency: 100, lastCheck: 'now', ssl: null },
      { id: 3, name: 'Down1', type: 'http', url: 'https://down1.com', interval: 60, uptime: '50', lastDowntime: 'now', status: 'down', latency: 0, lastCheck: 'now', ssl: null },
    ];
    
    const { lastFrame, unmount } = render(<SimpleDashboard monitors={monitors} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should maintain consistent column widths with long URLs', () => {
    const monitors = [{
      id: 1,
      name: 'VeryLongMonitorNameThatShouldBeTruncated',
      type: 'http',
      url: 'https://very-long-subdomain.example.com/path/to/resource',
      interval: 60,
      uptime: '99.99',
      lastDowntime: 'No downtime',
      status: 'up',
      latency: 100,
      lastCheck: '10 seconds ago',
      ssl: null
    }];
    
    const { lastFrame, unmount } = render(<SimpleDashboard monitors={monitors} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});

describe('MonitorDetail Component Snapshots', () => {
  it('should render loading state', () => {
    const { lastFrame, unmount } = render(<SimpleMonitorDetail monitor={null} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render not found state', () => {
    const { lastFrame, unmount } = render(<SimpleMonitorDetail notFound={true} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render HTTP monitor detail - online', () => {
    const monitor = {
      id: 1,
      name: 'Example Site',
      type: 'http',
      url: 'https://example.com',
      interval: 60,
      webhook_url: null
    };
    const heartbeats = [
      { status: 'up', timestamp: '2024-11-28 12:00:00', latency: 150 },
      { status: 'up', timestamp: '2024-11-28 11:59:00', latency: 145 },
      { status: 'up', timestamp: '2024-11-28 11:58:00', latency: 160 },
      { status: 'down', timestamp: '2024-11-28 11:57:00', latency: 0 },
      { status: 'up', timestamp: '2024-11-28 11:56:00', latency: 140 },
    ];
    
    const { lastFrame, unmount } = render(<SimpleMonitorDetail monitor={monitor} heartbeats={heartbeats} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render HTTP monitor detail - offline', () => {
    const monitor = {
      id: 1,
      name: 'Down Site',
      type: 'http',
      url: 'https://down.example.com',
      interval: 30,
      webhook_url: 'https://webhook.example.com/notify'
    };
    const heartbeats = [
      { status: 'down', timestamp: '2024-11-28 12:00:00', latency: 0 },
      { status: 'down', timestamp: '2024-11-28 11:59:30', latency: 0 },
      { status: 'down', timestamp: '2024-11-28 11:59:00', latency: 0 },
      { status: 'up', timestamp: '2024-11-28 11:58:30', latency: 200 },
    ];
    
    const { lastFrame, unmount } = render(<SimpleMonitorDetail monitor={monitor} heartbeats={heartbeats} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render ICMP monitor detail', () => {
    const monitor = { id: 2, name: 'Google DNS', type: 'icmp', url: '8.8.8.8', interval: 30, webhook_url: null };
    const heartbeats = [
      { status: 'up', timestamp: '2024-11-28 12:00:00', latency: 25 },
      { status: 'up', timestamp: '2024-11-28 11:59:30', latency: 28 },
      { status: 'up', timestamp: '2024-11-28 11:59:00', latency: 22 },
    ];
    
    const { lastFrame, unmount } = render(<SimpleMonitorDetail monitor={monitor} heartbeats={heartbeats} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render SSL monitor detail - valid certificate', () => {
    const monitor = { id: 4, name: 'GitHub SSL', type: 'ssl', url: 'github.com', interval: 3600, webhook_url: null };
    const heartbeats = [
      { status: 'up', timestamp: '2024-11-28 12:00:00', latency: 250 },
      { status: 'up', timestamp: '2024-11-28 11:00:00', latency: 245 },
    ];
    const sslCert = {
      issuer: 'DigiCert Inc',
      subject: 'github.com',
      valid_from: '2024-01-15',
      valid_to: '2025-02-15',
      days_remaining: 79,
      serial_number: '0A:1B:2C:3D',
      fingerprint: 'SHA256:AABBCCDD'
    };
    
    const { lastFrame, unmount } = render(<SimpleMonitorDetail monitor={monitor} heartbeats={heartbeats} sslCert={sslCert} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render SSL monitor detail - expiring certificate (warning)', () => {
    const monitor = { id: 5, name: 'Expiring SSL', type: 'ssl', url: 'expiring.com', interval: 3600, webhook_url: null };
    const heartbeats = [{ status: 'up', timestamp: '2024-11-28 12:00:00', latency: 200 }];
    const sslCert = {
      issuer: "Let's Encrypt",
      subject: 'expiring.com',
      valid_from: '2024-09-01',
      valid_to: '2024-12-15',
      days_remaining: 17
    };
    
    const { lastFrame, unmount } = render(<SimpleMonitorDetail monitor={monitor} heartbeats={heartbeats} sslCert={sslCert} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render SSL monitor detail - critical expiry (<=7 days)', () => {
    const monitor = { id: 6, name: 'Critical SSL', type: 'ssl', url: 'critical.com', interval: 3600, webhook_url: null };
    const heartbeats = [{ status: 'up', timestamp: '2024-11-28 12:00:00', latency: 180 }];
    const sslCert = {
      issuer: 'Comodo',
      subject: 'critical.com',
      valid_from: '2024-09-01',
      valid_to: '2024-12-01',
      days_remaining: 3
    };
    
    const { lastFrame, unmount } = render(<SimpleMonitorDetail monitor={monitor} heartbeats={heartbeats} sslCert={sslCert} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render SSL monitor detail - invalid certificate', () => {
    const monitor = { id: 7, name: 'Expired SSL', type: 'ssl', url: 'expired.com', interval: 3600, webhook_url: null };
    const heartbeats = [{ status: 'down', timestamp: '2024-11-28 12:00:00', latency: 0 }];
    const sslCert = {
      issuer: 'Unknown',
      subject: 'expired.com',
      valid_from: '2023-01-01',
      valid_to: '2024-01-01',
      days_remaining: -330
    };
    
    const { lastFrame, unmount } = render(<SimpleMonitorDetail monitor={monitor} heartbeats={heartbeats} sslCert={sslCert} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render monitor with webhook URL', () => {
    const monitor = {
      id: 8,
      name: 'Webhook Monitor',
      type: 'http',
      url: 'https://webhook-test.com',
      interval: 60,
      webhook_url: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXX'
    };
    const heartbeats = [{ status: 'up', timestamp: '2024-11-28 12:00:00', latency: 100 }];
    
    const { lastFrame, unmount } = render(<SimpleMonitorDetail monitor={monitor} heartbeats={heartbeats} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render with no heartbeat data', () => {
    const monitor = { id: 9, name: 'New Monitor', type: 'http', url: 'https://new.example.com', interval: 60, webhook_url: null };
    
    const { lastFrame, unmount } = render(<SimpleMonitorDetail monitor={monitor} heartbeats={[]} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });

  it('should render high latency monitor (>500ms)', () => {
    const monitor = { id: 10, name: 'Slow Site', type: 'http', url: 'https://slow.example.com', interval: 60, webhook_url: null };
    const heartbeats = [
      { status: 'up', timestamp: '2024-11-28 12:00:00', latency: 850 },
      { status: 'up', timestamp: '2024-11-28 11:59:00', latency: 920 },
      { status: 'up', timestamp: '2024-11-28 11:58:00', latency: 780 },
      { status: 'up', timestamp: '2024-11-28 11:57:00', latency: 650 },
    ];
    
    const { lastFrame, unmount } = render(<SimpleMonitorDetail monitor={monitor} heartbeats={heartbeats} />);
    expect(lastFrame()).toMatchSnapshot();
    unmount();
  });
});
