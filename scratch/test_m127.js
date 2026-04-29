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
      // Manager events
      const hmgr = j._rawData?.homeManagerLastEvents;
      const amgr = j._rawData?.awayManagerLastEvents;
      console.log('Home Mgr Events:', hmgr?.events?.length ?? 'null');
      console.log('Away Mgr Events:', amgr?.events?.length ?? 'null');
      // H2H managerDuel
      const md = j._rawData?.h2h?.managerDuel;
      console.log('Manager Duel:', JSON.stringify(md));
      // M127 value
      console.log('M127:', j._debug?.allMetrics?.M127 ?? 'from metricAudit');
      // Null audit
      const a = j._debug?.metricAudit;
      console.log('Null:', a?.nullCount, a?.nullMetrics);
    } catch(e) {
      console.error(e.message);
      console.log(body.substring(0,500));
    }
  });
});
req.on('error', (e) => console.error(e.message));
req.write(postData);
req.end();
