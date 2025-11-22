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

      <Box flexDirection="column">
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
        {monitors.map((m, i) => {
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
        {monitors.length === 0 && (
          <Box marginTop={1} paddingX={1}>
            <Text italic color="yellow">No monitors found. Run `uptimekit add` to add one.</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default Dashboard;
