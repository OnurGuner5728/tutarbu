const http = require('http');
const fs = require('fs');
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
    const j = JSON.parse(body);
    
    // === BEHAVIORAL BLOCKS ===
    const beh = j.behavioralAnalysis || {};
    console.log('=== BEHAVIORAL BLOCKS ===');
    const homeBlocks = beh.home || {};
    const awayBlocks = beh.away || {};
    for (const [k, v] of Object.entries(homeBlocks)) {
      const av = awayBlocks[k];
      console.log(`  ${k}: Home=${typeof v === 'number' ? v.toFixed(4) : v} | Away=${typeof av === 'number' ? av.toFixed(4) : av}`);
    }
    
    // === METRIC BY METRIC — Doğrudan response'tan çıkar ===
    // Result > Home/Away metrics are inside prediction engine flow
    // Lets check what keys are available in the top level
    console.log('\n=== RESPONSE KEYS ===');
    console.log(Object.keys(j));
    
    // Score
    console.log('\n=== SCORE ===');
    console.log(JSON.stringify(j.score));
    
    // Goals breakdown 
    console.log('\n=== GOALS DISTRIBUTION ===');
    console.log(JSON.stringify(j.goals));
    
    // Analysis
    console.log('\n=== ANALYSIS ===');
    console.log('Probabilities:', JSON.stringify(j.analysis?.probabilities));
    console.log('Hot Zones:', JSON.stringify(j.analysis?.hotZones));
    console.log('Market:', JSON.stringify(j.analysis?.marketIntelligence));
    
    // Comparison
    console.log('\n=== COMPARISON ===');
    const cmp = j.comparison || {};
    for (const [k, v] of Object.entries(cmp).slice(0, 15)) {
      console.log(`  ${k}: ${JSON.stringify(v)}`);
    }
    
    // Prediction
    console.log('\n=== PREDICTION ===');
    console.log(JSON.stringify(j.prediction));
    
    // Simulation
    console.log('\n=== SIMULATION ===');
    console.log(JSON.stringify(j.simulationResult));
    
    // Poisson 
    console.log('\n=== POISSON ===');
    console.log(JSON.stringify(j.poissonResult));
    
    // Result 
    console.log('\n=== RESULT ===');
    console.log(JSON.stringify(j.result));
    
    // First half
    console.log('\n=== FIRST HALF ===');
    console.log(JSON.stringify(j.firstHalf));
    
    // Corners/Cards
    console.log('\n=== CORNERS/CARDS ===');
    console.log('Corners:', JSON.stringify(j.corners));
    console.log('Cards:', JSON.stringify(j.cards));
    
    // Highlights
    console.log('\n=== HIGHLIGHTS (first 3) ===');
    const hl = j.highlights || [];
    for (const h of hl.slice(0, 3)) {
      console.log(`  - ${h}`);
    }
    
    // League baseline
    console.log('\n=== LEAGUE BASELINE ===');
    console.log(JSON.stringify(j.leagueBaseline));
    
    // Save everything
    fs.writeFileSync('scratch/full_live_data.json', JSON.stringify(j, null, 2));
    console.log('\n✅ ALL data saved to scratch/full_live_data.json');
  });
});
req.on('error', (e) => console.error(e.message));
req.write(postData);
req.end();
