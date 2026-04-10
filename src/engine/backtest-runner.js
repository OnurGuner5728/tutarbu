/**
 * Backtest Runner
 * Fetches historical matches (finished), runs predictions, and compares outcomes.
 * Usage: node src/engine/backtest-runner.js <YYYY-MM-DD>
 */

const api = require('../services/playwright-client');
const { fetchAllMatchData } = require('../services/data-fetcher');
const { calculateAllMetrics } = require('./metric-calculator');
const { generatePrediction } = require('./prediction-generator');

async function runBacktest(date) {
  console.log(`\x1b[35m[Backtest] Starting backtest for date: ${date}\x1b[0m`);
  
  try {
    await api.initBrowser();
    
    // 1. Get matches
    const events = await api.getScheduledEvents(date);
    if (!events || !events.events) {
      console.error('[Backtest] No events found for this date.');
      return;
    }

    // 2. Filter for finished matches in top tournaments
    const finishedMatches = events.events.filter(e => 
      e.status.type === 'finished' && 
      e.tournament?.uniqueTournament?.id // Only pro/tracked leagues
    ).slice(0, 15); // Limit to top 15 for a performance/safety balance

    console.log(`[Backtest] Found ${finishedMatches.length} suitable finished matches.`);

    const results = [];
    let hits1X2 = 0;
    let hitsOU25 = 0;
    let hitsBTTS = 0;

    for (const match of finishedMatches) {
      const matchLabel = `${match.homeTeam.name} vs ${match.awayTeam.name}`;
      console.log(`\n\x1b[36m[Backtest] Processing: ${matchLabel} (ID: ${match.id})\x1b[0m`);
      
      try {
        // Fetch full data
        const fullData = await fetchAllMatchData(match.id);
        
        // Calculate metrics
        const metrics = calculateAllMetrics(fullData);
        
        // Generate prediction
        const report = generatePrediction(metrics, fullData);

        // Reality Check
        const realHS = match.homeScore.current;
        const realAS = match.awayScore.current;
        const realTotal = realHS + realAS;
        const realResult = realHS > realAS ? '1' : (realHS < realAS ? '2' : 'X');
        const realOU25 = realTotal > 2.5 ? 'Over' : 'Under';
        const realBTTS = (realHS > 0 && realAS > 0) ? 'Yes' : 'No';

        const predictedStr = report.result.mostLikelyResult; 
        let normalizedPredicted = 'X';
        if (predictedStr.startsWith('1')) normalizedPredicted = '1';
        if (predictedStr.startsWith('2')) normalizedPredicted = '2';
        
        const predictedOU25 = report.goals.over25 > 50 ? 'Over' : 'Under';
        const predictedBTTS = report.goals.btts > 50 ? 'Yes' : 'No';

        const hit1X2 = normalizedPredicted === realResult;
        const hitOU25 = predictedOU25 === realOU25;
        const hitBTTS = predictedBTTS === realBTTS;

        if (hit1X2) hits1X2++;
        if (hitOU25) hitsOU25++;
        if (hitBTTS) hitsBTTS++;

        console.log(`[Result] Actual: ${realHS}-${realAS} (${realResult}) | Predicted: ${report.result.homeWin}/${report.result.draw}/${report.result.awayWin} -> ${normalizedPredicted}`);
        console.log(`[Check] 1X2: ${hit1X2 ? '✅' : '❌'} | O/U 2.5: ${hitOU25 ? '✅' : '❌'} | BTTS: ${hitBTTS ? '✅' : '❌'}`);

        results.push({
          match: matchLabel,
          actual: `${realHS}-${realAS}`,
          predicted: report.score.predicted,
          hit1X2, hitOU25, hitBTTS
        });

      } catch (err) {
        console.error(`[Backtest] Error processing ${matchLabel}: ${err.message}`);
      }
    }

    // 3. Overall Report
    console.log('\n\x1b[32m' + '='.repeat(40));
    console.log('       BACKTEST SUMMARY (' + date + ')');
    console.log('='.repeat(40) + '\x1b[0m');
    console.log(`Total Matches: ${results.length}`);
    console.log(`1X2 Accuracy: ${((hits1X2 / results.length) * 100).toFixed(1)}% (${hits1X2}/${results.length})`);
    console.log(`O/U 2.5 Accuracy: ${((hitsOU25 / results.length) * 100).toFixed(1)}% (${hitsOU25}/${results.length})`);
    console.log(`BTTS Accuracy: ${((hitsBTTS / results.length) * 100).toFixed(1)}% (${hitsBTTS}/${results.length})`);
    console.log('\x1b[32m' + '='.repeat(40) + '\x1b[0m');

  } catch (err) {
    console.error(`[Backtest FATAL] ${err.message}`);
  } finally {
    await api.closeBrowser();
  }
}

// Get date from args or default to yesterday
const targetDate = process.argv[2] || new Date(Date.now() - 86400000).toISOString().split('T')[0];
runBacktest(targetDate);
