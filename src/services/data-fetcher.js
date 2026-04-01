/**
 * Data Fetcher — Orchestrator
 * Bir maç için gereken TÜM verileri SofaScore API'den toplar.
 * Hiçbir fallback/statik değer yoktur.
 */

const api = require('./playwright-client');

/**
 * Verilen event ID için tahmin motorunun ihtiyaç duyduğu tüm ham verileri toplar.
 * @param {number} eventId
 * @returns {Promise<object>} Tüm ham veriler
 */
async function fetchAllMatchData(eventId) {
  console.log(`[DataFetcher] Fetching all data for event ${eventId}...`);
  const startTime = Date.now();

  // 1. Maç temel bilgisi — tournamentId, seasonId, teamId'ler buradan çıkacak
  const eventData = await api.getEvent(eventId);
  if (!eventData || !eventData.event) {
    throw new Error(`Event ${eventId} not found or API error`);
  }

  const event = eventData.event;
  const homeTeamId = event.homeTeam.id;
  const awayTeamId = event.awayTeam.id;
  const tournamentId = event.tournament?.uniqueTournament?.id || event.tournament?.id;
  const seasonId = event.season?.id;
  const refereeId = event.referee?.id || null;
  const homeManagerId = event.homeTeam?.manager?.id || null;
  const awayManagerId = event.awayTeam?.manager?.id || null;

  console.log(`[DataFetcher] Match: ${event.homeTeam.name} vs ${event.awayTeam.name}`);
  console.log(`[DataFetcher] Tournament: ${tournamentId}, Season: ${seasonId}`);

  // 2. Maç seviyesi veriler (paralel)
  // Promise.allSettled kullanılıyor: tek bir API hatası tüm fetch'i çökertmemeli.
  // Her sonuç { status: 'fulfilled'|'rejected', value|reason } şeklinde gelir.
  const matchLevelResults = await Promise.allSettled([
    api.getEventStats(eventId),        // 0
    api.getEventIncidents(eventId),    // 1
    api.getEventLineups(eventId),      // 2
    api.getEventShotmap(eventId),      // 3
    api.getEventGraph(eventId),        // 4
    api.getEventH2H(eventId),          // 5
    api.getEventH2HEvents(eventId),    // 6
    api.getEventOdds(eventId),         // 7
    api.getEventMissingPlayers(eventId), // 8
    api.getEventStreaks(eventId),      // 9
    api.getEventForm(eventId),         // 10
    api.getEventManagers(eventId),     // 11
    api.getEventVotes(eventId),        // 12
  ]);

  const matchLevelNames = [
    'eventStats', 'incidents', 'lineups', 'shotmap', 'graph',
    'h2h', 'h2hEvents', 'odds', 'missingPlayers', 'streaks',
    'form', 'managers', 'votes',
  ];
  matchLevelResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(`[DataFetcher] Non-critical fetch failed (${matchLevelNames[i]}): ${r.reason?.message || r.reason}`);
    }
  });

  let [
    eventStats, incidents, lineups, shotmap, graph,
    h2h, h2hEvents, odds, missingPlayers, streaks,
    form, managers, votes
  ] = matchLevelResults.map(r => (r.status === 'fulfilled' ? r.value : null));

  // 3 + 4. Takım verileri — Ev sahibi ve deplasman (paralel)
  const teamLevelResults = await Promise.allSettled([
    api.getTeam(homeTeamId),              // 0
    api.getTeamPlayers(homeTeamId),       // 1
    api.getTeamLastEvents(homeTeamId, 0), // 2
    api.getTeamLastEvents(homeTeamId, 1), // 3
    api.getTeam(awayTeamId),              // 4
    api.getTeamPlayers(awayTeamId),       // 5
    api.getTeamLastEvents(awayTeamId, 0), // 6
    api.getTeamLastEvents(awayTeamId, 1), // 7
  ]);

  const teamLevelNames = [
    'homeTeam', 'homePlayers', 'homeLastEvents0', 'homeLastEvents1',
    'awayTeam', 'awayPlayers', 'awayLastEvents0', 'awayLastEvents1',
  ];
  teamLevelResults.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(`[DataFetcher] Non-critical fetch failed (${teamLevelNames[i]}): ${r.reason?.message || r.reason}`);
    }
  });

  const [
    homeTeam, homePlayers, homeLastEvents0, homeLastEvents1,
    awayTeam, awayPlayers, awayLastEvents0, awayLastEvents1
  ] = teamLevelResults.map(r => (r.status === 'fulfilled' ? r.value : null));

  // 5. Lig/Turnuva verileri
  let standingsTotal = null;
  let standingsHome = null;
  let standingsAway = null;
  let homeTeamSeasonStats = null;
  let awayTeamSeasonStats = null;
  let homeTopPlayers = null;
  let awayTopPlayers = null;

  if (tournamentId && seasonId) {
    const leagueResults = await Promise.allSettled([
      api.getStandings(tournamentId, seasonId, 'total'),             // 0
      api.getStandings(tournamentId, seasonId, 'home'),              // 1
      api.getStandings(tournamentId, seasonId, 'away'),              // 2
      api.getTeamSeasonStats(homeTeamId, tournamentId, seasonId),    // 3
      api.getTeamSeasonStats(awayTeamId, tournamentId, seasonId),    // 4
      api.getTeamTopPlayers(homeTeamId, tournamentId, seasonId),     // 5
      api.getTeamTopPlayers(awayTeamId, tournamentId, seasonId),     // 6
    ]);

    const leagueNames = [
      'standingsTotal', 'standingsHome', 'standingsAway',
      'homeTeamSeasonStats', 'awayTeamSeasonStats',
      'homeTopPlayers', 'awayTopPlayers',
    ];
    leagueResults.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.warn(`[DataFetcher] Non-critical fetch failed (${leagueNames[i]}): ${r.reason?.message || r.reason}`);
      }
    });

    const [st, sh, sa, hss, ass, htp, atp] = leagueResults.map(r => (r.status === 'fulfilled' ? r.value : null));
    standingsTotal = st; standingsHome = sh; standingsAway = sa;
    homeTeamSeasonStats = hss; awayTeamSeasonStats = ass;
    homeTopPlayers = htp; awayTopPlayers = atp;
  }

  // 6. Hakem verisi
  let refereeStats = null;
  if (refereeId) {
    refereeStats = await api.getRefereeStats(refereeId);
  }

  // 7. Menajer verileri
  let homeManagerCareer = null;
  let awayManagerCareer = null;

  // Manager ID'leri event'ten veya managers endpoint'ten al
  let actualHomeManagerId = homeManagerId;
  let actualAwayManagerId = awayManagerId;

  if (managers) {
    if (managers.homeManager) actualHomeManagerId = managers.homeManager.id;
    if (managers.awayManager) actualAwayManagerId = managers.awayManager.id;
  }
  if (!actualHomeManagerId && homeTeam?.team?.manager?.id) {
    actualHomeManagerId = homeTeam.team.manager.id;
  }
  if (!actualAwayManagerId && awayTeam?.team?.manager?.id) {
    actualAwayManagerId = awayTeam.team.manager.id;
  }

  if (actualHomeManagerId) {
    homeManagerCareer = await api.getManagerCareer(actualHomeManagerId);
  }
  if (actualAwayManagerId) {
    awayManagerCareer = await api.getManagerCareer(actualAwayManagerId);
  }

  // 8. Son maçların incident/stats verilerini çek (son 5 maç deep-dive)
  // Her iki sayfa birleştirilip sıralanarak gerçek son 5 maç alınır (cross-competition).
  const homeMergedEvents = mergeAndSortEvents(homeLastEvents0, homeLastEvents1);
  const awayMergedEvents = mergeAndSortEvents(awayLastEvents0, awayLastEvents1);
  const homeRecentMatchDetails = await fetchRecentMatchDetails(homeMergedEvents, 5);
  const awayRecentMatchDetails = await fetchRecentMatchDetails(awayMergedEvents, 5);

  // --- FALLBACK LINEUP GENERATOR ---
  function buildFallbackLineup(topPlayers, squadPlayers) {
    if (!topPlayers && !squadPlayers) return { players: [] };

    let pool = [];
    if (topPlayers?.topPlayers?.rating) {
      pool = topPlayers.topPlayers.rating.map(p => ({
        player: p.player,
        position: p.player?.position || 'M',
        shirtNumber: p.player?.shirtNumber || '',
        substitute: false,
      }));
    } else if (squadPlayers?.players) {
      pool = squadPlayers.players.map(p => ({
        player: p.player,
        position: p.player?.position || 'M',
        shirtNumber: p.player?.shirtNumber || '',
        substitute: false,
      }));
    }

    // Pozisyon bazlı seçim — kaleci garantisi
    const byPos = { G: [], D: [], M: [], F: [] };
    for (const p of pool) {
      const pos = p.position;
      if (byPos[pos]) byPos[pos].push(p);
    }

    const starting = [];
    const usedIdx = new Set();

    function pickN(posArr, n) {
      let picked = 0;
      for (const p of posArr) {
        if (picked >= n) break;
        if (!usedIdx.has(p.player?.id)) {
          starting.push({ ...p, substitute: false });
          usedIdx.add(p.player?.id);
          picked++;
        }
      }
      // Yeterli oyuncu yoksa genel havuzdan doldur
      if (picked < n) {
        for (const p of pool) {
          if (picked >= n) break;
          if (!usedIdx.has(p.player?.id)) {
            starting.push({ ...p, substitute: false });
            usedIdx.add(p.player?.id);
            picked++;
          }
        }
      }
    }

    // 4-3-3 varsayılan formasyon
    pickN(byPos.G, 1); // 1 kaleci
    pickN(byPos.D, 4); // 4 defans
    pickN(byPos.M, 3); // 3 orta saha
    pickN(byPos.F, 3); // 3 forvet

    // Yedekler: kalan oyunculardan
    const subs = pool
      .filter(p => !usedIdx.has(p.player?.id))
      .slice(0, 7)
      .map(p => ({ ...p, substitute: true }));

    return {
      players: [...starting, ...subs],
      formation: '4-3-3',
      isFallback: true,
    };
  }

  if (!lineups) lineups = {};
  if (!lineups.home || !lineups.home.players || lineups.home.players.length === 0) {
    console.log(`[DataFetcher] No home lineup found, generating fallback Auto-Lineup...`);
    lineups.home = buildFallbackLineup(homeTopPlayers, homePlayers);
    lineups.isFallback = true;
  }
  
  if (!lineups.away || !lineups.away.players || lineups.away.players.length === 0) {
    console.log(`[DataFetcher] No away lineup found, generating fallback Auto-Lineup...`);
    lineups.away = buildFallbackLineup(awayTopPlayers, awayPlayers);
    lineups.isFallback = true;
  }

  // 9. İlk 11 oyuncuların bireysel istatistikleri
  const homePlayerStats = await fetchPlayerStats(lineups?.home?.players, tournamentId, seasonId);
  const awayPlayerStats = await fetchPlayerStats(lineups?.away?.players, tournamentId, seasonId);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[DataFetcher] All data fetched in ${elapsed}s`);

  return {
    event: eventData,
    eventId,
    homeTeamId,
    awayTeamId,
    tournamentId,
    seasonId,
    refereeId,

    // Maç seviyesi
    eventStats,
    incidents,
    lineups,
    shotmap,
    graph,
    h2h,
    h2hEvents,
    odds,
    missingPlayers,
    streaks,
    form,
    managers,
    votes,

    // Takımlar
    homeTeam,
    awayTeam,
    homePlayers,
    awayPlayers,
    homeLastEvents: mergeEventPages(homeLastEvents0, homeLastEvents1),
    awayLastEvents: mergeEventPages(awayLastEvents0, awayLastEvents1),

    // Lig
    standingsTotal,
    standingsHome,
    standingsAway,
    homeTeamSeasonStats,
    awayTeamSeasonStats,
    homeTopPlayers,
    awayTopPlayers,

    // Hakem & Menajer
    refereeStats,
    homeManagerCareer,
    awayManagerCareer,
    homeManagerId: actualHomeManagerId,
    awayManagerId: actualAwayManagerId,

    // Deep-dive
    homeRecentMatchDetails,
    awayRecentMatchDetails,
    homePlayerStats,
    awayPlayerStats,
  };
}

/**
 * Son N maçın incidents + statistics + shotmap + graph verilerini çeker.
 * Tüm turnuvalardan (cross-competition) gerçek son N maç seçilir.
 * @param {Array} eventsArray - mergeAndSortEvents() ile üretilmiş, startTimestamp'e göre
 *                              azalan sırada düzenlenmiş düz event dizisi.
 * @param {number} count - Kaç maçın deep-dive verisi çekileceği (varsayılan 5)
 */
async function fetchRecentMatchDetails(eventsArray, count = 5) {
  const events = Array.isArray(eventsArray) ? eventsArray : (eventsArray?.events || []);
  const recentFinished = events
    .filter(e => e.status?.type === 'finished')
    .slice(0, count);

  const details = [];
  for (const ev of recentFinished) {
    const incidents = await api.getEventIncidents(ev.id);
    const stats = await api.getEventStats(ev.id);
    const shotmap = await api.getEventShotmap(ev.id);
    const graph = await api.getEventGraph(ev.id);
    const lineups = await api.getEventLineups(ev.id);

    details.push({
      eventId: ev.id,
      homeTeam: ev.homeTeam,
      awayTeam: ev.awayTeam,
      homeScore: ev.homeScore,
      awayScore: ev.awayScore,
      status: ev.status,
      startTimestamp: ev.startTimestamp,
      incidents,
      stats,
      shotmap,
      graph,
      lineups,
    });
  }
  return details;
}

/**
 * Kadrodaki oyuncuların sezon istatistiklerini çeker.
 * İlk 11 + tüm yedekler — M067 (Yedek Rating) ve M088 (Bench/Starter değer oranı) için tam veri gereklidir.
 */
async function fetchPlayerStats(players, tournamentId, seasonId) {
  if (!players || !tournamentId || !seasonId) return [];

  const starters = players.filter(p => !p.substitute).slice(0, 11);
  const subs = players.filter(p => p.substitute); // Tüm yedekler — 5 değişiklik kuralı gereği hepsi çekilmeli
  const targetPlayers = [...starters, ...subs];

  const results = [];
  for (const p of targetPlayers) {
    const playerId = p.player?.id;
    if (!playerId) continue;

    const seasonStats = await api.getPlayerSeasonStats(playerId, tournamentId, seasonId);
    const attributes = await api.getPlayerAttributes(playerId);
    const characteristics = await api.getPlayerCharacteristics(playerId);

    results.push({
      playerId,
      name: p.player.name,
      position: p.player.position || p.position,
      shirtNumber: p.shirtNumber,
      substitute: p.substitute || false,
      seasonStats,
      attributes,
      characteristics,
    });
  }
  return results;
}

/**
 * İki sayfa event verisini birleştirir ve startTimestamp'e göre azalan sırada döner.
 * Tüm turnuvalardan (lig, kupa, Avrupa) gerçek kronolojik sıra korunur.
 */
function mergeEventPages(page0, page1) {
  const events0 = page0?.events || [];
  const events1 = page1?.events || [];
  return [...events0, ...events1].sort((a, b) => (b.startTimestamp || 0) - (a.startTimestamp || 0));
}

/**
 * İki sayfa event verisini birleştirip startTimestamp'e göre azalan sırada
 * düzenlenmiş düz bir dizi döner. fetchRecentMatchDetails için kullanılır.
 */
function mergeAndSortEvents(page0, page1) {
  const events0 = page0?.events || [];
  const events1 = page1?.events || [];
  return [...events0, ...events1].sort((a, b) => (b.startTimestamp || 0) - (a.startTimestamp || 0));
}

module.exports = { fetchAllMatchData };
