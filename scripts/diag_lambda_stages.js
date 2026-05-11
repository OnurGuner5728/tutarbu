/**
 * Diagnostic: tek bir maçta tüm lambda stage'lerinin diag/trace dump'ı.
 * Hangi stage null/1.0 dönüyor görmek için.
 */

const fs = require('fs');
const path = require('path');
const api = require('../src/services/playwright-client');
const { fetchAllMatchData } = require('../src/services/data-fetcher');
const { calculateAllMetrics } = require('../src/engine/metric-calculator');
const { applyAsOfFilter } = require('../src/services/as-of-filter');

const MATCH_ID = parseInt(process.argv[2] || '14024024', 10); // Liverpool vs Chelsea

(async () => {
  await api.initBrowser();
  console.log(`[Diag] Fetching match ${MATCH_ID}...`);
  const fullData = await fetchAllMatchData(MATCH_ID);
  const kickoffTs = fullData?.event?.event?.startTimestamp ?? null;
  if (kickoffTs) {
    applyAsOfFilter(fullData, { cutoffTs: kickoffTs - 1 });
    console.log(`[Diag] AsOf cutoff applied: ${new Date(kickoffTs * 1000).toISOString()}`);
  }
  const metrics = calculateAllMetrics(fullData);
  const audit = metrics.prediction?.lambdaAudit;
  if (!audit) { console.error('No lambdaAudit!'); process.exit(1); }

  const { diag, trace } = audit;

  console.log('\n=== DIAG SNAPSHOT ===');
  console.log(JSON.stringify(diag, null, 2));

  console.log('\n=== TRACE (per-stage lambda evolution) ===');
  trace.forEach((t, i) => {
    const dH = (t.hAfter != null && t.hBefore != null) ? (t.hAfter / t.hBefore).toFixed(4) : '—';
    const dA = (t.aAfter != null && t.aBefore != null) ? (t.aAfter / t.aBefore).toFixed(4) : '—';
    console.log(`[${i.toString().padStart(2)}] ${(t.stage||'').padEnd(18)} | hB=${fmt(t.hBefore)} → hA=${fmt(t.hAfter)} (×${dH}) | aB=${fmt(t.aBefore)} → aA=${fmt(t.aAfter)} (×${dA})`);
    if (t.meta) {
      const interesting = Object.entries(t.meta).filter(([k,v]) => v != null && v !== 1 && v !== 1.0).slice(0,8);
      interesting.forEach(([k,v]) => console.log(`      ${k}: ${typeof v === 'number' ? v.toFixed(4) : JSON.stringify(v)}`));
      const nullsOrOnes = Object.entries(t.meta).filter(([k,v]) => v == null || v === 1 || v === 1.0);
      if (nullsOrOnes.length > 0) {
        console.log(`      DEAD (null/1.0): ${nullsOrOnes.map(([k]) => k).join(', ')}`);
      }
    }
  });

  console.log('\n=== STAGE DIAGNOSIS ===');
  const stages = ['behavMod', 'urgencyMod', 'lqr', 'xgOverPerf', 'refMod', 'cleanSheet', 'referenceScaling'];
  stages.forEach(s => {
    const t = trace.find(x => x.stage === s);
    if (!t) { console.log(`  ${s.padEnd(20)} : MISSING from trace`); return; }
    const hRatio = (t.hAfter && t.hBefore) ? t.hAfter / t.hBefore : null;
    const aRatio = (t.aAfter && t.aBefore) ? t.aAfter / t.aBefore : null;
    const isDead = (hRatio === 1 || hRatio == null) && (aRatio === 1 || aRatio == null);
    const status = isDead ? 'DEAD (no effect)' : `home×${hRatio?.toFixed(3)} away×${aRatio?.toFixed(3)}`;
    console.log(`  ${s.padEnd(20)} : ${status}`);
  });

  const outFile = path.join(__dirname, '..', `diag_${MATCH_ID}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ diag, trace }, null, 2));
  console.log(`\nSaved: ${outFile}`);

  await api.closeBrowser?.();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

function fmt(v) { return v == null ? 'null' : (typeof v === 'number' ? v.toFixed(3) : String(v)); }
