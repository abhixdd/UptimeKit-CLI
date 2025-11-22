import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { initDB, getMonitorByIdOrName, getHeartbeatsForMonitor } from '../core/db.js';

const StatBox = ({ label, value, color = "white" }) => (
    <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1} flexGrow={1} marginRight={1}>
        <Text color="gray" dimColor>{label}</Text>
        <Text bold color={color}>{value}</Text>
    </Box>
);

const bars = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
function renderSparkline(values, width = 60) {
    if (!values || values.length === 0) return ''.padEnd(width, ' ');

    // fit values to width
    const v = values.slice(-width);
    const max = Math.max(...v);
    const min = Math.min(...v);
    const range = max - min || 1;

    return v.map(num => {
        const p = Math.floor(((num - min) / range) * (bars.length - 1));
        return bars[p] || bars[0];
    }).join('');
}

export default function MonitorDetail({ idOrName }) {
    const [monitor, setMonitor] = useState(null);
    const [heartbeats, setHeartbeats] = useState([]);
    const [notFound, setNotFound] = useState(false);
    const { exit } = useApp();

    useEffect(() => {
        let mounted = true;

        const fetchData = async () => {
            try {
                await initDB();

                const m = getMonitorByIdOrName(idOrName);

                if (!m) {
                    if (mounted) setNotFound(true);
                    setTimeout(() => { if (mounted) exit(); }, 2000);
                    return;
                }

                if (mounted) {
                    setMonitor(prev => (JSON.stringify(prev) !== JSON.stringify(m) ? m : prev));

                    const hb = getHeartbeatsForMonitor(m.id, 60);
                    setHeartbeats(prev => (JSON.stringify(prev) !== JSON.stringify(hb) ? hb : prev));
                }
            } catch (e) {
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 1000);

        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, [idOrName, exit]);

    useInput((input, key) => {
        if (input === 'q' || key.escape) exit();
    });

    const stats = useMemo(() => {
        const latencies = heartbeats
            .filter(h => typeof h.latency === 'number')
            .map(h => h.latency);

        const total = heartbeats.length;
        const up = heartbeats.filter(h => h.status === 'up').length;

        const sorted = [...latencies].sort((a, b) => a - b);
        const p95Index = Math.floor(sorted.length * 0.95);

        return {
            latencies,
            currentStatus: heartbeats[0]?.status || 'unknown',
            min: latencies.length ? Math.min(...latencies) : 0,
            max: latencies.length ? Math.max(...latencies) : 0,
            avg: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
            p95: sorted[p95Index] || 0,
            uptime: total ? ((up / total) * 100).toFixed(2) : '0.00'
        };
    }, [heartbeats]);

    if (!monitor) {
        return (
            <Box padding={1} borderStyle="round" borderColor="red">
                <Text>{notFound ? `❌ Monitor "${idOrName}" not found.` : '⏳ Loading data...'}</Text>
            </Box>
        );
    }

    const isUp = stats.currentStatus === 'up' || stats.currentStatus === 200;
    const statusColor = isUp ? "green" : "red";

    // reverse so it reads left-to-right as old-to-new
    const historyBar = heartbeats.slice(0, 40).reverse().map((h, i) => {
        const up = h.status === 'up';
        return <Text key={i} color={up ? "green" : "red"}>{up ? "■" : "✖"}</Text>;
    });

    return (
        <Box flexDirection="column" padding={1} borderStyle="round" borderColor={statusColor} minHeight={20}>

            <Box justifyContent="space-between" marginBottom={1}>
                <Box flexDirection="column">
                    <Box alignItems="center">
                        <Text bold color="white" backgroundColor={statusColor}>
                            {isUp ? "  ONLINE  " : "  OFFLINE  "}
                        </Text>
                        <Box marginLeft={1}>
                            <Text bold color="white" underline>{monitor.name || "Monitor"}</Text>
                        </Box>
                    </Box>
                    <Box marginTop={1}>
                        <Text color="cyan">{monitor.url}</Text>
                    </Box>
                    <Text color="gray" dimColor>Type: {monitor.type} • Interval: {monitor.interval}s</Text>
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

            <Box flexDirection="column" marginBottom={1}>
                <Box justifyContent="space-between">
                    <Text bold color="white">Latency (Last 60s)</Text>
                    <Text color="gray" dimColor>Max: {stats.max}ms</Text>
                </Box>
                <Box borderStyle="single" borderColor="gray" paddingX={1}>
                    <Text color={statusColor}>
                        {renderSparkline(stats.latencies, 80)}
                    </Text>
                </Box>
            </Box>

            <Box flexDirection="row" justifyContent="space-between">
                <StatBox label="Current" value={`${stats.latencies[stats.latencies.length - 1] || 0} ms`} color={statusColor} />
                <StatBox label="Avg Latency" value={`${stats.avg} ms`} />
                <StatBox label="P95 Latency" value={`${stats.p95} ms`} />
                <StatBox label="Uptime (24h)" value={`${stats.uptime}%`} color={parseFloat(stats.uptime) > 99 ? "green" : "yellow"} />
            </Box>

        </Box>
    );
}