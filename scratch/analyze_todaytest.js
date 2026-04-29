const fs = require('fs');
const path = require('path');

const mdFilename = process.argv[2] || 'todaytest_results.md';
const mdPath = path.join(__dirname, '..', mdFilename);
const content = fs.readFileSync(mdPath, 'utf8');

const blocks = content.split('---');
const headerBlock = blocks[0];
const matchesBlocks = blocks.slice(1);

let stats = {
  totalFinished: 0,
  poisson1X2: 0,
  sim1X2: 0,
  poissonExact: 0,
  simExact: 0,
  ou25Correct: 0,
  kgCorrect: 0
};

const newMatchesBlocks = [];

for (const block of matchesBlocks) {
  if (!block.trim()) continue;

  let newBlock = block;
  
  const isFinished = block.includes('[BITTI]');
  const actualScoreMatch = block.match(/>>> GERCEK SKOR: (\d+)\s*-\s*(\d+)/);
  
  if (isFinished && actualScoreMatch) {
    stats.totalFinished++;
    
    const actualHome = parseInt(actualScoreMatch[1]);
    const actualAway = parseInt(actualScoreMatch[2]);
    const actualTotal = actualHome + actualAway;
    const actual1X2 = actualHome > actualAway ? '1' : (actualHome < actualAway ? '2' : 'X');
    const actualOver25 = actualTotal > 2.5;
    const actualKG = actualHome > 0 && actualAway > 0;

    const poissonMatch = block.match(/- Poisson Tahmini: (\d+)-(\d+)/);
    const simMatch = block.match(/- Simulasyon Tahmini: (\d+)-(\d+)/);
    const ouMatch = block.match(/- Ust 2.5 Gol: %([\d\.]+)/);
    const kgMatch = block.match(/- Karsilikli Gol: %([\d\.]+)/);

    let pHome = -1, pAway = -1, p1X2 = null;
    let sHome = -1, sAway = -1, s1X2 = null;
    
    if (poissonMatch) {
      pHome = parseInt(poissonMatch[1]);
      pAway = parseInt(poissonMatch[2]);
      p1X2 = pHome > pAway ? '1' : (pHome < pAway ? '2' : 'X');
      
      const isExact = pHome === actualHome && pAway === actualAway;
      const is1X2 = p1X2 === actual1X2;
      
      if (isExact) stats.poissonExact++;
      if (is1X2) stats.poisson1X2++;
      
      newBlock = newBlock.replace(
        /- Poisson Tahmini: .*/,
        `- Poisson Tahmini: ${pHome}-${pAway} (1X2: ${p1X2}) -> ${isExact ? '🎯 TAM SKOR' : (is1X2 ? '✅ Taraf Bildi' : '❌ Bilemedi')}`
      );
    }

    if (simMatch) {
      sHome = parseInt(simMatch[1]);
      sAway = parseInt(simMatch[2]);
      s1X2 = sHome > sAway ? '1' : (sHome < sAway ? '2' : 'X');
      
      const isExact = sHome === actualHome && sAway === actualAway;
      const is1X2 = s1X2 === actual1X2;
      
      if (isExact) stats.simExact++;
      if (is1X2) stats.sim1X2++;
      
      newBlock = newBlock.replace(
        /- Simulasyon Tahmini: .*/,
        `- Simulasyon Tahmini: ${sHome}-${sAway} (1X2: ${s1X2}) -> ${isExact ? '🎯 TAM SKOR' : (is1X2 ? '✅ Taraf Bildi' : '❌ Bilemedi')}`
      );
    }

    if (ouMatch) {
      const ouProb = parseFloat(ouMatch[1]);
      const predOver = ouProb >= 50;
      const ouCorrect = predOver === actualOver25;
      if (ouCorrect) stats.ou25Correct++;
      
      newBlock = newBlock.replace(
        /- Ust 2.5 Gol: .*/,
        `- Ust 2.5 Gol: %${ouProb} -> Tahmin: ${predOver ? 'ÜST' : 'ALT'} | Gerçekleşen: ${actualOver25 ? 'ÜST' : 'ALT'} -> ${ouCorrect ? '✅ Bildi' : '❌ Bilemedi'}`
      );
    }

    if (kgMatch) {
      const kgProb = parseFloat(kgMatch[1]);
      const predKG = kgProb >= 50;
      const kgCorrect = predKG === actualKG;
      if (kgCorrect) stats.kgCorrect++;
      
      newBlock = newBlock.replace(
        /- Karsilikli Gol: .*/,
        `- Karsilikli Gol: %${kgProb} -> Tahmin: ${predKG ? 'VAR' : 'YOK'} | Gerçekleşen: ${actualKG ? 'VAR' : 'YOK'} -> ${kgCorrect ? '✅ Bildi' : '❌ Bilemedi'}`
      );
    }
  }

  newMatchesBlocks.push(newBlock);
}

const dateMatch = headerBlock.match(/# TodayTest Backtest Raporu - ([\d-]+)/) || headerBlock.match(/# TodayTest - ([\d-]+)/);
const dateStr = dateMatch ? dateMatch[1] : 'Bilinmeyen Tarih';

const newHeader = `# TodayTest Backtest Raporu - ${dateStr}

Detaylı analiz sonuçları (${stats.totalFinished} bitmiş maç):

## 🌌 Simülasyon Başarısı
- **1X2 İsabeti:** ${stats.sim1X2} / ${stats.totalFinished} (%${((stats.sim1X2/stats.totalFinished)*100).toFixed(1)})
- **Tam Skor İsabeti:** ${stats.simExact} / ${stats.totalFinished} (%${((stats.simExact/stats.totalFinished)*100).toFixed(1)})

## 📈 Poisson Başarısı
- **1X2 İsabeti:** ${stats.poisson1X2} / ${stats.totalFinished} (%${((stats.poisson1X2/stats.totalFinished)*100).toFixed(1)})
- **Tam Skor İsabeti:** ${stats.poissonExact} / ${stats.totalFinished} (%${((stats.poissonExact/stats.totalFinished)*100).toFixed(1)})

## ⚽ Genel Gol Tahminleri (Algoritma Karma)
- **2.5 Alt/Üst İsabeti:** ${stats.ou25Correct} / ${stats.totalFinished} (%${((stats.ou25Correct/stats.totalFinished)*100).toFixed(1)})
- **Karşılıklı Gol (KG) İsabeti:** ${stats.kgCorrect} / ${stats.totalFinished} (%${((stats.kgCorrect/stats.totalFinished)*100).toFixed(1)})

`;

const finalContent = newHeader.trim() + '\n\n---\n\n' + newMatchesBlocks.join('\n\n---\n\n');

fs.writeFileSync(mdPath, finalContent, 'utf8');
console.log('Rapor guncellendi.');
