/**
 * Backtest Runner
 * Fetches historical matches (finished), runs predictions, and compares outcomes.
 * Usage: node src/engine/backtest-runner.js <YYYY-MM-DD>
 */

const api = require('../services/playwright-client');
const { fetchAllMatchData } = require('../services/data-fetcher');
const { calculateAllMetrics } = require('./metric-calculator');
const { generatePrediction } = require('./prediction-generator');
const { getDynamicBaseline } = require('./dynamic-baseline');

// Top 5 ligi + önemli turnuvalar için filtreleme (opsiyonel)
const TOP_TOURNAMENT_IDS = new Set([
  17,   // Premier League
  8,    // La Liga
  23,   // Serie A
  35,   // Bundesliga
  34,   // Ligue 1
  7,    // Champions League
  679,  // Europa League
  52,   // Süper Lig
  325,  // Eredivisie
  37,   // Primeira Liga
]);

async function runBacktest(date, matchLimit = 10) {
  console.log(`\x1b[35m[Backtest] Starting backtest for date: ${date} (limit: ${matchLimit})\x1b[0m`);

  try {
    await api.initBrowser();

    // 1. Get matches — tek günde yeterli yoksa geriye doğru gez
    let collected = [];
    let cursor = date;
    const MAX_DAYS_BACK = 14;
    for (let d = 0; d < MAX_DAYS_BACK && collected.length < matchLimit; d++) {
      const events = await api.getScheduledEvents(cursor);
      if (events?.events?.length) {
        let dayFinished = events.events.filter(e =>
          e.status.type === 'finished' &&
          e.tournament?.uniqueTournament?.id &&
          TOP_TOURNAMENT_IDS.has(e.tournament.uniqueTournament.id)
        );
        if (dayFinished.length === 0) {
          dayFinished = events.events.filter(e =>
            e.status.type === 'finished' && e.tournament?.uniqueTournament?.id
          );
        }
        collected.push(...dayFinished);
        console.log(`[Backtest] ${cursor}: +${dayFinished.length} (toplam ${collected.length})`);
      }
      if (collected.length >= matchLimit) break;
      // Bir gün geri kay
      const prev = new Date(cursor);
      prev.setDate(prev.getDate() - 1);
      cursor = prev.toISOString().split('T')[0];
    }

    const finishedMatches = collected.slice(0, matchLimit);
    console.log(`[Backtest] Processing ${finishedMatches.length} matches.`);

    const results = [];
    let hits1X2 = 0;
    let hitsOU25 = 0;
    let hitsBTTS = 0;
    let hitsScore = 0;

    const INTER_MATCH_DELAY_MS = 5000; // 5s maçlar arası — rate limit / IP ban önlemi

    for (let mi = 0; mi < finishedMatches.length; mi++) {
      const match = finishedMatches[mi];
      if (mi > 0) {
        console.log(`\x1b[90m[Backtest] Waiting ${INTER_MATCH_DELAY_MS / 1000}s before next match...\x1b[0m`);
        await new Promise(r => setTimeout(r, INTER_MATCH_DELAY_MS));
      }
      const matchLabel = `${match.homeTeam.name} vs ${match.awayTeam.name}`;
      console.log(`\n\x1b[36m[Backtest] Processing (${mi + 1}/${finishedMatches.length}): ${matchLabel} (ID: ${match.id})\x1b[0m`);
      
      try {
        // Fetch full data
        const fullData = await fetchAllMatchData(match.id);
        
        // Calculate metrics
        const metrics = calculateAllMetrics(fullData);
        
        // Calculate dynamic baseline
        const baseline = getDynamicBaseline(fullData);
        
        // Generate prediction (with baseline and audit)
        const report = generatePrediction(metrics, fullData, baseline, [], Math.random);

        // Reality Check
        const realHS = match.homeScore.current;
        const realAS = match.awayScore.current;
        const realTotal = realHS + realAS;
        const realResult = realHS > realAS ? '1' : (realHS < realAS ? '2' : 'X');
        const realOU25 = realTotal > 2.5 ? 'Over' : 'Under';
        const realBTTS = (realHS > 0 && realAS > 0) ? 'Yes' : 'No';

        // Predicted result — use simulation distribution overrides
        const simDist = report.simulationInsights?.distribution || {};
        const pHome = parseFloat(simDist.homeWin) || report.result.homeWin || 0;
        const pDraw = parseFloat(simDist.draw) || report.result.draw || 0; 
        const pAway = parseFloat(simDist.awayWin) || report.result.awayWin || 0;
        
        let normalizedPredicted = 'X';
        if (pHome >= pDraw && pHome >= pAway) normalizedPredicted = '1';
        else if (pAway >= pDraw && pAway >= pHome) normalizedPredicted = '2';
        
        const pOU25 = parseFloat(simDist.over25) || report.goals?.over25 || 0;
        const predictedOU25 = pOU25 > 50 ? 'Over' : 'Under';
        
        const pBTTS = parseFloat(simDist.btts) || report.goals?.btts || 0;
        const predictedBTTS = pBTTS > 50 ? 'Yes' : 'No';

        const predictedScore = report.score?.predicted || 'N/A';

        const hit1X2 = normalizedPredicted === realResult;
        const hitOU25 = predictedOU25 === realOU25;
        const hitBTTS = predictedBTTS === realBTTS;
        const hitScore = predictedScore === `${realHS}-${realAS}`;

        if (hit1X2) hits1X2++;
        if (hitOU25) hitsOU25++;
        if (hitBTTS) hitsBTTS++;
        if (hitScore) hitsScore++;

        console.log(`[Result] Actual: ${realHS}-${realAS} (${realResult}) | Predicted: ${pHome.toFixed(1)}/${pDraw.toFixed(1)}/${pAway.toFixed(1)} -> ${normalizedPredicted}`);
        console.log(`[Score]  Predicted Score: ${predictedScore} | O/U2.5: ${pOU25.toFixed(1)}% -> ${predictedOU25} | BTTS: ${pBTTS.toFixed(1)}% -> ${predictedBTTS}`);
        console.log(`[Check]  1X2: ${hit1X2 ? '✅' : '❌'} | O/U 2.5: ${hitOU25 ? '✅' : '❌'} | BTTS: ${hitBTTS ? '✅' : '❌'} | Skor: ${hitScore ? '✅' : '❌'}`);

        results.push({
          match: matchLabel,
          tournament: match.tournament?.name || '',
          actual: `${realHS}-${realAS}`,
          actualResult: realResult,
          actualOU25: realOU25,
          actualBTTS: realBTTS,
          predicted: predictedScore,
          predictedResult: normalizedPredicted,
          predictedOU25,
          predictedBTTS,
          probHome: pHome,
          probDraw: pDraw,
          probAway: pAway,
          probOU25: pOU25,
          probBTTS: pBTTS,
          hit1X2, hitOU25, hitBTTS, hitScore,
          confidence: report.result?.confidence || 0,
          avgGoals: simDist.avgGoals || 0,
        });

      } catch (err) {
        console.error(`[Backtest] Error processing ${matchLabel}: ${err.message}`);
      }
    }

    // 3. Overall Report
    const total = results.length;
    if (total === 0) {
      console.log('\n[Backtest] No matches processed successfully.');
      return;
    }

    console.log('\n\x1b[32m' + '═'.repeat(60));
    console.log('          BACKTEST SUMMARY (' + date + ')');
    console.log('═'.repeat(60) + '\x1b[0m');
    console.log(`Total Matches Analyzed: ${total}`);
    console.log(`─────────────────────────────────────────`);
    console.log(`1X2 Accuracy:   ${((hits1X2 / total) * 100).toFixed(1)}% (${hits1X2}/${total})`);
    console.log(`O/U 2.5 Acc:    ${((hitsOU25 / total) * 100).toFixed(1)}% (${hitsOU25}/${total})`);
    console.log(`BTTS Accuracy:  ${((hitsBTTS / total) * 100).toFixed(1)}% (${hitsBTTS}/${total})`);
    console.log(`Exact Score:    ${((hitsScore / total) * 100).toFixed(1)}% (${hitsScore}/${total})`);
    console.log('─────────────────────────────────────────');

    // Detailed results table
    console.log('\n\x1b[33m--- DETAILED RESULTS ---\x1b[0m');
    for (const r of results) {
      const flags = [
        r.hit1X2 ? '✅1X2' : '❌1X2',
        r.hitOU25 ? '✅O/U' : '❌O/U',
        r.hitBTTS ? '✅BTTS' : '❌BTTS',
      ].join(' ');
      console.log(`  ${r.match.padEnd(45)} | ${r.actual} vs ${r.predicted.padEnd(5)} | ${flags}`);
    }

    console.log('\x1b[32m' + '═'.repeat(60) + '\x1b[0m');

    // Export results as JSON for artifact
    const fs = require('fs');
    const outputPath = `backtest_${date}.json`;
    fs.writeFileSync(outputPath, JSON.stringify({ date, summary: { total, hits1X2, hitsOU25, hitsBTTS, hitsScore }, results }, null, 2), 'utf-8');
    console.log(`[Backtest] Results saved to ${outputPath}`);

  } catch (err) {
    console.error(`[Backtest FATAL] ${err.message}`);
  } finally {
    await api.closeBrowser();
  }
}

// Get date and match count from args
const targetDate = process.argv[2] || new Date(Date.now() - 86400000).toISOString().split('T')[0];
const matchLimit = parseInt(process.argv[3], 10) || 10;
runBacktest(targetDate, matchLimit);
