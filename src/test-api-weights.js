const http = require('http');

const eventId = process.argv[2] || '15632632';

const opts = {
  hostname: '127.0.0.1', port: 3001,
  path: `/api/predict/${eventId}?debug=1`,
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
};

const req = http.request(opts, res => {
  let d = '';
  res.on('data', c => d += c);
  res.on('end', () => {
    const j = JSON.parse(d);

    const b = j._debug?.baseline || j.prediction?._debug?.baseline || {};
    const hw = b.homeDynamicBlockWeights;
    const aw = b.awayDynamicBlockWeights;
    const home = j.match?.homeTeam?.name || j.homeTeamName || '?';
    const away = j.match?.awayTeam?.name || j.awayTeamName || '?';

    console.log('\n' + home + ' vs ' + away);

    const printWeights = (label, w) => {
      if (!w) { console.log(label + ': YOK'); return; }
      console.log('\n=== ' + label + ' ===');
      console.log('Blok'.padEnd(22) + 'G'.padStart(8) + 'D'.padStart(8) + 'M'.padStart(8) + 'F'.padStart(8));
      console.log('-'.repeat(54));
      for (const [k, v] of Object.entries(w)) {
        const wt = v.weights;
        console.log(
          k.padEnd(22) +
          ((wt.G * 100).toFixed(1) + '%').padStart(8) +
          ((wt.D * 100).toFixed(1) + '%').padStart(8) +
          ((wt.M * 100).toFixed(1) + '%').padStart(8) +
          ((wt.F * 100).toFixed(1) + '%').padStart(8)
        );
      }
    };

    printWeights('HOME', hw);
    printWeights('AWAY', aw);

    if (!hw && !aw) {
      console.log('\nDebug keys:', Object.keys(b).join(', '));
      console.log('Top keys:', Object.keys(j).join(', '));
    }
    console.log('');
  });
});
req.write('{}');
req.end();
