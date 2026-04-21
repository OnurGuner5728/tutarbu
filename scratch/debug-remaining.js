/**
 * Kalan 10 "sorunlu" metriğin verisini detaylı göster
 */
const { computeAllLeagueAverages } = require('../src/engine/league-averages.js');
const { fetchAllMatchData } = require('../src/services/data-fetcher.js');

async function main() {
  const data1 = await fetchAllMatchData(14023999); // PL
  const data2 = await fetchAllMatchData(13981737); // Serie A

  const debug = (label, data) => {
    console.log(`\n=== ${label} ===`);
    const hs = data.homeTeamSeasonStats?.statistics;
    const as = data.awayTeamSeasonStats?.statistics;
    
    console.log(`M074 (dribble): home=${hs?.successfulDribblesPercentage}, away=${as?.successfulDribblesPercentage}`);
    console.log(`M077 (missing): missingPlayers count=${data.missingPlayers?.players?.length ?? 0}`);
    console.log(`M078 (suspend): missingPlayers types=${JSON.stringify(data.missingPlayers?.players?.map(p => p.type) ?? [])}`);
    
    // M089 — h2h lineups
    const h2h = data.h2hEvents?.events || [];
    let h2hWithLineups = h2h.filter(e => e.lineups);
    console.log(`M089 (h2h lineup): total h2h=${h2h.length}, with lineups=${h2hWithLineups.length}`);
    
    // M142/143/144 — standings 
    const rows = data.standingsTotal?.standings?.[0]?.rows || [];
    console.log(`M142 (rank): teams=${rows.length}`);
    const hRows = data.standingsHome?.standings?.[0]?.rows || [];
    const aRows = data.standingsAway?.standings?.[0]?.rows || [];
    console.log(`M144 (strength): standingsHome=${hRows.length}, standingsAway=${aRows.length}`);
    
    // M052/M064 — lastEvents  
    const hLE = data.homeLastEvents?.slice(0, 5) || [];
    const aLE = data.awayLastEvents?.slice(0, 5) || [];
    console.log(`M052 (CS): lastEN home=${hLE.map(e => `${e.homeScore?.current}-${e.awayScore?.current}`).join(',')}`);
    console.log(`M052 (CS): lastEN away=${aLE.map(e => `${e.homeScore?.current}-${e.awayScore?.current}`).join(',')}`);
  };
  
  debug('PL (CP vs Newcastle)', data1);
  debug('Serie A (Genoa vs Sassuolo)', data2);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
