#!/usr/bin/env node
/**
 * Lambda Audit Post-Processor (Faz 0)
 * --------------------------------------------------------------
 * Bir backtest dump dosyasını (results[].lambdaAudit alanı dolu olmalı)
 * okuyup λ transformation zincirini analiz eder. Hangi modifier'ın
 * hangi maçta ne kadar log-amplifikasyon kattığını, clamp hit oranlarını,
 * source agreement dağılımını çıkarır.
 *
 * Statik eşik yoktur — eşikler veriden türetilir (medyan, IQR, vb).
 *
 * Kullanım:
 *   node tools/lambda-audit.js <backtest_results.json>
 *
 * Çıktı:
 *   - stdout: Markdown özet
 *   - <input>.lambda-audit.csv: maç-modifier matrisi (R/Python ile analiz için)
 */

'use strict';

const fs = require('fs');
const path = require('path');

function loadDump(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  if (Array.isArray(data.matches)) return { matches: data.matches, root: data };
  if (Array.isArray(data.results)) return { matches: data.results, root: data };
  throw new Error(`Backtest dump'ında matches[] veya results[] bulunamadı: ${filePath}`);
}

function extractAuditRows(matches) {
  const rows = [];
  for (const m of matches) {
    const audit = m.lambdaAudit;
    if (!audit || !audit.trace) continue;
    const trace = audit.trace || [];
    const diag = audit.diag || {};
    const modByStage = {};
    for (const entry of trace) {
      modByStage[entry.stage] = entry;
    }
    rows.push({
      match: m.match || m.matchLabel || `${m.homeTeam || '?'} vs ${m.awayTeam || '?'}`,
      tournament: m.tournament || m.competition || '',
      actual: m.actual || null,
      predicted: m.predicted || null,
      hit1X2: m.hit1X2 ?? null,
      hitOU25: m.hitOU25 ?? null,
      brier: m.brierScore ?? null,
      // Diagnostics
      kMatchHome: diag.kMatchHome,
      kMatchAway: diag.kMatchAway,
      agreementHome: diag.agreementHome,
      agreementAway: diag.agreementAway,
      cvLocal: diag.cvLocal,
      leagueAvgGoals: diag.leagueAvgGoals,
      lambdaMin: diag.dynamicLambdaMin,
      lambdaMax: diag.dynamicLambdaMax,
      clampHomeMinHit: diag.clampHomeMinHit ?? false,
      clampHomeMaxHit: diag.clampHomeMaxHit ?? false,
      clampAwayMinHit: diag.clampAwayMinHit ?? false,
      clampAwayMaxHit: diag.clampAwayMaxHit ?? false,
      // Source counts
      hAtkN: diag.sources?.hAtk?.n,
      aDefN: diag.sources?.aDef?.n,
      aAtkN: diag.sources?.aAtk?.n,
      hDefN: diag.sources?.hDef?.n,
      // Stage outputs
      lambdaHome_dcBase: modByStage.dcBase?.hAfter,
      lambdaAway_dcBase: modByStage.dcBase?.aAfter,
      lambdaHome_initialClamp: modByStage.initialClamp?.hAfter,
      lambdaAway_initialClamp: modByStage.initialClamp?.aAfter,
      lambdaHome_final: modByStage.finalM167?.hAfter,
      lambdaAway_final: modByStage.finalM167?.aAfter,
      // Per-modifier log-deltas (null ise stage uygulanmadı)
      dLog_behavMod_home: modByStage.behavMod?.dLogH,
      dLog_behavMod_away: modByStage.behavMod?.dLogA,
      dLog_urgencyMod_home: modByStage.urgencyMod?.dLogH,
      dLog_urgencyMod_away: modByStage.urgencyMod?.dLogA,
      dLog_lqr_home: modByStage.lqr?.dLogH,
      dLog_lqr_away: modByStage.lqr?.dLogA,
      dLog_xgOver_home: modByStage.xgOverPerf?.dLogH,
      dLog_xgOver_away: modByStage.xgOverPerf?.dLogA,
      dLog_ref_home: modByStage.refMod?.dLogH,
      dLog_ref_away: modByStage.refMod?.dLogA,
      dLog_clean_home: modByStage.cleanSheet?.dLogH,
      dLog_clean_away: modByStage.cleanSheet?.dLogA,
      dLog_scaling_home: modByStage.referenceScaling?.dLogH,
      dLog_scaling_away: modByStage.referenceScaling?.dLogA,
      dLog_shrinkage_home: modByStage.lambdaShrinkage?.dLogH,
      dLog_shrinkage_away: modByStage.lambdaShrinkage?.dLogA,
    });
  }
  return rows;
}

// --- İstatistik yardımcıları (sabit yok) -----------------------------------
function quantile(arr, q) {
  const sorted = arr.slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * q;
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
function mean(arr) {
  const v = arr.filter(x => x != null && isFinite(x));
  if (v.length === 0) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}
function std(arr) {
  const v = arr.filter(x => x != null && isFinite(x));
  if (v.length < 2) return null;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}
function pctTrue(arr) {
  const v = arr.filter(x => x != null);
  if (v.length === 0) return null;
  return v.filter(x => x === true).length / v.length;
}
function nonNullCount(arr) {
  return arr.filter(x => x != null && isFinite(x)).length;
}

// --- Modifier amplifikasyon özeti ------------------------------------------
const STAGES = [
  'behavMod', 'urgencyMod', 'lqr', 'xgOverPerf',
  'refMod', 'cleanSheet', 'referenceScaling', 'lambdaShrinkage',
];

function summarizeStage(rows, stage, side) {
  const key = `dLog_${stage === 'behavMod' ? 'behavMod' :
              stage === 'urgencyMod' ? 'urgencyMod' :
              stage === 'lqr' ? 'lqr' :
              stage === 'xgOverPerf' ? 'xgOver' :
              stage === 'refMod' ? 'ref' :
              stage === 'cleanSheet' ? 'clean' :
              stage === 'referenceScaling' ? 'scaling' :
              'shrinkage'}_${side}`;
  const vals = rows.map(r => r[key]).filter(x => x != null && isFinite(x) && x !== 0);
  if (vals.length === 0) return null;
  return {
    n: vals.length,
    nTotal: rows.length,
    triggerRate: vals.length / rows.length,
    meanLog: mean(vals),
    stdLog: std(vals),
    p25Log: quantile(vals, 0.25),
    p50Log: quantile(vals, 0.50),
    p75Log: quantile(vals, 0.75),
    meanFactor: vals.length > 0 ? Math.exp(mean(vals)) : null,
  };
}

// --- Hit/no-hit kontribüsyon ayrımı ----------------------------------------
function summarizeHitDelta(rows, stage, side, hitField) {
  const key = `dLog_${stage === 'behavMod' ? 'behavMod' :
              stage === 'urgencyMod' ? 'urgencyMod' :
              stage === 'lqr' ? 'lqr' :
              stage === 'xgOverPerf' ? 'xgOver' :
              stage === 'refMod' ? 'ref' :
              stage === 'cleanSheet' ? 'clean' :
              stage === 'referenceScaling' ? 'scaling' :
              'shrinkage'}_${side}`;
  const hits = rows.filter(r => r[hitField] === true).map(r => r[key]).filter(x => x != null && isFinite(x));
  const miss = rows.filter(r => r[hitField] === false).map(r => r[key]).filter(x => x != null && isFinite(x));
  return {
    hitMean: mean(hits),
    missMean: mean(miss),
    hitN: hits.length,
    missN: miss.length,
    diff: (mean(hits) != null && mean(miss) != null) ? mean(hits) - mean(miss) : null,
  };
}

// --- Markdown rapor üretici ------------------------------------------------
function fmt(x, d = 4) {
  if (x == null || !isFinite(x)) return '—';
  return Number(x).toFixed(d);
}
function fmtPct(x) {
  if (x == null) return '—';
  return (x * 100).toFixed(1) + '%';
}

function renderReport(rows) {
  const lines = [];
  lines.push(`# Lambda Audit Raporu`);
  lines.push(``);
  lines.push(`Toplam maç: **${rows.length}** | Audit kayıtlı: **${rows.filter(r => r.lambdaHome_final != null).length}**`);
  lines.push(``);

  // Genel diagnostik
  const kMatchAll = [...rows.map(r => r.kMatchHome), ...rows.map(r => r.kMatchAway)].filter(x => x != null);
  const agreementAll = [...rows.map(r => r.agreementHome), ...rows.map(r => r.agreementAway)].filter(x => x != null);
  const lambdaFinalH = rows.map(r => r.lambdaHome_final).filter(x => x != null);
  const lambdaFinalA = rows.map(r => r.lambdaAway_final).filter(x => x != null);
  const lambdaSum = rows.map(r => (r.lambdaHome_final ?? 0) + (r.lambdaAway_final ?? 0)).filter(x => x > 0);

  lines.push(`## Diagnostics`);
  lines.push(``);
  lines.push(`| Ölçü | n | mean | p25 | p50 | p75 |`);
  lines.push(`|---|---|---|---|---|---|`);
  lines.push(`| kMatch (home+away) | ${kMatchAll.length} | ${fmt(mean(kMatchAll))} | ${fmt(quantile(kMatchAll, 0.25))} | ${fmt(quantile(kMatchAll, 0.5))} | ${fmt(quantile(kMatchAll, 0.75))} |`);
  lines.push(`| agreement (home+away) | ${agreementAll.length} | ${fmt(mean(agreementAll))} | ${fmt(quantile(agreementAll, 0.25))} | ${fmt(quantile(agreementAll, 0.5))} | ${fmt(quantile(agreementAll, 0.75))} |`);
  lines.push(`| λ_home final | ${lambdaFinalH.length} | ${fmt(mean(lambdaFinalH))} | ${fmt(quantile(lambdaFinalH, 0.25))} | ${fmt(quantile(lambdaFinalH, 0.5))} | ${fmt(quantile(lambdaFinalH, 0.75))} |`);
  lines.push(`| λ_away final | ${lambdaFinalA.length} | ${fmt(mean(lambdaFinalA))} | ${fmt(quantile(lambdaFinalA, 0.25))} | ${fmt(quantile(lambdaFinalA, 0.5))} | ${fmt(quantile(lambdaFinalA, 0.75))} |`);
  lines.push(`| λ_total final | ${lambdaSum.length} | ${fmt(mean(lambdaSum))} | ${fmt(quantile(lambdaSum, 0.25))} | ${fmt(quantile(lambdaSum, 0.5))} | ${fmt(quantile(lambdaSum, 0.75))} |`);
  lines.push(``);

  // Clamp hit
  lines.push(`## Clamp Hit Oranları`);
  lines.push(``);
  lines.push(`| Yön | Min Hit | Max Hit |`);
  lines.push(`|---|---|---|`);
  lines.push(`| home | ${fmtPct(pctTrue(rows.map(r => r.clampHomeMinHit)))} | ${fmtPct(pctTrue(rows.map(r => r.clampHomeMaxHit)))} |`);
  lines.push(`| away | ${fmtPct(pctTrue(rows.map(r => r.clampAwayMinHit)))} | ${fmtPct(pctTrue(rows.map(r => r.clampAwayMaxHit)))} |`);
  lines.push(``);

  // Source counts
  const allSourceN = [...rows.map(r => r.hAtkN), ...rows.map(r => r.aDefN), ...rows.map(r => r.aAtkN), ...rows.map(r => r.hDefN)].filter(x => x != null);
  lines.push(`## Kaynak Sayısı (per blendRate çağrısı)`);
  lines.push(`mean=${fmt(mean(allSourceN), 2)} | p25=${fmt(quantile(allSourceN, 0.25), 0)} | p50=${fmt(quantile(allSourceN, 0.5), 0)} | p75=${fmt(quantile(allSourceN, 0.75), 0)} | min=${fmt(Math.min(...allSourceN), 0)} | max=${fmt(Math.max(...allSourceN), 0)}`);
  lines.push(``);

  // Modifier amplifikasyon
  lines.push(`## Modifier Amplifikasyonu (log-uzayda)`);
  lines.push(``);
  lines.push(`*meanFactor*: ortalama log-delta'nın exponential'ı (=ortalama λ çarpanı)`);
  lines.push(`*p25/p75*: log-delta IQR'ı — büyükse modifier maçtan maça çok değişiyor`);
  lines.push(``);
  lines.push(`| Stage | Side | TriggerRate | n | meanLog | meanFactor | p25Log | p50Log | p75Log |`);
  lines.push(`|---|---|---|---|---|---|---|---|---|`);
  for (const stage of STAGES) {
    for (const side of ['home', 'away']) {
      const s = summarizeStage(rows, stage, side);
      if (s == null) {
        lines.push(`| ${stage} | ${side} | 0% | 0 | — | — | — | — | — |`);
      } else {
        lines.push(`| ${stage} | ${side} | ${fmtPct(s.triggerRate)} | ${s.n} | ${fmt(s.meanLog)} | ${fmt(s.meanFactor)} | ${fmt(s.p25Log)} | ${fmt(s.p50Log)} | ${fmt(s.p75Log)} |`);
      }
    }
  }
  lines.push(``);

  // Hit/miss kontribüsyon
  lines.push(`## Modifier Katkısı: Hit vs Miss (1X2 ekseninde)`);
  lines.push(``);
  lines.push(`*hitMean - missMean*: pozitif → modifier doğru tahminlerde fazla yukarı çekmiş; negatif → tersi`);
  lines.push(``);
  lines.push(`| Stage | Side | hitN | hitMean | missN | missMean | diff |`);
  lines.push(`|---|---|---|---|---|---|---|`);
  for (const stage of STAGES) {
    for (const side of ['home', 'away']) {
      const s = summarizeHitDelta(rows, stage, side, 'hit1X2');
      lines.push(`| ${stage} | ${side} | ${s.hitN} | ${fmt(s.hitMean)} | ${s.missN} | ${fmt(s.missMean)} | ${fmt(s.diff)} |`);
    }
  }
  lines.push(``);

  // Anomali tespiti — λ_total dağılımının p10'undan düşük maçlar
  const lowTotal = quantile(lambdaSum, 0.10);
  const highTotal = quantile(lambdaSum, 0.90);
  lines.push(`## Anomali: λ_total dağılım uçları`);
  lines.push(``);
  lines.push(`p10 = ${fmt(lowTotal)} | p90 = ${fmt(highTotal)}`);
  lines.push(``);
  lines.push(`### λ_total < p10 (deflasyon adayları)`);
  rows
    .filter(r => r.lambdaHome_final != null && r.lambdaAway_final != null)
    .filter(r => (r.lambdaHome_final + r.lambdaAway_final) <= lowTotal)
    .slice(0, 10)
    .forEach(r => {
      lines.push(`- **${r.match}** (${r.tournament}) — λH=${fmt(r.lambdaHome_final, 2)}, λA=${fmt(r.lambdaAway_final, 2)}, kH=${fmt(r.kMatchHome, 2)}, agreementH=${fmt(r.agreementHome, 2)}, actual=${r.actual}, predicted=${r.predicted}`);
    });
  lines.push(``);
  lines.push(`### λ_total > p90 (inflasyon adayları)`);
  rows
    .filter(r => r.lambdaHome_final != null && r.lambdaAway_final != null)
    .filter(r => (r.lambdaHome_final + r.lambdaAway_final) >= highTotal)
    .slice(0, 10)
    .forEach(r => {
      lines.push(`- **${r.match}** (${r.tournament}) — λH=${fmt(r.lambdaHome_final, 2)}, λA=${fmt(r.lambdaAway_final, 2)}, kH=${fmt(r.kMatchHome, 2)}, agreementH=${fmt(r.agreementHome, 2)}, actual=${r.actual}, predicted=${r.predicted}`);
    });
  lines.push(``);

  return lines.join('\n');
}

function exportCSV(rows, outPath) {
  if (rows.length === 0) {
    fs.writeFileSync(outPath, '', 'utf8');
    return;
  }
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(',')];
  for (const r of rows) {
    lines.push(cols.map(c => {
      const v = r[c];
      if (v == null) return '';
      if (typeof v === 'string') return `"${v.replace(/"/g, '""')}"`;
      if (typeof v === 'boolean') return v ? '1' : '0';
      return String(v);
    }).join(','));
  }
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
}

// --- Main ------------------------------------------------------------------
function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Kullanım: node tools/lambda-audit.js <backtest_results.json>');
    process.exit(1);
  }
  const abs = path.resolve(inputPath);
  if (!fs.existsSync(abs)) {
    console.error(`Dosya bulunamadı: ${abs}`);
    process.exit(1);
  }
  const { matches } = loadDump(abs);
  const rows = extractAuditRows(matches);
  if (rows.length === 0) {
    console.error('UYARI: Hiçbir maçta lambdaAudit alanı yok. Backtest tracer-aktif build ile çalıştırılmalı.');
    process.exit(2);
  }
  const report = renderReport(rows);
  process.stdout.write(report);
  const csvOut = abs.replace(/\.json$/i, '.lambda-audit.csv');
  exportCSV(rows, csvOut);
  process.stderr.write(`\n[lambda-audit] CSV: ${csvOut}\n`);
}

if (require.main === module) main();

module.exports = { extractAuditRows, summarizeStage, summarizeHitDelta, renderReport };
