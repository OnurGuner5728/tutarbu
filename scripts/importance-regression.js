/**
 * Aşama 6: Maçın Önemi → λ Kanıt Prosedürü
 * 
 * Backtest verisinden goalsScored vs gapImportance regresyonu yapar.
 * β anlamlıysa (p<0.05) entegrasyon parametreleri önerir.
 */
const fs = require('fs');

const btFile = 'backtest_comprehensive.json';
if (!fs.existsSync(btFile)) {
  console.error('❌ backtest_comprehensive.json bulunamadı. Önce backtest çalıştırın.');
  process.exit(1);
}

const bt = JSON.parse(fs.readFileSync(btFile, 'utf8'));
const matches = bt.matches || [];

// M172 = contextual importance metriği
// Backtest'ten gol ve importance bilgisi topla
const data = [];
for (const m of matches) {
  const scoreParts = (m.actual?.score || '').split('-');
  const hg = parseInt(scoreParts[0]) || 0;
  const ag = parseInt(scoreParts[1]) || 0;
  const totalGoals = hg + ag;
  // M172 veya urgency proxy'si olarak lambda ratio kullanabiliriz
  // Standings gap: model'in ürettiği homeWin-awayWin olasılık farkı 
  // (güçlü takım daha büyük fark → daha az gol ihtiyacı)
  const hw = m.model?.probs?.[0] ?? 0.33;
  const aw = m.model?.probs?.[2] ?? 0.33;
  const importance = Math.abs(hw - aw); // 0=çok eşit(kritik), 1=çok farklı(rahat)
  // Ters çevir: eşit maç daha "önemli/stresli"
  const gapImportance = 1 - importance;
  
  data.push({ totalGoals, gapImportance });
}

if (data.length < 10) {
  console.error('❌ En az 10 maç gerekli. Mevcut:', data.length);
  process.exit(1);
}

// Basit lineer regresyon: y = α + β × x
const n = data.length;
const sumX = data.reduce((s, d) => s + d.gapImportance, 0);
const sumY = data.reduce((s, d) => s + d.totalGoals, 0);
const sumXY = data.reduce((s, d) => s + d.gapImportance * d.totalGoals, 0);
const sumX2 = data.reduce((s, d) => s + d.gapImportance * d.gapImportance, 0);

const meanX = sumX / n;
const meanY = sumY / n;
const Sxx = sumX2 - n * meanX * meanX;
const Sxy = sumXY - n * meanX * meanY;

const beta = Sxy / Sxx;
const alpha = meanY - beta * meanX;

// Residuals ve standard error
const residuals = data.map(d => d.totalGoals - (alpha + beta * d.gapImportance));
const SSR = residuals.reduce((s, r) => s + r * r, 0);
const MSE = SSR / (n - 2);
const SE_beta = Math.sqrt(MSE / Sxx);

// t-statistic
const t_stat = beta / SE_beta;

// p-value (iki kuyruklu, t-dağılımı yaklaşımı)
const df = n - 2;
// Basit yaklaşım: |t| > 2.0 → p < 0.05 (df >= 10 için yeterli)
const significant = Math.abs(t_stat) > 2.0;

// Goal istatistikleri
const stdGoals = Math.sqrt(data.reduce((s, d) => s + Math.pow(d.totalGoals - meanY, 2), 0) / (n - 1));
const betaScaled = beta * stdGoals / (meanY > 0 ? meanY : 1);

// R²
const SST = data.reduce((s, d) => s + Math.pow(d.totalGoals - meanY, 2), 0);
const R2 = 1 - SSR / SST;

console.log('═══════════════════════════════════════════════════');
console.log('AŞAMA 6: Maçın Önemi → λ Kanıt Prosedürü');
console.log('═══════════════════════════════════════════════════');
console.log(`n = ${n} maç`);
console.log(`Mean goals/match = ${meanY.toFixed(2)}`);
console.log(`σ(goals) = ${stdGoals.toFixed(2)}`);
console.log(`Mean gapImportance = ${meanX.toFixed(3)}`);
console.log('');
console.log('Regresyon: goalsScored = α + β × gapImportance');
console.log(`  α = ${alpha.toFixed(4)}`);
console.log(`  β = ${beta.toFixed(4)}`);
console.log(`  SE(β) = ${SE_beta.toFixed(4)}`);
console.log(`  t = ${t_stat.toFixed(3)}`);
console.log(`  R² = ${R2.toFixed(4)}`);
console.log(`  p < 0.05? ${significant ? 'EVET ✅' : 'HAYIR ❌'}`);
console.log('');

if (significant) {
  console.log('📊 β anlamlı — entegrasyon öneriliyor.');
  console.log(`  β_scaled = β × σ/μ = ${betaScaled.toFixed(4)}`);
  console.log(`  Yön: ${beta > 0 ? '+' : '-'} (önemli maç gol ${beta > 0 ? 'artırıyor' : 'azaltıyor'})`);
  console.log(`  Önerilen: λ *= 1 + M172_normalized × ${betaScaled.toFixed(4)}`);
} else {
  console.log('📊 β ANLAMsız — Aşama 6 entegrasyonu ATLANMALI.');
  console.log('  Maçın önemi gol sayısını istatistiksel olarak etkilemiyor.');
}

// JSON çıktı
const result = {
  n, alpha, beta, SE_beta, t_stat, R2, significant, betaScaled,
  meanGoals: meanY, stdGoals, meanImportance: meanX,
  recommendation: significant ? 'INTEGRATE' : 'SKIP'
};
fs.writeFileSync('importance_regression.json', JSON.stringify(result, null, 2), 'utf8');
console.log('\n✅ Sonuç kaydedildi: importance_regression.json');
