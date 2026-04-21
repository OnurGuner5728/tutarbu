const { calculateAllMetrics } = require('./src/engine/metric-calculator');

// Mock data
const mockData = {
  eventId: 123,
  event: { event: { homeTeam: { name: 'Home' }, awayTeam: { name: 'Away' } } },
  lineups: { isFallback: true },
  _apiLog: [
    { endpoint: 'lineups', status: 'fulfilled', success: true, elapsedMs: 150, isCritical: true },
    { endpoint: 'weather', status: 'rejected', success: false, elapsedMs: 50, isCritical: false }
  ]
};

try {
  const metrics = calculateAllMetrics(mockData);
  console.log('--- METRIC AUDIT PREVIEW ---');
  console.log(JSON.stringify(metrics.metricAudit, null, 2));
  console.log('--- SUCCESS ---');
} catch (e) {
  console.error('FAILED:', e.message);
}
