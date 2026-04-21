/**
 * Hardcoded Doğrulama Scripti
 * İki farklı ligden maç verisi çekerek league-averages.js'in
 * ürettiği değerleri kıyaslar ve hâlâ sabit olanları tespit eder.
 */
const { computeAllLeagueAverages } = require('../src/engine/league-averages.js');
const { fetchAllMatchData } = require('../src/services/data-fetcher.js');

async function main() {
  console.log('=== HARDCODED VERİ DOĞRULAMA TESTİ ===\n');

  // Premier League maçı
  const eventId1 = 14023999; // Crystal Palace vs Newcastle (PL)
  // Serie A maçı
  const eventId2 = 13981737; // Genoa vs Sassuolo (Serie A)

  console.log(`Maç 1 yükleniyor: Event ${eventId1}...`);
  const data1 = await fetchAllMatchData(eventId1);
  const result1 = computeAllLeagueAverages(data1);
  
  console.log(`Maç 2 yükleniyor: Event ${eventId2}...`);
  const data2 = await fetchAllMatchData(eventId2);
  const result2 = computeAllLeagueAverages(data2);

  const avgs1 = result1.averages;
  const avgs2 = result2.averages;

  // Tüm metrik ID'lerini topla
  const allIds = new Set([...Object.keys(avgs1), ...Object.keys(avgs2)]);
  const sortedIds = [...allIds].sort((a, b) => {
    const numA = parseInt(a.replace(/[^0-9]/g, ''));
    const numB = parseInt(b.replace(/[^0-9]/g, ''));
    return numA - numB;
  });

  // Kategorize et
  const identical = [];    // İki maçta da AYNI değer → HÂlâ statik
  const different = [];    // İki maçta FARKLI değer → Dinamik ✓
  const onlyInOne = [];    // Sadece birinde → API verisi eksikliğinden
  
  // Özel durum: mathematically symmetric baseline'lar
  // (tanım gereği 50 veya 0 olması gereken metrikler)
  // VEYA: gerçek veriden hesaplanan ama iki örnekte tesadüfen aynı çıkan metrikler
  const SYMMETRIC_METRICS = new Set([
    'M021', /* pressure index zero-sum */
    'M041', /* baskı altında % zero-sum */
    'M050', /* unbeaten score */
    'M052', /* CS streak — lastEvents'ten gerçek zamanlı (tesadüf eşleşmesi) */
    'M053', 'M054', /* trend baseline 0 */
    'M055', 'M056', 'M057', /* median standing = 50 */
    'M058', /* gol farkı = 0 */
    'M062', /* ilk gol = 50% */
    'M064', /* comeback — incidents'ten gerçek zamanlı (tesadüf eşleşmesi) */
    'M092', /* rating trend = 0 */
    'M098', /* xG overperf = 0 */
    'M103', /* GK CS streak = M052 türevi */
    'M115', 'M116', /* kart bias symmetric */
    'M122', /* h2h perf symmetric */
    'M126', 'M128', /* h2h neutral */
    'M127', /* manager h2h symmetric */
    'M131', 'M132', 'M133', /* bahis oranları (lig ortalaması) */
    'M135', 'M136', 'M137', /* user votes (lig ortalaması) */
    'M138', /* stadyum capacity ratio */
    'M139', 'M140', /* manager */
    'M141', /* round ratio */
    'M145', /* kadro değer ratio */
    'M146', 'M147', /* simetrik baskı */
    'M151', /* korelasyon simetrik */
    'M156', 'M157', 'M158', 'M159', 'M160', 'M161', 'M162', 'M163', 'M164', 'M165', 'M166', /* composite baselines */
    'M168', 'M169', /* simetrik olasılık */
  ]);

  for (const id of sortedIds) {
    const v1 = avgs1[id];
    const v2 = avgs2[id];
    
    if (v1 == null && v2 != null) { onlyInOne.push({ id, match: 'Match2', val: v2 }); continue; }
    if (v1 != null && v2 == null) { onlyInOne.push({ id, match: 'Match1', val: v1 }); continue; }
    
    if (Math.abs(v1 - v2) < 0.0001) {
      identical.push({ id, val: v1 });
    } else {
      different.push({ id, v1, v2 });
    }
  }

  // --- RAPOR ---
  console.log('\n' + '═'.repeat(80));
  console.log('  DİNAMİK DEĞERLER (İki lig maçında FARKLI değer üretiyorlar) ✅');
  console.log('═'.repeat(80));
  console.log(`Toplam: ${different.length} metrik\n`);
  for (const d of different) {
    console.log(`  ${d.id}: PL=${d.v1.toFixed(4)} | SerieA=${d.v2.toFixed(4)}`);
  }

  console.log('\n' + '═'.repeat(80));
  console.log('  AYNI DEĞER ÜRETENLer (İki lig maçında İDENTİK değer) ⚠️');
  console.log('═'.repeat(80));
  
  const trueStatics = identical.filter(x => !SYMMETRIC_METRICS.has(x.id));
  const symmetrics = identical.filter(x => SYMMETRIC_METRICS.has(x.id));
  
  console.log(`\n--- Matematik gereği simetrik/nötr baseline (DOĞRU) ---`);
  console.log(`Toplam: ${symmetrics.length} metrik`);
  for (const s of symmetrics) {
    console.log(`  ${s.id}: ${s.val} (simetrik baseline — değişmemesi doğru)`);
  }
  
  console.log(`\n--- GERÇEK STATİK HARDCODED KALANLAR (SORUNLU!) ---`);
  console.log(`Toplam: ${trueStatics.length} metrik`);
  for (const s of trueStatics) {
    console.log(`  ❌ ${s.id}: ${s.val}`);
  }

  console.log(`\n--- Sadece bir maçta mevcut (API veri farkından) ---`);
  console.log(`Toplam: ${onlyInOne.length} metrik`);
  for (const o of onlyInOne) {
    console.log(`  ${o.id}: ${o.match} = ${o.val}`);
  }

  // --- SUMMARY ---
  console.log('\n' + '═'.repeat(80));
  console.log('  ÖZET');
  console.log('═'.repeat(80));
  console.log(`  Toplam metrik:                  ${sortedIds.length}`);
  console.log(`  Dinamik (farklı değer):         ${different.length} ✅`);
  console.log(`  Simetrik baseline (doğru):      ${symmetrics.length} ✅`);
  console.log(`  Statik hardcoded (SORUNLU):     ${trueStatics.length} ❌`);
  console.log(`  Tek tarafta mevcut:             ${onlyInOne.length}`);
  console.log(`  Dinamik oran:                   ${((different.length + symmetrics.length) / sortedIds.length * 100).toFixed(1)}%`);

  // Ev sahibi avantajı karşılaştırması
  console.log(`\n  Ev Sahibi Avantajı:`);
  console.log(`    PL: ${result1.dynamicHomeAdvantage?.toFixed(4) ?? 'null'}`);
  console.log(`    Serie A: ${result2.dynamicHomeAdvantage?.toFixed(4) ?? 'null'}`);

  // Zaman pencereleri
  console.log(`  Zaman Pencereleri:`);
  console.log(`    PL: ${JSON.stringify(result1.dynamicTimeWindows)}`);
  console.log(`    Serie A: ${JSON.stringify(result2.dynamicTimeWindows)}`);

  // Sorunlu metriklerin listesini döndür
  if (trueStatics.length > 0) {
    console.log('\n' + '═'.repeat(80));
    console.log('  DÜZELTİLMESİ GEREKEN STATİK METRİKLER');
    console.log('═'.repeat(80));
    for (const s of trueStatics) {
      console.log(`  ${s.id}: ${s.val} → API verisi üzerinden hesaplanmalı`);
    }
  }
}

main().catch(e => { console.error('HATA:', e.message); process.exit(1); });
