/**
 * SofaScore Prediction Engine — Ana Giriş Noktası
 * 168 metrikli, sıfır fallback, tamamen API-driven tahmin motoru.
 *
 * Kullanım:
 *   node src/index.js <eventId>
 *   node src/index.js 11874288
 */

const { fetchAllMatchData } = require('./services/data-fetcher');
const { calculateAllMetrics } = require('./engine/metric-calculator');
const { generatePrediction } = require('./engine/prediction-generator');

async function runPrediction(eventId) {
  console.log('═══════════════════════════════════════════════════');
  console.log('  🧠 SofaScore Tahmin Motoru v1.0 — 168 Metrik');
  console.log('═══════════════════════════════════════════════════');
  console.log(`\n📌 Event ID: ${eventId}\n`);

  try {
    // ADIM 1: Tüm verileri topla
    console.log('📡 [ADIM 1/4] Veri toplama başladı...');
    const data = await fetchAllMatchData(eventId);
    console.log('✅ Veri toplama tamamlandı.\n');

    console.log(`  Ev Sahibi: ${data.event?.event?.homeTeam?.name}`);
    console.log(`  Deplasman: ${data.event?.event?.awayTeam?.name}`);
    console.log('');

    // ADIM 2: 168 metriği hesapla
    console.log('📊 [ADIM 2/3] 168 metrik hesaplanıyor...');
    const metrics = calculateAllMetrics(data);
    console.log(`✅ ${metrics.meta.totalMetricsCalculated} metrik hesaplandı.\n`);

    // ADIM 3: Tahmin üret
    console.log('🎯 [ADIM 3/3] Tahmin üretiliyor...');
    const prediction = generatePrediction(metrics, data);
    console.log('✅ Tahmin tamamlandı.\n');

    // Sonuçları yazdır
    printPredictionReport(prediction);

    // JSON dosyasına kaydet
    const fs = require('fs');
    const outputPath = `prediction_${eventId}_${Date.now()}.json`;
    fs.writeFileSync(outputPath, JSON.stringify(prediction, null, 2), 'utf-8');
    console.log(`\n💾 Detaylı rapor kaydedildi: ${outputPath}`);

    return prediction;

  } catch (error) {
    console.error(`\n❌ HATA: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

function printPredictionReport(pred) {
  const divider = '─'.repeat(55);

  console.log('\n' + '═'.repeat(55));
  console.log('  📋 TAHMİN RAPORU');
  console.log('═'.repeat(55));

  console.log(`\n  🏟️  ${pred.match.homeTeam} vs ${pred.match.awayTeam}`);
  console.log(`  🏆  ${pred.match.tournament} — Hafta ${pred.match.round}`);
  console.log(`  📍  ${pred.match.stadium}`);
  console.log(`  👨‍⚖️  Hakem: ${pred.match.referee}`);

  console.log(`\n${divider}`);
  console.log('  🎯 MAÇ SONUCU TAHMİNİ');
  console.log(divider);
  console.log(`  1 (Ev Sahibi) : %${pred.result.homeWin}`);
  console.log(`  X (Beraberlik) : %${pred.result.draw}`);
  console.log(`  2 (Deplasman)  : %${pred.result.awayWin}`);
  console.log(`  ➡️  Tahmin: ${pred.result.mostLikelyResult}`);
  console.log(`  📈 Güven: %${pred.result.confidence}`);

  console.log(`\n${divider}`);
  console.log('  ⚽ SKOR TAHMİNİ');
  console.log(divider);
  console.log(`  En Olası Skor: ${pred.score.predicted} (%${pred.score.probability})`);
  if (pred.score.top5) {
    for (const s of pred.score.top5) {
      console.log(`    ${s.score} → %${s.probability}`);
    }
  }

  console.log(`\n${divider}`);
  console.log('  📊 GOL PİYASALARI');
  console.log(divider);
  console.log(`  Üst 1.5: %${pred.goals.over15}  |  Alt 1.5: %${pred.goals.under15}`);
  console.log(`  Üst 2.5: %${pred.goals.over25}  |  Alt 2.5: %${pred.goals.under25}`);
  console.log(`  Üst 3.5: %${pred.goals.over35}  |  Alt 3.5: %${pred.goals.under35}`);
  console.log(`  KG Var:  %${pred.goals.btts}   |  KG Yok:  %${pred.goals.bttsNo}`);

  console.log(`\n${divider}`);
  console.log('  🥅 İLK YARI');
  console.log(divider);
  console.log(`  İY Sonuç: ${pred.firstHalf.htResult}`);
  console.log(`  İY Üst 0.5: %${pred.firstHalf.over05HT}`);
  console.log(`  İY Üst 1.5: %${pred.firstHalf.over15HT}`);

  console.log(`\n${divider}`);
  console.log('  🚩 KORNER & KART');
  console.log(divider);
  console.log(`  Korner: ${pred.corners.expectedHome} - ${pred.corners.expectedAway} (Toplam: ${pred.corners.expectedTotal})`);
  console.log(`  Sarı Kart: ~${pred.cards.expectedYellowCards}`);
  console.log(`  Kırmızı Kart: ~${pred.cards.expectedRedCards}`);

  console.log(`\n${divider}`);
  console.log('  ⚡ TAKIM GÜÇ KARŞILAŞTIRMASI');
  console.log(divider);
  const c = pred.comparison;
  console.log(`  ${'Metrik'.padEnd(20)} ${'Ev'.padStart(7)} ${'Dep'.padStart(7)}`);
  console.log(`  ${'Hücum Gücü'.padEnd(20)} ${String(c.home.attackPower).padStart(7)} ${String(c.away.attackPower).padStart(7)}`);
  console.log(`  ${'Defans Gücü'.padEnd(20)} ${String(c.home.defensePower).padStart(7)} ${String(c.away.defensePower).padStart(7)}`);
  console.log(`  ${'Form'.padEnd(20)} ${String(c.home.form).padStart(7)} ${String(c.away.form).padStart(7)}`);
  console.log(`  ${'Oyuncu Kalitesi'.padEnd(20)} ${String(c.home.playerQuality).padStart(7)} ${String(c.away.playerQuality).padStart(7)}`);
  console.log(`  ${'Kaleci'.padEnd(20)} ${String(c.home.goalkeeperPower).padStart(7)} ${String(c.away.goalkeeperPower).padStart(7)}`);
  console.log(`  ${'Momentum'.padEnd(20)} ${String(c.home.momentum).padStart(7)} ${String(c.away.momentum).padStart(7)}`);
  console.log(`  ${'TOPLAM GÜÇ'.padEnd(20)} ${String(c.home.overallPower).padStart(7)} ${String(c.away.overallPower).padStart(7)}`);

  if (pred.highlights && pred.highlights.length > 0) {
    console.log(`\n${divider}`);
    console.log('  💡 ÖNE ÇIKAN NOTLAR');
    console.log(divider);
    for (const h of pred.highlights) {
      console.log(`  ${h}`);
    }
  }

  console.log('\n' + '═'.repeat(55));
}

// CLI ile çalıştırma
const eventId = process.argv[2];
if (!eventId) {
  console.log('Kullanım: node src/index.js <eventId>');
  console.log('Örnek:    node src/index.js 11874288');
  process.exit(1);
}

runPrediction(parseInt(eventId, 10));
