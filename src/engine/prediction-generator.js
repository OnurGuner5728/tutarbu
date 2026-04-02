/**
 * Prediction Generator
 * Tüm metrikleri kullanarak nihai tahmin çıktısını oluşturur.
 * Poisson dağılımı + bileşik skorlar + ek özel tahminler.
 */

/**
 * @param {object} metricsResult - calculateAllMetrics() çıktısı
 * @param {object} data - fetchAllMatchData() çıktısı
 * @returns {object} Detaylı tahmin raporu
 */
function generatePrediction(metricsResult, data) {
  const { home, away, shared, prediction } = metricsResult;
  const event = data.event?.event;

  // ── Detaylı tahmin raporu ──
  const report = {
    match: {
      homeTeam: event?.homeTeam?.name || 'Home',
      awayTeam: event?.awayTeam?.name || 'Away',
      homeTeamId: data.homeTeamId,
      awayTeamId: data.awayTeamId,
      tournament: event?.tournament?.name || '',
      round: event?.roundInfo?.round || '',
      stadium: event?.venue?.stadium?.name || '',
      referee: event?.referee?.name || '',
      startTime: event?.startTimestamp
        ? new Date(event.startTimestamp * 1000).toISOString() : '',
      isLive: event?.status?.type === 'inprogress' || (event?.status?.code >= 6 && event?.status?.code <= 40),
    },

    // Ana tahmin
    result: {
      homeWin: prediction.homeWinProbability,
      draw: prediction.drawProbability,
      awayWin: prediction.awayWinProbability,
      mostLikelyResult: getMostLikelyResult(prediction),
      confidence: calculateConfidence(prediction, shared, home, away),
    },

    // Skor tahmini
    score: {
      predicted: prediction.mostLikelyScore,
      probability: prediction.mostLikelyScoreProbability,
      top5: prediction.top5Scores,
      lambdaHome: prediction.lambdaHome,
      lambdaAway: prediction.lambdaAway,
    },

    // Gol piyasaları
    goals: {
      over15: prediction.over15,
      over25: prediction.over25,
      over35: prediction.over35,
      under15: round2(100 - prediction.over15),
      under25: round2(100 - prediction.over25),
      under35: round2(100 - prediction.over35),
      btts: prediction.btts,
      bttsNo: round2(100 - prediction.btts),
    },

    // İlk yarı tahmini
    firstHalf: generateFirstHalfPrediction(home, away),

    // Korner tahmini
    corners: generateCornerPrediction(home, away, shared),

    // Kart tahmini
    cards: generateCardPrediction(home, away, shared),

    // İlk gol tahmini — normalize so home+away sum to 100
    firstGoal: (() => {
      const rawHome = (home.form.M062 || 50) * 0.6 + (prediction.homeWinProbability) * 0.4;
      const rawAway = (away.form.M062 || 50) * 0.6 + (prediction.awayWinProbability) * 0.4;
      const total = rawHome + rawAway || 100;
      return {
        homeScoresFirst: round2((rawHome / total) * 100),
        awayScoresFirst: round2((rawAway / total) * 100),
      };
    })(),

    // Takım güç karşılaştırması
    comparison: {
      home: {
        attackPower: round2(home.compositeScores.M156),
        defensePower: round2(home.compositeScores.M157),
        form: round2(home.compositeScores.M158),
        playerQuality: round2(home.compositeScores.M159),
        goalkeeperPower: round2(home.compositeScores.M160),
        momentum: round2(home.compositeScores.M164),
        overallPower: round2(home.compositeScores.M166),
      },
      away: {
        attackPower: round2(away.compositeScores.M156),
        defensePower: round2(away.compositeScores.M157),
        form: round2(away.compositeScores.M158),
        playerQuality: round2(away.compositeScores.M159),
        goalkeeperPower: round2(away.compositeScores.M160),
        momentum: round2(away.compositeScores.M164),
        overallPower: round2(away.compositeScores.M166),
      },
      shared: {
        refereeImpact: round2(shared.sharedComposite.M161),
        h2hAdvantage: round2(shared.sharedComposite.M162),
        contextualAdvantage: round2(shared.sharedComposite.M163),
      },
    },

    // UI-Specific: Detaylı Analiz & Zaman Çizelgesi
    analysis: {
      goalPeriods: {
        home: calculateGoalPeriods(home),
        away: calculateGoalPeriods(away),
      },
      hotZones: calculateHotZones(home, away),
      probabilities: {
        penaltyChance: calculatePenaltyChance(home, away, shared),
        redCardChance: calculateRedCardChance(home, away, shared),
        surpriseIndex: calculateSurpriseIndex(prediction, shared.contextual),
      },
    },

    // Öne çıkan istatistikler
    highlights: generateHighlights(home, away, shared, prediction),

    // Lineup Workshop Data
    lineups: {
      home: Object.assign({}, metricsResult.home.lineup || data.lineups?.home, {
        players: injectReserves((metricsResult.home.lineup || data.lineups?.home)?.players, data.homePlayers)
      }),
      away: Object.assign({}, metricsResult.away.lineup || data.lineups?.away, {
        players: injectReserves((metricsResult.away.lineup || data.lineups?.away)?.players, data.awayPlayers)
      }),
      isFallback: data.lineups?.isFallback || false,
    },

    // Form & H2H History
    h2hMatches: (() => {
      // 1. Dedicated H2H events endpoint (event-level)
      let _evs = data.h2hEvents?.events || [];
      // 2. Team-level H2H history (/team/:id/head2head/:id) — various possible keys
      if (_evs.length === 0) {
        _evs = data.teamH2H?.events ||
               data.teamH2H?.previousEvents ||
               data.teamH2H?.teamDuel?.events ||
               [];
      }
      // 3. Event-level h2h object (may nest events under various keys)
      if (_evs.length === 0) {
        _evs = data.h2h?.events ||
               data.h2h?.previousEvents ||
               data.h2h?.lastH2H ||
               [];
      }
      // 4. Last-resort: scan both teams' recent matches for mutual games
      if (_evs.length === 0) {
        const hid = data.homeTeamId;
        const aid = data.awayTeamId;
        const seen = new Set();
        _evs = [...(data.homeLastEvents || []), ...(data.awayLastEvents || [])].filter(ev => {
          if (!ev || seen.has(ev.id)) return false;
          seen.add(ev.id);
          return (ev.homeTeam?.id === hid || ev.awayTeam?.id === hid) &&
                 (ev.homeTeam?.id === aid || ev.awayTeam?.id === aid);
        });
      }
      return _evs
        .filter(e => e.status?.type === 'finished' || e.homeScore?.current != null)
        .sort((a, b) => (b.startTimestamp || 0) - (a.startTimestamp || 0))
        .map(e => ({
          ...e,
          startTimestamp: e.startTimestamp ? new Date(e.startTimestamp * 1000).toISOString() : '',
        }));
    })(),
    h2hSummary: (() => {
      // 1. Önce SofaScore teamDuel / teamDuels alanını dene (singular ve plural her ikisi)
      const teamDuel = data.h2h?.teamDuel || data.h2h?.teamDuels ||
                       data.h2hEvents?.teamDuel || data.h2hEvents?.teamDuels ||
                       data.h2h?.h2h || null;
      if (teamDuel && (teamDuel.homeWins != null || teamDuel.team1Wins != null)) {
        return {
          team1Wins: teamDuel.homeWins ?? teamDuel.team1Wins ?? 0,
          draws: teamDuel.draws ?? 0,
          team2Wins: teamDuel.awayWins ?? teamDuel.team2Wins ?? 0,
        };
      }

      // 2. Fallback: H2H maç listesini manuel say
      const h2hGames = data.h2hEvents?.events || data.h2h?.events || [];
      if (h2hGames.length === 0) return null;

      const homeTeamId = data.event?.event?.homeTeam?.id;
      let team1Wins = 0, draws = 0, team2Wins = 0;
      for (const game of h2hGames) {
        const homeScore = game.homeScore?.current ?? game.homeScore?.display ?? 0;
        const awayScore = game.awayScore?.current ?? game.awayScore?.display ?? 0;
        const gameHomeTeamId = game.homeTeam?.id;
        if (homeScore === awayScore) {
          draws++;
        } else if (
          (gameHomeTeamId === homeTeamId && homeScore > awayScore) ||
          (gameHomeTeamId !== homeTeamId && awayScore > homeScore)
        ) {
          team1Wins++;
        } else {
          team2Wins++;
        }
      }
      return { team1Wins, draws, team2Wins };
    })(),
    recentForm: {
      home: (data.homeLastEvents || [])
        .filter(e => e.status?.type === 'finished')
        .map(e => ({
          ...e,
          startTimestamp: e.startTimestamp ? new Date(e.startTimestamp * 1000).toISOString() : '',
        })),
      away: (data.awayLastEvents || [])
        .filter(e => e.status?.type === 'finished')
        .map(e => ({
          ...e,
          startTimestamp: e.startTimestamp ? new Date(e.startTimestamp * 1000).toISOString() : '',
        })),
    },

    // Meta
    meta: metricsResult.meta,
  };

  return report;
}

function injectReserves(lineupPlayers, squadPlayers) {
  if (!lineupPlayers) lineupPlayers = [];
  if (!squadPlayers || !squadPlayers.players) return lineupPlayers;

  const lineupIds = new Set(lineupPlayers.map(p => p.player?.id).filter(Boolean));
  const reserves = [];

  squadPlayers.players.forEach(p => {
    if (!lineupIds.has(p.player?.id)) {
      reserves.push({
        player: p.player,
        position: p.player?.position || 'Unknown',
        shirtNumber: p.player?.shirtNumber || '',
        substitute: true,
        isReserve: true
      });
    }
  });

  return [...lineupPlayers, ...reserves];
}

function generateFirstHalfPrediction(home, away) {
  const homeHT = home.attack.M003 || 0;
  const awayHT = away.attack.M003 || 0;
  const totalHTGoals = homeHT + awayHT;

  // Use Poisson CDF instead of linear scaling for consistent over/under probabilities.
  // P(X >= 1) = 1 - e^(-λ), P(X >= 2) = 1 - e^(-λ)(1 + λ)
  const pOver05 = totalHTGoals > 0 ? (1 - Math.exp(-totalHTGoals)) * 100 : 0;
  const pOver15 = totalHTGoals > 0
    ? (1 - Math.exp(-totalHTGoals) * (1 + totalHTGoals)) * 100 : 0;

  return {
    expectedHomeGoals: round2(homeHT),
    expectedAwayGoals: round2(awayHT),
    over05HT: round2(Math.min(95, pOver05)),
    over15HT: round2(Math.min(90, pOver15)),
    htResult: homeHT > awayHT + 0.2 ? '1' : awayHT > homeHT + 0.2 ? '2' : 'X',
  };
}

function generateCornerPrediction(home, away, shared) {
  const homeCorners = home.attack.M022 || 5;
  const awayCorners = away.attack.M022 || 4;
  const totalCorners = homeCorners + awayCorners;

  // Poisson-based over/under: P(X > k) = 1 - CDF(k, lambda)
  return {
    expectedHome: round2(homeCorners),
    expectedAway: round2(awayCorners),
    expectedTotal: round2(totalCorners),
    over85: round2(Math.min(95, poissonExceed(totalCorners, 8.5) * 100)),
    over95: round2(Math.min(95, poissonExceed(totalCorners, 9.5) * 100)),
    over105: round2(Math.min(95, poissonExceed(totalCorners, 10.5) * 100)),
  };
}

function generateCardPrediction(home, away, shared) {
  const homeYellows = home.defense.M039 || 2;
  const awayYellows = away.defense.M039 || 2;
  const refYellows = shared.referee.M109 || 4;

  const expectedYellows = (homeYellows + awayYellows) * 0.6 + refYellows * 0.4;
  const expectedReds = (home.defense.M040 || 0) + (away.defense.M040 || 0);

  // Poisson-based over/under
  return {
    expectedYellowCards: round2(expectedYellows),
    expectedRedCards: round2(expectedReds),
    over35Cards: round2(Math.min(95, poissonExceed(expectedYellows, 3.5) * 100)),
    over45Cards: round2(Math.min(95, poissonExceed(expectedYellows, 4.5) * 100)),
    refereeSeverity: shared.referee.M117 || 'N/A',
  };
}

// P(X > threshold) for Poisson(lambda) — sums PMF from 0 to floor(threshold) and subtracts
function poissonExceed(lambda, threshold) {
  if (lambda <= 0) return 0;
  const kMax = Math.floor(threshold);
  let cdf = 0;
  for (let k = 0; k <= kMax; k++) {
    cdf += poissonPMF(k, lambda);
  }
  return Math.max(0, 1 - cdf);
}

function generateHighlights(home, away, shared, prediction) {
  const highlights = [];

  // Form vurgusu
  if (home.form.M046 > 80) highlights.push(`🔥 Ev sahibi son 5 maçta muhteşem formda (%${round2(home.form.M046)})`);
  if (away.form.M046 > 80) highlights.push(`🔥 Deplasman son 5 maçta muhteşem formda (%${round2(away.form.M046)})`);
  if (home.form.M046 < 30) highlights.push(`⚠️ Ev sahibi son 5 maçta kötü formda (%${round2(home.form.M046)})`);
  if (away.form.M046 < 30) highlights.push(`⚠️ Deplasman son 5 maçta kötü formda (%${round2(away.form.M046)})`);

  // Gol serisi
  if (home.form.M051 > 5) highlights.push(`⚽ Ev sahibi ${home.form.M051} maçtır gol atıyor`);
  if (away.form.M051 > 5) highlights.push(`⚽ Deplasman ${away.form.M051} maçtır gol atıyor`);

  // Clean sheet
  if (home.form.M052 > 3) highlights.push(`🧤 Ev sahibi ${home.form.M052} maçtır gol yemiyor`);
  if (away.form.M052 > 3) highlights.push(`🧤 Deplasman ${away.form.M052} maçtır gol yemiyor`);

  // Sakatlık etkisi
  if (home.player.M077 > 1) highlights.push(`🏥 Ev sahibinde kritik sakatlıklar var (etki: ${round2(home.player.M077)})`);
  if (away.player.M077 > 1) highlights.push(`🏥 Deplasmanında kritik sakatlıklar var (etki: ${round2(away.player.M077)})`);

  // H2H
  const totalH2H = (shared.h2h.M119 || 0) + (shared.h2h.M120 || 0) + (shared.h2h.M121 || 0);
  if (totalH2H > 0 && shared.h2h.M119 > shared.h2h.M121 * 1.5) {
    highlights.push(`📊 H2H'de ev sahibi baskın (${shared.h2h.M119}G-${shared.h2h.M120}B-${shared.h2h.M121}M)`);
  }

  // Geriden gelme
  if (home.form.M064 > 50) highlights.push(`💪 Ev sahibi geriden gelme konusunda güçlü (%${round2(home.form.M064)})`);
  if (away.form.M064 > 50) highlights.push(`💪 Deplasman geriden gelme konusunda güçlü (%${round2(away.form.M064)})`);

  // Güven skoru
  const confidence = calculateConfidence(prediction, shared, home, away);
  if (confidence > 75) highlights.push(`✅ Yüksek güvenilirlik skoru: %${round2(confidence)}`);
  if (confidence < 45) highlights.push(`⚠️ Düşük güvenilirlik skoru: %${round2(confidence)} — çok riskli maç`);

  // Sürpriz Endeksi
  const surpriseIndex = calculateSurpriseIndex(prediction, shared.contextual);
  if (surpriseIndex > 60) highlights.push(`🌪️ Sürpriz Endeksi Çok Yüksek (%${surpriseIndex}) — Ters köşe riski barındıran maç`);

  // Güç Dengesi
  if (home.compositeScores.M156 > away.compositeScores.M157 * 1.3) {
    highlights.push(`⚔️ Ev sahibi hücumu, deplasman defansını rahatlıkla aşacak potansiyelde`);
  }
  if (away.compositeScores.M156 > home.compositeScores.M157 * 1.3) {
    highlights.push(`⚔️ Deplasman hücumu, ev sahibi defansına ciddi bir tehdit oluşturuyor`);
  }

  // Korner Dinamiği
  const totalCorners = (home.attack.M022 || 5) + (away.attack.M022 || 4);
  const pOver105 = Math.min(95, poissonExceed(totalCorners, 10.5) * 100);
  if (pOver105 > 60) {
    highlights.push(`🚩 Maçta her iki takımın temposuyla yoğun korner trafiği bekleniyor`);
  }

  return highlights;
}

function getMostLikelyResult(prediction) {
  const max = Math.max(prediction.homeWinProbability, prediction.drawProbability, prediction.awayWinProbability);
  if (max === prediction.homeWinProbability) return '1 (Ev Sahibi Kazanır)';
  if (max === prediction.awayWinProbability) return '2 (Deplasman Kazanır)';
  return 'X (Beraberlik)';
}

function calculateConfidence(prediction, shared, home, away) {
  // 1. Olasılık Farkı (Base Confidence)
  const maxProb = Math.max(prediction.homeWinProbability, prediction.drawProbability, prediction.awayWinProbability);
  const minProb = Math.min(prediction.homeWinProbability, prediction.drawProbability, prediction.awayWinProbability);
  const midProb = 100 - maxProb - minProb;
  
  const gap = maxProb - midProb;
  let baseConfidence = (gap * 1.5) + (maxProb * 0.5);

  const favModel = maxProb === prediction.homeWinProbability ? 'home' : (maxProb === prediction.awayWinProbability ? 'away' : 'draw');

  // 2. Geçmiş Dominansı (H2H Edge)
  const homeH2HWins = shared?.h2h?.M119 || 0;
  const awayH2HWins = shared?.h2h?.M121 || 0;
  if (favModel === 'home' && homeH2HWins > awayH2HWins * 1.5) baseConfidence += 8;
  if (favModel === 'away' && awayH2HWins > homeH2HWins * 1.5) baseConfidence += 8;

  // 3. Sakatlık Volatilitesi
  const homeInjuries = home?.player?.M077 || 0;
  const awayInjuries = away?.player?.M077 || 0;
  if (homeInjuries > 2 || awayInjuries > 2) {
    baseConfidence -= 12; // High volatility due to missing key players
  }

  // 4. Tahmini Pazar Mutabakatı
  if (favModel !== 'draw' && maxProb > 55) baseConfidence += 5;

  return Math.min(95, Math.max(15, baseConfidence));
}

function round2(val) {
  return Math.round((val || 0) * 100) / 100;
}

function poissonPMF(k, lambda) {
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

function calculateGoalPeriods(team) {
  return {
    '0-15': team.attack.M005 || 0,
    '16-30': team.attack.M006 || 0,
    '31-45': team.attack.M007 || 0,
    '46-60': team.attack.M008 || 0,
    '61-75': team.attack.M009 || 0,
    '76-90': team.attack.M010 || 0,
  };
}

function calculateHotZones(home, away) {
  const zones = ['0-15', '16-30', '31-45', '46-60', '61-75', '76-90'];
  const results = zones.map(z => ({
    period: z,
    intensity: round2((home.attack[`M${getMetricForPeriod(z)}`] || 0) + (away.attack[`M${getMetricForPeriod(z)}`] || 0))
  }));
  return results.sort((a, b) => b.intensity - a.intensity).slice(0, 2).map(r => r.period);
}

function getMetricForPeriod(p) {
  const map = { '0-15': '005', '16-30': '006', '31-45': '007', '46-60': '008', '61-75': '009', '76-90': '010' };
  return map[p];
}

function calculatePenaltyChance(home, away, shared) {
  const teamFreq = (home.attack.M019 || 0) + (away.attack.M019 || 0);
  const refFreq = shared.referee.M111 || 0.24;
  const chance = (teamFreq * 0.4) + (refFreq * 0.6 * 100);
  return chance > 40 ? 'High' : chance > 20 ? 'Medium' : 'Low';
}

function calculateRedCardChance(home, away, shared) {
  const teamAgg = (home.defense.M040 || 0) + (away.defense.M040 || 0);
  const refAgg = shared.referee.M110 || 0.06;
  const chance = (teamAgg * 50) + (refAgg * 100);
  return chance > 20 ? 'High' : chance > 10 ? 'Medium' : 'Low';
}

function calculateSurpriseIndex(prediction, contextual) {
  // Bahis oranları ile Poisson arasındaki sapma
  const homeProb = prediction.homeWinProbability;
  const marketProb = contextual.M131 || 33.3;
  const delta = Math.abs(homeProb - marketProb);
  return round2(Math.min(100, delta * 2.5));
}

module.exports = { generatePrediction };
