const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3001/api';
const outputPath = path.join(__dirname, '..', '..', 'todaytest_results.md');

function writeReport(results) {
  const sorted = [...results].sort((a, b) => b.totalXg - a.totalXg);
  const lines = [];

  lines.push('# TodayTest - ' + new Date().toISOString().split('T')[0]);
  lines.push('');
  lines.push(results.length + ' mac analiz edildi');
  lines.push('');
  lines.push('---');
  lines.push('');

  sorted.forEach((r, idx) => {
    const emoji = r.status === 'finished' ? '[BITTI]' : r.status === 'inprogress' ? '[CANLI]' : '[BASLAMADI]';
    
    lines.push('## ' + (idx + 1) + '. ' + r.homeTeam + ' vs ' + r.awayTeam + ' ' + emoji);
    lines.push('Lig: ' + r.league);
    lines.push('');
    lines.push('- Poisson Tahmini: ' + r.poissonScore);
    lines.push('- Simulasyon Tahmini: ' + r.simScore);
    lines.push('- Beklenen Toplam Gol (xG): ' + r.totalXg.toFixed(2));
    lines.push('- Ev Sahibi Kazanir: ' + r.homeWin);
    lines.push('- Beraberlik: ' + r.draw);
    lines.push('- Deplasman Kazanir: ' + r.awayWin);
    lines.push('- Ust 2.5 Gol: ' + r.over25);
    lines.push('- Karsilikli Gol: ' + r.btts);
    
    if (r.status === 'finished' && r.actualScore) {
      lines.push('');
      lines.push('>>> GERCEK SKOR: ' + r.actualScore);
    }
    
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
}

async function run() {
  const dateStr = new Date().toISOString().split('T')[0];
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
    if (status === 'finished' && match.homeScore != null && match.awayScore != null) {
      actualScore = match.homeScore + ' - ' + match.awayScore;
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

      const homeXg = (pred.score && pred.score.lambdaHome != null) ? pred.score.lambdaHome : 0;
      const awayXg = (pred.score && pred.score.lambdaAway != null) ? pred.score.lambdaAway : 0;
      const totalXg = homeXg + awayXg;

      const homeWin = (pred.result && pred.result.homeWin != null) ? '%' + pred.result.homeWin : '-';
      const draw = (pred.result && pred.result.draw != null) ? '%' + pred.result.draw : '-';
      const awayWin = (pred.result && pred.result.awayWin != null) ? '%' + pred.result.awayWin : '-';

      const over25 = (pred.goals && pred.goals.over25 != null) ? '%' + pred.goals.over25 : '-';
      const btts = (pred.goals && pred.goals.btts != null) ? '%' + pred.goals.btts : '-';

      results.push({
        homeTeam, awayTeam, league, status, actualScore,
        poissonScore, simScore, totalXg,
        homeWin, draw, awayWin, over25, btts
      });

      // Her mactan sonra dosyaya yaz
      writeReport(results);
      console.log('  Poisson: ' + poissonScore + ' | Sim: ' + simScore + ' | xG: ' + totalXg.toFixed(2));

    } catch (e) {
      console.error('  HATA: ' + e.message);
      results.push({
        homeTeam, awayTeam, league, status, actualScore,
        poissonScore: 'HATA', simScore: 'HATA', totalXg: 0,
        homeWin: '-', draw: '-', awayWin: '-', over25: '-', btts: '-'
      });
      writeReport(results);
    }

    if (i < matches.length - 1) {
      const delayMs = 2000 + Math.random() * 2000;
      console.log('  Bekleniyor: ' + (delayMs / 1000).toFixed(1) + 's\n');
      await new Promise(function(r) { setTimeout(r, delayMs); });
    }
  }

  console.log('\n[TodayTest] TAMAMLANDI! ' + results.length + ' mac.');
  console.log('Sonuclar: ' + outputPath);
  process.exit(0);
}

run();
