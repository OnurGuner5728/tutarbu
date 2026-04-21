/**
 * API Veri Keşif Scripti  
 * Her iki maçın API verisini inceleyerek hangi alanların mevcut olduğunu tespit eder.
 */
const { fetchAllMatchData } = require('../src/services/data-fetcher.js');

async function main() {
  const eventId = 14023999; // Crystal Palace vs Newcastle
  console.log(`Event ${eventId} yükleniyor...\n`);
  const data = await fetchAllMatchData(eventId);

  // standingsTotal yapısı
  console.log('=== standingsTotal rows[0] ===');
  const row0 = data.standingsTotal?.standings?.[0]?.rows?.[0];
  if (row0) console.log(JSON.stringify(row0, null, 2));
  
  // standingsHome yapısı
  console.log('\n=== standingsHome rows[0] ===');
  const hRow0 = data.standingsHome?.standings?.[0]?.rows?.[0];
  if (hRow0) console.log(JSON.stringify(hRow0, null, 2));

  // standingsAway yapısı
  console.log('\n=== standingsAway rows[0] ===');
  const aRow0 = data.standingsAway?.standings?.[0]?.rows?.[0];
  if (aRow0) console.log(JSON.stringify(aRow0, null, 2));

  // homeTeamSeasonStats
  console.log('\n=== homeTeamSeasonStats.statistics KEYS ===');
  const hs = data.homeTeamSeasonStats?.statistics;
  if (hs) console.log(Object.keys(hs).sort().join('\n'));
  else console.log('NULL');

  // awayTeamSeasonStats
  console.log('\n=== awayTeamSeasonStats.statistics KEYS ===');
  const as = data.awayTeamSeasonStats?.statistics;
  if (as) console.log(Object.keys(as).sort().join('\n'));
  else console.log('NULL');

  // homePlayerStats — ilk oyuncu seasonStats
  console.log('\n=== homePlayerStats[0].seasonStats.statistics KEYS ===');
  const ps0 = data.homePlayerStats?.[0]?.seasonStats?.statistics;
  if (ps0) console.log(Object.keys(ps0).sort().join('\n'));
  else console.log('NULL');

  // recentMatchDetails structure 
  console.log('\n=== homeRecentMatchDetails[0] — keys ===');
  const rmd0 = data.homeRecentMatchDetails?.[0];
  if (rmd0) console.log(Object.keys(rmd0).join(', '));
  else console.log('NULL');

  // incidents sample
  console.log('\n=== homeRecentMatchDetails[0].incidents.incidents[0:3] ===');
  const incs = rmd0?.incidents?.incidents?.slice(0, 3);
  if (incs) console.log(JSON.stringify(incs, null, 2));

  // shotmap sample
  console.log('\n=== homeRecentMatchDetails[0].shotmap.shotmap[0] ===');
  const sh0 = rmd0?.shotmap?.shotmap?.[0];
  if (sh0) console.log(JSON.stringify(sh0, null, 2));

  // homeLastEvents sample
  console.log('\n=== homeLastEvents[0] keys ===');
  const hle0 = data.homeLastEvents?.[0];
  if (hle0) console.log(Object.keys(hle0).join(', '));
  
  // H2H
  console.log('\n=== h2hEvents?.events length ===');
  console.log(data.h2hEvents?.events?.length ?? 'null');

  // Graph
  console.log('\n=== homeGraph keys (first match) ===');
  const hg0 = data.homeRecentMatchDetails?.[0]?.graph;
  if (hg0) console.log(JSON.stringify(hg0).substring(0, 300));

  // Standings count
  console.log('\n=== Standings Counts ===');
  console.log(`Total rows: ${data.standingsTotal?.standings?.[0]?.rows?.length}`);
  console.log(`Home rows: ${data.standingsHome?.standings?.[0]?.rows?.length}`);
  console.log(`Away rows: ${data.standingsAway?.standings?.[0]?.rows?.length}`);

  process.exit(0);
}

main().catch(e => { console.error('HATA:', e); process.exit(1); });
