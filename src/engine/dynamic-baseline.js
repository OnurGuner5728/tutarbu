/**
 * dynamic-baseline.js
 * Computes dynamic baselines and league averages from API data.
 * Used as fallback context for the simulation engine.
 */

'use strict';

const { METRIC_METADATA } = require('./metric-metadata');

/**
 * Derives a baseline context for a match based on its specific league/team data.
 * Falls back to METRIC_METADATA defaults if data is totally missing.
 */
function getDynamicBaseline(data) {
  const meta = METRIC_METADATA;
  const baseline = {
    leagueAvgGoals: 1.35, // Ultimate fallback
    shotsPerMin: meta.M013.leagueAvg / 90,
    onTargetRate: meta.M014.leagueAvg / meta.M013.leagueAvg,
    goalConvRate: meta.M011.leagueAvg / 100,
    blockRate: meta.M034.leagueAvg / 100,
    cornerPerMin: meta.M022.leagueAvg / 90,
    yellowPerMin: meta.M039.leagueAvg / 90,
    redPerMin: meta.M040.leagueAvg / 90,
    penConvRate: meta.M020.leagueAvg / 100,
    gkSaveRate: meta.M096.leagueAvg / 100,
    penPerMatch: meta.M019.leagueAvg,
    traces: []
  };

  // 1. Dynamic Goals from Standings
  const standingsAvg = computeLeagueAvgGoals(data.standingsTotal);
  if (standingsAvg) {
    baseline.leagueAvgGoals = standingsAvg;
    baseline.traces.push(`leagueAvgGoals derived from standings: ${standingsAvg.toFixed(2)}`);
  }

  // 2. Dynamic Team-Context Averages (Average of Home+Away as a "Match Baseline")
  // This is better than a global average for specific teams (e.g., lower league vs top league)
  const homeStats = data.homeTeamSeasonStats?.statistics;
  const awayStats = data.awayTeamSeasonStats?.statistics;

  if (homeStats && awayStats) {
    const avgShots = ( (homeStats.shotsPerGame || 13) + (awayStats.shotsPerGame || 13) ) / 2;
    baseline.shotsPerMin = avgShots / 90;

    const avgSOT = ( (homeStats.shotsOnTargetPerGame || 4.5) + (awayStats.shotsOnTargetPerGame || 4.5) ) / 2;
    baseline.onTargetRate = avgSOT / avgShots;
    
    // GK Save Rate
    const avgGKSave = ( (homeStats.savesPerGame || 3) / (homeStats.concededPerGame + homeStats.savesPerGame || 4) + 
                        (awayStats.savesPerGame || 3) / (awayStats.concededPerGame + awayStats.savesPerGame || 4) ) / 2;
    if (isFinite(avgGKSave)) {
      baseline.gkSaveRate = avgGKSave;
      baseline.traces.push(`gkSaveRate derived from team stats: ${avgGKSave.toFixed(2)}`);
    }

    baseline.traces.push(`Base shot rates derived from match context (Home+Away Avg)`);
  }

  return baseline;
}

function computeLeagueAvgGoals(standingsTotal) {
  const rows = standingsTotal?.standings?.[0]?.rows || [];
  if (rows.length < 4) return null;
  const totalGoals = rows.reduce((s, r) => s + (r.scoresFor || r.goalsFor || 0), 0);
  const totalGames = rows.reduce((s, r) => s + (r.played || 0), 0);
  return totalGames > 0 ? (totalGoals / totalGames) : null;
}

module.exports = { getDynamicBaseline };
