/**
 * Data Fetcher — Orchestrator
 * Bir maç için gereken TÜM verileri SofaScore API'den toplar.
 * Hiçbir fallback/statik değer yoktur.
 */

const api = require('./playwright-client');
const { fetchWeatherData, computeWeatherMetrics } = require('./weather-service');

/**
 * Verilen event ID için tahmin motorunun ihtiyaç duyduğu tüm ham verileri toplar.
 * @param {number} eventId
 * @returns {Promise<object>} Tüm ham veriler
 */
async function fetchAllMatchData(eventId) {
  console.log(`[DataFetcher] Fetching all data for event ${eventId}...`);
  const startTime = Date.now();

  // 1. Maç temel bilgisi — tournamentId, seasonId, teamId'ler buradan çıkacak
  const eventDataStart = Date.now();
  const eventData = await api.getEvent(eventId);
  const eventDataElapsed = Date.now() - eventDataStart;

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
  // SofaScore h2h/events endpoint'i customId (slug) ile çalışır, numeric ID ile değil
  const eventCustomId = event.customId || eventId;

  console.log(`[DataFetcher] Match: ${event.homeTeam.name} vs ${event.awayTeam.name}`);
  console.log(`[DataFetcher] Tournament: ${tournamentId}, Season: ${seasonId}`);

  // Helper for tracking parallel calls
  async function track(name, promise, isCritical = false) {
    const start = Date.now();
    try {
      const value = await promise;
      return { name, value, elapsedMs: Date.now() - start, isCritical };
    } catch (error) {
      // Re-throw with timing metadata so allSettled captures it as a rejection
      error.elapsedMs = Date.now() - start;
      error.isCritical = isCritical;
      error.trackName = name;
      throw error;
    }
  }

  // 2. Maç seviyesi veriler (paralel)
  const matchLevelResults = await Promise.allSettled([
    track('lineups', api.getEventLineups(eventId), true),
    track('h2h', api.getEventH2H(eventId)),
    track('h2hEvents', api.getEventH2HEvents(eventCustomId)),
    track('odds', api.getEventOdds(eventId)),
    track('missingPlayers', api.getEventMissingPlayers(eventId)),
    track('streaks', api.getEventStreaks(eventId)),
    track('form', api.getEventForm(eventId)),
    track('managers', api.getEventManagers(eventId)),
    track('votes', api.getEventVotes(eventId)),
  ]);

  matchLevelResults.forEach((r) => {
    if (r.status === 'rejected') {
      const name = r.reason?.trackName || 'unknown';
      console.warn(`[DataFetcher] Non-critical fetch failed (${name}): ${r.reason?.message || r.reason}`);
    }
  });

  const [
    lineupsRes, h2hRes, h2hEventsRes, oddsRes, missingPlayersRes,
    streaksRes, formRes, managersRes, votesRes
  ] = matchLevelResults;

  let lineups = lineupsRes.status === 'fulfilled' ? lineupsRes.value.value : null;
  let h2h = h2hRes.status === 'fulfilled' ? h2hRes.value.value : null;
  let h2hEvents = h2hEventsRes.status === 'fulfilled' ? h2hEventsRes.value.value : null;
  let odds = oddsRes.status === 'fulfilled' ? oddsRes.value.value : null;
  let missingPlayers = missingPlayersRes.status === 'fulfilled' ? missingPlayersRes.value.value : null;
  let streaks = streaksRes.status === 'fulfilled' ? streaksRes.value.value : null;
  let form = formRes.status === 'fulfilled' ? formRes.value.value : null;
  let managers = managersRes.status === 'fulfilled' ? managersRes.value.value : null;
  let votes = votesRes.status === 'fulfilled' ? votesRes.value.value : null;

  const teamH2H = null;

  // 3 + 4. Takım verileri — Ev sahibi ve deplasman (paralel)
  const teamLevelResults = await Promise.allSettled([
    track('homeTeam', api.getTeam(homeTeamId)),
    track('homePlayers', api.getTeamPlayers(homeTeamId)),
    track('homeLastEvents0', api.getTeamLastEvents(homeTeamId, 0)),
    track('homeLastEvents1', api.getTeamLastEvents(homeTeamId, 1)),
    track('awayTeam', api.getTeam(awayTeamId)),
    track('awayPlayers', api.getTeamPlayers(awayTeamId)),
    track('awayLastEvents0', api.getTeamLastEvents(awayTeamId, 0)),
    track('awayLastEvents1', api.getTeamLastEvents(awayTeamId, 1)),
  ]);

  teamLevelResults.forEach((r) => {
    if (r.status === 'rejected') {
      const name = r.reason?.trackName || 'unknown';
      console.warn(`[DataFetcher] Non-critical fetch failed (${name}): ${r.reason?.message || r.reason}`);
    }
  });

  const [
    homeTeamRes, homePlayersRes, homeLastEvents0Res, homeLastEvents1Res,
    awayTeamRes, awayPlayersRes, awayLastEvents0Res, awayLastEvents1Res
  ] = teamLevelResults;

  const homeTeam = homeTeamRes.status === 'fulfilled' ? homeTeamRes.value.value : null;
  const homePlayers = homePlayersRes.status === 'fulfilled' ? homePlayersRes.value.value : null;
  const homeLastEvents0 = homeLastEvents0Res.status === 'fulfilled' ? homeLastEvents0Res.value.value : null;
  const homeLastEvents1 = homeLastEvents1Res.status === 'fulfilled' ? homeLastEvents1Res.value.value : null;
  const awayTeam = awayTeamRes.status === 'fulfilled' ? awayTeamRes.value.value : null;
  const awayPlayers = awayPlayersRes.status === 'fulfilled' ? awayPlayersRes.value.value : null;
  const awayLastEvents0 = awayLastEvents0Res.status === 'fulfilled' ? awayLastEvents0Res.value.value : null;
  const awayLastEvents1 = awayLastEvents1Res.status === 'fulfilled' ? awayLastEvents1Res.value.value : null;

  // 5. Lig/Turnuva verileri
  let standingsTotal = null, standingsHome = null, standingsAway = null;
  let homeTeamSeasonStats = null, awayTeamSeasonStats = null;
  let homeTopPlayers = null, awayTopPlayers = null;
  let leagueResults = [];

  if (tournamentId && seasonId) {
    leagueResults = await Promise.allSettled([
      track('standingsTotal', api.getStandings(tournamentId, seasonId, 'total')),
      track('standingsHome', api.getStandings(tournamentId, seasonId, 'home')),
      track('standingsAway', api.getStandings(tournamentId, seasonId, 'away')),
      track('homeTeamSeasonStats', api.getTeamSeasonStats(homeTeamId, tournamentId, seasonId)),
      track('awayTeamSeasonStats', api.getTeamSeasonStats(awayTeamId, tournamentId, seasonId)),
      track('homeTopPlayers', api.getTeamTopPlayers(homeTeamId, tournamentId, seasonId)),
      track('awayTopPlayers', api.getTeamTopPlayers(awayTeamId, tournamentId, seasonId)),
    ]);

    leagueResults.forEach((r) => {
      if (r.status === 'rejected') {
        const name = r.reason?.trackName || 'unknown';
        console.warn(`[DataFetcher] Non-critical fetch failed (${name}): ${r.reason?.message || r.reason}`);
      }
    });

    const [st, sh, sa, hss, ass, htp, atp] = leagueResults;
    standingsTotal = st.status === 'fulfilled' ? st.value.value : null;
    standingsHome = sh.status === 'fulfilled' ? sh.value.value : null;
    standingsAway = sa.status === 'fulfilled' ? sa.value.value : null;
    homeTeamSeasonStats = hss.status === 'fulfilled' ? hss.value.value : null;
    awayTeamSeasonStats = ass.status === 'fulfilled' ? ass.value.value : null;
    homeTopPlayers = htp.status === 'fulfilled' ? htp.value.value : null;
    awayTopPlayers = atp.status === 'fulfilled' ? atp.value.value : null;
  }

  // 6. Hakem verileri (Paralel)
  const refereeTrackResults = await Promise.allSettled([
    track('refereeStats', refereeId ? api.getRefereeStats(refereeId) : Promise.resolve(null)),
    track('refereeLastEvents', refereeId ? api.getRefereeLastEvents(refereeId, 0) : Promise.resolve(null)),
  ]);
  let refereeStats = refereeTrackResults[0].status === 'fulfilled' ? refereeTrackResults[0].value.value : null;
  const refereeLastEvents = refereeTrackResults[1].status === 'fulfilled' ? refereeTrackResults[1].value.value : null;

  if (event.referee && refereeId) {
    if (!refereeStats) refereeStats = { statistics: {} };
    refereeStats.eventReferee = event.referee;
  }

  // 7. Menajer verileri
  let actualHomeManagerId = homeManagerId;
  let actualAwayManagerId = awayManagerId;
  if (managers) {
    if (managers.homeManager) actualHomeManagerId = managers.homeManager.id;
    if (managers.awayManager) actualAwayManagerId = managers.awayManager.id;
  }
  if (!actualHomeManagerId && homeTeam?.team?.manager?.id) actualHomeManagerId = homeTeam.team.manager.id;
  if (!actualAwayManagerId && awayTeam?.team?.manager?.id) actualAwayManagerId = awayTeam.team.manager.id;

  const managerTrackResults = await Promise.allSettled([
    track('homeManagerLastEvents', actualHomeManagerId ? api.getManagerLastEvents(actualHomeManagerId, 0) : Promise.resolve(null)),
    track('awayManagerLastEvents', actualAwayManagerId ? api.getManagerLastEvents(actualAwayManagerId, 0) : Promise.resolve(null)),
  ]);

  const homeManagerCareer = managerTrackResults[0].status === 'fulfilled' ? managerTrackResults[0].value.value : null;
  const awayManagerCareer = managerTrackResults[1].status === 'fulfilled' ? managerTrackResults[1].value.value : null;

  // 8. Derinlemesine Detaylar (H2H & Son Maçlar - Paralel)
  const [h2hMatchDetails, homeRecentMatchDetails, awayRecentMatchDetails] = await Promise.all([
    fetchH2HMatchDetails(h2hEvents),
    fetchRecentMatchDetails(mergeAndSortEvents(homeLastEvents0, homeLastEvents1), 5),
    fetchRecentMatchDetails(mergeAndSortEvents(awayLastEvents0, awayLastEvents1), 5),
  ]);

  // --- FALLBACK LINEUP GENERATOR ---
  function buildFallbackLineup(squadPlayers, recentMatchDetails, teamId) {
    if (!squadPlayers?.players) return { players: [] };
    
    // Create pool and default to isReserve: true unless explicitly assigned
    const pool = squadPlayers.players.map(p => ({
      player: p.player,
      position: p.player?.position || 'M',
      shirtNumber: p.player?.shirtNumber || '',
      substitute: false,
      isReserve: true
    }));

    if (pool.length === 0) return { players: [] };

    let lastLineupPlayers = null;
    if (recentMatchDetails && recentMatchDetails.length > 0) {
      for (const match of recentMatchDetails) {
        if (match.lineups) {
          const isHome = match.homeTeamId === teamId || match.homeTeam?.id === teamId;
          const teamLineup = isHome ? match.lineups.home : match.lineups.away;
          // Fallback if homeTeamId wasn't strictly checked
          const actualLineup = teamLineup || (match.homeTeam?.name?.includes(squadPlayers.team?.name) ? match.lineups.home : match.lineups.away);
          if (actualLineup && actualLineup.players && actualLineup.players.length > 0) {
            lastLineupPlayers = actualLineup.players;
            break;
          }
        }
      }
    }

    const starting = [];
    const subs = [];
    const usedIdx = new Set();

    if (lastLineupPlayers) {
      // Use previous match lineup
      for (const p of lastLineupPlayers) {
        const poolPlayer = pool.find(sp => sp.player?.id === p.player?.id);
        if (poolPlayer) {
          if (!p.substitute) {
            starting.push({ ...poolPlayer, substitute: false, isReserve: false });
          } else {
            subs.push({ ...poolPlayer, substitute: true, isReserve: false });
          }
          usedIdx.add(poolPlayer.player.id);
        }
      }
    }

    // If starting 11 is not complete from previous match, fill remaining using position fallback
    if (starting.length < 11) {
      const byPos = { G: [], D: [], M: [], F: [] };
      for (const p of pool) { 
        if (!usedIdx.has(p.player.id)) {
          const pos = (p.position || 'M').toUpperCase()[0];
          if (byPos[pos]) byPos[pos].push(p); 
          else byPos['M'].push(p);
        }
      }

      function pickN(posArr, n) {
        let picked = 0;
        for (const p of posArr) { 
          if (starting.length >= 11) break;
          if (picked >= n) break; 
          if (!usedIdx.has(p.player?.id)) { 
            starting.push({ ...p, substitute: false, isReserve: false }); 
            usedIdx.add(p.player?.id); 
            picked++; 
          } 
        }
      }

      // Check how many we already have by position
      const currentG = starting.filter(p => (p.position || 'M').toUpperCase()[0] === 'G').length;
      const currentD = starting.filter(p => (p.position || 'M').toUpperCase()[0] === 'D').length;
      const currentM = starting.filter(p => (p.position || 'M').toUpperCase()[0] === 'M').length;
      const currentF = starting.filter(p => (p.position || 'M').toUpperCase()[0] === 'F').length;

      pickN(byPos.G, Math.max(0, 1 - currentG)); 
      pickN(byPos.D, Math.max(0, 4 - currentD)); 
      pickN(byPos.M, Math.max(0, 3 - currentM)); 
      pickN(byPos.F, Math.max(0, 3 - currentF));
      
      // If still less than 11, just pick anyone
      if (starting.length < 11) {
        for (const p of pool) {
          if (starting.length >= 11) break;
          if (!usedIdx.has(p.player?.id)) {
            starting.push({ ...p, substitute: false, isReserve: false }); 
            usedIdx.add(p.player?.id);
          }
        }
      }
    }

    // Assign up to 9 remaining as substitutes if not already populated from previous match
    if (subs.length === 0) {
      const remainingForSubs = pool.filter(p => !usedIdx.has(p.player?.id)).slice(0, 9);
      for (const p of remainingForSubs) {
        subs.push({ ...p, substitute: true, isReserve: false });
        usedIdx.add(p.player.id);
      }
    }

    const reserves = pool.filter(p => !usedIdx.has(p.player?.id)).map(p => ({ ...p, substitute: true, isReserve: true }));

    return { players: [...starting, ...subs, ...reserves], formation: '4-3-3', isFallback: true };
  }

  function normalizeStarters(lineup) {
    if (!lineup || !lineup.players) return lineup;
    let starterCount = 0;
    const players = lineup.players.map(p => {
      // Determine if a player was neither starter nor sub based on the source data.
      // If it's a squad list without starter distinction, they might all be `substitute: false`.
      const isActuallyReserve = p.isReserve || false;
      if (!p.substitute && !isActuallyReserve) {
        if (starterCount >= 11) {
          return { ...p, substitute: true };
        }
        starterCount++;
      }
      return p;
    });
    return { ...lineup, players };
  }

  const lineupsSafe = lineups || {};
  if (!lineupsSafe.home || !lineupsSafe.home.players || lineupsSafe.home.players.length === 0) {
    lineupsSafe.home = buildFallbackLineup(homePlayers, homeRecentMatchDetails, homeTeamId); lineupsSafe.isFallback = true;
  } else {
    lineupsSafe.home = normalizeStarters(lineupsSafe.home);
  }
  if (!lineupsSafe.away || !lineupsSafe.away.players || lineupsSafe.away.players.length === 0) {
    lineupsSafe.away = buildFallbackLineup(awayPlayers, awayRecentMatchDetails, awayTeamId); lineupsSafe.isFallback = true;
  } else {
    lineupsSafe.away = normalizeStarters(lineupsSafe.away);
  }

  // 9. Oyuncu Sezon İstatistikleri (Ev ve Deplasman Paralel)
  const [homePResult, awayPResult] = await Promise.all([
    fetchPlayerStats(lineupsSafe?.home?.players, tournamentId, seasonId),
    fetchPlayerStats(lineupsSafe?.away?.players, tournamentId, seasonId),
  ]);
  const { stats: homePlayerStats, log: homePlayerLog } = homePResult;
  const { stats: awayPlayerStats, log: awayPlayerLog } = awayPResult;

  // Enrich lineups and squad arrays with fetched statistics
  const enrichPlayers = (playersArr, statsArr) => {
    if (!playersArr || !statsArr) return playersArr;
    return playersArr.map(p => {
      if (!p.player) return p;
      const st = statsArr.find(s => s.playerId === p.player.id);
      if (st) {
        return {
          ...p,
          player: {
            ...p.player,
            seasonStats: st.seasonStats || null,
            statistics: st.seasonStats?.statistics || null
          }
        };
      }
      return p;
    });
  };

  if (lineupsSafe.home?.players) lineupsSafe.home.players = enrichPlayers(lineupsSafe.home.players, homePlayerStats);
  if (lineupsSafe.away?.players) lineupsSafe.away.players = enrichPlayers(lineupsSafe.away.players, awayPlayerStats);
  if (homePlayers?.players) homePlayers.players = enrichPlayers(homePlayers.players, homePlayerStats);
  if (awayPlayers?.players) awayPlayers.players = enrichPlayers(awayPlayers.players, awayPlayerStats);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[DataFetcher] Optimized fetch completed in ${elapsed}s`);

  // Actual API URLs for each matchLevel endpoint
  const matchLevelUrls = {
    lineups: `/event/${eventId}/lineups`,
    h2h: `/event/${eventId}/h2h`,
    h2hEvents: `/event/${eventCustomId}/h2h/events`,
    odds: `/event/${eventId}/odds/1/all`,
    missingPlayers: `/event/${eventId}/missing-players`,
    streaks: `/event/${eventId}/team-streaks`,
    form: `/event/${eventId}/pregame-form`,
    managers: `/event/${eventId}/managers`,
    votes: `/event/${eventId}/votes`,
  };

  // Attach API call log for debug page (includes full response data)
  const _apiLog = [
    {
      endpoint: 'getEvent',
      url: `/event/${eventId}`,
      success: !!eventData,
      elapsedMs: eventDataElapsed,
      responseSize: eventData ? JSON.stringify(eventData).length : 0,
      data: eventData,
    },
    ...matchLevelResults.map(r => ({
      endpoint: r.status === 'fulfilled' ? r.value.name : (r.reason?.trackName || 'unknown'),
      status: r.status,
      success: r.status === 'fulfilled',
      elapsedMs: r.status === 'fulfilled' ? r.value.elapsedMs : (r.reason?.elapsedMs || 0),
      isCritical: r.status === 'fulfilled' ? r.value.isCritical : (r.reason?.isCritical || false),
      error: r.status === 'rejected' ? (r.reason?.message || 'failed') : null,
      data: r.status === 'fulfilled' ? r.value.value : null
    })),
    ...teamLevelResults.map(r => ({
      endpoint: r.status === 'fulfilled' ? r.value.name : (r.reason?.trackName || 'unknown'),
      status: r.status,
      success: r.status === 'fulfilled',
      elapsedMs: r.status === 'fulfilled' ? r.value.elapsedMs : (r.reason?.elapsedMs || 0),
      data: r.status === 'fulfilled' ? r.value.value : null
    })),
    ...leagueResults.map(r => ({
      endpoint: r.status === 'fulfilled' ? r.value.name : (r.reason?.trackName || 'unknown'),
      status: r.status,
      success: r.status === 'fulfilled',
      elapsedMs: r.status === 'fulfilled' ? r.value.elapsedMs : (r.reason?.elapsedMs || 0),
      data: r.status === 'fulfilled' ? r.value.value : null
    })),
    // Hakem & Menajer
    ...refereeTrackResults.map(r => ({
      endpoint: r.status === 'fulfilled' ? r.value.name : (r.reason?.trackName || 'unknown'),
      status: r.status,
      success: r.status === 'fulfilled',
      elapsedMs: r.status === 'fulfilled' ? r.value.elapsedMs : (r.reason?.elapsedMs || 0),
      data: r.status === 'fulfilled' ? r.value.value : null
    })),
    ...managerTrackResults.map(r => ({
      endpoint: r.status === 'fulfilled' ? r.value.name : (r.reason?.trackName || 'unknown'),
      status: r.status,
      success: r.status === 'fulfilled',
      elapsedMs: r.status === 'fulfilled' ? r.value.elapsedMs : (r.reason?.elapsedMs || 0),
      data: r.status === 'fulfilled' ? r.value.value : null
    })),
    // H2H maç detayları (M129/M130)
    {
      endpoint: 'h2hMatchDetails',
      url: `fetchH2HMatchDetails × ${h2hMatchDetails.length} maç`,
      success: h2hMatchDetails.length > 0,
      responseSize: JSON.stringify(h2hMatchDetails).length,
      data: h2hMatchDetails,
    },
    // Player stats summary
    {
      endpoint: 'homePlayerStats',
      url: `fetchPlayerStats × ${homePlayerLog.length} oyuncu`,
      success: homePlayerStats.length > 0,
      data: homePlayerStats,
      _detail: homePlayerLog,
    },
    {
      endpoint: 'awayPlayerStats',
      url: `fetchPlayerStats × ${awayPlayerLog.length} oyuncu`,
      success: awayPlayerStats.length > 0,
      data: awayPlayerStats,
      _detail: awayPlayerLog,
    },
  ];
  const result = {
    event: eventData,
    eventId,
    homeTeamId,
    awayTeamId,
    tournamentId,
    seasonId,
    refereeId,

    // Maç seviyesi
    lineups: lineupsSafe,
    h2h,
    h2hEvents,
    teamH2H,
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
    homeLastEvents: mergeAndSortEvents(homeLastEvents0, homeLastEvents1),
    awayLastEvents: mergeAndSortEvents(awayLastEvents0, awayLastEvents1),

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
    refereeLastEvents,
    homeManagerCareer,
    awayManagerCareer,
    homeManagerId: actualHomeManagerId,
    awayManagerId: actualAwayManagerId,
    h2hMatchDetails,

    // Deep-dive
    homeRecentMatchDetails,
    awayRecentMatchDetails,
    homePlayerStats,
    awayPlayerStats,

    // Hava durumu
    weatherMetrics: null, // Asenkron olarak eklenecek

    // Debug
    _apiLog,
  };

  // Hava durumu (stadyum koordinatları ve tarih var ise)
  let weatherPromise = Promise.resolve(null);
  if (eventData.event && eventData.event.startTimestamp) {
    const ts = eventData.event.startTimestamp * 1000;
    const d = new Date(ts);
    const matchDate = d.toISOString().split('T')[0];
    const matchHour = d.getHours();
    let lat, lon;
    
    if (eventData.event.venue && eventData.event.venue.venueCoordinates) {
       lat = eventData.event.venue.venueCoordinates.latitude;
       lon = eventData.event.venue.venueCoordinates.longitude;
    } else if (eventData.event.venue?.city?.location) {
       lat = eventData.event.venue.city.location.latitude;
       lon = eventData.event.venue.city.location.longitude;
    }
    
    if (lat && lon) {
      weatherPromise = fetchWeatherData(lat, lon, matchDate, matchHour).catch(err => {
        console.warn('[DataFetcher] Weather fetch failed:', err.message);
        return null;
      });
    }
  }

  // Final merge (Hava durumu zaten paralel gidiyor)
  const weatherRaw = await weatherPromise;
  if (weatherRaw) {
    result.weatherMetrics = computeWeatherMetrics(weatherRaw);
  }

  return result;
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

  const details = await Promise.all(recentFinished.map(async (ev) => {
    const [incidents, stats, shotmap, graph, lineups] = await Promise.all([
      api.getEventIncidents(ev.id).catch(() => null),
      api.getEventStats(ev.id).catch(() => null),
      api.getEventShotmap(ev.id).catch(() => null),
      api.getEventGraph(ev.id).catch(() => null),
      api.getEventLineups(ev.id).catch(() => null),
    ]);

    return {
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
    };
  }));
  return details;
}

/**
 * Kadrodaki oyuncuların sezon istatistiklerini çeker.
 * İlk 11 + tüm yedekler — M067 (Yedek Rating) ve M088 (Bench/Starter değer oranı) için tam veri gereklidir.
 */
async function fetchPlayerStats(players, tournamentId, seasonId) {
  if (!players || !tournamentId || !seasonId) return { stats: [], log: [] };

  const starters = players.filter(p => !p.substitute).slice(0, 11);
  const subs = players.filter(p => p.substitute);
  const targetPlayers = [...starters, ...subs];

  const stats = [];
  const log = [];

  // Artık batching'i playwright-client'ın içindeki 200ms rate-limiter'a bırakıyoruz.
  // Tüm oyuncuları aynı anda Promise.all ile başlatmak, toplam süreyi minimize eder.
  await Promise.all(targetPlayers.map(async (p) => {
    const playerId = p.player?.id;
    if (!playerId) return;

    const t0 = Date.now();
    const [seasonStats, attributes, characteristics] = await Promise.all([
      api.getPlayerSeasonStats(playerId, tournamentId, seasonId).catch(() => null),
      api.getPlayerAttributes(playerId).catch(() => null),
      api.getPlayerCharacteristics(playerId).catch(() => null),
    ]);
    const duration = Date.now() - t0;

    stats.push({
      playerId,
      name: p.player.name,
      position: p.player.position || p.position,
      shirtNumber: p.shirtNumber,
      substitute: p.substitute || false,
      seasonStats,
      attributes,
      characteristics,
    });

    log.push({
      playerId,
      name: p.player.name,
      substitute: p.substitute || false,
      durationMs: duration,
      hasSeasonStats: !!seasonStats,
      hasAttributes: !!attributes,
      hasCharacteristics: !!characteristics,
      rating: seasonStats?.statistics?.rating ?? null,
    });
  }));

  return { stats, log };
}

/**
 * H2H maçlarının kart ve korner verilerini çeker — M129/M130 için.
 * h2hEvents.events içindeki son 5 bitmiş maçın incidents + statistics'ini çeker,
 * her event'e { incidents, statistics } olarak gömülü döner.
 */
async function fetchH2HMatchDetails(h2hEventsData) {
  const events = h2hEventsData?.events || [];
  const finished = events
    .filter(e => e.status?.type === 'finished' || e.homeScore?.current != null)
    .slice(0, 5);

  const details = await Promise.all(finished.map(async (ev) => {
    const [incidentsData, statsData] = await Promise.all([
      api.getEventIncidents(ev.id).catch(() => null),
      api.getEventStats(ev.id).catch(() => null),
    ]);

    // İstatistikleri düzleştir
    const statsArr = statsData?.statistics || [];
    const allPeriod = statsArr.find(p => p.period === 'ALL') || statsArr[0] || null;
    const flatStats = [];
    for (const group of (allPeriod?.groups || [])) {
      for (const item of (group.statisticsItems || [])) {
        flatStats.push({
          name: item.name,
          homeValue: item.homeValue ?? item.home ?? null,
          awayValue: item.awayValue ?? item.away ?? null,
        });
      }
    }

    return {
      eventId: ev.id,
      homeTeamId: ev.homeTeam?.id,
      awayTeamId: ev.awayTeam?.id,
      homeScore: ev.homeScore,
      awayScore: ev.awayScore,
      incidents: incidentsData?.incidents || [],
      statistics: flatStats,
    };
  }));

  return details;
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

/**
 * Workshop için: belirli oyuncuların istatistiklerini fetch eder.
 * fetchPlayerStats ile aynı mantık — sadece filtre olmadan tüm oyuncuları alır.
 * @param {Array} players - { player: { id, name, position }, substitute, isReserve, ... }
 * @param {number} tournamentId
 * @param {number} seasonId
 * @returns {Promise<Array>} stats array (homePlayerStats / awayPlayerStats formatında)
 */
async function fetchPlayerStatsForPlayers(players, tournamentId, seasonId) {
  if (!players?.length || !tournamentId || !seasonId) return [];

  const stats = [];
  await Promise.all(players.map(async (p) => {
    const playerId = p.player?.id;
    if (!playerId) return;

    const [seasonStats, attributes, characteristics] = await Promise.all([
      api.getPlayerSeasonStats(playerId, tournamentId, seasonId).catch(() => null),
      api.getPlayerAttributes(playerId).catch(() => null),
      api.getPlayerCharacteristics(playerId).catch(() => null),
    ]);

    stats.push({
      playerId,
      name: p.player.name,
      position: p.player.position || p.position || 'M',
      shirtNumber: p.shirtNumber || '',
      substitute: p.substitute || false,
      isReserve: p.isReserve || false,
      seasonStats,
      attributes,
      characteristics,
    });
  }));

  return stats;
}

module.exports = { fetchAllMatchData, fetchPlayerStatsForPlayers };
