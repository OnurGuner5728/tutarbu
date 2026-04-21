/**
 * FINAL ENGINE CHECK
 * Proves the logic of the refactored simulation engine directly (CLI).
 */
const { simulateMatch } = require('../src/engine/match-simulator');
const { getDynamicBaseline } = require('../src/engine/dynamic-baseline');

// 1. Setup Mock Data
const data = {
  standings: [
    { teamId: 1, goalsScored: 50, goalsConceded: 20, matchesPlayed: 20 },
    { teamId: 2, goalsScored: 30, goalsConceded: 40, matchesPlayed: 20 }
  ],
  homeTeamId: 1,
  awayTeamId: 2
};

const homeMetrics = { M011: 15, M013: 12 }; // Missing many metrics to trigger baseline
const awayMetrics = { M011: 10, M013: 8 };
const selectedMetrics = new Set(['M011', 'M013']);

const audit = { baselineTraces: [], simWarnings: [] };
const baseline = getDynamicBaseline(data);

console.log('🚀 MOTOR MANTIĞI DOĞRULANIYOR...\n');

// 2. Run Simulation
const res1 = simulateMatch({
  homeMetrics,
  awayMetrics,
  selectedMetrics,
  baseline,
  audit,
  runs: 1,
  rng: Math.random // Using standard random for first run
});

// 3. Check Traces
console.log('--- 1. KANIT: Baseline İzleri ---');
if (audit.baselineTraces.length > 0) {
  console.log('✅ BAŞARILI: Motor eksik verileri dinamik baseline ile doldurdu.');
  console.log('İz Sayısı:', audit.baselineTraces.length);
  console.log('Örnek İz:', audit.baselineTraces[0]);
} else {
  console.log('❌ HATA: İz bulunamadı!');
}

// 4. Check Determinism
console.log('\n--- 2. KANIT: Tohumlama (Seed) Doğruluğu ---');
const lcg = (s) => {
  let seed = s;
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
};

const runA = simulateMatch({
  homeMetrics, awayMetrics, selectedMetrics, baseline, audit: { baselineTraces: [] },
  runs: 1, rng: lcg(12345)
});
const runB = simulateMatch({
  homeMetrics, awayMetrics, selectedMetrics, baseline, audit: { baselineTraces: [] },
  runs: 1, rng: lcg(12345)
});

const scoreA = `${runA.result.homeGoals}-${runA.result.awayGoals}`;
const scoreB = `${runB.result.homeGoals}-${runB.result.awayGoals}`;
const eventsA = runA.events.map(e => e.type).join(',');
const eventsB = runB.events.map(e => e.type).join(',');

if (scoreA === scoreB && eventsA === eventsB) {
  console.log(`✅ BAŞARILI: Aynı seed birebir aynı skor (${scoreA}) ve olayları üretti.`);
} else {
  console.log(`❌ HATA: Seed çalışmıyor! A: ${scoreA}, B: ${scoreB}`);
}

console.log('\n💯 MANTIKSAL DOĞRULAMA TAMAMLANDI.');
