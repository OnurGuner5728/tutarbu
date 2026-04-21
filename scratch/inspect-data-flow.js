'use strict';

const api = require('../src/services/playwright-client');
const { fetchAllMatchData } = require('../src/services/data-fetcher');
const { calculateAllMetrics } = require('../src/engine/metric-calculator');
const { getDynamicBaseline } = require('../src/engine/dynamic-baseline');
const { generatePrediction } = require('../src/engine/prediction-generator');

async function inspectMatchFlow(matchId) {
  console.log(`[INSPECTION] Starting Data Flow Audit for Match ID: ${matchId}`);
  await api.initBrowser();

  // 1. RAW DATA FETCH
  const data = await fetchAllMatchData(matchId);
  console.log(`\n--- 1. API DATA FETCHED ---`);
  console.log(`Match: ${data.event?.event?.homeTeam?.name} vs ${data.event?.event?.awayTeam?.name}`);
  console.log(`Standings Rows: ${data.standingsTotal?.standings?.[0]?.rows?.length || 0}`);
  console.log(`Season Stats Found: ${data.homeTeamSeasonStats ? 'Yes' : 'No'}`);
  console.log(`Recent Match Details: ${data.homeRecentMatchDetails?.length || 0} matches`);

  // 2. METRIC CALCULATION
  const metrics = calculateAllMetrics(data);
  console.log(`\n--- 2. METRIC CALCULATION (SAMPLE) ---`);
  console.log(`M001 (League Goals/Match): ${metrics.dynamicLeagueAvgs.M001}`);
  console.log(`M172 (Home Importance): ${metrics.shared.contextual.M172} (Gap: ${metrics.meta.homeGap})`);
  console.log(`M170 (Match Intensity): ${metrics.shared.contextual.M170}`);

  // 3. DYNAMIC PHYSICS CALIBRATION
  console.log(`\n--- 3. DYNAMIC PHYSICS CALIBRATION ---`);
  console.log(`League Point Density: ${metrics.meta.leaguePointDensity || '?'}`);
  console.log(`League Goal Volatility: ${metrics.meta.leagueGoalVolatility || '?'}`);

  // 4. PREDICTION GENERATION
  const baseline = getDynamicBaseline(data);
  const report = generatePrediction(metrics, data, baseline, [], Math.random);
  
  console.log(`\n--- 4. FINAL PREDICTION & BLENDING ---`);
  console.log(`Poisson WinProb: ${report.prediction.homeWinProbability}% / ${report.prediction.drawProbability}% / ${report.prediction.awayWinProbability}%`);
  console.log(`Sim WinProb: ${report.result.homeWin}% / ${report.result.draw}% / ${report.result.awayWin}% (Hybrid)`);
  console.log(`Confidence Score: ${report.result.confidence}%`);
  console.log(`Logic Source: ${report.result.source}`);

  await api.closeBrowser();
  process.exit(0);
}

// Inspect a known big match (e.g. Atletico vs Barcelona ID 15632089 or similar)
const targetId = process.argv[2] || 15632089;
inspectMatchFlow(targetId);
