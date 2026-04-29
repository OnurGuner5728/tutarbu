const fs = require('fs');
const path = require('path');

const API_BASE = 'http://127.0.0.1:3001/api';
const outputPath = process.argv[3] 
  ? path.join(__dirname, '..', '..', process.argv[3])
  : path.join(__dirname, '..', '..', 'todaytest_results.md');

function get1X2(scoreStr) {
  if (!scoreStr || !scoreStr.includes('-')) return null;
  const parts = scoreStr.split('-');
  const h = parseInt(parts[0].trim());
  const a = parseInt(parts[1].trim());
  if (isNaN(h) || isNaN(a)) return null;
  if (h > a) return '1';
  if (h < a) return '2';
  return 'X';
}

function writeReport(results) {
  const sorted = [...results].sort((a, b) => b.totalXg - a.totalXg);
  const lines = [];

  const dateStr = process.argv[2] || new Date().toISOString().split('T')[0];
  const finishedMatches = results.filter(r => r.status === 'finished' && r.actualScore);
  const poissonExact = finishedMatches.filter(r => r.poissonExactHit).length;
  const simExact = finishedMatches.filter(r => r.simExactHit).length;
  const poisson1X2 = finishedMatches.filter(r => r.poisson1X2Hit).length;
  const sim1X2 = finishedMatches.filter(r => r.sim1X2Hit).length;
  const totalFinished = finishedMatches.length;

  lines.push('# TodayTest - ' + dateStr);
  lines.push('');
  lines.push(results.length + ' mac analiz edildi (' + totalFinished + ' bitmis)');
  lines.push('');

  if (totalFinished > 0) {
    lines.push('## Backtest Sonuclari');
    lines.push(`- **Poisson Dogru Skor:** ${poissonExact} / ${totalFinished} (%${((poissonExact/totalFinished)*100).toFixed(1)})`);
    lines.push(`- **Simulasyon Dogru Skor:** ${simExact} / ${totalFinished} (%${((simExact/totalFinished)*100).toFixed(1)})`);
    lines.push(`- **Poisson 1X2 Dogrulugu:** ${poisson1X2} / ${totalFinished} (%${((poisson1X2/totalFinished)*100).toFixed(1)})`);
    lines.push(`- **Simulasyon 1X2 Dogrulugu:** ${sim1X2} / ${totalFinished} (%${((sim1X2/totalFinished)*100).toFixed(1)})`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  sorted.forEach((r, idx) => {
    const emoji = r.status === 'finished' ? '[BITTI]' : r.status === 'inprogress' ? '[CANLI]' : '[BASLAMADI]';
    
    lines.push('## ' + (idx + 1) + '. ' + r.homeTeam + ' vs ' + r.awayTeam + ' ' + emoji);
    lines.push('Lig: ' + r.league);
    lines.push('');
    lines.push('- Poisson Tahmini: ' + r.poissonScore + (r.status === 'finished' && r.actualScore ? ` (1X2: ${r.poisson1X2}) -> ${r.poissonExactHit ? '✅ Skor Bildi' : (r.poisson1X2Hit ? '✅ Taraf Bildi' : '❌ Bilemedi')}` : ''));
    lines.push('- Simulasyon Tahmini: ' + r.simScore + (r.status === 'finished' && r.actualScore ? ` (1X2: ${r.sim1X2}) -> ${r.simExactHit ? '✅ Skor Bildi' : (r.sim1X2Hit ? '✅ Taraf Bildi' : '❌ Bilemedi')}` : ''));
    lines.push('- Beklenen Toplam Gol (xG): ' + r.totalXg.toFixed(2));
    lines.push('- Ev Sahibi Kazanir: ' + r.homeWin);
    lines.push('- Beraberlik: ' + r.draw);
    lines.push('- Deplasman Kazanir: ' + r.awayWin);
    lines.push('- Ust 2.5 Gol: ' + r.over25);
    lines.push('- Karsilikli Gol: ' + r.btts);
    
    if (r.status === 'finished' && r.actualScore) {
      lines.push('');
      lines.push('>>> GERCEK SKOR: ' + r.actualScore + ' (1X2: ' + r.actual1X2 + ')');
    }
    
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
}

async function run() {
  const dateStr = process.argv[2] || new Date().toISOString().split('T')[0];
  console.log('[TodayTest] Sunucuya baglaniliyor... (' + dateStr + ')');
  
  let matches;
  try {
    const res = await fetch(API_BASE + '/matches?date=' + dateStr);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    matches = await res.json();
  } catch (err) {
    console.error('[TodayTest] HATA: Sunucuya baglanilamadi. npm run server calisiyor mu? (' + err.message + ')');
    process.exit(1);
  }

  if (!Array.isArray(matches) || matches.length === 0) {
    console.error('[TodayTest] HATA: Sunucu bos liste dondu.');
    process.exit(1);
  }

  matches = matches.slice(0, 50);
  console.log('[TodayTest] ' + matches.length + ' mac analiz edilecek.\n');

  const results = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const eventId = match.id;
    const homeTeam = match.homeTeam || '?';
    const awayTeam = match.awayTeam || '?';
    const league = match.tournament || '?';
    const status = match.status || 'notstarted';
    
    // Gercek skor sadece bitmis maclar icin
    let actualScore = '';
    let actual1X2 = null;
    if (status === 'finished' && match.homeScore != null && match.awayScore != null) {
      actualScore = match.homeScore + ' - ' + match.awayScore;
      actual1X2 = get1X2(actualScore);
    }

    console.log('[' + (i + 1) + '/' + matches.length + '] ' + homeTeam + ' vs ' + awayTeam);

    try {
      const predRes = await fetch(API_BASE + '/predict/' + eventId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selectedMetrics: [], runs: 1 })
      });
      if (!predRes.ok) throw new Error('Sunucu HTTP ' + predRes.status);
      
      const pred = await predRes.json();

      const poissonScore = pred.score && pred.score.predicted ? pred.score.predicted : 'N/A';
      
      const simDist = pred.result && pred.result.simulation ? pred.result.simulation.distribution : null;
      const simScore = simDist && simDist.topScore ? simDist.topScore : 'N/A';

      const poisson1X2 = get1X2(poissonScore);
      const sim1X2 = get1X2(simScore);

      const poissonExactHit = (status === 'finished' && poissonScore === actualScore);
      const simExactHit = (status === 'finished' && simScore === actualScore);
      
      const poisson1X2Hit = (status === 'finished' && poisson1X2 === actual1X2 && poisson1X2 !== null);
      const sim1X2Hit = (status === 'finished' && sim1X2 === actual1X2 && sim1X2 !== null);

      const homeXg = (pred.score && pred.score.lambdaHome != null) ? pred.score.lambdaHome : 0;
      const awayXg = (pred.score && pred.score.lambdaAway != null) ? pred.score.lambdaAway : 0;
      const totalXg = homeXg + awayXg;

      const homeWin = (pred.result && pred.result.homeWin != null) ? '%' + pred.result.homeWin : '-';
      const draw = (pred.result && pred.result.draw != null) ? '%' + pred.result.draw : '-';
      const awayWin = (pred.result && pred.result.awayWin != null) ? '%' + pred.result.awayWin : '-';

      const over25 = (pred.goals && pred.goals.over25 != null) ? '%' + pred.goals.over25 : '-';
      const btts = (pred.goals && pred.goals.btts != null) ? '%' + pred.goals.btts : '-';

      results.push({
        homeTeam, awayTeam, league, status, actualScore, actual1X2,
        poissonScore, simScore, poisson1X2, sim1X2,
        poissonExactHit, simExactHit, poisson1X2Hit, sim1X2Hit,
        totalXg, homeWin, draw, awayWin, over25, btts
      });

      // Her mactan sonra dosyaya yaz
      writeReport(results);
      
      let debugStr = '  Poisson: ' + poissonScore + ' | Sim: ' + simScore;
      if (status === 'finished' && actualScore) {
         debugStr += ` | Gercek: ${actualScore}`;
      }
      console.log(debugStr);

    } catch (e) {
      console.error('  HATA: ' + e.message);
      results.push({
        homeTeam, awayTeam, league, status, actualScore, actual1X2: null,
        poissonScore: 'HATA', simScore: 'HATA', poisson1X2: null, sim1X2: null,
        poissonExactHit: false, simExactHit: false, poisson1X2Hit: false, sim1X2Hit: false,
        totalXg: 0, homeWin: '-', draw: '-', awayWin: '-', over25: '-', btts: '-'
      });
      writeReport(results);
    }

    if (i < matches.length - 1) {
      const delayMs = 1500 + Math.random() * 1000;
      await new Promise(function(r) { setTimeout(r, delayMs); });
    }
  }

  console.log('\n[TodayTest] TAMAMLANDI! ' + results.length + ' mac.');
  console.log('Sonuclar: ' + outputPath);
  process.exit(0);
}

run();
