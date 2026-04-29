/**
 * Gerçek API'den prediction response'unu çekip
 * lineup player'ların statistics içerip içermediğini kontrol eder.
 */
const http = require('http');

function fetchJSON(url, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3001,
      path: url,
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  try {
    // PSG vs Bayern match
    const prediction = await fetchJSON('/api/predict/15632632', {});
    
    console.log('=== LINEUP STATS CHECK ===\n');
    
    for (const side of ['home', 'away']) {
      const players = prediction.lineups?.[side]?.players || [];
      const starters = players.filter(p => !p.substitute && !p.isReserve);
      
      console.log(`--- ${side.toUpperCase()} (${starters.length} starter) ---`);
      for (const p of starters.slice(0, 5)) {
        const name = p.player?.shortName || p.player?.name || '?';
        const pos = p.player?.position || '?';
        const mv = p.player?.proposedMarketValue || 0;
        const hasStats = !!p.player?.statistics;
        const hasSeason = !!p.player?.seasonStats;
        const rating = p.player?.statistics?.rating || p.player?.seasonStats?.statistics?.rating || null;
        const goals = p.player?.statistics?.goals || p.player?.seasonStats?.statistics?.goals || null;
        const appearances = p.player?.statistics?.appearances || p.player?.seasonStats?.statistics?.appearances || null;
        
        console.log(`  ${name.padEnd(20)} | pos: ${pos} | MV: €${(mv/1e6).toFixed(0)}M | stats: ${hasStats} | season: ${hasSeason} | rating: ${rating} | goals: ${goals} | apps: ${appearances}`);
      }
      console.log('');
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
