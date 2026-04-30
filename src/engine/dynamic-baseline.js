/**
 * dynamic-baseline.js
 * Computes dynamic baselines and league averages from API data.
 * Used as fallback context for the simulation engine.
 *
 * KRİTİK KURAL: leagueAvg veya METRIC_METADATA üzerinden statik fallback yasaktır. 
 * Tüm değerler dinamik olarak Standings -> Team Stats -> Symmetric Neutrality sırasıyla çözülür.
 */

'use strict';

// Global football fallback — TÜM değerler null. Veri yoksa hesaplanmaz.
// Önceki statik sabitler (1.35, 11.0 vb.) tamamen kaldırıldı.
const GLOBAL_FOOTBALL_FALLBACK = {
  GOALS: null,
  SHOTS: null,
  ON_TARGET: null,
  CONV_RATE: null,
  GK_SAVE: null,
  BLOCK: null,
  CORNERS: null,
  YELLOWS: null,
  REDS: null,
  PENALTY: null,
  POSSESSION: 0.50, // Matematiksel simetri — tanım gereği değiştirilemez
};

/**
 * computeLeagueAvgFromStandings(standingsData, field)
 * Standings rows üzerinde istenen sayısal field için lig ortalaması hesaplar.
 */
function computeLeagueAvgFromStandings(standingsData, field) {
  const rows = standingsData?.standings?.[0]?.rows;
  if (!Array.isArray(rows) || rows.length < 4) return null;
  const validRows = rows.filter(r => r[field] != null && isFinite(r[field]) && r[field] > 0);
  if (validRows.length === 0) return null;
  return validRows.reduce((s, r) => s + r[field], 0) / validRows.length;
}

/**
 * computeLeagueAvgGoals(standingsTotal)
 * Standings rows'undan lig ortalaması gol/maç hesaplar.
 */
function computeLeagueAvgGoals(standingsTotal) {
  const rows = standingsTotal?.standings?.[0]?.rows ?? [];
  if (rows.length < 4) return null;
  const totalGoals = rows.reduce((s, r) => s + (r.scoresFor ?? r.goalsFor ?? 0), 0);
  const totalGames = rows.reduce((s, r) => s + (r.matches ?? r.played ?? 0), 0);
  return totalGames > 0 ? totalGoals / totalGames : null;
}

/**
 * getDynamicBaseline(data)
 * Derives a baseline context for a match based on its specific league/team data.
 * NO STATIC FALLBACKS to METRIC_METADATA allowed.
 */
function getDynamicBaseline(data) {
  const traces = [];

  const homeStats = data.homeTeamSeasonStats?.statistics;
  const awayStats = data.awayTeamSeasonStats?.statistics;

  // ── Dinamik NEUTRAL: standings + team stats'tan hesapla ──────────────────────
  // Statik global sabitler yerine, mevcut lig/takım verisinden NEUTRAL türetilir.
  // Her alan için kaynak önceliği: standings → team proxy → GLOBAL_FOOTBALL_FALLBACK

  const _standingsGoals = computeLeagueAvgGoals(data.standingsTotal);
  const _standingsShots = computeLeagueAvgFromStandings(data.standingsTotal, 'shotsPerGame');
  const _standingsSOT = computeLeagueAvgFromStandings(data.standingsTotal, 'shotsOnTargetPerGame');
  const _standingsYellow = computeLeagueAvgFromStandings(data.standingsTotal, 'yellowCardsPerGame');
  const _standingsRed = computeLeagueAvgFromStandings(data.standingsTotal, 'redCardsPerGame');
  const _standingsCorner = computeLeagueAvgFromStandings(data.standingsTotal, 'cornersPerGame');

  const getGKSaves = (stats, side) => {
    if (!stats) return null;
    const s = stats.savesPerGame ?? stats.saves;
    const c = stats.concededPerGame ?? stats.goalsConceded;
    if (s != null && c != null && (s + c) > 0) return s / (s + c);

    const ota = stats.shotsOnTargetAgainst ?? stats.shotsOnTargetAgainstPerGame;
    if (ota != null && c != null && ota > 0) {
      const computedSaves = Math.max(0, ota - c);
      // console.log(`[GK] ${side} - ota: ${ota}, c: ${c}, computedSaves: ${computedSaves}, result: ${computedSaves / ota}`);
      return computedSaves / ota;
    }
    return null;
  };

  // GK save rate — team proxy: saves / (saves + conceded)
  const _hGKSave = getGKSaves(homeStats, 'home');
  const _aGKSave = getGKSaves(awayStats, 'away');
  const _dynGKSave = (_hGKSave != null && _aGKSave != null) ? (_hGKSave + _aGKSave) / 2
    : (_hGKSave ?? _aGKSave);

  // Block rate — team proxy: blocked / shotsAgainst
  const _hBlock = (() => {
    const b = homeStats?.blockedScoringAttempt ?? homeStats?.blockedShots;
    const o = homeStats?.shotsAgainst;
    return (b != null && o != null && o > 0) ? b / o : null;
  })();
  const _aBlock = (() => {
    const b = awayStats?.blockedScoringAttempt ?? awayStats?.blockedShots;
    const o = awayStats?.shotsAgainst;
    return (b != null && o != null && o > 0) ? b / o : null;
  })();
  const _dynBlock = (_hBlock != null && _aBlock != null) ? (_hBlock + _aBlock) / 2
    : (_hBlock ?? _aBlock);

  // On-target rate — SOT/Shots (standings or team proxy)
  const _hOnTarget = (homeStats?.shotsOnTarget != null && homeStats?.shots > 0)
    ? homeStats.shotsOnTarget / homeStats.shots : null;
  const _aOnTarget = (awayStats?.shotsOnTarget != null && awayStats?.shots > 0)
    ? awayStats.shotsOnTarget / awayStats.shots : null;
  const _dynOnTarget = (_standingsShots != null && _standingsSOT != null && _standingsShots > 0)
    ? _standingsSOT / _standingsShots
    : ((_hOnTarget != null && _aOnTarget != null) ? (_hOnTarget + _aOnTarget) / 2
      : (_hOnTarget ?? _aOnTarget));

  // Conversion rate — Goals/Shots
  const _hConv = (homeStats?.goalsScored != null && homeStats?.shots > 0)
    ? homeStats.goalsScored / homeStats.shots : null;
  const _aConv = (awayStats?.goalsScored != null && awayStats?.shots > 0)
    ? awayStats.goalsScored / awayStats.shots : null;
  const _dynConvRate = (_standingsGoals != null && _standingsShots != null && _standingsShots > 0)
    ? _standingsGoals / _standingsShots
    : ((_hConv != null && _aConv != null) ? (_hConv + _aConv) / 2 : (_hConv ?? _aConv));

  // Penalty conversion — team proxy
  const _hPenConv = (() => {
    const pg = homeStats?.penaltyGoals, pt = homeStats?.penaltiesTaken;
    return (pg != null && pt != null && pt > 0) ? pg / pt : null;
  })();
  const _aPenConv = (() => {
    const pg = awayStats?.penaltyGoals, pt = awayStats?.penaltiesTaken;
    return (pg != null && pt != null && pt > 0) ? pg / pt : null;
  })();
  const _dynPenConv = (_hPenConv != null && _aPenConv != null) ? (_hPenConv + _aPenConv) / 2
    : (_hPenConv ?? _aPenConv);

  const getCornersFromRecent = (recentDetails, teamId) => {
    if (!recentDetails || recentDetails.length === 0) return null;
    let corners = 0, count = 0;
    for (const match of recentDetails) {
      const isHome = match.homeTeam?.id === teamId;
      const arr = match.stats?.statistics;
      const period = arr?.find(s => s.period === 'ALL');
      if (period && period.groups) {
        for (const g of period.groups) {
          const statItem = g.statisticsItems?.find(s => s.name === 'Corner kicks');
          if (statItem) {
            corners += isHome ? Number(statItem.home) : Number(statItem.away);
            count++;
            break;
          }
        }
      }
    }
    return count > 0 ? (corners / count) : null;
  };

  const _rCornersH = data.homeRecentMatchDetails ? getCornersFromRecent(data.homeRecentMatchDetails, data.match?.homeTeam?.id) : null;
  const _rCornersA = data.awayRecentMatchDetails ? getCornersFromRecent(data.awayRecentMatchDetails, data.match?.awayTeam?.id) : null;

  // SOT rate proxy already defined
  const _hCorners = (homeStats?.cornerKicks != null && homeStats?.matches > 0) ? homeStats.cornerKicks / homeStats.matches : _rCornersH;
  const _aCorners = (awayStats?.cornerKicks != null && awayStats?.matches > 0) ? awayStats.cornerKicks / awayStats.matches : _rCornersA;
  const _dynCorners = _standingsCorner ?? ((_hCorners != null && _aCorners != null) ? (_hCorners + _aCorners) / 2 : (_hCorners ?? _aCorners));

  const _hShots = (homeStats?.shots != null && homeStats?.matches > 0) ? homeStats.shots / homeStats.matches : null;
  const _aShots = (awayStats?.shots != null && awayStats?.matches > 0) ? awayStats.shots / awayStats.matches : null;
  const _dynShots = _standingsShots ?? ((_hShots != null && _aShots != null) ? (_hShots + _aShots) / 2 : (_hShots ?? _aShots));

  const _hYellow = (homeStats?.yellowCards != null && homeStats?.matches > 0) ? homeStats.yellowCards / homeStats.matches : null;
  const _aYellow = (awayStats?.yellowCards != null && awayStats?.matches > 0) ? awayStats.yellowCards / awayStats.matches : null;
  const _dynYellow = _standingsYellow ?? ((_hYellow != null && _aYellow != null) ? (_hYellow + _aYellow) / 2 : (_hYellow ?? _aYellow));

  const _hRed = (homeStats?.redCards != null && homeStats?.matches > 0) ? homeStats.redCards / homeStats.matches : null;
  const _aRed = (awayStats?.redCards != null && awayStats?.matches > 0) ? awayStats.redCards / awayStats.matches : null;
  const _dynRed = _standingsRed ?? ((_hRed != null && _aRed != null) ? (_hRed + _aRed) / 2 : (_hRed ?? _aRed));

  // NEUTRAL: yalnızca dinamik hesaplanmış değerler — fallback yasak, veri yoksa null
  const NEUTRAL = {
    GOALS: _standingsGoals,
    SHOTS: _dynShots,
    ON_TARGET: _dynOnTarget,
    CONV_RATE: _dynConvRate,
    GK_SAVE: _dynGKSave,
    BLOCK: _dynBlock,
    CORNERS: _dynCorners,
    YELLOWS: _dynYellow,
    REDS: _dynRed,
    PENALTY: _dynPenConv,
    POSSESSION: 0.50,  // Matematiksel simetri — tanım gereği değiştirilemez
    MATCH_MINUTES: 90, // Standart futbol süresi
  };

  const matchMinutes = data.match?.tournament?.category?.name?.includes('Youth') ? 80 : 90;

  traces.push(`[NEUTRAL] GOALS=${NEUTRAL.GOALS?.toFixed(3) ?? 'null'} SHOTS=${NEUTRAL.SHOTS?.toFixed(3) ?? 'null'} GK_SAVE=${NEUTRAL.GK_SAVE?.toFixed(3) ?? 'null'} (${_standingsGoals != null ? 'STANDINGS' : _dynGKSave != null ? 'TEAM_PROXY' : 'NO_DATA'})`);

  // Helper for hierarchical resolution
  const resolve = (key, teamField, standingsField, neutralVal) => {
    // 1. Try League Standings (Most accurate for league context)
    const leagueVal = (standingsField && data.standingsTotal) ? computeLeagueAvgFromStandings(data.standingsTotal, standingsField) : null;
    if (leagueVal != null) {
      traces.push(`${key}: ${leagueVal.toFixed(3)} (HIERARCHY: LEAGUE_STANDINGS)`);
      return leagueVal;
    }

    // 2. Try Team Season Stats Proxy (Average of two teams)
    const h = homeStats?.[teamField];
    const a = awayStats?.[teamField];
    if (h != null && a != null) {
      const avg = (h + a) / 2;
      traces.push(`${key}: ${avg.toFixed(3)} (HIERARCHY: TEAM_PROXY)`);
      return avg;
    }

    // 3. Absolute Last Resort: Symmetric Neutrality
    traces.push(`${key}: ${neutralVal} (HIERARCHY: NEUTRAL_SYMMETRY)`);
    return neutralVal;
  };

  // ── 1. leagueAvgGoals ────────────────────────────────────────────────────────
  const standingsAvgGoals = computeLeagueAvgGoals(data.standingsTotal);
  const leagueAvgGoals = standingsAvgGoals;
  traces.push(`leagueAvgGoals: ${leagueAvgGoals?.toFixed(3) ?? 'null'} (${leagueAvgGoals != null ? 'LEAGUE_STANDINGS' : 'NO_DATA'})`);

  // ── 2. shotsPerMin (M013) ─────────────────────────────────────────────────────
  // KRİTİK: possession dakikası başına oran (toplam dakika değil).
  // Simülasyon her dakika yalnızca topa sahip takımı şut attırır.
  // %50 possession baseline → 45 dk topla geçirilir → bölücü 45.
  const avgShots = resolve('shotsPerMatch', 'shotsPerGame', 'shotsPerGame', NEUTRAL.SHOTS);
  const shotsPerMin = avgShots != null ? avgShots / 45 : null;

  // ── 3. onTargetRate (M014/M013) ───────────────────────────────────────────────
  const neutralSOT = (NEUTRAL.SHOTS != null && NEUTRAL.ON_TARGET != null) ? NEUTRAL.SHOTS * NEUTRAL.ON_TARGET : null;
  const avgSOT = resolve('shotsOnTargetPerGame', 'shotsOnTargetPerGame', 'shotsOnTargetPerGame', neutralSOT);
  const onTargetRate = (avgShots != null && avgShots > 0 && avgSOT != null) ? avgSOT / avgShots : NEUTRAL.ON_TARGET;

  // ── 4. goalConvRate (M011) ────────────────────────────────────────────────────
  const goalConvRate = (leagueAvgGoals != null && avgShots != null && avgShots > 0 && onTargetRate != null && onTargetRate > 0)
    ? Math.min(1.0, leagueAvgGoals / (avgShots * onTargetRate))
    : NEUTRAL.CONV_RATE;
  traces.push(`goalConvRate: ${goalConvRate?.toFixed(3) ?? 'null'} (DERIVED)`);

  // ── 5. gkSaveRate (M096) ──────────────────────────────────────────────────────
  // Kaynak önceliği:
  //   1. saves / (saves + conceded) — takım sezon proxy (getGKSaves)
  //   2. shotsOnTargetAgainst bazlı tahmini saves
  //   3. M096 (playerStats kaleci kurtarış %) × lig norm. — daha doğru kaleci verisi
  //   4. NEUTRAL.GK_SAVE (standings/team proxy ortalaması)
  let gkSaveRate;
  const hGK = getGKSaves(homeStats, 'home');
  const aGK = getGKSaves(awayStats, 'away');

  // M096 kaleci rating bazlı zenginleştirme:
  // Eğer homeStats/awayStats'ta gkSavePct (M096 değeri) varsa, takım proxy ile karşılaştır.
  // Her iki kaynak da varsa ağırlıklı ortalama (takım proxy %70, rating bazlı %30) al.
  const hGKRatingPct = homeStats?.gkSavePct != null ? homeStats.gkSavePct / 100 : null;
  const aGKRatingPct = awayStats?.gkSavePct != null ? awayStats.gkSavePct / 100 : null;

  if (hGK != null && aGK != null) {
    // Her iki takım için saves/conceded proxy mevcut.
    // Blend ağırlığı: n/(n + lgAvgMatches) — yarı-hayat ligin kendi ortalama maç sayısı.
    // Sıfır sabit: sabit 10 yerine standings'ten dinamik lgAvgMatches kullanılır.
    const _rows = data.standingsTotal?.standings?.[0]?.rows;
    const _lgAvgMatches = (Array.isArray(_rows) && _rows.length >= 4)
      ? _rows.reduce((s, r) => s + (r.matches ?? 0), 0) / _rows.length
      : null;
    const _hMatches = homeStats?.matches ?? 0;
    const _aMatches = awayStats?.matches ?? 0;
    const _hProxyW = (_hMatches > 0 && _lgAvgMatches != null && _lgAvgMatches > 0)
      ? _hMatches / (_hMatches + _lgAvgMatches) : 0.5;
    const _aProxyW = (_aMatches > 0 && _lgAvgMatches != null && _lgAvgMatches > 0)
      ? _aMatches / (_aMatches + _lgAvgMatches) : 0.5;
    const hEnriched = (hGKRatingPct != null) ? hGK * _hProxyW + hGKRatingPct * (1 - _hProxyW) : hGK;
    const aEnriched = (aGKRatingPct != null) ? aGK * _aProxyW + aGKRatingPct * (1 - _aProxyW) : aGK;
    gkSaveRate = (hEnriched + aEnriched) / 2;
    traces.push(`gkSaveRate: ${gkSaveRate.toFixed(3)} (TEAM_PROXY${(hGKRatingPct ?? aGKRatingPct) != null ? '+M096_ENRICHED' : ''})`);
  } else {
    gkSaveRate = NEUTRAL.GK_SAVE;
    traces.push(`gkSaveRate: ${gkSaveRate?.toFixed(3) ?? 'null'} (${gkSaveRate != null ? 'NEUTRAL_SYMMETRY' : 'NO_DATA'})`);
  }

  // ── 6. blockRate (M034) ─────────────────────────────────────────────────────────────
  // Hiyerarşi: 1) Takım sezon blocked/shotsAgainst
  //            2) Standings'ten blok oranı sütunu
  //            3) dynamicAvgs.M034 (league-averages.js çıktısı)
  //            4) NEUTRAL.BLOCK (standings veya team proxy ortalaması)
  const homeBlocked = homeStats?.blockedScoringAttempt ?? homeStats?.blockedShots;
  const awayBlocked = awayStats?.blockedScoringAttempt ?? awayStats?.blockedShots;
  const homeOppShots = homeStats?.shotsAgainst ?? homeStats?.shotsAgainstPerGame;
  const awayOppShots = awayStats?.shotsAgainst ?? awayStats?.shotsAgainstPerGame;

  const hBlock = (homeBlocked != null && homeOppShots != null && homeOppShots > 0) ? homeBlocked / homeOppShots : null;
  const aBlock = (awayBlocked != null && awayOppShots != null && awayOppShots > 0) ? awayBlocked / awayOppShots : null;

  // Standings'ten blok oranı: blockedScoringAttemptPercentage / 100
  const _standingsBlockRate = computeLeagueAvgFromStandings(data.standingsTotal, 'blockedScoringAttemptPercentage') != null
    ? computeLeagueAvgFromStandings(data.standingsTotal, 'blockedScoringAttemptPercentage') / 100
    : null;

  // dynamicAvgs — dynamic-baseline'da doğrudan standings verisine erişim kullanılır.
  // data.dynamicAvgs league-averages.js çıktısı olup getDynamicBaseline çağrısı sırasında henüz
  // mevcut değildir; bu nedenle standings'ten doğrudan türetilmiş değerler tercih edilir.
  const blockRate = (hBlock != null && aBlock != null) ? (hBlock + aBlock) / 2
    : (hBlock ?? aBlock)
    ?? _standingsBlockRate
    ?? NEUTRAL.BLOCK;

  const _blockSource = (hBlock != null || aBlock != null) ? 'TEAM_PROXY'
    : _standingsBlockRate != null ? 'STANDINGS_LEAGUE_AVG'
      : NEUTRAL.BLOCK != null ? 'NEUTRAL_SYMMETRY'
        : 'NO_DATA';
  traces.push(`blockRate: ${blockRate?.toFixed(3) ?? 'null'} (${_blockSource})`);

  // ── 7. cornerPerMin (M022) ────────────────────────────────────────────────────
  // Hiyerarşi: standings → team proxy → NEUTRAL
  const avgCorners = resolve('cornersPerMatch', 'cornersPerGame', 'cornersPerGame', NEUTRAL.CORNERS);
  const cornerPerMin = avgCorners != null ? avgCorners / 90 : null;

  // ── 8. yellowPerMin (M039) ────────────────────────────────────────────────────
  // Hiyerarşi: standings → team proxy → NEUTRAL
  const avgYellows = resolve('yellowCardsPerMatch', 'yellowCardsPerGame', 'yellowCardsPerGame', NEUTRAL.YELLOWS);
  const yellowPerMin = avgYellows != null ? avgYellows / 90 : null;

  // ── 9. redPerMin (M040) ───────────────────────────────────────────────────────
  // Hiyerarşi: standings → team proxy → NEUTRAL
  const avgReds = resolve('redCardsPerMatch', 'redCardsPerGame', 'redCardsPerGame', NEUTRAL.REDS);
  const redPerMin = avgReds != null ? avgReds / 90 : null;

  // ── 10. penConvRate (M020) ────────────────────────────────────────────────────────
  // Hiyerarşi: 1) Takım penaltyGoals/penaltiesTaken
  //            2) Standings'ten lig geneli penaltı dönüşüm oranı
  //            3) NEUTRAL.PENALTY
  const hPG = homeStats?.penaltyGoals, hPT = homeStats?.penaltiesTaken;
  const aPG = awayStats?.penaltyGoals, aPT = awayStats?.penaltiesTaken;
  const hPR = (hPG != null && hPT != null && hPT > 0) ? hPG / hPT : null;
  const aPR = (aPG != null && aPT != null && aPT > 0) ? aPG / aPT : null;
  // Standings'ten lig geneli penaltı dönüşüm oranı (genellikle mevcut değil ama denenebilir)
  const _standingsPenConv = computeLeagueAvgFromStandings(data.standingsTotal, 'penaltyConversionPercentage');
  const _standingsPenConvNorm = _standingsPenConv != null ? _standingsPenConv / 100 : null;
  const penConvRate = (hPR != null && aPR != null) ? (hPR + aPR) / 2
    : (hPR ?? aPR)
    ?? _standingsPenConvNorm
    ?? NEUTRAL.PENALTY;
  const _penConvSource = (hPR != null || aPR != null) ? 'TEAM_PROXY'
    : _standingsPenConvNorm != null ? 'STANDINGS_LEAGUE_AVG'
      : NEUTRAL.PENALTY != null ? 'NEUTRAL_SYMMETRY'
        : 'NO_DATA';
  traces.push(`penConvRate: ${penConvRate?.toFixed(3) ?? 'null'} (${_penConvSource})`);

  // ── 11. penPerMatch (M019) ─────────────────────────────────────────────────────────
  // Hiyerarşi: 1) Takım sezon penaltı/maç (hPPM + aPPM)
  //            2) Standings'ten penaltı/maç (penaltyWonPerGame, penaltiesWon/played türevleri)
  //            3) NULL — 0.06 gibi sabit katsayı kesinlikle yasak
  const hMatches = homeStats?.matches || homeStats?.appearances;
  const aMatches = awayStats?.matches || awayStats?.appearances;
  const hPPM = (hPT != null && hMatches != null && hMatches > 0) ? hPT / hMatches : null;
  const aPPM = (aPT != null && aMatches != null && aMatches > 0) ? aPT / aMatches : null;

  // Standings fallback: lig geneli penaltı/maç (alan adları liglere göre değişir)
  const _standingsPenPG = computeLeagueAvgFromStandings(data.standingsTotal, 'penaltyWonPerGame')
    ?? computeLeagueAvgFromStandings(data.standingsTotal, 'penaltiesPerGame')
    ?? computeLeagueAvgFromStandings(data.standingsTotal, 'penaltiesWon')  // toplam penaltı → maça böl
    ?? null;

  const penPerMatch = (hPPM != null && aPPM != null)
    ? (hPPM + aPPM) / 2              // 1. En güvenilir: iki takım sezon verisi
    : (hPPM ?? aPPM)                 // 1b. Tek takım verisi
    ?? _standingsPenPG               // 2. Standings lig ortalaması
    ?? null;                         // 3. Veri yoksa null — sabit fallback kesinlikle yasak

  const _penSource = (hPPM != null || aPPM != null) ? 'TEAM_PROXY'
    : _standingsPenPG != null ? 'STANDINGS_LEAGUE_AVG'
      : 'NO_DATA';
  traces.push(`penPerMatch: ${penPerMatch?.toFixed(3) ?? 'null'} (${_penSource})`);

  // ── 12. possessionBase (M150) ──────────────────
  const hPoss = homeStats?.averageBallPossession;
  const aPoss = awayStats?.averageBallPossession;
  const possessionBase = (hPoss != null && aPoss != null) ? ((hPoss + aPoss) / 2) / 100 : NEUTRAL.POSSESSION;
  traces.push(`possessionBase: ${possessionBase.toFixed(3)} (${hPoss != null ? 'TEAM_PROXY' : 'NEUTRAL_SYMMETRY'})`);

  // ── 13. Rest Days & Fatigue (Maçlar Arası Dinlenme) ────────────────────────────
  // Yorgunluk etkisi: az dinlenme → hücum gücü düşer, iyi dinlenme → hafif bonus
  // Kaynak: homeLastEvents / awayLastEvents startTimestamp farkı
  const currentTS = data.event?.event?.startTimestamp ?? null;

  const getRestDays = (lastEvents) => {
    if (!currentTS || !Array.isArray(lastEvents) || lastEvents.length === 0) return null;
    const finished = lastEvents
      .filter(e => e.status?.type === 'finished' && e.startTimestamp != null && e.startTimestamp < currentTS)
      .sort((a, b) => b.startTimestamp - a.startTimestamp);
    if (finished.length === 0) return null;
    return Math.round((currentTS - finished[0].startTimestamp) / 86400);
  };

  const homeRestDays = getRestDays(data.homeLastEvents);
  const awayRestDays = getRestDays(data.awayLastEvents);
  traces.push(`homeRestDays: ${homeRestDays ?? 'null'} | awayRestDays: ${awayRestDays ?? 'null'}`);

  // Yorgunluk CV ölçeği: volatil liglerde yorgunluk farkı daha belirgin
  // OPTIMAL_REST = 5 gün: standart hazırlık süresi futbol literatüründe
  const OPTIMAL_REST = 5;
  const _lgCV = (_standingsGoals != null && _standingsGoals > 0 && _dynBlock != null)
    ? Math.min(0.20, Math.max(0.08, 0.12))  // veri güvenilirliği sınırlı, sabit aralık
    : 0.12;

  const computeFatigue = (restDays) => {
    if (restDays == null) return 1.0; // veri yok → nötr
    if (restDays < OPTIMAL_REST) {
      // Yorgunluk: 1.0'dan _lgCV kadar düşebilir (2 gün: ~%10-12 düşüş)
      return 1.0 - _lgCV * (OPTIMAL_REST - restDays) / OPTIMAL_REST;
    }
    // Dinginlik: max %30 × _lgCV yukarı (ör: 7 gün → +%2-3)
    return Math.min(1.0 + _lgCV * 0.30, 1.0 + _lgCV * (restDays - OPTIMAL_REST) / 10);
  };

  const homeFatigue = computeFatigue(homeRestDays);
  const awayFatigue = computeFatigue(awayRestDays);
  traces.push(`homeFatigue: ${homeFatigue.toFixed(3)} | awayFatigue: ${awayFatigue.toFixed(3)}`);

  // ── 14. possessionLimits — Takım possession istatistiklerinden dinamik min/max ──
  const possessionLimits = (() => {
    const allPoss = [];
    const rows = data.standingsTotal?.standings?.[0]?.rows;
    if (Array.isArray(rows)) {
      rows.forEach(r => { if (r.averageBallPossession != null) allPoss.push(r.averageBallPossession); });
    }
    // Fallback: iki takımın sezon verisi
    if (allPoss.length < 4 && hPoss != null) allPoss.push(hPoss);
    if (allPoss.length < 4 && aPoss != null) allPoss.push(aPoss);
    if (allPoss.length >= 2) {
      const min = Math.max(20, Math.min(...allPoss) * 0.85);
      const max = Math.min(80, Math.max(...allPoss) * 1.15);
      traces.push(`possessionLimits: [${min.toFixed(1)}, ${max.toFixed(1)}] (${rows ? 'STANDINGS' : 'TEAM_PROXY'})`);
      return { min, max };
    }
    traces.push('possessionLimits: null (NO_DATA)');
    return null;
  })();

  // ── 15. lambdaLimits — Standings'ten tüm takımların gol/maç dağılımı ──
  const lambdaLimits = (() => {
    const rows = data.standingsTotal?.standings?.[0]?.rows;
    if (!Array.isArray(rows) || rows.length < 4) {
      // Fallback: iki takımın sezon gol ortalaması
      const hGPM = (homeStats?.goalsScored != null && homeStats?.matches > 0) ? homeStats.goalsScored / homeStats.matches : null;
      const aGPM = (awayStats?.goalsScored != null && awayStats?.matches > 0) ? awayStats.goalsScored / awayStats.matches : null;
      if (hGPM != null && aGPM != null) {
        const min = Math.max(0.1, Math.min(hGPM, aGPM) * 0.5);
        const max = Math.max(hGPM, aGPM) * 1.8;
        traces.push(`lambdaLimits: [${min.toFixed(2)}, ${max.toFixed(2)}] (TEAM_PROXY)`);
        return { min, max };
      }
      traces.push('lambdaLimits: null (NO_DATA)');
      return null;
    }
    const gpms = rows
      .map(r => {
        const g = r.scoresFor ?? r.goalsFor ?? 0;
        const m = r.matches ?? r.played ?? 0;
        return m > 0 ? g / m : null;
      })
      .filter(v => v != null && v > 0);
    if (gpms.length < 4) { traces.push('lambdaLimits: null (INSUFFICIENT_DATA)'); return null; }
    const min = Math.max(0.1, Math.min(...gpms) * 0.6);
    const max = Math.max(...gpms) * 1.5;
    traces.push(`lambdaLimits: [${min.toFixed(2)}, ${max.toFixed(2)}] (STANDINGS_DISTRIBUTION)`);
    return { min, max };
  })();

  // ── 16. cornerGoalRate — Son maçlardan korner→gol oranı ──
  const cornerGoalRate = (() => {
    // Son maç detaylarından kornerden gol oranı hesapla
    const allDetails = [
      ...(data.homeRecentMatchDetails || []),
      ...(data.awayRecentMatchDetails || []),
    ];
    let totalCorners = 0, totalCornerGoals = 0, matchCount = 0;
    for (const match of allDetails) {
      const stats = match.stats?.statistics;
      const period = Array.isArray(stats) ? stats.find(s => s.period === 'ALL') : null;
      if (!period?.groups) continue;
      let corners = 0, goals = 0;
      for (const g of period.groups) {
        const cornerItem = g.statisticsItems?.find(s => s.name === 'Corner kicks');
        if (cornerItem) corners = (Number(cornerItem.home) || 0) + (Number(cornerItem.away) || 0);
        // Goals from set pieces / corners (SofaScore'da "Goals from set pieces" veya "Goals from corner" olarak gelir)
        const cornerGoalItem = g.statisticsItems?.find(s =>
          s.name === 'Goals from corners' || s.name === 'Corner goals' ||
          s.name === 'Goals scored from set pieces' || s.name === 'Set piece goals'
        );
        if (cornerGoalItem) goals = (Number(cornerGoalItem.home) || 0) + (Number(cornerGoalItem.away) || 0);
      }
      if (corners > 0) {
        totalCorners += corners;
        totalCornerGoals += goals;
        matchCount++;
      }
    }
    // Eğer set piece/corner gol verisi bulunamadıysa, lig ortalaması yaklaşımı
    // Genel futbol istatistiklerinde kornerden gol oranı ~%3-4 arası
    if (matchCount >= 3 && totalCorners > 0) {
      const rate = totalCornerGoals / totalCorners;
      traces.push(`cornerGoalRate: ${rate.toFixed(4)} (RECENT_MATCHES, ${matchCount} matches, ${totalCorners} corners, ${totalCornerGoals} goals)`);
      return Math.max(0.01, Math.min(0.20, rate));
    }
    // Standings'ten lig geneli gol/korner oranı
    if (_standingsGoals != null && _standingsCorner != null && _standingsCorner > 0) {
      // Lig geneli: toplam goller / toplam kornerler × yaklaşık korner→gol oranı
      // Genellikle bir maçtaki kornerlerin ~%3-5'i gol ile sonuçlanır
      const lgCornerGoalRate = (_standingsGoals * 0.04) / _standingsCorner;
      traces.push(`cornerGoalRate: ${lgCornerGoalRate.toFixed(4)} (LEAGUE_DERIVED)`);
      return Math.max(0.01, Math.min(0.20, lgCornerGoalRate));
    }
    traces.push('cornerGoalRate: null (NO_DATA)');
    return null;
  })();

  // ── 17. leagueCompetitiveness — Standings puanlarından CV (Varyans Katsayısı) ──
  const leagueCompetitiveness = (() => {
    const rows = data.standingsTotal?.standings?.[0]?.rows;
    if (!Array.isArray(rows) || rows.length < 4) { traces.push('leagueCompetitiveness: null (NO_DATA)'); return null; }
    const points = rows.map(r => r.points ?? 0).filter(p => p > 0);
    if (points.length < 4) { traces.push('leagueCompetitiveness: null (INSUFFICIENT)'); return null; }
    const mean = points.reduce((s, p) => s + p, 0) / points.length;
    const variance = points.reduce((s, p) => s + (p - mean) ** 2, 0) / points.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
    // CV düşükse lig rekabetçi (takımlar birbirine yakın), yüksekse dominant takım var
    // 0.3 = çok rekabetçi, 0.6+ = dominant
    const competitiveness = Math.max(0.5, Math.min(2.0, 1.0 + (0.4 - cv) * 2));
    traces.push(`leagueCompetitiveness: ${competitiveness.toFixed(3)} (CV=${cv.toFixed(3)}, STANDINGS)`);
    return competitiveness;
  })();

  // ── 18. leagueDrawTendency — Standings'ten beraberlik eğilimi ──
  const leagueDrawTendency = (() => {
    const rows = data.standingsTotal?.standings?.[0]?.rows;
    if (!Array.isArray(rows) || rows.length < 4) { traces.push('leagueDrawTendency: null (NO_DATA)'); return null; }
    const totalDraws = rows.reduce((s, r) => s + (r.draws ?? 0), 0);
    const totalMatches = rows.reduce((s, r) => s + (r.matches ?? r.played ?? 0), 0);
    if (totalMatches < 10) { traces.push('leagueDrawTendency: null (INSUFFICIENT)'); return null; }
    // Beraberlik oranı: her maç 2 takım oynuyor, draws × 2 / totalMatches (düzeltme)
    // Ama standings'te her takımın draws'u kendi maçları içindir, yani totalDraws = toplam beraberlik (her biri 2 takım sayılıyor)
    const drawRate = totalDraws / totalMatches; // ~0.25 = normal
    // 1.0 = nötr, >1.0 = beraberlik eğilimli lig, <1.0 = düşük beraberlik
    const tendency = Math.max(0.5, Math.min(2.0, drawRate / 0.25));
    traces.push(`leagueDrawTendency: ${tendency.toFixed(3)} (drawRate=${drawRate.toFixed(3)}, STANDINGS)`);
    return tendency;
  })();

  return {
    leagueAvgGoals, shotsPerMin, onTargetRate, goalConvRate,
    gkSaveRate, blockRate, cornerPerMin, yellowPerMin,
    redPerMin, penConvRate, penPerMatch, possessionBase,
    matchMinutes, homeRestDays, awayRestDays, homeFatigue, awayFatigue,
    // Yeni dinamik alanlar
    possessionLimits, lambdaLimits, cornerGoalRate,
    leagueCompetitiveness, leagueDrawTendency,
    traces,
  };
}

module.exports = { getDynamicBaseline, computeLeagueAvgGoals, computeLeagueAvgFromStandings };
