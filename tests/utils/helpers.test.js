// Helper function tests

const bars = [' ', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function renderSparkline(values, width = 60) {
  if (!values || values.length === 0) return ''.padEnd(width, ' ');

  const v = values.slice(-width);
  const max = Math.max(...v);
  const min = Math.min(...v);
  const range = max - min || 1;

  return v.map(num => {
    const p = Math.floor(((num - min) / range) * (bars.length - 1));
    return bars[p] || bars[0];
  }).join('');
}

describe('Sparkline Renderer', () => {
  it('returns empty padded string for no values', () => {
    const result = renderSparkline([]);
    expect(result).toBe(''.padEnd(60, ' '));
    expect(result.length).toBe(60);
  });

  it('returns empty padded string for null', () => {
    const result = renderSparkline(null);
    expect(result).toBe(''.padEnd(60, ' '));
  });

  it('renders single value', () => {
    const result = renderSparkline([100]);
    expect(result).toBe(' ');
  });

  it('renders two identical values', () => {
    const result = renderSparkline([50, 50], 2);
    expect(result.length).toBe(2);
  });

  it('renders increasing values', () => {
    const result = renderSparkline([0, 25, 50, 75, 100], 5);
    expect(result.length).toBe(5);
    expect(result[0]).toBe(' ');
    expect(result[4]).toBe('█');
  });

  it('renders decreasing values', () => {
    const result = renderSparkline([100, 75, 50, 25, 0], 5);
    expect(result.length).toBe(5);
    expect(result[0]).toBe('█');
    expect(result[4]).toBe(' ');
  });

  it('handles negative values', () => {
    const result = renderSparkline([-50, 0, 50], 3);
    expect(result.length).toBe(3);
    expect(result[0]).toBe(' ');
    expect(result[2]).toBe('█');
  });

  it('respects width parameter', () => {
    const values = Array(100).fill(0).map((_, i) => i);
    const result = renderSparkline(values, 20);
    expect(result.length).toBe(20);
  });

  it('handles very small range', () => {
    const result = renderSparkline([100, 101, 102], 3);
    expect(result.length).toBe(3);
    expect(result[0]).toBe(' ');
    expect(result[2]).toBe('█');
  });

  it('handles latency-like values', () => {
    const latencies = [120, 145, 132, 128, 155, 140, 138, 142];
    const result = renderSparkline(latencies, 8);
    expect(result.length).toBe(8);
    result.split('').forEach(char => {
      expect(bars).toContain(char);
    });
  });
});

describe('URL Display Helpers', () => {
  function getDisplayUrl(url) {
    try {
      const parsed = new URL(url);
      let displayUrl = parsed.hostname;
      if (displayUrl.length > 20) {
        displayUrl = displayUrl.slice(0, 10) + '...' + displayUrl.slice(-7);
      }
      return displayUrl;
    } catch (err) {
      const host = url.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      if (host.length > 20) {
        return host.slice(0, 10) + '...' + host.slice(-7);
      }
      return host;
    }
  }

  it('extracts hostname from HTTP URL', () => {
    expect(getDisplayUrl('https://example.com')).toBe('example.com');
    expect(getDisplayUrl('http://test.org')).toBe('test.org');
  });

  it('extracts hostname from URL with path', () => {
    expect(getDisplayUrl('https://example.com/path/to/page')).toBe('example.com');
  });

  it('extracts hostname from URL with port', () => {
    expect(getDisplayUrl('https://example.com:8080/api')).toBe('example.com');
  });

  it('truncates long hostnames', () => {
    const longUrl = 'https://very-long-subdomain.example.com';
    const result = getDisplayUrl(longUrl);
    expect(result.length).toBeLessThanOrEqual(20);
    expect(result).toContain('...');
  });

  it('handles plain hostnames for ICMP/DNS', () => {
    expect(getDisplayUrl('google.com')).toBe('google.com');
    expect(getDisplayUrl('8.8.8.8')).toBe('8.8.8.8');
  });

  it('handles hostnames with protocol prefix removal', () => {
    const result = getDisplayUrl('google.com/path');
    expect(result).toBe('google.com');
  });
});

describe('Monitor Type Validation', () => {
  const allowedTypes = ['http', 'icmp', 'dns', 'ssl'];

  function isValidType(type) {
    return allowedTypes.includes(type);
  }

  it('accepts valid monitor types', () => {
    expect(isValidType('http')).toBe(true);
    expect(isValidType('icmp')).toBe(true);
    expect(isValidType('dns')).toBe(true);
    expect(isValidType('ssl')).toBe(true);
  });

  it('rejects invalid monitor types', () => {
    expect(isValidType('tcp')).toBe(false);
    expect(isValidType('udp')).toBe(false);
    expect(isValidType('HTTP')).toBe(false);
    expect(isValidType('')).toBe(false);
    expect(isValidType(null)).toBe(false);
  });
});

describe('Uptime Calculation', () => {
  function calculateUptime(heartbeats) {
    if (!heartbeats || heartbeats.length === 0) return '0.00';
    const total = heartbeats.length;
    const up = heartbeats.filter(h => h.status === 'up').length;
    return ((up / total) * 100).toFixed(2);
  }

  it('returns 0.00 for empty heartbeats', () => {
    expect(calculateUptime([])).toBe('0.00');
    expect(calculateUptime(null)).toBe('0.00');
  });

  it('returns 100.00 for all up', () => {
    const heartbeats = [{ status: 'up' }, { status: 'up' }, { status: 'up' }];
    expect(calculateUptime(heartbeats)).toBe('100.00');
  });

  it('returns 0.00 for all down', () => {
    const heartbeats = [{ status: 'down' }, { status: 'down' }];
    expect(calculateUptime(heartbeats)).toBe('0.00');
  });

  it('calculates correct percentage', () => {
    const heartbeats = [
      { status: 'up' },
      { status: 'up' },
      { status: 'up' },
      { status: 'down' }
    ];
    expect(calculateUptime(heartbeats)).toBe('75.00');
  });

  it('handles mixed statuses', () => {
    const heartbeats = [
      { status: 'up' },
      { status: 'down' },
      { status: 'up' },
      { status: 'down' },
      { status: 'up' }
    ];
    expect(calculateUptime(heartbeats)).toBe('60.00');
  });
});

describe('Latency Statistics', () => {
  function calculateLatencyStats(heartbeats) {
    const latencies = heartbeats
      .filter(h => typeof h.latency === 'number')
      .map(h => h.latency);

    if (latencies.length === 0) {
      return { min: 0, max: 0, avg: 0, p95: 0 };
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);

    return {
      min: Math.min(...latencies),
      max: Math.max(...latencies),
      avg: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
      p95: sorted[p95Index] || sorted[sorted.length - 1]
    };
  }

  it('returns zeros for empty heartbeats', () => {
    const stats = calculateLatencyStats([]);
    expect(stats).toEqual({ min: 0, max: 0, avg: 0, p95: 0 });
  });

  it('calculates stats for single heartbeat', () => {
    const heartbeats = [{ latency: 100 }];
    const stats = calculateLatencyStats(heartbeats);
    expect(stats.min).toBe(100);
    expect(stats.max).toBe(100);
    expect(stats.avg).toBe(100);
    expect(stats.p95).toBe(100);
  });

  it('calculates correct min/max', () => {
    const heartbeats = [
      { latency: 50 },
      { latency: 150 },
      { latency: 100 },
      { latency: 200 },
      { latency: 75 }
    ];
    const stats = calculateLatencyStats(heartbeats);
    expect(stats.min).toBe(50);
    expect(stats.max).toBe(200);
  });

  it('calculates correct average', () => {
    const heartbeats = [
      { latency: 100 },
      { latency: 200 },
      { latency: 300 }
    ];
    const stats = calculateLatencyStats(heartbeats);
    expect(stats.avg).toBe(200);
  });

  it('filters out non-numeric latencies', () => {
    const heartbeats = [
      { latency: 100 },
      { latency: null },
      { latency: 200 },
      { latency: undefined },
      { latency: 300 }
    ];
    const stats = calculateLatencyStats(heartbeats);
    expect(stats.avg).toBe(200);
  });

  it('calculates p95 correctly', () => {
    const heartbeats = Array(20).fill(0).map((_, i) => ({ latency: (i + 1) * 10 }));
    const stats = calculateLatencyStats(heartbeats);
    expect(stats.p95).toBe(200);
  });
});

describe('SSL Days Remaining Classification', () => {
  function getSSLStatus(daysRemaining) {
    if (daysRemaining === null || daysRemaining === undefined) return 'unknown';
    if (daysRemaining <= 0) return 'expired';
    if (daysRemaining <= 7) return 'critical';
    if (daysRemaining <= 30) return 'warning';
    return 'valid';
  }

  it('returns unknown for null days', () => {
    expect(getSSLStatus(null)).toBe('unknown');
    expect(getSSLStatus(undefined)).toBe('unknown');
  });

  it('returns expired for 0 or negative days', () => {
    expect(getSSLStatus(0)).toBe('expired');
    expect(getSSLStatus(-10)).toBe('expired');
    expect(getSSLStatus(-365)).toBe('expired');
  });

  it('returns critical for 1-7 days', () => {
    expect(getSSLStatus(1)).toBe('critical');
    expect(getSSLStatus(5)).toBe('critical');
    expect(getSSLStatus(7)).toBe('critical');
  });

  it('returns warning for 8-30 days', () => {
    expect(getSSLStatus(8)).toBe('warning');
    expect(getSSLStatus(14)).toBe('warning');
    expect(getSSLStatus(30)).toBe('warning');
  });

  it('returns valid for >30 days', () => {
    expect(getSSLStatus(31)).toBe('valid');
    expect(getSSLStatus(90)).toBe('valid');
    expect(getSSLStatus(365)).toBe('valid');
  });
});
