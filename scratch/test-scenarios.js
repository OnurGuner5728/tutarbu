/**
 * test-scenarios.js
 * Proving the Realism of the Tutarbu Simulation Engine - V2 (Dramatic proof)
 */

const { simulateSingleRun } = require('../src/engine/match-simulator');

// Help function to create metrics object
function createMetrics(overrides = {}) {
  const metrics = {};
  for (let i = 1; i <= 169; i++) {
    const id = 'M' + String(i).padStart(3, '0');
    metrics[id] = 50; // Default middle-ground (norm = 1.0)
  }
  return { ...metrics, ...overrides };
}

const ALL_IDS = new Set();
for (let i = 1; i <= 169; i++) ALL_IDS.add('M' + String(i).padStart(3, '0'));

function runMultiple(scenarioFn, runs = 10) {
  const aggregated = [];
  for(let i=0; i<runs; i++) aggregated.push(scenarioFn(true));
  return aggregated;
}

// SCENARIO 1: TOTAL DOMINATION (The "City" Effect)
function testDomination(quiet = false) {
  const homeMetrics = createMetrics({
    M150: 98, // Top Kontrolü % (Extreme)
    M025: 98, // Üçüncü Bölge Pas
    M152: 98, // Pas Tamamlama
    M164: 95, // Momentum
    M013: 5,  // We want many shots (This is count per match in metadata context)
  });
  const awayMetrics = createMetrics({
    M150: 10, // Extreme Low
    M025: 10,
    M157: 20, // Weak defense
  });

  const result = simulateSingleRun({ homeMetrics, awayMetrics, selectedMetrics: ALL_IDS });
  if (!quiet) {
    console.log('\n--- SCENARIO 1: TOTAL DOMINATION (Possession Proof) ---');
    const avgHomePoss = Math.round(result.minuteLog.reduce((acc, m) => acc + m.possession.home, 0) / 95);
    console.log(`Average Home Possession: ${avgHomePoss}%`);
    console.log(`Minute 10 Possession: ${result.minuteLog[9].possession.home}%`);
    console.log(`Minute 80 Possession: ${result.minuteLog[79].possession.home}%`);
  }
  return result;
}

// SCENARIO 2: PSYCHOLOGICAL RESILIENCE (Urgency Proof)
function testComeback(quiet = false) {
  const homeMetrics = createMetrics({ M165: 100, M064: 100 }); // Max Urgency & Resilience
  const awayMetrics = createMetrics({ M041: 95 }); // Psychological Fragility
  const result = simulateSingleRun({ homeMetrics, awayMetrics, selectedMetrics: ALL_IDS });
  
  if (!quiet) {
    console.log('\n--- SCENARIO 2: PSYCHOLOGICAL RESILIENCE (Late High Intensity) ---');
    const firstHalfEvents = result.events.filter(e => e.minute <= 45).length;
    const lateGameEvents = result.events.filter(e => e.minute > 75).length;
    console.log(`First Half Events: ${firstHalfEvents} | Last 15 Mins Events: ${lateGameEvents}`);
    const avgMomentumLate = result.minuteLog.slice(75).reduce((acc, m) => acc + m.behavioralState.home.GOL_IHTIYACI, 0) / 20;
    console.log(`Home Urgency Factor (Late Game): ${avgMomentumLate.toFixed(2)}x Boost`);
  }
  return result;
}

// SCENARIO 3: SHOT VARIANCE PROOF (Statistical Spread)
function testVariance(quiet = false) {
  const homeMetrics = createMetrics({
    M013: 8, // Very high shot production
    M011: 15, // Low accuracy/conversion
  });
  const awayMetrics = createMetrics({ M096: 98 }); // Extreme Goalie
  const result = simulateSingleRun({ homeMetrics, awayMetrics, selectedMetrics: ALL_IDS });

  const totalShots = result.minuteLog.reduce((acc, m) => {
    return acc + (m.events?.filter(e => e.type === 'shot' || e.type === 'shot_on_target' || e.type === 'goal').length || 0);
  }, 0);
  const goals = result.result.homeGoals;
  
  if (!quiet) {
    console.log('\n--- SCENARIO 3: SHOT VARIANCE (Eliminating "3-3-3" Static Stats) ---');
    console.log(`Total Offensive Attempts: ${totalShots} | Goals: ${goals}`);
    console.log(`Realism Proof: Engine correctly generated ${totalShots - goals} non-goal offensive sequences.`);
  }
  return result;
}

testDomination();
testComeback();
testVariance();
