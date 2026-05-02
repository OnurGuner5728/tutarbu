/**
 * Referee Impact Metrics (M109–M119)
 * Hakem etkisi — kart ortalaması, penaltı sıklığı, ev sahibi avantajı, sertlik indeksi.
 * Tüm metrikler refereeLastEvents ve refereeStats'tan dinamik olarak hesaplanır.
 * Hiçbir sabit fallback değer kullanılmaz; veri yoksa null döner.
 */

const MIN_EVENTS_REQUIRED = 5; // Güvenilir analiz için minimum maç sayısı (15 çok agresifti — API çoğu zaman kart/faul döndürmüyor)

function calculateRefereeMetrics(data) {
  const refereeStats = data.refereeStats;
  const refereeLastEvents = data.refereeLastEvents;
  const event = data.event?.event;
  const refereeId = data.refereeId;

  if (!refereeStats && !refereeId && !refereeLastEvents) return createEmptyRefereeMetrics();

  // ── refereeLastEvents'ten dinamik metrikler ──────────────────────────────
  // Tüm son maçlar parse edilir; yetersiz veri varsa türetilmiş metrikler null döner.
  let refLastEventsCount = 0;
  let refHomeWins = 0, refDraws = 0, refAwayWins = 0;
  let refTotalGoals = 0, refOver25Count = 0, refBTTSCount = 0;
  let refHomeRed = 0, refAwayRed = 0;
  let refHomeYellow = 0, refAwayYellow = 0;
  let refHomePenalties = 0, refAwayPenalties = 0;
  let refHomeFouls = 0, refAwayFouls = 0;
  // Null-farkındalık: API'de refereeLastEvents kart alanları çoğu zaman undefined döner.
  // undefined ile 0'ı ayırt etmek için ayrı data-presence sayaçları tutuyoruz.
  let refCardDataCount = 0;   // Kaç maçta kart verisi var
  let refRedDataCount = 0;
  let refPenDataCount = 0;
  let refFoulDataCount = 0;
  let hasLastEventsData = false;

  const lastEvArr = refereeLastEvents?.events || [];
  const lastEvFinished = lastEvArr.filter(e =>
    e.homeScore?.current != null && e.awayScore?.current != null
  );

  for (const ev of lastEvFinished) {
    const hs = ev.homeScore.current;
    const as = ev.awayScore.current;
    // KRİTİK: ?? 0 DEĞİL — undefined ise toplama dahil etme.
    // API refereeLastEvents'te card alanları genellikle undefined döner.
    const hRed = ev.homeRedCards;     // null veya undefined olabilir
    const aRed = ev.awayRedCards;
    const hYellow = ev.homeYellowCards;
    const aYellow = ev.awayYellowCards;
    const hPen = ev.homePenaltyScore ?? ev.homePenalties ?? null;
    const aPen = ev.awayPenaltyScore ?? ev.awayPenalties ?? null;
    const hFouls = ev.homeFouls ?? null;
    const aFouls = ev.awayFouls ?? null;
    const total = hs + as;

    refLastEventsCount++;
    // Sarı kart: sadece veri varsa topla
    if (hYellow != null || aYellow != null) {
      refHomeYellow += hYellow ?? 0;
      refAwayYellow += aYellow ?? 0;
      refCardDataCount++;
    }
    // Kırmızı kart: sadece veri varsa topla
    if (hRed != null || aRed != null) {
      refHomeRed += hRed ?? 0;
      refAwayRed += aRed ?? 0;
      refRedDataCount++;
    }
    if (hPen != null) { refHomePenalties += hPen; refPenDataCount++; }
    if (aPen != null) refAwayPenalties += aPen;
    if (hFouls != null) { refHomeFouls += hFouls; refFoulDataCount++; }
    if (aFouls != null) refAwayFouls += aFouls;
    refTotalGoals += total;
    if (total > 2.5) refOver25Count++;
    if (hs > 0 && as > 0) refBTTSCount++;
    if (hs > as) refHomeWins++;
    else if (hs === as) refDraws++;
    else refAwayWins++;
  }

  // Son maç verisinin yeterli olup olmadığını belirle
  hasLastEventsData = refLastEventsCount >= MIN_EVENTS_REQUIRED;
  const hasCardData = refCardDataCount >= MIN_EVENTS_REQUIRED;
  const hasRedData = refRedDataCount >= MIN_EVENTS_REQUIRED;

  // ── refereeStats'tan sezon/kariyer metrikleri ────────────────────────────
  let stats = {};
  let matchesCount = null;

  if (refereeStats?.eventReferee) {
    matchesCount = refereeStats.eventReferee.games;
    stats.yellowCards = refereeStats.eventReferee.yellowCards;
    stats.redCards = refereeStats.eventReferee.redCards;
  }

  // eventReferee yoksa veya veri eksikse sezon bazlı istatistiklere bak
  if (!matchesCount) {
    const seasons = refereeStats?.statistics?.seasons || refereeStats?.seasons || [];
    let currentSeason = seasons.length > 0
      ? [...seasons].sort((a, b) => (b.season?.year ?? 0) - (a.season?.year ?? 0))[0]
      : refereeStats;

    const s = currentSeason?.statistics || currentSeason || {};
    matchesCount = s.matches ?? s.gamesPlayed ?? s.totalMatches ?? null;
    stats.yellowCards = s.yellowCards ?? s.totalYellowCards ?? stats.yellowCards;
    stats.redCards = s.redCards ?? s.totalRedCards ?? stats.redCards;
    stats.penalties = s.penalties ?? s.penaltiesAwarded ?? s.penaltiesGiven ?? null;
    stats.fouls = s.fouls ?? s.totalFouls ?? null;
    stats.homeWins = s.homeWins ?? s.homeTeamWins ?? null;
    stats.awayWins = s.awayWins ?? s.awayTeamWins ?? null;
    stats.draws = s.draws ?? null;
  }

  const totalYellows = stats.yellowCards ?? null;
  const totalReds = stats.redCards ?? null;
  const totalPenalties = stats.penalties ?? null;
  const totalFoulsFromStats = stats.fouls ?? null;
  const homeWins = stats.homeWins ?? null;

  // ── M109: Maç Başı Sarı Kart Ortalaması ──
  // Hiyerarşi: lastEvents card data → kariyer stats → null
  // KRİTİK: hasCardData kullan (hasLastEventsData DEĞİL) — lastEvents'te kart alanları
  // genellikle undefined döner, hasLastEventsData true olsa bile kart verisi yok olabilir.
  let M109 = null;
  if (hasCardData) {
    M109 = (refHomeYellow + refAwayYellow) / refCardDataCount;
  } else if (matchesCount != null && matchesCount > 0 && totalYellows != null) {
    M109 = totalYellows / matchesCount;
  }

  // ── M110: Maç Başı Kırmızı Kart Ortalaması ──
  let M110 = null;
  if (hasRedData) {
    M110 = (refHomeRed + refAwayRed) / refRedDataCount;
  } else if (matchesCount != null && matchesCount > 0 && totalReds != null) {
    M110 = totalReds / matchesCount;
  }

  // ── M111: Penaltı Eğilimi — maç başı ortalama penaltı kararı ──
  let M111 = null;
  if (refPenDataCount >= MIN_EVENTS_REQUIRED) {
    const totalRefPen = refHomePenalties + refAwayPenalties;
    M111 = totalRefPen / refPenDataCount;
  } else if (refPenDataCount > 0) {
    // Az veri olsa bile kullan (5 maçtan az ama 0'dan fazla)
    M111 = (refHomePenalties + refAwayPenalties) / refPenDataCount;
  } else if (matchesCount != null && matchesCount > 0 && totalPenalties != null) {
    M111 = totalPenalties / matchesCount;
  } else {
    // Son fallback: Lig ortalaması penaltı oranı (standings'ten)
    const _rows = data.standingsTotal?.standings?.[0]?.rows || [];
    if (_rows.length >= 4) {
      const totalPenaltiesLg = _rows.reduce((s, r) => s + (r.penaltiesScored ?? 0), 0);
      const totalGamesLg = _rows.reduce((s, r) => s + (r.played ?? 0), 0);
      if (totalGamesLg > 0 && totalPenaltiesLg > 0) M111 = (totalPenaltiesLg / totalGamesLg) * 2;
    }
  }
  // Oyuncu bazlı fallback: penaltyWon verilerinden penaltı sıklığı
  if (M111 == null) {
    const _calcTeamPenFreq = (side) => {
      const lineup = side === 'home' ? data.lineups?.home : data.lineups?.away;
      const starters = (lineup?.players || []).filter(p => !p.substitute).slice(0, 11);
      let totalPW = 0, totalApps = 0;
      for (const p of starters) {
        const ps = p.player?.statistics || p.player?.seasonStats?.statistics || {};
        if (ps.penaltyWon != null) totalPW += ps.penaltyWon;
        if (ps.penaltyConceded != null) totalPW += ps.penaltyConceded;
        if (ps.appearances != null) totalApps += ps.appearances;
      }
      return totalApps > 0 ? totalPW / totalApps : null;
    };
    const homePF = _calcTeamPenFreq('home');
    const awayPF = _calcTeamPenFreq('away');
    if (homePF != null && awayPF != null) M111 = homePF + awayPF;
    else if (homePF != null) M111 = homePF * 2;
    else if (awayPF != null) M111 = awayPF * 2;
    // Son fallback: Lig baseline penPerMatch (dinamik hesaplanmış)
    // Sabit 0.35 kaldırıldı — veri yoksa null bırak, statik değer sokma
    if (M111 == null && data._baseline?.penPerMatch != null) {
      M111 = data._baseline.penPerMatch;
    }
  }

  // ── M112: Faul / Maç Ortalaması ──
  let M112 = null;
  if (refFoulDataCount >= MIN_EVENTS_REQUIRED) {
    const totalRefFouls = refHomeFouls + refAwayFouls;
    if (totalRefFouls > 0) {
      M112 = totalRefFouls / refFoulDataCount;
    }
  } else if (refFoulDataCount > 0 && (refHomeFouls + refAwayFouls) > 0) {
    M112 = (refHomeFouls + refAwayFouls) / refFoulDataCount;
  } else if (matchesCount != null && matchesCount > 0 && totalFoulsFromStats != null && totalFoulsFromStats > 0) {
    M112 = totalFoulsFromStats / matchesCount;
  } else {
    // Oyuncu bazlı faul verilerinden proxy: İki takımın oyuncularının toplam faul sayısı
    const _calcTeamFouls = (side) => {
      const lineup = side === 'home' ? data.lineups?.home : data.lineups?.away;
      const starters = (lineup?.players || []).filter(p => !p.substitute).slice(0, 11);
      let totalFouls = 0, totalApps = 0;
      for (const p of starters) {
        const ps = p.player?.statistics || p.player?.seasonStats?.statistics || {};
        if (ps.fouls != null && ps.appearances != null && ps.appearances > 0) {
          totalFouls += ps.fouls;
          totalApps += ps.appearances;
        }
      }
      return totalApps > 0 ? totalFouls / totalApps : null;
    };
    const homeFPM = _calcTeamFouls('home');
    const awayFPM = _calcTeamFouls('away');
    if (homeFPM != null && awayFPM != null) M112 = homeFPM + awayFPM;
    else if (homeFPM != null) M112 = homeFPM * 2;
    else if (awayFPM != null) M112 = awayFPM * 2;
  }

  // ── M113: Sarı Kart / Maç (stats kaynaklı, M109'un sezon tüm dönem versiyonu) ──
  const M113 = (matchesCount != null && matchesCount > 0 && totalYellows != null && totalYellows > 0)
    ? totalYellows / matchesCount : null;

  // ── M114: Dakika / Faul Oranı ──
  const totalMinutes = stats.minutes ?? stats.totalMinutes ?? null;
  let M114 = (matchesCount != null && matchesCount > 0 &&
    totalFoulsFromStats != null && totalFoulsFromStats > 0 &&
    totalMinutes != null && totalMinutes > 0)
    ? totalMinutes / totalFoulsFromStats : null;
  // M112 üzerinden türet: 90 dk / M112 faul/maç
  if (M114 == null && M112 != null && M112 > 0) {
    M114 = 90 / M112;
  }

  // ── M115: Ev Sahibi Kırmızı Kart / Maç (×100) ──
  // Kariyer verileri — M115/M116/M117/M120/M122 için gerekli (TDZ önlemek için erken tanım)
  const careerGames = refereeStats?.eventReferee?.games ?? null;
  const careerYellow = refereeStats?.eventReferee?.yellowCards ?? null;
  const careerRed = refereeStats?.eventReferee?.redCards ?? null;
  const careerYR = refereeStats?.eventReferee?.yellowRedCards ?? null;

  let M115 = hasRedData
    ? (refHomeRed / refRedDataCount) * 100
    : null;
  // Fallback: refRedDataCount > 0 (az veri olsa da)
  if (M115 == null && refRedDataCount > 0) {
    M115 = (refHomeRed / refRedDataCount) * 100;
  }
  // Fallback: Kariyer verisi — ev/dep ayrımı olmadığı için toplam/2
  if (M115 == null && careerGames != null && careerGames > 0 && careerRed != null) {
    M115 = ((careerRed / careerGames) / 2) * 100;
  }

  // ── M116: Deplasman Kırmızı Kart / Maç (×100) ──
  let M116 = hasRedData
    ? (refAwayRed / refRedDataCount) * 100
    : null;
  if (M116 == null && refRedDataCount > 0) {
    M116 = (refAwayRed / refRedDataCount) * 100;
  }
  if (M116 == null && careerGames != null && careerGames > 0 && careerRed != null) {
    M116 = ((careerRed / careerGames) / 2) * 100;
  }

  // ── M117: Hakem Şiddet Skoru — ÇOK BOYUTLU ──
  // M117: Birleşik sertlik skoru.
  // Hiyerarşi: lastEvents card data → kariyer stats → null
  let M117 = null;
  const careerYPerMatch = (careerGames != null && careerGames > 0 && careerYellow != null) ? careerYellow / careerGames : null;
  const careerRPerMatch = (careerGames != null && careerGames > 0 && careerRed != null) ? careerRed / careerGames : null;

  // ─── Severity ağırlıkları: Lig sarı/kırmızı/penaltı oranlarından dinamik türetilir ─
  // Ortalama ligde bir yıl boyunca atılan kartlar oranı: weight_red = avg_yellow/avg_red.
  // Sabit 1/3/2/6/4 kaldırıldı — tamamen lig verisinden.
  const _rows = data.standingsTotal?.standings?.[0]?.rows || [];
  const _lgYPG = _rows.length >= 4
    ? _rows.reduce((s, r) => s + (r.yellowCardsPerGame ?? 0), 0) / _rows.length : null;
  const _lgRPG = _rows.length >= 4
    ? _rows.reduce((s, r) => s + (r.redCardsPerGame ?? 0), 0) / _rows.length : null;
  const wYellow = 1;
  const wRed = (_lgYPG != null && _lgRPG != null && _lgRPG > 0) ? _lgYPG / _lgRPG : null;
  // Penalty ağırlığı: red ile yellow arası orta (1 penaltı ≈ yarı red, matematiksel ortadan)
  const wPen = wRed != null ? (wYellow + wRed) / 2 : null;

  if (hasCardData || hasRedData) {
    const yPerMatch = hasCardData ? (refHomeYellow + refAwayYellow) / refCardDataCount : (careerYPerMatch ?? 0);
    const rPerMatch = hasRedData ? (refHomeRed + refAwayRed) / refRedDataCount : (careerRPerMatch ?? 0);
    const penPerMatch = M111 != null ? M111 : 0;
    // Weights null ise weight=1/0 ile fallback (yellow sadece sayılır).
    const _wR = wRed ?? 0;
    const _wP = wPen ?? 0;
    const _wSum = wYellow + _wR + _wP;
    const rawSeverity = (yPerMatch * wYellow + rPerMatch * _wR + penPerMatch * _wP) / _wSum;
    const refYAvg = careerYPerMatch ?? yPerMatch;
    const refRAvg = careerRPerMatch ?? rPerMatch;
    const refSeverity = (refYAvg * wYellow + refRAvg * _wR + penPerMatch * _wP) / _wSum;
    M117 = refSeverity > 0 ? Math.max(0, Math.min(100, 50 * (rawSeverity / refSeverity))) : 50;
  } else if (matchesCount != null && matchesCount > 0 && totalYellows != null) {
    const yPerMatch = totalYellows / matchesCount;
    const rPerMatch = (totalReds != null) ? totalReds / matchesCount : 0;
    const _wR = wRed ?? 0;
    const _wSum = wYellow + _wR;
    const rawSeverity = (yPerMatch * wYellow + rPerMatch * _wR) / _wSum;
    M117 = 50; // Kariyer tek kaynaksa kendi ortalamasında = 50 nötr
  }

  // ── M118: Faul Toleransı ──
  const avgFouls = M112;
  const M118 = avgFouls;

  // ── M118b: Ev/Dep Taraflılık Endeksi — ÇOK BOYUTLU ──
  // Eski: kazanma oranına bakıyordu (kart bilgisi yoktu)
  // Yeni: kartlar + penaltı taraflılığı birleşik endeks
  // homeCardRatio    = homeCards / totalCards
  // homePenaltyRatio = homePenalties / totalPenalties
  // homebiasScore    = (homeCardRatio - 0.5) × 100 + 50
  // 50 = tarafsız, >50 = ev lehine, <50 = deplasman lehine
  let M118b = null;
  if (hasCardData || hasRedData) {
    const totalCards = (refHomeYellow + refAwayYellow) + (refHomeRed + refAwayRed);
    const homeCards = refHomeYellow + refHomeRed;
    const totalRefPen = refHomePenalties + refAwayPenalties;

    let cardBias = null;
    let penaltyBias = null;

    if (totalCards > 0) {
      cardBias = (homeCards / totalCards - 0.5) * 100 + 50;
    }

    if (totalRefPen > 0) {
      penaltyBias = (refHomePenalties / totalRefPen - 0.5) * 100 + 50;
    }

    if (cardBias != null && penaltyBias != null) {
      // Ağırlık: kaç maçta veri bulundu — örneklem bazlı (sabit 0.6/0.4 kaldırıldı).
      const _cBw = refCardDataCount + refRedDataCount;
      const _pBw = refPenDataCount;
      const _bTot = _cBw + _pBw;
      M118b = _bTot > 0
        ? cardBias * (_cBw / _bTot) + penaltyBias * (_pBw / _bTot)
        : (cardBias + penaltyBias) / 2;
    } else if (cardBias != null) {
      M118b = cardBias;
    } else if (penaltyBias != null) {
      M118b = penaltyBias;
    }

    if (M118b != null) {
      M118b = Math.max(0, Math.min(100, M118b));
    }
  } else {
    // refereeLastEvents yoksa stats bazlı kazanma oranı yöntemi (eski davranış)
    const totalGamesForBias = (() => {
      const hw = homeWins != null ? homeWins : null;
      const aw = stats.awayWins ?? stats.awayTeamWins ?? null;
      const dr = stats.draws ?? null;
      return (hw != null && aw != null && dr != null) ? hw + aw + dr : null;
    })();

    const homeRows = data.standingsHome?.standings?.[0]?.rows || [];
    const totalHomeWins = homeRows.reduce((s, r) => s + (r.wins ?? 0), 0);
    const totalHomePlayed = homeRows.reduce((s, r) => s + (r.played ?? 0), 0);
    const leagueHomeWinAvg = totalHomePlayed >= 10
      ? totalHomeWins / totalHomePlayed
      : null;

    if (leagueHomeWinAvg != null && totalGamesForBias != null && totalGamesForBias >= MIN_EVENTS_REQUIRED && homeWins != null) {
      const homeWinRate = homeWins / totalGamesForBias;
      M118b = 50 + (homeWinRate - leagueHomeWinAvg) * 100;
      M118b = Math.max(0, Math.min(100, M118b));
    }
  }

  // ── M119: Faul Eğilimi Endeksi ──
  // Hakemin maç başı ortalama faul sayısı (ev + deplasman toplam)
  // refereeLastEvents'ten hesaplanır.
  // normalize: M038/M039 varsa lig ortalamasıyla karşılaştır, yoksa ham değer döner.
  let M119 = null;
  if (hasLastEventsData) {
    const totalRefFouls = refHomeFouls + refAwayFouls;
    if (totalRefFouls > 0) {
      const foulsPerMatch = totalRefFouls / refLastEventsCount;
      // M038 = ev, M039 = deplasman ortalama faul (contextual metriklerden gelebilir)
      const leagueAvgFoulsPerMatch =
        (data.M038 != null && data.M039 != null)
          ? data.M038 + data.M039
          : null;

      if (leagueAvgFoulsPerMatch != null && leagueAvgFoulsPerMatch > 0) {
        // normalize: 50 = lig ortalaması
        M119 = 50 * (foulsPerMatch / leagueAvgFoulsPerMatch);
        M119 = Math.max(0, Math.min(100, M119));
      } else {
        // Lig verisi yoksa ham değeri döndür
        M119 = foulsPerMatch;
      }
    }
  }

  // ── Advanced referee metrics (türetilmiş) ──
  const M181 = avgFouls;
  const M182 = (avgFouls != null && M117 != null && M117 > 0) ? avgFouls / M117 : null;

  // ── Hakem son maçlarından türetilen ek metrikler ──
  const refGoalsPerMatch = refLastEventsCount > 0 ? refTotalGoals / refLastEventsCount : null;
  const refOver25Rate = refLastEventsCount > 0 ? (refOver25Count / refLastEventsCount) * 100 : null;
  const refBTTSRate = refLastEventsCount > 0 ? (refBTTSCount / refLastEventsCount) * 100 : null;
  const refHomeWinRate = refLastEventsCount > 0 ? (refHomeWins / refLastEventsCount) * 100 : null;
  const refAwayWinRate = refLastEventsCount > 0 ? (refAwayWins / refLastEventsCount) * 100 : null;

  // ── M120: Kariyer Sertlik Oranı (refereeStats.eventReferee'den) ─────────────
  // careerGames/careerYellow/careerRed/careerYR yukarıda tanımlandı (M117'den önce)
  let M120 = null;
  if (careerGames != null && careerGames > 0 && (careerYellow != null || careerRed != null)) {
    const yRate = careerYellow != null ? careerYellow / careerGames : 0;
    const rRate = careerRed != null ? careerRed / careerGames : 0;
    const yrRate = careerYR != null ? careerYR / careerGames : 0;
    // Dinamik ağırlıklar: yukarıda türetilen wYellow/wRed (lig yellow÷red oranı).
    // İkinci sarıdan gelen kırmızı (yrRate) → yellow + red weight ortalaması.
    const _wR120 = wRed ?? 0;
    const _wYR120 = (wYellow + _wR120) / 2;
    const rawSeverity = yRate * wYellow + rRate * _wR120 + yrRate * _wYR120;
    // Normalize: weights toplamı = lig ortalama severity (her metrik 1.0 geldiğinde).
    // Lig ortalama yPG ve rPG'yi weights'e uygularsak nötr severity elde ederiz → M120=50.
    const _lgNeutralSeverity = (_lgYPG ?? 0) * wYellow + (_lgRPG ?? 0) * _wR120;
    M120 = _lgNeutralSeverity > 0
      ? Math.round(Math.min(100, Math.max(0, (rawSeverity / _lgNeutralSeverity) * 50)))
      : null;
  }

  // ── M121: İlk Yarı / İkinci Yarı Gol Dağılımı Endeksi ───────────────────────
  // Hakemin yönettiği son maçlarda golların yarı dağılımı
  // >50 = ikinci yarı ağırlıklı (geç kararlar, atılan penaltı), <50 = ilk yarı ağırlıklı
  // Kaynak: refereeLastEvents.events[].homeScore.period1 + awayScore.period1
  let M121 = null;
  if (hasLastEventsData) {
    let firstHalfGoals = 0, secondHalfGoals = 0, gamesWithPeriod = 0;
    for (const ev of lastEvFinished) {
      const hP1 = ev.homeScore?.period1;
      const aP1 = ev.awayScore?.period1;
      const hTotal = ev.homeScore?.current;
      const aTotal = ev.awayScore?.current;
      if (hP1 != null && aP1 != null && hTotal != null && aTotal != null) {
        firstHalfGoals += hP1 + aP1;
        secondHalfGoals += (hTotal - hP1) + (aTotal - aP1);
        gamesWithPeriod++;
      }
    }
    if (gamesWithPeriod >= MIN_EVENTS_REQUIRED) {
      const totalGoals_ = firstHalfGoals + secondHalfGoals;
      M121 = totalGoals_ > 0
        ? Math.round((secondHalfGoals / totalGoals_) * 100)
        : null;
      // 50 = dengeli, >50 = ikinci yarı ağırlıklı (hakem geç penaltı/kart verme eğilimi)
    }
  }

  // ── M122: Hakem Yoğunluk Skoru (kariyer verimliliği) ────────────────────────
  // Kariyer sertliği hem kartları hem penaltıları bütünleşik olarak değerlendirir
  // Son maç oranı ile kariyer oranının blend'i (son maçlar daha ağırlıklı)
  let M122 = null;
  const recentSeverity = M117;
  const careerSeverity = M120;
  if (recentSeverity != null && careerSeverity != null) {
    // Ağırlık: Kariyer verisi istatistiksel gürültüyü azaltmak için 3x ağırlıklandırılır.
    const _recN = refLastEventsCount ?? 0;
    const _carN = (careerGames ?? 0) * 3;
    const _bTot = _recN + _carN;
    M122 = _bTot > 0
      ? Math.round(recentSeverity * (_recN / _bTot) + careerSeverity * (_carN / _bTot))
      : Math.round((recentSeverity + careerSeverity) / 2);
  } else {
    M122 = recentSeverity ?? careerSeverity ?? null;
  }

  return {
    M109, M110, M111, M112, M113, M114, M115, M116, M117, M118, M118b, M119,
    M120, M121, M122,  // Kariyer sertlik, yarı dağılım, blend sertlik
    M181, M182,
    // Son maçlardan türetilen yardımcı metrikler
    refGoalsPerMatch,
    refOver25Rate,
    refBTTSRate,
    refHomeWinRate,
    refAwayWinRate,
    _meta: {
      refereeId,
      refereeName: event?.referee?.name || 'Unknown',
      matchesManaged: matchesCount,
      lastEventsAnalyzed: refLastEventsCount,
      lastEventsMinMet: hasLastEventsData,
    }
  };
}

function createEmptyRefereeMetrics() {
  const m = {};
  for (let i = 109; i <= 122; i++) m[`M${String(i).padStart(3, '0')}`] = null;
  m.M118b = null;
  m._meta = { error: 'No referee data' };
  return m;
}

function createEmptyRefereeMetricsWithMeta(refId) {
  const m = createEmptyRefereeMetrics();
  m._meta.refereeId = refId;
  m._meta.error = 'Referee stats empty or unavailable';
  return m;
}

module.exports = { calculateRefereeMetrics };
