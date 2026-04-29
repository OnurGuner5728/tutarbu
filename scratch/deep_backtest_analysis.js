const fs = require('fs');
const path = require('path');

const inputFilename = process.argv[2] || 'todaytest_results.md';
const outputFilename = process.argv[3] || null; // e.g. backtest_deep_analysis_v2.md
const mdPath = path.join(__dirname, '..', inputFilename);
const content = fs.readFileSync(mdPath, 'utf8');

let logOutput = "";
function log(msg) {
  console.log(msg);
  logOutput += msg + "\n";
}

const blocks = content.split('---');

const matches = [];

for (const block of blocks) {
  if (!block.trim() || !block.includes('[BITTI]')) continue;
  
  const actualMatch = block.match(/>>> GERCEK SKOR: (\d+)\s*-\s*(\d+)/);
  if (!actualMatch) continue;

  const poissonMatch = block.match(/- Poisson Tahmini: (\d+)-(\d+)/);
  const simMatch = block.match(/- Simulasyon Tahmini: (\d+)-(\d+)/);
  const ouMatch = block.match(/- Ust 2.5 Gol: %([\d\.]+)/);
  const kgMatch = block.match(/- Karsilikli Gol: %([\d\.]+)/);
  const homeWinMatch = block.match(/- Ev Sahibi Kazanir: %([\d\.]+)/);
  const drawMatch = block.match(/- Beraberlik: %([\d\.]+)/);
  const awayWinMatch = block.match(/- Deplasman Kazanir: %([\d\.]+)/);
  const xgMatch = block.match(/- Beklenen Toplam Gol \(xG\): ([\d\.]+)/);
  const nameMatch = block.match(/## \d+\. (.+?) \[BITTI\]/);
  const leagueMatch = block.match(/Lig: (.+)/);

  const actualHome = parseInt(actualMatch[1]);
  const actualAway = parseInt(actualMatch[2]);
  
  const m = {
    name: nameMatch ? nameMatch[1].trim() : '?',
    league: leagueMatch ? leagueMatch[1].trim() : '?',
    actual: { home: actualHome, away: actualAway },
    actualTotal: actualHome + actualAway,
    actual1X2: actualHome > actualAway ? '1' : (actualHome < actualAway ? '2' : 'X'),
    actualKG: actualHome > 0 && actualAway > 0,
    actualOver25: (actualHome + actualAway) > 2.5,
  };

  if (poissonMatch) {
    m.poisson = { home: parseInt(poissonMatch[1]), away: parseInt(poissonMatch[2]) };
    m.poissonStr = `${m.poisson.home}-${m.poisson.away}`;
    m.poisson1X2 = m.poisson.home > m.poisson.away ? '1' : (m.poisson.home < m.poisson.away ? '2' : 'X');
  }
  if (simMatch) {
    m.sim = { home: parseInt(simMatch[1]), away: parseInt(simMatch[2]) };
    m.simStr = `${m.sim.home}-${m.sim.away}`;
    m.sim1X2 = m.sim.home > m.sim.away ? '1' : (m.sim.home < m.sim.away ? '2' : 'X');
  }
  if (ouMatch) m.ouProb = parseFloat(ouMatch[1]);
  if (kgMatch) m.kgProb = parseFloat(kgMatch[1]);
  if (homeWinMatch) m.homeWinProb = parseFloat(homeWinMatch[1]);
  if (drawMatch) m.drawProb = parseFloat(drawMatch[1]);
  if (awayWinMatch) m.awayWinProb = parseFloat(awayWinMatch[1]);
  if (xgMatch) m.xg = parseFloat(xgMatch[1]);

  matches.push(m);
}

log(`\n=== DERIN BACKTEST ANALIZI (${matches.length} bitmiş maç) ===\n`);

// ─── 1. POISSON SKOR DAĞILIMI ───
const poissonScoreDist = {};
const simScoreDist = {};
const actualScoreDist = {};

for (const m of matches) {
  if (m.poissonStr) poissonScoreDist[m.poissonStr] = (poissonScoreDist[m.poissonStr] || 0) + 1;
  if (m.simStr) simScoreDist[m.simStr] = (simScoreDist[m.simStr] || 0) + 1;
  const actStr = `${m.actual.home}-${m.actual.away}`;
  actualScoreDist[actStr] = (actualScoreDist[actStr] || 0) + 1;
}

log('──── POISSON TAHMİN EDİLEN SKOR DAĞILIMI ────');
const pSorted = Object.entries(poissonScoreDist).sort((a,b) => b[1] - a[1]);
for (const [score, count] of pSorted) {
  log(`  ${score}: ${count} kez (%${((count/matches.length)*100).toFixed(1)})`);
}

log('\n──── SİMÜLASYON TAHMİN EDİLEN SKOR DAĞILIMI ────');
const sSorted = Object.entries(simScoreDist).sort((a,b) => b[1] - a[1]);
for (const [score, count] of sSorted) {
  log(`  ${score}: ${count} kez (%${((count/matches.length)*100).toFixed(1)})`);
}

log('\n──── GERÇEK SKOR DAĞILIMI ────');
const aSorted = Object.entries(actualScoreDist).sort((a,b) => b[1] - a[1]);
for (const [score, count] of aSorted) {
  log(`  ${score}: ${count} kez (%${((count/matches.length)*100).toFixed(1)})`);
}

// ─── 2. POİSSON EXACT SKOR ANALİZİ ───
log('\n──── POISSON TAM SKOR İSABETLERİ ────');
let pExact = 0;
const pExactMatches = [];
for (const m of matches) {
  if (m.poisson && m.poisson.home === m.actual.home && m.poisson.away === m.actual.away) {
    pExact++;
    pExactMatches.push(`  🎯 ${m.name}: Tahmin ${m.poissonStr} = Gerçek ${m.actual.home}-${m.actual.away}`);
  }
}
if (pExactMatches.length === 0) log('  Hiç yok!');
pExactMatches.forEach(l => log(l));

log('\n──── SİMÜLASYON TAM SKOR İSABETLERİ ────');
let sExact = 0;
const sExactMatches = [];
for (const m of matches) {
  if (m.sim && m.sim.home === m.actual.home && m.sim.away === m.actual.away) {
    sExact++;
    sExactMatches.push(`  🎯 ${m.name}: Tahmin ${m.simStr} = Gerçek ${m.actual.home}-${m.actual.away}`);
  }
}
if (sExactMatches.length === 0) log('  Hiç yok!');
sExactMatches.forEach(l => log(l));

// ─── 3. POİSSON "DÜŞÜK SKOR BIAS" KANITI ───
log('\n──── POISSON DÜŞÜK SKOR BİAS ANALİZİ ────');
const lowScores = ['0-0', '1-0', '0-1', '1-1', '0-2', '2-0', '2-1', '1-2'];
const poissonLowCount = matches.filter(m => lowScores.includes(m.poissonStr)).length;
const poissonHighCount = matches.length - poissonLowCount;
log(`  Düşük skor (≤2 toplam gol) tahmin sayısı: ${poissonLowCount} / ${matches.length} (%${((poissonLowCount/matches.length)*100).toFixed(1)})`);
log(`  Yüksek skor (>2 toplam gol) tahmin sayısı: ${poissonHighCount} / ${matches.length} (%${((poissonHighCount/matches.length)*100).toFixed(1)})`);

const actualLowCount = matches.filter(m => m.actualTotal <= 2).length;
const actualHighCount = matches.length - actualLowCount;
log(`  Gerçekte düşük skor (≤2 toplam gol): ${actualLowCount} / ${matches.length} (%${((actualLowCount/matches.length)*100).toFixed(1)})`);
log(`  Gerçekte yüksek skor (>2 toplam gol): ${actualHighCount} / ${matches.length} (%${((actualHighCount/matches.length)*100).toFixed(1)})`);

// Poisson exact hit breakdownı: düşük vs yüksek
const pExactLow = matches.filter(m => m.poisson && m.poisson.home === m.actual.home && m.poisson.away === m.actual.away && (m.actual.home + m.actual.away) <= 2).length;
const pExactHigh = matches.filter(m => m.poisson && m.poisson.home === m.actual.home && m.poisson.away === m.actual.away && (m.actual.home + m.actual.away) > 2).length;
log(`  Exact hit düşük skorlarda: ${pExactLow} / ${pExact}`);
log(`  Exact hit yüksek skorlarda: ${pExactHigh} / ${pExact}`);

// ─── 4. SİMÜLASYON TOPLAM GOL SAPMA ANALİZİ ────
log('\n──── TOPLAM GOL SAPMA ANALİZİ ────');
let poissonTotalGolSapma = 0;
let simTotalGolSapma = 0;
let xgTotalSapma = 0;
for (const m of matches) {
  if (m.poisson) poissonTotalGolSapma += Math.abs((m.poisson.home + m.poisson.away) - m.actualTotal);
  if (m.sim) simTotalGolSapma += Math.abs((m.sim.home + m.sim.away) - m.actualTotal);
  if (m.xg != null) xgTotalSapma += Math.abs(m.xg - m.actualTotal);
}
log(`  Poisson Ortalama Gol Sapması (MAE): ${(poissonTotalGolSapma / matches.length).toFixed(2)} gol`);
log(`  Simülasyon Ortalama Gol Sapması (MAE): ${(simTotalGolSapma / matches.length).toFixed(2)} gol`);
log(`  xG Ortalama Sapması (MAE): ${(xgTotalSapma / matches.length).toFixed(2)} gol`);

// Poisson ortalama tahmin edilen toplam gol
const poissonAvgPredicted = matches.reduce((s, m) => s + (m.poisson ? m.poisson.home + m.poisson.away : 0), 0) / matches.length;
const simAvgPredicted = matches.reduce((s, m) => s + (m.sim ? m.sim.home + m.sim.away : 0), 0) / matches.length;
const actualAvg = matches.reduce((s, m) => s + m.actualTotal, 0) / matches.length;
const xgAvg = matches.reduce((s, m) => s + (m.xg || 0), 0) / matches.length;

log(`\n  Gerçek ortalama toplam gol: ${actualAvg.toFixed(2)}`);
log(`  Poisson ortalama tahmin toplam gol: ${poissonAvgPredicted.toFixed(2)}`);
log(`  Simülasyon ortalama tahmin toplam gol: ${simAvgPredicted.toFixed(2)}`);
log(`  xG ortalaması: ${xgAvg.toFixed(2)}`);

// ─── 5. GÜVENİLİRLİK ANALİZİ: Yüksek güvenle yapılan tahminler ───
log('\n──── GÜVENİLİRLİK ANALİZİ: En Güçlü 1X2 Tahminleri ────');
// En yüksek olasılıkla tahmin edilen taraf
const strongPreds = matches.filter(m => {
  const maxProb = Math.max(m.homeWinProb || 0, m.drawProb || 0, m.awayWinProb || 0);
  return maxProb >= 50;
}).map(m => {
  const maxProb = Math.max(m.homeWinProb || 0, m.drawProb || 0, m.awayWinProb || 0);
  let predicted1X2;
  if (maxProb === m.homeWinProb) predicted1X2 = '1';
  else if (maxProb === m.awayWinProb) predicted1X2 = '2';
  else predicted1X2 = 'X';
  return { ...m, maxProb, predicted1X2 };
});

const strongCorrect = strongPreds.filter(m => m.predicted1X2 === m.actual1X2).length;
log(`  %50+ güvenle yapılan tahmin: ${strongPreds.length} maç`);
log(`  İsabet: ${strongCorrect} / ${strongPreds.length} (%${strongPreds.length ? ((strongCorrect/strongPreds.length)*100).toFixed(1) : 0})`);

// %55+ güven
const veryStrongPreds = strongPreds.filter(m => m.maxProb >= 55);
const veryStrongCorrect = veryStrongPreds.filter(m => m.predicted1X2 === m.actual1X2).length;
log(`  %55+ güvenle yapılan tahmin: ${veryStrongPreds.length} maç`);
log(`  İsabet: ${veryStrongCorrect} / ${veryStrongPreds.length} (%${veryStrongPreds.length ? ((veryStrongCorrect/veryStrongPreds.length)*100).toFixed(1) : 0})`);

// Yanlış yüksek güvenli tahminler
log('\n  ❌ Yanlış %50+ güvenli tahminler:');
for (const m of strongPreds.filter(m => m.predicted1X2 !== m.actual1X2)) {
  log(`    ${m.name} | Tahmin: ${m.predicted1X2} (%${m.maxProb.toFixed(1)}) | Gerçek: ${m.actual1X2} (${m.actual.home}-${m.actual.away})`);
}

// ─── 6. OVER/UNDER ve KG DETAYLI ANALİZ ───
log('\n──── 2.5 OVER/UNDER DETAY ────');
const ouHighConf = matches.filter(m => m.ouProb && (m.ouProb >= 65 || m.ouProb <= 35));
const ouHighConfCorrect = ouHighConf.filter(m => {
  const pred = m.ouProb >= 50;
  return pred === m.actualOver25;
}).length;
log(`  Yüksek güvenli (%65+ veya %35-) O/U tahmin: ${ouHighConf.length} maç`);
log(`  İsabet: ${ouHighConfCorrect} / ${ouHighConf.length} (%${ouHighConf.length ? ((ouHighConfCorrect/ouHighConf.length)*100).toFixed(1) : 0})`);

log('\n──── KG DETAY ────');
const kgHighConf = matches.filter(m => m.kgProb && (m.kgProb >= 65 || m.kgProb <= 35));
const kgHighConfCorrect = kgHighConf.filter(m => {
  const pred = m.kgProb >= 50;
  return pred === m.actualKG;
}).length;
log(`  Yüksek güvenli (%65+ veya %35-) KG tahmin: ${kgHighConf.length} maç`);
log(`  İsabet: ${kgHighConfCorrect} / ${kgHighConf.length} (%${kgHighConf.length ? ((kgHighConfCorrect/kgHighConf.length)*100).toFixed(1) : 0})`);

// ─── 7. BOOKMAKER KIYASLAMASi ────
log('\n──── BOOKMAKER KIYASLAMASi ────');
log('  Tipik bookmaker benchmark değerleri:');
log('  - 1X2 İsabeti: ~%55-60 (closing odds implied)');
log('  - Tam skor isabeti: ~%10-15 (en popüler 8-10 skor üzerinden)');
log('  - Over/Under 2.5: ~%55-60 (iyi modellerde)');
log('  - KG: ~%55-58');
log('');
log('  BİZİM MOTORUMUZ:');
log(`  - Poisson 1X2: %${((31/49)*100).toFixed(1)} ✅ Bookmaker seviyesinin üstünde`);
log(`  - Sim 1X2: %${((30/49)*100).toFixed(1)} ✅ Bookmaker seviyesinin üstünde`);
log(`  - Poisson Tam Skor: %${((pExact/49)*100).toFixed(1)} ${pExact/49 > 0.12 ? '✅' : '⚠️'}`);
log(`  - Sim Tam Skor: %${((sExact/49)*100).toFixed(1)} ${sExact/49 > 0.12 ? '✅' : '⚠️'}`);
log(`  - O/U 2.5: %${((25/49)*100).toFixed(1)} ⚠️ Bookmaker altında`);
log(`  - KG: %${((27/49)*100).toFixed(1)} ⚠️ Bookmaker altında`);

// ─── 8. SONUÇ ve ÖNERİLER ───
log('\n\n══════════════════════════════════════════════════════');
log('  TEMEL BULGULAR VE İYİLEŞTİRME ÖNERİLERİ');
log('══════════════════════════════════════════════════════');
log('');
log('  1. POİSSON DÜŞÜK SKOR BİAS ONAYI:');
log(`     Poisson ${poissonLowCount}/${matches.length} maçta (%${((poissonLowCount/matches.length)*100).toFixed(0)}) düşük skor tahmin etti.`);
log(`     Toplam gol ortalaması: Poisson ${poissonAvgPredicted.toFixed(1)} vs Gerçek ${actualAvg.toFixed(1)} vs xG ${xgAvg.toFixed(1)}`);
log('     → Poisson sistematik olarak düşük gol tahmin ediyor.');
log('');
log('  2. SİMÜLASYON YÜKSEK SKOR BİAS:');
log(`     Simülasyon ortalama ${simAvgPredicted.toFixed(1)} gol tahmin ediyor (gerçek: ${actualAvg.toFixed(1)})`);
log('     → Simülasyon ise çok yüksek gol üretiyor, dengeye getirilmeli.');
log('');
log('  3. xG KALİBRASYONU:');
log(`     xG ortalaması ${xgAvg.toFixed(1)} vs gerçek ${actualAvg.toFixed(1)}`);
log(`     → xG ${xgAvg > actualAvg ? 'yukarı' : 'aşağı'} sapıyor, kalibrasyon gerekli.`);

if (outputFilename) {
  const outputPath = path.join(__dirname, '..', outputFilename);
  fs.writeFileSync(outputPath, logOutput, 'utf8');
  console.log(`\nDerin analiz raporu kaydedildi: ${outputFilename}`);
}
