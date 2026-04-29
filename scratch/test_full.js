const http = require('http');
const postData = JSON.stringify({});
const options = {
  hostname: '127.0.0.1', port: 3001,
  path: '/api/predict/15632632?debug=1',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
};
const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    try {
      const j = JSON.parse(body);
      const a = j._debug?.metricAudit;
      console.log('=== METRIC AUDIT ===');
      console.log('Total:', a?.totalMetrics, '| Computed:', a?.computedMetrics, '| Null:', a?.nullCount);
      console.log('Null Metrics:', JSON.stringify(a?.nullMetrics));

      // Check penalty & red card
      const prob = j.analysis?.probabilities;
      console.log('\n=== PENALTY & RED CARD ===');
      console.log('Penalty:', JSON.stringify(prob?.penaltyChance));
      console.log('RedCard:', JSON.stringify(prob?.redCardChance));

      // Check if prediction works
      console.log('\n=== PREDICTION ===');
      console.log('Home Win:', j.homeWinProbability, '| Draw:', j.drawProbability, '| Away:', j.awayWinProbability);
      console.log('Score:', j.homeExpectedGoals, '-', j.awayExpectedGoals);

      // HTTP Status
      console.log('\n=== HTTP ===');
      console.log('Status:', res.statusCode);
    } catch(e) {
      console.error('Parse error:', e.message);
      console.log('Body:', body.substring(0, 1000));
    }
  });
});
req.on('error', (e) => console.error('Request error:', e.message));
req.write(postData);
req.end();
