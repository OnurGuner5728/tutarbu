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
      // Top level keys
      console.log('Top keys:', Object.keys(j).join(', '));
      // Prediction object
      const pred = j.prediction || j;
      console.log('Pred keys:', Object.keys(pred).join(', '));
      console.log('homeWin:', pred.homeWin ?? pred.homeWinProbability ?? 'not found');
      console.log('Score:', (pred.homeGoals ?? pred.homeExpectedGoals ?? '?') + '-' + (pred.awayGoals ?? pred.awayExpectedGoals ?? '?'));
    } catch(e) {
      console.error(e.message);
    }
  });
});
req.on('error', (e) => console.error(e.message));
req.write(postData);
req.end();
