/**
 * schema-validator.js
 * SofaScore API response'larının beklenen şemaya uygunluğunu kontrol eder.
 * Uyumsuzluk tespit edildiğinde: warning log + data.meta.schemaWarnings[] dizisine kaydet.
 */

'use strict';

/**
 * Kritik alanları kontrol eder ve uyarı listesi döner.
 * @param {object} data - fetchAllMatchData çıktısı
 * @returns {string[]} warnings listesi
 */
function validateMatchData(data) {
  const warnings = [];

  if (!data) {
    warnings.push('data is null/undefined');
    return warnings;
  }

  // Event temel alanları
  const event = data.event?.event;
  if (!event) {
    warnings.push('event.event is missing');
  } else {
    if (!event.homeTeam?.id) warnings.push('event.homeTeam.id is missing');
    if (!event.awayTeam?.id) warnings.push('event.awayTeam.id is missing');
    if (!event.tournament) warnings.push('event.tournament is missing');
  }

  // Standings
  const standingsRows = data.standingsTotal?.standings?.[0]?.rows;
  if (!Array.isArray(standingsRows)) {
    warnings.push('standingsTotal.standings[0].rows is not an array');
  } else if (standingsRows.length < 4) {
    warnings.push(`standingsTotal has only ${standingsRows.length} rows (min 4 expected)`);
  }

  // Lineups
  const homePlayers = data.lineups?.home?.players || data.lineups?.home;
  const awayPlayers = data.lineups?.away?.players || data.lineups?.away;
  if (!Array.isArray(homePlayers) || homePlayers.length === 0) {
    warnings.push('lineups.home.players is missing or empty');
  }
  if (!Array.isArray(awayPlayers) || awayPlayers.length === 0) {
    warnings.push('lineups.away.players is missing or empty');
  }

  // Team IDs
  if (!data.homeTeamId) warnings.push('homeTeamId is missing');
  if (!data.awayTeamId) warnings.push('awayTeamId is missing');

  // Season stats
  if (!data.homeTeamSeasonStats) warnings.push('homeTeamSeasonStats is missing');
  if (!data.awayTeamSeasonStats) warnings.push('awayTeamSeasonStats is missing');

  // H2H events
  if (!Array.isArray(data.h2hEvents) || data.h2hEvents.length === 0) {
    warnings.push('h2hEvents is missing or empty');
  }

  // Last events
  if (!Array.isArray(data.homeLastEvents) || data.homeLastEvents.length === 0) {
    warnings.push('homeLastEvents is missing or empty');
  }
  if (!Array.isArray(data.awayLastEvents) || data.awayLastEvents.length === 0) {
    warnings.push('awayLastEvents is missing or empty');
  }

  // Statistics — period='ALL' filtresi doğrulaması
  if (data.homeRecentMatchDetails && Array.isArray(data.homeRecentMatchDetails)) {
    for (let i = 0; i < Math.min(data.homeRecentMatchDetails.length, 3); i++) {
      const md = data.homeRecentMatchDetails[i];
      const stats = md?.stats?.statistics;
      if (Array.isArray(stats) && stats.length > 0) {
        const hasAll = stats.some(p => p.period === 'ALL');
        if (!hasAll) {
          warnings.push(`homeRecentMatchDetails[${i}] has no period=ALL statistics`);
        }
      }
    }
  }

  // Lineups — oyuncu name alanı kontrolü
  if (Array.isArray(homePlayers) && homePlayers.length > 0) {
    const namedCount = homePlayers.filter(p => p?.player?.name || p?.name).length;
    if (namedCount < homePlayers.length * 0.5) {
      warnings.push(`lineups.home: only ${namedCount}/${homePlayers.length} players have names`);
    }
  }
  if (Array.isArray(awayPlayers) && awayPlayers.length > 0) {
    const namedCount = awayPlayers.filter(p => p?.player?.name || p?.name).length;
    if (namedCount < awayPlayers.length * 0.5) {
      warnings.push(`lineups.away: only ${namedCount}/${awayPlayers.length} players have names`);
    }
  }

  // Incidents — temel yapı kontrolü
  if (data.homeIncidents && Array.isArray(data.homeIncidents)) {
    for (const inc of data.homeIncidents.slice(0, 5)) {
      if (inc && inc.incidentType == null) {
        warnings.push('homeIncidents contains items without incidentType');
        break;
      }
    }
  }

  // Numeric range validation — standings row sanity check
  if (Array.isArray(standingsRows) && standingsRows.length >= 4) {
    for (const row of standingsRows.slice(0, 3)) {
      if (row.matches != null && (row.matches < 0 || row.matches > 100)) {
        warnings.push(`standings row ${row.team?.name ?? '?'} has unreasonable matches: ${row.matches}`);
      }
      if (row.scoresFor != null && row.scoresFor < 0) {
        warnings.push(`standings row ${row.team?.name ?? '?'} has negative scoresFor: ${row.scoresFor}`);
      }
    }
  }

  // Log warnings
  if (warnings.length > 0) {
    console.warn(`[SchemaValidator] ${warnings.length} warning(s):`, warnings.join('; '));
  }

  return warnings;
}

module.exports = { validateMatchData };
