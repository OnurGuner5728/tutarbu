#!/usr/bin/env node
/**
 * Takım Skor Profili Demo — Gerçek maçlarla profil verisini gösterir.
 * 
 * Kullanım: node scripts/score-profile-demo.js [eventId1] [eventId2]
 * Varsayılan: backtest'teki son 2 maç
 */
'use strict';

const { fetchAllMatchData } = require('../src/services/data-fetcher');
const { extractTeamScoreProfile } = require('../src/engine/score-profile');

async function demoMatch(eventId) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  EVENT ${eventId} — Veri çekiliyor...`);
  console.log(`${'═'.repeat(70)}`);

  const data = await fetchAllMatchData(eventId);
  const homeName = data.event?.event?.homeTeam?.name || 'Home';
  const awayName = data.event?.event?.awayTeam?.name || 'Away';
  console.log(`\n  📋 ${homeName} vs ${awayName}`);

  // Ev sahibi profil
  const homeProfile = extractTeamScoreProfile(data.homeLastEvents, data.homeTeamId, 'home', 15);
  const awayProfile = extractTeamScoreProfile(data.awayLastEvents, data.awayTeamId, 'away', 15);

  // Ev sahibi (tüm maçlar) profili de göster
  const homeAllProfile = extractTeamScoreProfile(data.homeLastEvents, data.homeTeamId, null, 15);
  const awayAllProfile = extractTeamScoreProfile(data.awayLastEvents, data.awayTeamId, null, 15);

  function printProfile(name, profile, label) {
    if (!profile) {
      console.log(`\n  ❌ ${name} (${label}): Profil üretilemedi (yetersiz veri)`);
      return;
    }
    console.log(`\n  🏟️  ${name} — ${label} (n=${profile.n}, maxMatch=${profile.maxMatches})`);
    console.log(`     Ort. Atılan: ${profile.avgScored.toFixed(2)} gol/maç`);
    console.log(`     Ort. Yenen:  ${profile.avgConceded.toFixed(2)} gol/maç`);
    console.log(`     Varyans:     scored=${profile.variance.scored.toFixed(2)}, conceded=${profile.variance.conceded.toFixed(2)}`);
    
    console.log(`\n     Gol Atma Dağılımı (scoredDist):`);
    profile.scoredDist.forEach((p, i) => {
      const bar = '█'.repeat(Math.round(p * 40));
      console.log(`       ${i} gol: ${(p * 100).toFixed(1).padStart(5)}%  ${bar}`);
    });

    console.log(`\n     Gol Yeme Dağılımı (concededDist):`);
    profile.concededDist.forEach((p, i) => {
      const bar = '█'.repeat(Math.round(p * 40));
      console.log(`       ${i} gol: ${(p * 100).toFixed(1).padStart(5)}%  ${bar}`);
    });

    console.log(`\n     Skor Frekansları (jointDist):`);
    Object.entries(profile.jointDist)
      .sort((a, b) => b[1] - a[1])
      .forEach(([score, prob]) => {
        const bar = '█'.repeat(Math.round(prob * 30));
        console.log(`       ${score.padEnd(5)} ${(prob * 100).toFixed(1).padStart(5)}%  ${bar}`);
      });
  }

  printProfile(homeName, homeProfile, 'Ev Sahibi maçları');
  printProfile(homeName, homeAllProfile, 'Tüm maçlar');
  printProfile(awayName, awayProfile, 'Deplasman maçları');
  printProfile(awayName, awayAllProfile, 'Tüm maçlar');

  console.log(`\n  ${'─'.repeat(66)}`);
}

async function main() {
  // Argümanlardan event ID al, yoksa backtest'ten iki tane seç
  let eventIds = process.argv.slice(2).map(Number).filter(n => n > 0);
  
  if (eventIds.length === 0) {
    const fs = require('fs');
    const path = require('path');
    const btFile = path.join(__dirname, '..', 'backtest_comprehensive.json');
    if (fs.existsSync(btFile)) {
      const bt = JSON.parse(fs.readFileSync(btFile, 'utf8'));
      const matches = bt.matches || [];
      // Farklı liglerden 2 maç seç
      const ucl = matches.find(m => m.league?.includes('Champions'));
      const pl = matches.find(m => m.league?.includes('Premier'));
      eventIds = [ucl?.id, pl?.id].filter(Boolean).slice(0, 2);
    }
    if (eventIds.length === 0) {
      console.error('❌ Event ID belirtilmedi ve backtest dosyası bulunamadı.');
      process.exit(1);
    }
  }

  console.log(`\n🔬 Takım Skor Parmak İzi Demo — ${eventIds.length} maç`);

  for (const eid of eventIds) {
    await demoMatch(eid);
  }

  console.log(`\n✅ Demo tamamlandı.\n`);
  process.exit(0);
}

main().catch(e => { console.error('❌ Hata:', e.message); process.exit(1); });
