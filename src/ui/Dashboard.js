import React, { useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { getStats, initDB } from '../core/db.js';

const Dashboard = () => {
  const [monitors, setMonitors] = useState([]);
  const { exit } = useApp();

  useEffect(() => {
    const fetchData = async () => {
      try {
        await initDB();
        const stats = getStats();
        setMonitors(stats);
      } catch (error) {
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, []);

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit();
    }
  });

  // Separate monitors into regular and SSL
  const regularMonitors = monitors.filter(m => m.type !== 'ssl');
  const sslMonitors = monitors.filter(m => m.type === 'ssl');

  return (
    <Box flexDirection="column" padding={1} borderStyle="round" borderColor="cyan">
      <Box marginBottom={1}>
        <Text bold color="cyan">UptimeKit Dashboard</Text>
        <Box marginLeft={2}>
          <Text color="green">● {monitors.filter(m => m.status === 'up').length} Up</Text>
        </Box>
        <Box marginLeft={2}>
          <Text color="red">● {monitors.filter(m => m.status !== 'up').length} Down</Text>
        </Box>
        <Box marginLeft={2}>
          <Text color="gray">Press 'q' to exit</Text>
        </Box>
      </Box>

      {/* Regular Monitors Table */}
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
          {regularMonitors.map((m) => {
            let displayUrl = m.url;
            let displayName = m.name ? m.name : '';
            try {
              const parsed = new URL(m.url);
              displayUrl = parsed.hostname;
              if (!displayName) displayName = parsed.hostname;
            } catch (err) {
              const host = m.url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
              displayUrl = host;
              if (!displayName) displayName = host;
            }

            if (displayUrl.length > 20) {
              displayUrl = displayUrl.slice(0, 10) + '...' + displayUrl.slice(-7);
            }

            return (
              <Box key={m.id} borderStyle="single" borderColor="gray" borderTop={false} paddingX={1}>
                <Box width="6%"><Text>{m.id}</Text></Box>
                <Box width="19%"><Text>{displayName}</Text></Box>
                <Box width="20%"><Text>{displayUrl}</Text></Box>
                <Box width="10%"><Text>{m.type}</Text></Box>
                <Box width="10%">
                  <Text color={m.status === 'up' ? 'green' : 'red'} bold>
                    {m.status === 'up' ? '✔ UP' : '✖ DOWN'}
                  </Text>
                </Box>
                <Box width="10%">
                  <Text color={m.latency > 500 ? 'yellow' : 'green'}>{m.latency}ms</Text>
                </Box>
                <Box width="15%">
                  <Text color={parseFloat(m.uptime) > 99 ? 'green' : 'yellow'}>{m.uptime}%</Text>
                </Box>
                <Box width="30%">
                  <Text color="gray">{m.lastDowntime === 'No downtime' ? 'None' : m.lastDowntime}</Text>
                  {m.lastDowntime !== 'No downtime' && (
                    <Text color="gray" dimColor> ({m.lastCheck})</Text>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* SSL Monitors Table */}
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
          {sslMonitors.map((m) => {
            let displayHost = m.url;
            let displayName = m.name ? m.name : '';
            try {
              const parsed = new URL(m.url.includes('://') ? m.url : `https://${m.url}`);
              displayHost = parsed.hostname;
              if (!displayName) displayName = parsed.hostname;
            } catch (err) {
              const host = m.url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
              displayHost = host;
              if (!displayName) displayName = host;
            }

            if (displayHost.length > 25) {
              displayHost = displayHost.slice(0, 12) + '...' + displayHost.slice(-10);
            }

            const ssl = m.ssl || {};
            const days = ssl.daysRemaining;
            let daysColor = 'green';
            if (days !== null && days !== undefined) {
              if (days <= 7) daysColor = 'red';
              else if (days <= 30) daysColor = 'yellow';
            }

            let statusDisplay;
            if (m.status === 'up') {
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

            const expiryDate = ssl.validTo ? new Date(ssl.validTo).toLocaleDateString('en-US') : 'Unknown';
            const issuer = ssl.issuer ? (ssl.issuer.length > 18 ? ssl.issuer.slice(0, 15) + '...' : ssl.issuer) : 'Unknown';

            return (
              <Box key={m.id} borderStyle="single" borderColor="gray" borderTop={false} paddingX={1}>
                <Box width="6%"><Text>{m.id}</Text></Box>
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
          })}
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

export default Dashboard;
