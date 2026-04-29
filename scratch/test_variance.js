const http = require('http');

// 5 farklı seed ile simülasyon çalıştırarak varyansı ölç
const seeds = ['abc', 'def', 'ghi', 'jkl', 'mno'];
const results = [];

function run(seed) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({});
    const req = http.request({
      hostname: '127.0.0.1', port: 3001,
      path: `/api/predict/15632632?seed=${seed}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        const j = JSON.parse(body);
        resolve({
          seed,
          poisson: j.poissonResult,
          sim: j.simulationResult,
          prediction: j.prediction,
        });
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

(async () => {
  // Sequential to not overload
  for (const seed of seeds) {
    const r = await run(seed);
    results.push(r);
    console.log(`Seed=${seed}: Poisson[H=${r.poisson.homeWin}% D=${r.poisson.draw}% A=${r.poisson.awayWin}% λH=${r.poisson.lambdaHome} λA=${r.poisson.lambdaAway}]`);
    console.log(`          Sim[H=${r.sim.homeWin}% D=${r.sim.draw}% A=${r.sim.awayWin}% avg=${r.sim.avgGoals}]`);
  }

  // Poisson variance (should be 0 — deterministic)
  const poissonHomeWins = results.map(r => r.poisson.homeWin);
  const poissonStdDev = Math.sqrt(poissonHomeWins.reduce((s, v) => {
    const mean = poissonHomeWins.reduce((a, b) => a + b, 0) / poissonHomeWins.length;
    return s + (v - mean) ** 2;
  }, 0) / poissonHomeWins.length);
  console.log(`\nPoisson HomeWin StdDev: ${poissonStdDev.toFixed(4)} (should be 0 — deterministic)`);

  // Simulation variance
  const simHomeWins = results.map(r => r.sim.homeWin);
  const simMean = simHomeWins.reduce((a, b) => a + b, 0) / simHomeWins.length;
  const simStdDev = Math.sqrt(simHomeWins.reduce((s, v) => s + (v - simMean) ** 2, 0) / simHomeWins.length);
  console.log(`Sim HomeWin StdDev: ${simStdDev.toFixed(4)} (acceptable: <3%)`);
  console.log(`Sim HomeWin Range: ${Math.min(...simHomeWins)}% - ${Math.max(...simHomeWins)}%`);

  const simAvgGoals = results.map(r => r.sim.avgGoals);
  const goalMean = simAvgGoals.reduce((a, b) => a + b, 0) / simAvgGoals.length;
  const goalStdDev = Math.sqrt(simAvgGoals.reduce((s, v) => s + (v - goalMean) ** 2, 0) / simAvgGoals.length);
  console.log(`Sim AvgGoals StdDev: ${goalStdDev.toFixed(4)}`);
  console.log(`Sim AvgGoals Range: ${Math.min(...simAvgGoals)} - ${Math.max(...simAvgGoals)}`);

  // Poisson score distribution
  console.log('\n=== POISSON TOP SCORES ===');
  const scores = results[0].poisson.scoreDistribution || results[0].prediction?.scores || [];
  if (scores.length > 0) {
    for (const s of scores.slice(0, 10)) {
      console.log(`  ${s.score}: ${s.probability}%`);
    }
  } else {
    console.log('  (score distribution not in response — check topScores)');
    console.log('  topScore:', results[0].poisson.topScore);
  }
})();
