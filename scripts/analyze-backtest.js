#!/usr/bin/env node
/**
 * Backtest Diagnostic — her maç için neyi kaçırdık sınıflandırması.
 * Kullanım: node scripts/analyze-backtest.js backtest_2026-04-20.json
 */
const fs = require('fs');
const path = require('path');

const file = process.argv[2] || 'backtest_2026-04-20.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

// Dedup by match+actual — aynı eşleşme iki gün pencereli yakalanmış olabilir
const seen = new Set();
const unique = [];
for (const r of data.results) {
  const key = `${r.match}|${r.actual}`;
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(r);
}

const classify = (r) => {
  const [ah, aa] = r.actual.split('-').map(Number);
  const [ph, pa] = (r.predicted || '0-0').split('-').map(Number);
  const actualTotal = ah + aa;
  const predTotal = (isFinite(ph) ? ph : 0) + (isFinite(pa) ? pa : 0);
  const winnerGap = Math.abs(ah - aa) - Math.abs(ph - pa);

  const causes = [];
  if (!r.hit1X2) causes.push(`YANLIŞ_TARAF (olasılık: H${r.probHome?.toFixed(0)}/D${r.probDraw?.toFixed(0)}/A${r.probAway?.toFixed(0)} → gerçek ${r.actualResult})`);
  if (r.hit1X2 && !r.hitScore) {
    const marginDiff = Math.abs(ah - aa) - Math.abs(ph - pa);
    if (actualTotal !== predTotal) causes.push(`TOPLAM_GOL_SAPMA (tahmin ${predTotal}, gerçek ${actualTotal})`);
    if (marginDiff !== 0) causes.push(`MARJ_SAPMA (farkTahmin ${ph - pa}, farkGerçek ${ah - aa})`);
  }
  if (!r.hitOU25) causes.push(`O/U2.5_YANLIŞ (P=${r.probOU25?.toFixed(0)}% → ${r.predictedOU25} vs ${r.actualOU25})`);
  if (!r.hitBTTS) causes.push(`BTTS_YANLIŞ (P=${r.probBTTS?.toFixed(0)}% → ${r.predictedBTTS} vs ${r.actualBTTS})`);

  const oneGoalOff = !r.hitScore && r.hit1X2 && Math.abs(ah - ph) + Math.abs(aa - pa) === 1;
  const reversedSide = !r.hit1X2 && r.predictedResult !== 'X' && r.actualResult !== 'X' && r.predictedResult !== r.actualResult;

  const tags = [];
  if (r.hitScore) tags.push('✅ KESIN_SKOR');
  else if (oneGoalOff) tags.push('🟨 1_GOL_SAPMA');
  else if (reversedSide) tags.push('🟥 TERS_TARAF');
  else if (r.hit1X2) tags.push('🟧 TARAF_DOĞRU_SKOR_YANLIŞ');
  else tags.push('⬛ DRAW_ETRAFINDA_KAYBOLDU');

  return { tags, causes, actualTotal, predTotal };
};

let md = `# Backtest Maç-Maç Teşhis (${data.date})\n\n`;
md += `Toplam (dedup sonrası): **${unique.length}** maç\n\n`;

const summary = { exact: 0, oneGoal: 0, sideRight: 0, reversed: 0, drawLost: 0 };
const causeCounts = {};

md += `| # | Maç | Gerçek | Tahmin | Etiket | Nedenler |\n`;
md += `|---|---|---|---|---|---|\n`;

unique.forEach((r, i) => {
  const c = classify(r);
  if (r.hitScore) summary.exact++;
  else if (c.tags[0].includes('1_GOL_SAPMA')) summary.oneGoal++;
  else if (c.tags[0].includes('TARAF_DOĞRU')) summary.sideRight++;
  else if (c.tags[0].includes('TERS_TARAF')) summary.reversed++;
  else summary.drawLost++;
  for (const cause of c.causes) {
    const key = cause.split(' ')[0];
    causeCounts[key] = (causeCounts[key] || 0) + 1;
  }
  md += `| ${i + 1} | ${r.match} | ${r.actual} | ${r.predicted} | ${c.tags.join(' ')} | ${c.causes.join('; ') || '—'} |\n`;
});

md += `\n## Özet Dağılımı\n\n`;
md += `- ✅ Kesin skor tutan: **${summary.exact}** / ${unique.length} (${(summary.exact / unique.length * 100).toFixed(1)}%)\n`;
md += `- 🟨 1 gol sapmayla kaçan (taraf doğru): **${summary.oneGoal}** — *kısa mesafe, en iyileştirilebilir grup*\n`;
md += `- 🟧 Taraf doğru, skor uzak: **${summary.sideRight}**\n`;
md += `- 🟥 Taraf ters tahmin edildi: **${summary.reversed}** — *lambda kalibrasyonu sorunu*\n`;
md += `- ⬛ Draw etrafında kaybolan: **${summary.drawLost}**\n\n`;

md += `## Sistemik Neden Frekansı\n\n`;
const sorted = Object.entries(causeCounts).sort((a, b) => b[1] - a[1]);
for (const [cause, n] of sorted) md += `- **${cause}**: ${n} maç\n`;

md += `\n## Eyleme Dönük Çıkarımlar\n\n`;
const oneGoalPct = summary.oneGoal / unique.length * 100;
const reversedPct = summary.reversed / unique.length * 100;

md += `1. **1 gol sapmayla kaçan ${summary.oneGoal} maç**, toplam içinde %${oneGoalPct.toFixed(1)}. Bu grup, score distribution'ın tepesinden ±1 goldeki ikincil pikleri getirmekle iyileşir:\n`;
md += `   - Score calibration JSON ile spesifik skorlar (1-1, 2-1, 1-0) çarpanları eğitilebilir.\n`;
md += `   - H2H joint profile örneklem ağırlığı yükseltilebilir (şu an 2×, 3× denenebilir).\n\n`;
md += `2. **Ters taraf ${summary.reversed} maç** (%${reversedPct.toFixed(1)}) → Dixon-Coles lambda kaynakları (xG / stGF / M002) ağırlıklandırmasında olası yanlılık. Özellikle deplasman tarafını fazla küçümsüyor olabiliriz.\n\n`;
md += `3. **Toplam gol sapması** en sık neden ise overdispersion çarpanı CV × 0.6 yerine dinamik olarak CV × (leagueDrawTendency + 0.5) gibi türetilebilir.\n\n`;
md += `> Bu rapor sadece özet alanlardan üretildi. Tam skor dağılımı (top-5 skor olasılığı + λ) runner'a eklenirse "2. en olası skor tutardı mı" analizi de mümkün olur.\n`;

const outPath = path.join(path.dirname(file), `analysis_${path.basename(file, '.json')}.md`);
fs.writeFileSync(outPath, md, 'utf8');
console.log(`[analyze] wrote ${outPath}`);
console.log(`[analyze] exact=${summary.exact} oneGoalOff=${summary.oneGoal} sideRight=${summary.sideRight} reversed=${summary.reversed} drawLost=${summary.drawLost}`);
