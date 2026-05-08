'use strict';
/**
 * services/as-of-filter.js
 *
 * fetchAllMatchData() çıktısını verilen kickoff timestamp'inden ÖNCE oluşmuş
 * verilerle sınırlandırır. Backtest'te oynanmış maçın kendi sonucu / kendi sezon
 * istatistiğine etkisi gibi leakage'ları engeller.
 *
 * NOT: Standings ve team season stats kümülatif veridir; API "as-of date" desteklemez.
 *      Bu modül o alanları silmez ama leakage flag'i ekler. Tam çözüm ileri planda
 *      filtrelenmiş last_events üzerinden yeniden inşa gerektirir.
 *
 * Filtrelenen alanlar:
 *   - homeLastEvents.events / awayLastEvents.events
 *   - h2hEvents.events
 *   - h2hMatchDetails (h2hEvents'e bağlı)
 *   - homeRecentMatchDetails / awayRecentMatchDetails
 *   - missingPlayers — kickoff sonrası açıklanan ceza/sakatlık verisi olabilir
 *     (timestamp olmadığı için tam filtrelenmez, mevcut data kullanılır)
 *   - refereeLastEvents.events / managerCareer.events
 */

function _filterEventArray(arr, cutoffSec, excludeEventId = null) {
  if (!Array.isArray(arr)) return arr;
  return arr.filter(e => {
    if (!e) return false;
    if (excludeEventId != null && e.id === excludeEventId) return false;
    const ts = e.startTimestamp ?? e.start_ts ?? null;
    if (ts == null) return false; // ts yoksa kullanma — şüphe lehine ele
    return ts < cutoffSec;
  });
}

function _filterEventWrapper(obj, cutoffSec, excludeEventId = null) {
  if (!obj || !Array.isArray(obj.events)) return obj;
  const filtered = _filterEventArray(obj.events, cutoffSec, excludeEventId);
  return { ...obj, events: filtered, _asOfFiltered: true, _originalCount: obj.events.length };
}

/**
 * @param {object} fullData    fetchAllMatchData() çıktısı (mutate edilebilir)
 * @param {object} opts
 * @param {number} opts.cutoffTs    saniye cinsinden cutoff (typically kickoffTs - 1)
 * @returns {object} aynı obje, filtrelenmiş + meta
 */
function applyAsOfFilter(fullData, opts) {
  if (!fullData || !opts || opts.cutoffTs == null) return fullData;
  const cutoff = opts.cutoffTs;
  const matchEventId = fullData.event?.event?.id ?? fullData.eventId ?? null;
  const meta = {
    cutoffTs: cutoff,
    cutoffISO: new Date(cutoff * 1000).toISOString(),
    filtered: [],
    leakedFields: [],
  };

  // Team last events
  if (fullData.homeLastEvents) {
    const before = fullData.homeLastEvents.events?.length ?? 0;
    fullData.homeLastEvents = _filterEventWrapper(fullData.homeLastEvents, cutoff, matchEventId);
    meta.filtered.push({
      field: 'homeLastEvents',
      kept: fullData.homeLastEvents.events?.length ?? 0,
      total: before,
    });
  }
  if (fullData.awayLastEvents) {
    const before = fullData.awayLastEvents.events?.length ?? 0;
    fullData.awayLastEvents = _filterEventWrapper(fullData.awayLastEvents, cutoff, matchEventId);
    meta.filtered.push({
      field: 'awayLastEvents',
      kept: fullData.awayLastEvents.events?.length ?? 0,
      total: before,
    });
  }

  // H2H events
  if (fullData.h2hEvents) {
    const before = fullData.h2hEvents.events?.length ?? 0;
    fullData.h2hEvents = _filterEventWrapper(fullData.h2hEvents, cutoff, matchEventId);
    meta.filtered.push({
      field: 'h2hEvents',
      kept: fullData.h2hEvents.events?.length ?? 0,
      total: before,
    });
  }

  // H2H match details (object listesi — her elemanın startTimestamp'i olmalı)
  if (Array.isArray(fullData.h2hMatchDetails)) {
    const before = fullData.h2hMatchDetails.length;
    fullData.h2hMatchDetails = fullData.h2hMatchDetails.filter(d => {
      const ts = d?.startTimestamp ?? d?.event?.startTimestamp ?? null;
      if (ts == null) return false;
      return ts < cutoff && d?.id !== matchEventId && d?.event?.id !== matchEventId;
    });
    meta.filtered.push({ field: 'h2hMatchDetails', kept: fullData.h2hMatchDetails.length, total: before });
  }

  // Recent match details
  if (Array.isArray(fullData.homeRecentMatchDetails)) {
    const before = fullData.homeRecentMatchDetails.length;
    fullData.homeRecentMatchDetails = fullData.homeRecentMatchDetails.filter(d => {
      const ts = d?.startTimestamp ?? d?.event?.startTimestamp ?? null;
      if (ts == null) return false;
      return ts < cutoff && d?.id !== matchEventId && d?.event?.id !== matchEventId;
    });
    meta.filtered.push({ field: 'homeRecentMatchDetails', kept: fullData.homeRecentMatchDetails.length, total: before });
  }
  if (Array.isArray(fullData.awayRecentMatchDetails)) {
    const before = fullData.awayRecentMatchDetails.length;
    fullData.awayRecentMatchDetails = fullData.awayRecentMatchDetails.filter(d => {
      const ts = d?.startTimestamp ?? d?.event?.startTimestamp ?? null;
      if (ts == null) return false;
      return ts < cutoff && d?.id !== matchEventId && d?.event?.id !== matchEventId;
    });
    meta.filtered.push({ field: 'awayRecentMatchDetails', kept: fullData.awayRecentMatchDetails.length, total: before });
  }

  // Hakem son maçları
  if (fullData.refereeLastEvents) {
    const before = fullData.refereeLastEvents.events?.length ?? 0;
    fullData.refereeLastEvents = _filterEventWrapper(fullData.refereeLastEvents, cutoff, matchEventId);
    meta.filtered.push({
      field: 'refereeLastEvents',
      kept: fullData.refereeLastEvents.events?.length ?? 0,
      total: before,
    });
  }

  // Menajer son maçları
  if (fullData.homeManagerCareer) {
    const before = fullData.homeManagerCareer.events?.length ?? 0;
    fullData.homeManagerCareer = _filterEventWrapper(fullData.homeManagerCareer, cutoff, matchEventId);
    meta.filtered.push({
      field: 'homeManagerCareer',
      kept: fullData.homeManagerCareer.events?.length ?? 0,
      total: before,
    });
  }
  if (fullData.awayManagerCareer) {
    const before = fullData.awayManagerCareer.events?.length ?? 0;
    fullData.awayManagerCareer = _filterEventWrapper(fullData.awayManagerCareer, cutoff, matchEventId);
    meta.filtered.push({
      field: 'awayManagerCareer',
      kept: fullData.awayManagerCareer.events?.length ?? 0,
      total: before,
    });
  }

  // Standings / team season stats — KÜMÜLATIF VERİ LEAK FİX'İ
  // API as-of vermiyor. Bu alanlar "bugünün" snapshot'ını içeriyor → maçın kendi
  // sonucu da dahil. Çözüm: filtered last_events'ten yeniden hesapla.
  //
  // standingsRows.scoresFor/Against/matches/wins/draws/losses → her takım için
  // sadece cutoff'tan ÖNCEKİ maçlardan toplanır. Bu spurious accuracy yaratan
  // ana leak'ın kaynağı (50-maç testte Freiburg 3-1, Bayern 1-1 tam atışlar).
  const _rebuildTeamStats = (teamId, lastEvents) => {
    if (!Array.isArray(lastEvents)) return null;
    const valid = lastEvents.filter(e =>
      e.status?.type === 'finished' &&
      e.homeScore?.current != null &&
      e.awayScore?.current != null &&
      (e.startTimestamp ?? 0) < cutoff &&
      e.id !== matchEventId
    );
    let matches = 0, wins = 0, draws = 0, losses = 0;
    let scoresFor = 0, scoresAgainst = 0;
    for (const e of valid) {
      const isHome = e.homeTeam?.id === teamId;
      const isAway = e.awayTeam?.id === teamId;
      if (!isHome && !isAway) continue;
      const ourGoals = isHome ? e.homeScore.current : e.awayScore.current;
      const theirGoals = isHome ? e.awayScore.current : e.homeScore.current;
      matches++;
      scoresFor += ourGoals;
      scoresAgainst += theirGoals;
      if (ourGoals > theirGoals) wins++;
      else if (ourGoals < theirGoals) losses++;
      else draws++;
    }
    return {
      matches, wins, draws, losses, scoresFor, scoresAgainst,
      points: wins * 3 + draws,
    };
  };

  // Home team standings'inde kendi satırını yeniden inşa et.
  // Rebuild matches < MIN_REBUILD_N ise SATIRI KALDIR (advanced-derived fallback chain
  // devreye girer — scoreProfile veya leagueFingerprint kullanır).
  // Sebep: matches=0 ile rebuild edilen satır lambda formülünde NaN/extreme
  // değerlere yol açıyor (λ=0.05 veya λ=6.38 anomalileri).
  const MIN_REBUILD_N = 3; // En az 3 cutoff-öncesi maç olmadan rebuild güvenilir değil
  const _rebuildStandingsRow = (standingsObj, teamId, lastEvents) => {
    if (!standingsObj || !Array.isArray(standingsObj.standings) ||
        !standingsObj.standings[0]?.rows) return standingsObj;
    const stats = _rebuildTeamStats(teamId, lastEvents);
    if (stats == null) return standingsObj;
    const newObj = JSON.parse(JSON.stringify(standingsObj));
    for (const tier of newObj.standings) {
      if (!Array.isArray(tier.rows)) continue;
      // Yetersiz veri → satırı KALDIR (advanced-derived fallback'e düşer)
      if (stats.matches < MIN_REBUILD_N) {
        tier.rows = tier.rows.filter(row => row.team?.id !== teamId);
        continue;
      }
      for (const row of tier.rows) {
        if (row.team?.id === teamId) {
          row.matches = stats.matches;
          row.wins = stats.wins;
          row.draws = stats.draws;
          row.losses = stats.losses;
          row.scoresFor = stats.scoresFor;
          row.scoresAgainst = stats.scoresAgainst;
          row.points = stats.points;
          row._rebuiltAsOf = true;
        }
      }
    }
    newObj._asOfRebuilt = true;
    return newObj;
  };

  if (fullData.standingsTotal && fullData.homeTeamId != null) {
    fullData.standingsTotal = _rebuildStandingsRow(
      fullData.standingsTotal, fullData.homeTeamId, fullData.homeLastEvents?.events
    );
    fullData.standingsTotal = _rebuildStandingsRow(
      fullData.standingsTotal, fullData.awayTeamId, fullData.awayLastEvents?.events
    );
    meta.filtered.push({ field: 'standingsTotal', kept: 'rebuilt', total: 'rebuilt' });
  }

  // Team season stats — son n maçtan agregat. Kümülatif sayılar burada
  // hesaplanır ama API'nin verdiği değer "bugüne kadar tüm sezon" olduğu için
  // güvenilmez. Şimdilik stats'i null'a çek; advanced-derived scoreProfile'dan türetir.
  if (fullData.homeTeamSeasonStats) {
    fullData.homeTeamSeasonStats = null;
    meta.filtered.push({ field: 'homeTeamSeasonStats', kept: 0, total: 1 });
  }
  if (fullData.awayTeamSeasonStats) {
    fullData.awayTeamSeasonStats = null;
    meta.filtered.push({ field: 'awayTeamSeasonStats', kept: 0, total: 1 });
  }

  // Home/Away spesifik standings — total ile aynı mantıkla rebuild edilmeli ama
  // "home maçları sadece" filtresi ekleyerek
  const _rebuildLocationSpecific = (standingsObj, teamId, lastEvents, location) => {
    if (!standingsObj || !Array.isArray(lastEvents)) return standingsObj;
    const filtered = lastEvents.filter(e => {
      if (location === 'home') return e.homeTeam?.id === teamId;
      if (location === 'away') return e.awayTeam?.id === teamId;
      return true;
    });
    return _rebuildStandingsRow(standingsObj, teamId, filtered);
  };

  if (fullData.standingsHome) {
    fullData.standingsHome = _rebuildLocationSpecific(
      fullData.standingsHome, fullData.homeTeamId, fullData.homeLastEvents?.events, 'home'
    );
    meta.filtered.push({ field: 'standingsHome', kept: 'rebuilt', total: 'rebuilt' });
  }
  if (fullData.standingsAway) {
    fullData.standingsAway = _rebuildLocationSpecific(
      fullData.standingsAway, fullData.awayTeamId, fullData.awayLastEvents?.events, 'away'
    );
    meta.filtered.push({ field: 'standingsAway', kept: 'rebuilt', total: 'rebuilt' });
  }

  fullData._asOfMeta = meta;
  return fullData;
}

module.exports = { applyAsOfFilter };
