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
    // Find where metrics live
    const dbg = j._debug || {};
    console.log('_debug keys:', Object.keys(dbg));
    
    // Check home metrics
    const homeAtk = dbg.homeMetrics?.attack || {};
    const homeDef = dbg.homeMetrics?.defense || {};
    const homePlayer = dbg.homeMetrics?.player || {};
    const sharedRef = dbg.sharedMetrics?.referee || {};
    const sharedCtx = dbg.sharedMetrics?.contextual || {};
    const homeGk = dbg.homeMetrics?.goalkeeper || {};
    const sharedH2h = dbg.sharedMetrics?.h2h || {};
    
    console.log('\n--- HOME ATTACK (sample) ---');
    console.log('M001:', homeAtk.M001, '| M019:', homeAtk.M019, '| M025:', homeAtk.M025);
    
    console.log('\n--- HOME DEFENSE (sample) ---');
    console.log('M026:', homeDef.M026, '| M040:', homeDef.M040, '| M037:', homeDef.M037);
    
    console.log('\n--- HOME PLAYER (sample) ---');
    console.log('M066:', homePlayer.M066, '| M070:', homePlayer.M070, '| M071:', homePlayer.M071, '| M096c:', homePlayer.M096c);
    
    console.log('\n--- HOME GK ---');
    console.log('M106:', homeGk.M106);
    
    console.log('\n--- REFEREE ---');
    console.log('M111:', sharedRef.M111, '| M112:', sharedRef.M112, '| M114:', sharedRef.M114);
    console.log('M115:', sharedRef.M115, '| M116:', sharedRef.M116, '| M118:', sharedRef.M118);
    
    console.log('\n--- H2H ---');
    console.log('M127:', sharedH2h.M127);
    
    console.log('\n--- BEHAVIORAL ---');
    const beh = j.behavioralAnalysis || {};
    const hu = beh.home?.units || {};
    const au = beh.away?.units || {};
    console.log('Home BITIRICILIK:', hu.BITIRICILIK);
    console.log('Home YARATICILIK:', hu.YARATICILIK);
    console.log('Home SAVUNMA_DIRENCI:', hu.SAVUNMA_DIRENCI);
    console.log('Home TAKTIKSEL_UYUM:', hu.TAKTIKSEL_UYUM);
    console.log('Away BITIRICILIK:', au.BITIRICILIK);
    
    console.log('\n--- SIM RESULT ---');
    const sim = j.simulationResult || {};
    console.log('Sim:', JSON.stringify(sim));
    
    console.log('\n--- POISSON ---');
    const poi = j.poissonResult || {};
    console.log('Poisson:', JSON.stringify(poi));
    
    // Save full debug for report
    const report = {
      metricAudit: dbg.metricAudit,
      homeAttack: homeAtk,
      homeDefense: homeDef,
      homePlayer: homePlayer,
      homeGk: homeGk,
      awayAttack: dbg.awayMetrics?.attack || {},
      awayDefense: dbg.awayMetrics?.defense || {},
      awayPlayer: dbg.awayMetrics?.player || {},
      awayGk: dbg.awayMetrics?.goalkeeper || {},
      referee: sharedRef,
      contextual: sharedCtx,
      h2h: sharedH2h,
      behavioral: beh,
      prediction: j.prediction,
      simulation: sim,
      poisson: poi,
      baseline: j.leagueBaseline,
      probabilities: j.analysis?.probabilities,
      match: j.match,
      score: j.score,
      lineups: {
        homeCount: j.lineups?.home?.players?.length,
        awayCount: j.lineups?.away?.players?.length,
      },
    };
    fs.writeFileSync('scratch/full_report_data.json', JSON.stringify(report, null, 2));
    console.log('\n✅ Full report data saved');
  });
});
req.on('error', (e) => console.error(e.message));
req.write(postData);
req.end();
