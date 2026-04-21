'use strict';
/**
 * Hızlı örneklem backtest — 20-30 maç, 1X2 doğruluk ve Brier/LogLoss/RPS.
 * Sadece v9 code path'ini doğrulamak için — v7'ye karşı benchmark için değil.
 */

const api = require('../src/services/playwright-client');
const { fetchAllMatchData } = require('../src/services/data-fetcher');
const { calculateAllMetrics } = require('../src/engine/metric-calculator');
const { getDynamicBaseline } = require('../src/engine/dynamic-baseline');
const { generatePrediction } = require('../src/engine/prediction-generator');
const { computePositionMVBreakdown } = require('../src/engine/quality-factors');

const TARGET_N = parseInt(process.argv[2] || '20');
const DAYS_BACK = parseInt(process.argv[3] || '7');
const TOP_LEAGUES = new Set([17, 8, 23, 24, 35, 7]);

function brier(probs, actual) {
  const y = [actual === '1' ? 1 : 0, actual === 'X' ? 1 : 0, actual === '2' ? 1 : 0];
  return (Math.pow(probs[0]-y[0],2) + Math.pow(probs[1]-y[1],2) + Math.pow(probs[2]-y[2],2)) / 3;
}
function logLoss(probs, actual, eps=1e-7) {
  const pMap = { '1': probs[0], 'X': probs[1], '2': probs[2] };
  return -Math.log(Math.max(pMap[actual], eps));
}
function rps(probs, actual) {
  const y = [actual === '1' ? 1 : 0, actual === 'X' ? 1 : 0, actual === '2' ? 1 : 0];
  const cum = [probs[0] - y[0], probs[0] + probs[1] - y[0] - y[1]];
  return (cum[0]*cum[0] + cum[1]*cum[1]) / 2;
}

(async () => {
  await api.initBrowser();
  const today = new Date();
  const events = [];
  for (let i = 1; i <= DAYS_BACK && events.length < TARGET_N * 2; i++) {
    const d = new Date(today - i * 86400000).toISOString().split('T')[0];
    try {
      const data = await api.getScheduledEvents(d);
      const finished = (data?.events || []).filter(e =>
        e.status?.type === 'finished' &&
        TOP_LEAGUES.has(e.tournament?.uniqueTournament?.id) &&
        e.homeScore?.current != null
      );
      events.push(...finished.map(e => ({ ...e, _date: d })));
    } catch (err) { console.error('date err', d, err.message); }
  }
  const sample = events.slice(0, TARGET_N);
  console.log(`📊 Örneklem: ${sample.length} maç, ${DAYS_BACK} gün geriye`);

  const records = [];
  let idx = 0;
  for (const ev of sample) {
    idx++;
    const hS = ev.homeScore?.current, aS = ev.awayScore?.current;
    const actual = hS > aS ? '1' : hS < aS ? '2' : 'X';
    try {
      const md = await fetchAllMatchData(ev.id);
      const m = calculateAllMetrics(md);
      const baseline = getDynamicBaseline(md);
      baseline.leagueGoalVolatility = m.meta?.leagueGoalVolatility ?? null;
      baseline.leaguePointDensity   = m.meta?.leaguePointDensity   ?? null;
      baseline.medianGoalRate       = m.meta?.medianGoalRate       ?? null;
      baseline.leagueTeamCount      = m.meta?.leagueTeamCount      ?? null;
      baseline.ptsCV                = m.meta?.ptsCV                ?? null;
      baseline.normMinRatio         = m.meta?.normMinRatio         ?? null;
      baseline.normMaxRatio         = m.meta?.normMaxRatio         ?? null;
      baseline.homeMVBreakdown = computePositionMVBreakdown(md.homePlayers);
      baseline.awayMVBreakdown = computePositionMVBreakdown(md.awayPlayers);
      const report = generatePrediction(m, md, baseline, [], Math.random);
      const pH = (report.result?.homeWin ?? 0) / 100;
      const pD = (report.result?.draw    ?? 0) / 100;
      const pA = (report.result?.awayWin ?? 0) / 100;
      const sum = pH + pD + pA;
      const probs = sum > 0 ? [pH/sum, pD/sum, pA/sum] : [1/3, 1/3, 1/3];
      const predicted = probs[0] >= probs[1] && probs[0] >= probs[2] ? '1' :
                        probs[2] >= probs[1] ? '2' : 'X';
      const poissonL = m.prediction?.lambdaHome;
      const mcL = report.prediction?.lambdaHome;
      records.push({
        id: ev.id,
        match: `${ev.homeTeam.name} vs ${ev.awayTeam.name}`,
        actual,
        predicted,
        correct: actual === predicted,
        brier: brier(probs, actual),
        logLoss: logLoss(probs, actual),
        rps: rps(probs, actual),
        drift: (poissonL != null && mcL != null) ? Math.abs(poissonL - mcL) : null,
      });
      console.log(`[${idx}/${sample.length}] ${ev.homeTeam.name} vs ${ev.awayTeam.name} → pred=${predicted}, actual=${actual}, ${actual === predicted ? '✓' : '✗'}`);
    } catch (err) {
      console.error(`FAIL ${ev.id}:`, err.message);
    }
  }

  const n = records.length;
  if (n === 0) { console.error('Hiç maç işlenemedi'); process.exit(1); }
  const acc = records.filter(r => r.correct).length / n;
  const brAvg = records.reduce((s,r)=>s+r.brier,0)/n;
  const llAvg = records.reduce((s,r)=>s+r.logLoss,0)/n;
  const rpsAvg = records.reduce((s,r)=>s+r.rps,0)/n;
  const drifts = records.map(r=>r.drift).filter(d=>d!=null);
  const driftAvg = drifts.length > 0 ? drifts.reduce((s,d)=>s+d,0)/drifts.length : null;
  const driftMax = drifts.length > 0 ? Math.max(...drifts) : null;

  console.log(`\n=== ÖRNEKLEM ÖZETİ (n=${n}) ===`);
  console.log(`1X2 Accuracy: ${(acc*100).toFixed(2)}%`);
  console.log(`Brier: ${brAvg.toFixed(4)}`);
  console.log(`Log Loss: ${llAvg.toFixed(4)}`);
  console.log(`RPS: ${rpsAvg.toFixed(4)}`);
  console.log(`MC-Poisson drift: avg=${driftAvg?.toFixed(4) ?? 'n/a'}, max=${driftMax?.toFixed(4) ?? 'n/a'}`);
  console.log(`\nv7 referans (278 maç): Brier=0.1744, LogLoss=0.8867, RPS=0.18, Acc=59.71%`);
  process.exit(0);
})().catch(e => { console.error(e.stack); process.exit(1); });
