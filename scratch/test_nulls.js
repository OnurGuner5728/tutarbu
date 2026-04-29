const http = require('http');

const postData = JSON.stringify({});
const options = {
  hostname: '127.0.0.1',
  port: 3001,
  path: '/api/predict/15632632?debug=1',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
  },
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    try {
      const j = JSON.parse(body);
      const audit = j._debug?.metricAudit;
      console.log('=== METRIC AUDIT ===');
      console.log('Total:', audit?.totalMetrics);
      console.log('Computed:', audit?.computedMetrics);
      console.log('Null Count:', audit?.nullCount);
      console.log('Null Metrics:', JSON.stringify(audit?.nullMetrics));
    } catch (e) {
      console.error('Parse error:', e.message);
      console.log('Body (first 500):', body.substring(0, 500));
    }
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});

req.write(postData);
req.end();
