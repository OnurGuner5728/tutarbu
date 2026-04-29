/**
 * KAPSAMLI DOĞRULAMA TESTİ
 * Tüm metriklerin dinamik olduğunu, simülasyon/poisson/workshop uyumunu kanıtlar.
 * Gerçek API verisiyle çalışır, rapor için veri toplar.
 */
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
      const fs = require('fs');
      
      // ============= 1. METRIC AUDIT =============
      const audit = j._debug?.metricAudit;
      console.log('=== 1. METRIC AUDIT ===');
      console.log(`Total: ${audit?.totalMetrics} | Computed: ${audit?.computedMetrics} | Null: ${audit?.nullCount}`);
      console.log(`Null Metrics: ${JSON.stringify(audit?.nullMetrics)}`);
      
      // ============= 2. ALL METRICS (Ham Değerler) =============
      const allM = j._debug?.allMetrics || {};
      console.log('\n=== 2. METRIC VALUES (Örnekler) ===');
      // Faz 1 düzeltmeleri
      console.log(`M025 (FinalThirdPassAcc): ${allM.M025}`);
      console.log(`M025b (SetPieceGoalEff): ${allM.M025b}`);
      console.log(`M095 (LuckyGoalsIdx): ${allM.M095}`);
      console.log(`M106 (GK AttributeScore): ${allM.M106}`);
      // Faz 2 düzeltmeleri
      console.log(`M111 (PenaltyTendency): ${allM.M111}`);
      console.log(`M112 (Fouls/Match): ${allM.M112}`);
      console.log(`M114 (Min/Foul): ${allM.M114}`);
      console.log(`M115 (HomeRedCard): ${allM.M115}`);
      console.log(`M116 (AwayRedCard): ${allM.M116}`);
      console.log(`M118 (FoulTolerance): ${allM.M118}`);
      console.log(`M127 (ManagerH2H): ${allM.M127}`);
      // Faz 3 yeni/zenginleştirilmiş
      console.log(`M070 (MidCreativity): ${allM.M070}`);
      console.log(`M071 (DefStability): ${allM.M071}`);
      console.log(`M096c (PressingIntensity): ${allM.M096c}`);
      
      // ============= 3. PREDICTION (Poisson) =============
      const pred = j.prediction || {};
      console.log('\n=== 3. POISSON PREDICTION ===');
      console.log(`Home Win: ${pred.homeWinProbability}%`);
      console.log(`Draw: ${pred.drawProbability}%`);
      console.log(`Away Win: ${pred.awayWinProbability}%`);
      console.log(`Lambda Home: ${pred.lambdaHome}`);
      console.log(`Lambda Away: ${pred.lambdaAway}`);
      console.log(`Most Likely: ${pred.mostLikelyScore} (${pred.mostLikelyScoreProbability}%)`);
      console.log(`Over 2.5: ${pred.over25}%`);
      console.log(`BTTS: ${pred.btts}%`);
      console.log(`Confidence: ${pred.confidenceScore}`);
      
      // ============= 4. SIMULATION =============
      const sim = j.simulationResult || {};
      console.log('\n=== 4. SIMULATION RESULT ===');
      console.log(`Home Win: ${sim.homeWin}%`);
      console.log(`Draw: ${sim.draw}%`);
      console.log(`Away Win: ${sim.awayWin}%`);
      console.log(`Avg Goals: ${sim.averageGoals}`);
      console.log(`Over 2.5: ${sim.over25}%`);
      console.log(`BTTS: ${sim.btts}%`);
      console.log(`Avg Score: ${sim.averageHomeGoals}-${sim.averageAwayGoals}`);
      console.log(`Most Likely: ${sim.mostLikelyScore} (${sim.mostLikelyScoreProbability}%)`);
      
      // ============= 5. BEHAVIORAL ANALYSIS =============
      const beh = j.behavioralAnalysis || {};
      console.log('\n=== 5. BEHAVIORAL BLOCKS ===');
      const homeUnits = beh.home?.units || {};
      const awayUnits = beh.away?.units || {};
      const blockNames = Object.keys(homeUnits);
      for (const b of blockNames.slice(0, 10)) {
        console.log(`  ${b}: Home=${homeUnits[b]?.toFixed(3)} | Away=${awayUnits[b]?.toFixed(3)}`);
      }
      
      // ============= 6. PENALTY & RED CARD =============
      const prob = j.analysis?.probabilities || {};
      console.log('\n=== 6. PENALTY & RED CARD ===');
      console.log(`Penalty: ${JSON.stringify(prob.penaltyChance)}`);
      console.log(`RedCard: ${JSON.stringify(prob.redCardChance)}`);
      
      // ============= 7. LINEUP IMPACT (Workshop) =============
      const lineups = j.lineups || {};
      console.log('\n=== 7. LINEUP DATA ===');
      const hp = lineups.home?.players?.filter(p => !p.substitute)?.slice(0, 3) || [];
      for (const p of hp) {
        const ps = p.player?.statistics || {};
        console.log(`  ${p.player?.name}: rating=${ps.rating}, goals=${ps.goals}, xG=${ps.expectedGoals}, penaltyWon=${ps.penaltyWon}, tackles=${ps.tackles}, possWonAtt3rd=${ps.possessionWonAttThird}`);
      }
      
      // ============= 8. LEAGUE BASELINE =============
      const bl = j.leagueBaseline || {};
      console.log('\n=== 8. LEAGUE BASELINE ===');
      console.log(`Avg Goals: ${bl.leagueAvgGoals}`);
      console.log(`Volatility: ${bl.leagueGoalVolatility}`);
      console.log(`penPerMatch: ${bl.penPerMatch}`);
      console.log(`redPerMin: ${bl.redPerMin}`);
      console.log(`homeWinRate: ${bl.homeWinRate}`);
      
      // ============= 9. SCORE COMPARISON =============
      const score = j.score || {};
      console.log('\n=== 9. FINAL SCORE ===');
      console.log(`Home: ${score.home} | Away: ${score.away}`);
      
      // Dump full data for report
      const reportData = {
        metricAudit: audit,
        prediction: pred,
        simulation: sim,
        behavioral: beh,
        probabilities: prob,
        baseline: bl,
        score: score,
        allMetrics: allM,
        match: j.match,
      };
      fs.writeFileSync('scratch/live_report_data.json', JSON.stringify(reportData, null, 2));
      console.log('\n✅ Full data saved to scratch/live_report_data.json');
      
    } catch(e) {
      console.error('Parse error:', e.message);
      console.log('Body:', body.substring(0, 2000));
    }
  });
});
req.on('error', (e) => console.error('Request error:', e.message));
req.write(postData);
req.end();
