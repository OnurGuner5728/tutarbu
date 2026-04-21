const { calculateAllMetrics } = require('../src/engine/metric-calculator');
const { generatePrediction } = require('../src/engine/prediction-generator');
const { fetchAllMatchData } = require('../src/services/data-fetcher');
const { getDynamicBaseline } = require('../src/engine/dynamic-baseline');
const api = require('../src/services/playwright-client');

async function test() {
  console.log('Testing metadata flow with REAL data...');
  // Match ID for a recent/valid match
  const matchId = '12385023'; 
  
  try {
    await api.initBrowser();
    const data = await fetchAllMatchData(matchId);
    const baseline = getDynamicBaseline(data);
    
    console.log('[DEBUG] Metrics Calculation Starting...');
    const metrics = calculateAllMetrics(data);
    
    console.log('[DEBUG] Prediction Generation Starting...');
    const report = generatePrediction(metrics, data, baseline, [], Math.random);
    
    console.log('\n--- METADATA PROOF ---');
    console.log('Calculation Time:', report.metadata.calculationTimeMs, 'ms');
    console.log('League Point Density (Density):', report.metadata.leaguePointDensity);
    console.log('League Goal Volatility (Volatility):', report.metadata.leagueGoalVolatility);
    console.log('----------------------\n');
    
    if (report.metadata.leaguePointDensity && report.metadata.leaguePointDensity !== 1.8) {
      console.log('SUCCESS: League Point Density is dynamic:', report.metadata.leaguePointDensity);
    } else {
      console.log('WARNING: League Point Density is using fallback or missing.');
    }

    if (report.metadata.leagueGoalVolatility && report.metadata.leagueGoalVolatility !== 0.6) {
      console.log('SUCCESS: League Goal Volatility is dynamic:', report.metadata.leagueGoalVolatility);
    } else {
      console.log('WARNING: League Goal Volatility is using fallback or missing.');
    }
    
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await api.close();
  }
}

test();
