/**
 * dump-metrics.js
 * Gerçek bir maç için tüm 168+ metriği hesaplar ve dosyaya yazar.
 * Çıktı: her metriğin ID, adı, değeri, kaynağı ve dinamik lig ortalamasını içerir.
 *
 * Kullanım: node src/scripts/dump-metrics.js <eventId>
 */

'use strict';

const path = require('path');
const fs = require('fs');

// Engine imports
const { fetchAllMatchData } = require('../services/data-fetcher');
const { calculateAllMetrics } = require('../engine/metric-calculator');
const { getDynamicBaseline } = require('../engine/dynamic-baseline');
const { METRIC_METADATA } = require('../engine/metric-metadata');

async function main() {
  const eventId = process.argv[2];
  if (!eventId) {
    console.error('Kullanım: node src/scripts/dump-metrics.js <eventId>');
    console.error('Örnek:    node src/scripts/dump-metrics.js 12345678');
    process.exit(1);
  }

  console.log(`\n🔍 Maç ${eventId} için veri çekiliyor...`);
  const data = await fetchAllMatchData(Number(eventId));

  const homeTeam = data.event?.event?.homeTeam?.name || 'Ev Sahibi';
  const awayTeam = data.event?.event?.awayTeam?.name || 'Deplasman';
  const tournament = data.event?.event?.tournament?.name || '';

  console.log(`⚽ ${homeTeam} vs ${awayTeam} (${tournament})`);
  console.log(`📊 Metrikler hesaplanıyor...\n`);

  const metrics = calculateAllMetrics(data);
  const baseline = getDynamicBaseline(data);

  // ── Collect ALL metrics from all categories ──
  const allMetrics = {};
  const categories = ['attack', 'defense', 'form', 'player', 'goalkeeper', 'momentum'];
  
  for (const cat of categories) {
    if (metrics.home[cat]) {
      for (const [id, val] of Object.entries(metrics.home[cat])) {
        if (/^M\d{3}[a-z]?$/i.test(id)) {
          if (!allMetrics[id]) allMetrics[id] = {};
          allMetrics[id].homeValue = val;
          allMetrics[id].category = cat;
        }
      }
    }
    if (metrics.away[cat]) {
      for (const [id, val] of Object.entries(metrics.away[cat])) {
        if (/^M\d{3}[a-z]?$/i.test(id)) {
          if (!allMetrics[id]) allMetrics[id] = {};
          allMetrics[id].awayValue = val;
          allMetrics[id].category = cat;
        }
      }
    }
  }

  // Shared metrics (referee, h2h, contextual)
  const sharedCats = ['referee', 'h2h', 'contextual'];
  for (const cat of sharedCats) {
    if (metrics.shared[cat]) {
      for (const [id, val] of Object.entries(metrics.shared[cat])) {
        if (/^M\d{3}[a-z]?$/i.test(id)) {
          if (!allMetrics[id]) allMetrics[id] = {};
          allMetrics[id].sharedValue = val;
          allMetrics[id].category = `shared.${cat}`;
        }
      }
    }
  }

  // Composite scores
  if (metrics.home.compositeScores) {
    for (const [id, val] of Object.entries(metrics.home.compositeScores)) {
      if (/^M\d{3}[a-z]?$/i.test(id)) {
        if (!allMetrics[id]) allMetrics[id] = {};
        allMetrics[id].homeValue = val;
        allMetrics[id].category = 'composite';
      }
    }
  }
  if (metrics.away.compositeScores) {
    for (const [id, val] of Object.entries(metrics.away.compositeScores)) {
      if (/^M\d{3}[a-z]?$/i.test(id)) {
        if (!allMetrics[id]) allMetrics[id] = {};
        allMetrics[id].awayValue = val;
        allMetrics[id].category = 'composite';
      }
    }
  }

  // ── Build the output report ──
  const lines = [];
  lines.push('═'.repeat(120));
  lines.push(`TUTARBU METRİK KANIT RAPORU`);
  lines.push(`Maç: ${homeTeam} vs ${awayTeam}`);
  lines.push(`Turnuva: ${tournament}`);
  lines.push(`Event ID: ${eventId}`);
  lines.push(`Tarih: ${new Date().toISOString()}`);
  lines.push(`Toplam Benzersiz Metrik: ${Object.keys(allMetrics).length}`);
  lines.push('═'.repeat(120));

  // ── Section 1: Dynamic Baselines ──
  lines.push('');
  lines.push('╔' + '═'.repeat(118) + '╗');
  lines.push('║  BÖLÜM 1: DİNAMİK TEMEL DEĞİŞKENLER (BASELINES)                                                              ║');
  lines.push('║  Bu değerler simülasyonun temelini oluşturur. Hepsi API verisinden hesaplanmıştır.                              ║');
  lines.push('╚' + '═'.repeat(118) + '╝');
  lines.push('');

  for (const trace of baseline.traces) {
    lines.push(`  ➜ ${trace}`);
  }

  // ── Section 2: Dynamic League Averages ──
  lines.push('');
  lines.push('╔' + '═'.repeat(118) + '╗');
  lines.push('║  BÖLÜM 2: DİNAMİK LİG ORTALAMALARI (Her Metrik İçin)                                                         ║');
  lines.push('║  Bu değerler match-simulator.js tarafından normalizasyon için kullanılır.                                       ║');
  lines.push('╚' + '═'.repeat(118) + '╝');
  lines.push('');

  const dynAvgs = metrics.dynamicLeagueAvgs || {};
  const dynTraces = metrics.leagueAvgTraces || {};
  const dynKeys = Object.keys(dynAvgs).sort();

  lines.push(`  Toplam Dinamik Lig Ortalaması: ${dynKeys.length}`);
  lines.push('');
  lines.push(`  ${'ID'.padEnd(8)} ${'DEĞER'.padEnd(12)} ${'KAYNAK'.padEnd(60)} ${'METRİK ADI'}`);
  lines.push(`  ${'─'.repeat(8)} ${'─'.repeat(12)} ${'─'.repeat(60)} ${'─'.repeat(30)}`);

  for (const id of dynKeys) {
    const val = dynAvgs[id];
    const trace = dynTraces[id] || '';
    const meta = METRIC_METADATA[id];
    const name = meta?.name || id;
    const valStr = typeof val === 'number' ? val.toFixed(4) : String(val);
    lines.push(`  ${id.padEnd(8)} ${valStr.padEnd(12)} ${String(trace).padEnd(60)} ${name}`);
  }

  // ── Section 3: All Individual Metrics ──
  lines.push('');
  lines.push('╔' + '═'.repeat(118) + '╗');
  lines.push('║  BÖLÜM 3: TÜM BİREYSEL METRİKLER (Takım Bazlı)                                                              ║');
  lines.push('║  Her metriğin ev sahibi ve deplasman değeri, dinamik lig ortalaması ve kaynağı.                                 ║');
  lines.push('╚' + '═'.repeat(118) + '╝');
  lines.push('');

  const sortedIds = Object.keys(allMetrics).sort((a, b) => {
    const na = parseInt(a.replace(/[^0-9]/g, ''));
    const nb = parseInt(b.replace(/[^0-9]/g, ''));
    return na - nb;
  });

  lines.push(`  ${'ID'.padEnd(8)} ${'EV SAHİBİ'.padEnd(14)} ${'DEPLASMAN'.padEnd(14)} ${'PAYLAŞILAN'.padEnd(14)} ${'LİG ORT.'.padEnd(12)} ${'KATEGORİ'.padEnd(18)} ${'METRİK ADI'}`);
  lines.push(`  ${'─'.repeat(8)} ${'─'.repeat(14)} ${'─'.repeat(14)} ${'─'.repeat(14)} ${'─'.repeat(12)} ${'─'.repeat(18)} ${'─'.repeat(40)}`);

  let countWithValue = 0;
  let countNull = 0;

  for (const id of sortedIds) {
    const m = allMetrics[id];
    const meta = METRIC_METADATA[id];
    const name = meta?.name || id;
    const cat = m.category || '?';
    const hv = m.homeValue != null ? (typeof m.homeValue === 'number' ? m.homeValue.toFixed(4) : String(m.homeValue)) : '—';
    const av = m.awayValue != null ? (typeof m.awayValue === 'number' ? m.awayValue.toFixed(4) : String(m.awayValue)) : '—';
    const sv = m.sharedValue != null ? (typeof m.sharedValue === 'number' ? m.sharedValue.toFixed(4) : String(m.sharedValue)) : '—';
    const la = dynAvgs[id] != null ? (typeof dynAvgs[id] === 'number' ? dynAvgs[id].toFixed(4) : String(dynAvgs[id])) : '—';
    
    if (m.homeValue != null || m.awayValue != null || m.sharedValue != null) countWithValue++;
    else countNull++;

    lines.push(`  ${id.padEnd(8)} ${hv.padEnd(14)} ${av.padEnd(14)} ${sv.padEnd(14)} ${la.padEnd(12)} ${cat.padEnd(18)} ${name}`);
  }

  // ── Section 4: Summary Statistics ──
  lines.push('');
  lines.push('╔' + '═'.repeat(118) + '╗');
  lines.push('║  BÖLÜM 4: ÖZET İSTATİSTİKLER                                                                                  ║');
  lines.push('╚' + '═'.repeat(118) + '╝');
  lines.push('');
  lines.push(`  Toplam Benzersiz Metrik ID: ${sortedIds.length}`);
  lines.push(`  Değeri Olan Metrikler:      ${countWithValue}`);
  lines.push(`  Değeri Olmayan (null):      ${countNull}`);
  lines.push(`  Dinamik Lig Ortalamaları:   ${dynKeys.length}`);
  lines.push(`  Baseline Trace Sayısı:      ${baseline.traces.length}`);
  lines.push('');
  
  // Check for hardcoded evidence
  const neutralTraces = baseline.traces.filter(t => t.includes('NEUTRAL_SYMMETRY'));
  const directTraces = baseline.traces.filter(t => t.includes('LEAGUE_STANDINGS'));
  const proxyTraces = baseline.traces.filter(t => t.includes('TEAM_PROXY'));
  const derivedTraces = baseline.traces.filter(t => t.includes('DERIVED'));

  lines.push(`  ── Veri Çözümleme Hiyerarşisi ──`);
  lines.push(`  LEAGUE_STANDINGS (Doğrudan API): ${directTraces.length}`);
  lines.push(`  TEAM_PROXY (Takım Ortalaması):   ${proxyTraces.length}`);
  lines.push(`  DERIVED (Türetilmiş):            ${derivedTraces.length}`);
  lines.push(`  NEUTRAL_SYMMETRY (Nötr Baz):     ${neutralTraces.length}`);
  lines.push('');
  lines.push(`  📊 Dinamik Çözüm Oranı: %${(((directTraces.length + proxyTraces.length + derivedTraces.length) / baseline.traces.length) * 100).toFixed(1)}`);
  lines.push(`  ⚠️  Nötr Simetri Oranı: %${((neutralTraces.length / baseline.traces.length) * 100).toFixed(1)}`);
  lines.push('');
  lines.push('═'.repeat(120));
  lines.push('RAPOR SONU');
  lines.push('═'.repeat(120));

  // Write to file
  const outputPath = path.join(__dirname, '..', '..', `metric-dump-${eventId}.txt`);
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  console.log(`✅ Rapor yazıldı: ${outputPath}`);
  console.log(`📊 Toplam ${sortedIds.length} metrik, ${dynKeys.length} dinamik lig ortalaması`);
  console.log(`🎯 Dinamik Çözüm: ${directTraces.length} Direct + ${proxyTraces.length} Proxy + ${derivedTraces.length} Derived`);
  console.log(`⚠️  Nötr Simetri: ${neutralTraces.length}`);
}

main().catch(err => {
  console.error('HATA:', err.message);
  process.exit(1);
});
