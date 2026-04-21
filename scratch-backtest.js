'use strict';

const api = require('./src/services/playwright-client');
const { fetchAllMatchData } = require('./src/services/data-fetcher');
const { calculateAllMetrics } = require('./src/engine/metric-calculator');
const { getDynamicBaseline } = require('./src/engine/dynamic-baseline');
const { generatePrediction } = require('./src/engine/prediction-generator');
const fs = require('fs');

async function runBacktest() {
  console.log('Initiating Backtest Script for 5 Matches...');
  await api.initBrowser();

  console.log(`Fetching yesterday's events (2026-04-14)...`);
  let validEvents = [];
  try {
    const data = await api.getScheduledEvents('2026-04-14');
    if (data && data.events) {
      const topTournaments = [17, 8, 23, 24, 35, 7, 34, 11, 238, 37]; // Added more top leagues
      validEvents = data.events
        .filter(e => e.status?.type === 'finished')
        .sort((a,b) => {
           const aTop = topTournaments.includes(a.tournament?.uniqueTournament?.id) ? 1 : 0;
           const bTop = topTournaments.includes(b.tournament?.uniqueTournament?.id) ? 1 : 0;
           return bTop - aTop;
        })
        .slice(0, 10);
    }
  } catch (err) {
    console.error('Could not fetch events list:', err.message);
  }

  if (validEvents.length === 0) {
    console.log('No finished events found for 2026-04-14, using fallback sample.');
    validEvents = [
      { id: 14023999, homeTeam: { name: 'Crystal Palace' }, awayTeam: { name: 'Newcastle United' }, homeScore: { current: 2 }, awayScore: { current: 1 } },
      { id: 14025024, homeTeam: { name: 'Man United' }, awayTeam: { name: 'Leeds' }, homeScore: { current: 2 }, awayScore: { current: 2 } }
    ];
  }

  const results = [];

  for (const ev of validEvents) {
    console.log(`\n======================================================`);
    console.log(`Analyzing: ${ev.homeTeam.name} vs ${ev.awayTeam.name} (ID: ${ev.id})`);
    
    try {
      const matchData = await fetchAllMatchData(ev.id);
      const metrics = calculateAllMetrics(matchData);
      const baseline = getDynamicBaseline(matchData);
      const report = generatePrediction(metrics, matchData, baseline, [], Math.random);
      
      const realResultStr = `${ev.homeScore?.current ?? '?'}-${ev.awayScore?.current ?? '?'}`;
      const meta = metrics.meta || {};
      const resObj = {
        Match: `${ev.homeTeam.name.slice(0,10)} vs ${ev.awayTeam.name.slice(0,10)}`,
        Actual: realResultStr,
        Pred: report.score?.predicted ?? 'N/A',
        WinProb: `${((report.prediction?.homeWinProbability || 0) + (report.prediction?.awayWinProbability || 0)) > 0 ? report.prediction.homeWinProbability.toFixed(0) + '/' + report.prediction.drawProbability.toFixed(0) + '/' + report.prediction.awayWinProbability.toFixed(0) : 'N/A'}%`,
        Conf: `${report.result?.confidence}%`,
        Source: report.result?.source || '-',
        Gap: `${meta.homeGap != null ? meta.homeGap : '?'}/${meta.awayGap != null ? meta.awayGap : '?'}`,
        Leg: meta.isCup ? `L${meta.leg || '?'}` : 'Lg',
        Target: `${meta.homeHasTarget ? 'H' : ''}${meta.awayHasTarget ? 'A' : ''}` || '-'
      };
      
      results.push(resObj);
    } catch (err) {
      console.error(`  [ERROR] Backtest Failed for ${ev.id}:`, err.message);
    }
  }

  console.log(`\n======================================================`);
  console.log(`BACKTEST SUMMARY:`);
  console.table(results);

  fs.writeFileSync('backtest_report_latest.json', JSON.stringify(results, null, 2));
  
  try {
     await new Promise(r => setTimeout(r, 1000));
     process.exit(0);
  } catch (ex) {
     process.exit(0);
  }
}

runBacktest();
