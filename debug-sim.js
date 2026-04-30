/**
 * Debug: Gerçek API verisini çekip simülasyon motoruna sokarak
 * NaN'ın tam kaynağını tespit et.
 *
 * Çalıştır: node debug-sim.js
 * Gereksinim: Server çalışıyor olmalı (npm run server)
 */
'use strict';

const http = require('http');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}\n${data.slice(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('=== GERÇEK VERİ İLE NaN TEŞHİSİ ===\n');

  // 1. Server'dan maç listesini al
  console.log('[1] Maç listesi çekiliyor...');
  let matches;
  try {
    matches = await fetchJSON('http://localhost:3001/api/matches');
  } catch (e) {
    console.error('Server bağlantı hatası:', e.message);
    console.log('Server çalışıyor mu? (npm run server)');
    return;
  }

  const eventId = matches?.[0]?.id || 15632623;
  console.log(`    Hedef maç: eventId=${eventId} (${matches?.[0]?.homeTeam || '?'} vs ${matches?.[0]?.awayTeam || '?'})\n`);

  // 2. Simülasyonu debug modda çalıştır
  console.log('[2] Simülasyon çalıştırılıyor (tek koşu)...');
  const simResult = await new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      selectedMetrics: [], // boş = tüm metrikler
      runs: 1,
    });

    const req = http.request({
      hostname: 'localhost',
      port: 3001,
      path: `/api/simulate/${eventId}?debug=1`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Sim parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  console.log(`    Simülasyon tamamlandı.`);

  // 3. Sonuçları analiz et
  console.log('\n[3] SİMÜLASYON SONUÇLARI:');
  // result yapısı: { result: { homeGoals, awayGoals }, stats: {home, away}, units: {home, away} }
  const resultObj = simResult.result ?? simResult;
  const homeGoals = resultObj.homeGoals ?? simResult.homeGoals ?? '?';
  const awayGoals = resultObj.awayGoals ?? simResult.awayGoals ?? '?';
  console.log(`    Skor: ${homeGoals} - ${awayGoals}`);

  // Stats
  const hStats = simResult.stats?.home || {};
  const aStats = simResult.stats?.away || {};
  console.log(`    Home şut=${hStats.shots}, isabetli=${hStats.shotsOnTarget}, gol=${homeGoals}`);
  console.log(`    Away şut=${aStats.shots}, isabetli=${aStats.shotsOnTarget}, gol=${awayGoals}`);


  // 4. Units kontrolü
  console.log('\n[4] BEHAVIORAL UNITS:');
  const hUnits = simResult.units?.home || {};
  const aUnits = simResult.units?.away || {};
  
  let nanFound = false;
  console.log('    --- HOME UNITS ---');
  for (const [k, v] of Object.entries(hUnits)) {
    const flag = !isFinite(v) ? ' ❌ NaN/Infinity!' : '';
    if (flag) nanFound = true;
    console.log(`    ${k.padEnd(30)} = ${typeof v === 'number' ? v.toFixed(6) : v}${flag}`);
  }
  
  console.log('    --- AWAY UNITS ---');
  for (const [k, v] of Object.entries(aUnits)) {
    const flag = !isFinite(v) ? ' ❌ NaN/Infinity!' : '';
    if (flag) nanFound = true;
    console.log(`    ${k.padEnd(30)} = ${typeof v === 'number' ? v.toFixed(6) : v}${flag}`);
  }

  if (!nanFound) {
    console.log('\n    ✅ Hiçbir birimde NaN tespit edilmedi.');
  } else {
    console.log('\n    ❌ NaN tespit edildi! Yukarıdaki birimlere bakın.');
  }

  // 5. ProbBases kontrolü
  console.log('\n[5] PROB BASES:');
  const hProb = simResult.probBases?.home || {};
  const aProb = simResult.probBases?.away || {};
  console.log('    --- HOME ---');
  for (const [k, v] of Object.entries(hProb)) {
    if (typeof v !== 'number') continue;
    const flag = !isFinite(v) ? ' ❌ NaN!' : '';
    console.log(`    ${k.padEnd(25)} = ${v.toFixed(6)}${flag}`);
  }
  console.log('    --- AWAY ---');
  for (const [k, v] of Object.entries(aProb)) {
    if (typeof v !== 'number') continue;
    const flag = !isFinite(v) ? ' ❌ NaN!' : '';
    console.log(`    ${k.padEnd(25)} = ${v.toFixed(6)}${flag}`);
  }

  // 6. Baseline parametreleri
  console.log('\n[6] BASELINE PARAMETRELERİ:');
  const bp = simResult.baselineParams || simResult.leagueBaseline || {};
  const criticalKeys = [
    'normMinRatio', 'normMaxRatio', 'leagueGoalVolatility', 'leagueAvgGoals',
    'leaguePointDensity', 'leagueCompetitiveness', 'possessionBase',
    'shotsPerMin', 'onTargetRate', 'goalConvRate', 'blockRate',
    'homeLineupQualityRatio', 'awayLineupQualityRatio',
  ];
  for (const k of criticalKeys) {
    const v = bp[k];
    const flag = (v != null && typeof v === 'number' && !isFinite(v)) ? ' ❌ NaN!' : (v == null ? ' ⚠️ null/missing' : '');
    console.log(`    ${k.padEnd(30)} = ${v}${flag}`);
  }

  // 7. Tüm 95 dakikayı possession + olaylarla göster
  console.log('\n[7] 95 DAKİKA POSSESSION + OLAYLAR:');
  const minuteLog = simResult.minuteLog || [];
  let minPoss = 100, maxPoss = 0;
  const eventCounts = {};
  for (const ml of minuteLog) {
    const poss = ml.possession || {};
    const hP = poss.home ?? 50;
    if (hP < minPoss) minPoss = hP;
    if (hP > maxPoss) maxPoss = hP;
    const events = (ml.events || []).map(e => `${e.type}(${e.team})`).join(', ') || '-';
    for (const ev of (ml.events || [])) {
      const key = `${ev.type}`;
      eventCounts[key] = (eventCounts[key] || 0) + 1;
    }
    // State bilgisi (varsa)
    const bs = ml.behavioralState || {};
    const hState = simResult._stateLog?.[ml.minute]?.home;
    const aState = simResult._stateLog?.[ml.minute]?.away;
    console.log(`    dk ${String(ml.minute).padStart(2)}: H:${hP}% A:${100 - hP}% | ${events}`);
  }

  console.log(`\n[8] POSSESSION ARALIĞI: min=${minPoss}%, max=${maxPoss}%, fark=${maxPoss - minPoss}%`);

  console.log('\n[9] OLAY TİPİ DAĞILIMI:');
  const sortedEvents = Object.entries(eventCounts).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedEvents) {
    console.log(`    ${type.padEnd(25)} = ${count}`);
  }

  // 10. DYN_LIMITS (varsa response'ta)
  if (simResult._debug) {
    console.log('\n[10] DEBUG PAYLOAD:');
    console.log('    metricAudit toplam:', simResult._debug.metricAudit?.totalMetrics);
    console.log('    dynamicCount:', simResult._debug.metricAudit?.dynamicCount);
  }

  // 11. Baseline yeni alanlar + possession dynamics kaynak
  console.log('\n[11] YENİ BASELINE + POSSESSION DİNAMİK KAYNAKLARI:');
  const newKeys = ['foulRate', 'offsideRate', 'throwInRate', 'leaguePointDensity', 'leagueTeamCount'];
  for (const k of newKeys) {
    const v = bp[k];
    console.log(`    ${k.padEnd(25)} = ${v ?? 'null'}`);
  }
  // possessionLimits: territory impact scale'in ana kaynağı
  const pLim = bp.possessionLimits;
  console.log(`    possessionLimits.min     = ${pLim?.min ?? 'null'}`);
  console.log(`    possessionLimits.max     = ${pLim?.max ?? 'null'}`);
  const spread = (pLim?.min != null && pLim?.max != null) ? (pLim.max - pLim.min) : null;
  console.log(`    possessionSpread (puan)  = ${spread ?? 'null (fallback aktif)'}`);
  if (spread != null) {
    console.log(`    → terrCoeff              = ${(spread * 0.5).toFixed(2)} (territory farkı × bu = possession kayması %)`);
    console.log(`    → regRate                = ${((1 - spread/100) / (bp.leagueTeamCount ?? 20)).toFixed(4)} (dakika başı regresyon)`);
  }


  console.log('\n=== TEŞHİS TAMAMLANDI ===');
}

main().catch(e => console.error('HATA:', e));
