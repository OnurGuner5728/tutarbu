'use strict';

const { fetchAllMatchData } = require('./src/services/data-fetcher');
const { calculateAllMetrics } = require('./src/engine/metric-calculator');
const { generatePrediction } = require('./src/engine/prediction-generator');
const { getDynamicBaseline } = require('./src/engine/dynamic-baseline');

async function run() {
  const eventId = 14025024; // M. United vs Leeds
  console.log(`Starting simulation test for ${eventId}`);
  const data = await fetchAllMatchData(eventId);
  const metrics = calculateAllMetrics(data);
  const baseline = getDynamicBaseline(data);

  const report = generatePrediction(metrics, data, baseline, [], Math.random);
  console.log('Result:', report.result.mostLikelyResult);
  console.log('Projected Score:', report.score.predicted);
  console.log('--- Monte Carlo Sim Results ---');
  console.log('Average Goals (lambdaHome vs lambdaAway):', report.prediction.lambdaHome, 'vs', report.prediction.lambdaAway);
  console.log('Over/Under 2.5:', report.prediction.over25, 'vs', 100 - report.prediction.over25);
  console.log('BTTS:', report.prediction.btts);
}

run().catch(console.error);
