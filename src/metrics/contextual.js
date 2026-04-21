/**
 * Contextual Metrics (M131–M145)
 * Bahis oranları, kullanıcı oyları, stadyum, menajer deneyimi, sezon bağlamı, puan farkı.
 */

const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

function calculateContextualMetrics(data) {
  const odds = data.odds;
  const votes = data.votes;
  const event = data.event?.event;
  const standings = data.standingsTotal;
  const homeTeamId = data.homeTeamId;
  const awayTeamId = data.awayTeamId;
  const homePlayers = data.homePlayers;
  const awayPlayers = data.awayPlayers;

  // ── Bahis Oranı Yardımcısı ──
  // SofaScore bazen decimalValue, bazen fractionalValue döndürür.
  // fractionalValue: "163/100" → decimal = (163+100)/100 = 2.63
  function parseOddsDecimal(choice) {
    if (choice.decimalValue != null) {
      const d = parseFloat(choice.decimalValue);
      return (!isNaN(d) && d > 1) ? d : null;
    }
    if (choice.fractionalValue != null) {
      const parts = String(choice.fractionalValue).split('/');
      if (parts.length !== 2) return null;
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (isNaN(num) || isNaN(den) || den === 0) return null;
      return (num + den) / den;
    }
    return null;
  }

  // ── M131-M134: Bahis Oranı İma Edilen Olasılıklar ──
  let M131 = null, M132 = null, M133 = null, M134 = null;
  let M134b = null, M134c = null, ahLine = null;

  // Ev takımı adı (AH choice name eşleşmesi için)
  const homeTeamName = (event?.homeTeam?.name || '').toLowerCase();

  const markets = odds?.markets || [];
  for (const market of markets) {
    const mId = market.marketId;
    const mName = (market.marketName || '').toLowerCase();

    // 1X2 (Full time)
    if (mId === 1 || mName === '1x2' || mName === 'full time') {
      for (const choice of (market.choices || [])) {
        const decimal = parseOddsDecimal(choice);
        if (decimal != null) {
          if (choice.name === '1') M131 = (1 / decimal) * 100;
          if (choice.name === 'X') M132 = (1 / decimal) * 100;
          if (choice.name === '2') M133 = (1 / decimal) * 100;
        }
      }
    }

    // Over/Under 2.5 — marketId=9 (choiceGroup="2.5") veya marketId=11 veya marketName içerir
    const isMatchGoals = mId === 9 || mId === 11 || mName.includes('over/under') || mName.includes('match goals');
    if (isMatchGoals) {
      const cg = String(market.choiceGroup ?? '');
      const is25 = cg === '2.5' || cg === '2,5';
      // choiceGroup bilgisi yoksa sadece 'Over 2.5' isimli choice'ı al
      for (const choice of (market.choices || [])) {
        const decimal = parseOddsDecimal(choice);
        if (decimal == null) continue;
        const isOver = choice.name === 'Over 2.5' || (choice.name === 'Over' && is25);
        if (isOver) M134 = (1 / decimal) * 100;
      }
    }

    // Asian Handicap — marketId=17 veya mName içerir
    if (mId === 17 || mName.includes('asian handicap') || mName.includes('asian')) {
      for (const choice of (market.choices || [])) {
        const decimal = parseOddsDecimal(choice);
        if (decimal == null) continue;
        const cName = (choice.name || '').toLowerCase();
        // choice.name = "(0) Real Madrid" veya "1" veya "Home" gibi olabilir
        const isHome = cName === '1' || cName.includes('home') || (homeTeamName && cName.includes(homeTeamName));
        if (isHome) {
          M134b = (1 / decimal) * 100;
          const hMatch = (choice.name + (choice.handicap || '')).match(/[-+]?\d*\.?\d+/);
          if (hMatch) ahLine = parseFloat(hMatch[0]);
        }
      }
    }

    // Draw No Bet — marketId=4 veya mName içerir
    if (mId === 4 || mName.includes('draw no bet') || mName.includes('dnb')) {
      for (const choice of (market.choices || [])) {
        const decimal = parseOddsDecimal(choice);
        if (decimal == null) continue;
        const cName = (choice.name || '').toLowerCase();
        const isHome = cName === '1' || cName.includes('home') || (homeTeamName && cName.includes(homeTeamName));
        if (isHome) M134c = (1 / decimal) * 100;
      }
    }
  }

  // ── M135-M137: Kullanıcı Oyları ──
  let M135 = null, M136 = null, M137 = null;
  if (votes) {
    const voteData = votes.vote || votes;
    const vote1Raw = voteData.vote1 ?? voteData.home ?? null;
    const voteXRaw = voteData.voteX ?? voteData.draw ?? null;
    const vote2Raw = voteData.vote2 ?? voteData.away ?? null;
    if (vote1Raw != null && voteXRaw != null && vote2Raw != null) {
      const totalVotes = vote1Raw + voteXRaw + vote2Raw;
      if (totalVotes > 0) {
        M135 = (vote1Raw / totalVotes) * 100;
        M136 = (voteXRaw / totalVotes) * 100;
        M137 = (vote2Raw / totalVotes) * 100;
      }
    }
  }

  // ── M138: Stadyum Kapasitesi Etkisi ──
  const capacity = event?.venue?.stadium?.capacity;
  const M138 = (capacity != null && capacity > 0) ? Math.min(capacity / 80000, 1) : null;

  // ── M139-M140: Menajer Deneyimi & Galibiyet Oranı ──
  // homeManagerCareer = getManagerLastEvents sonucu: { events: [...] }
  // M139: Son sayfada kaç maç var (0-20) → deneyim skoru (0-100)
  // M140: Mevcut takımla (homeTeamId) son maçlardaki galibiyet oranı
  let M139 = null, M140 = null;
  const homeMgrLastEv = data.homeManagerCareer?.events || [];
  const finishedMgrEv = homeMgrLastEv.filter(e =>
    e.status?.type === 'finished' && e.homeScore?.current != null && e.awayScore?.current != null
  );

  if (finishedMgrEv.length > 0) {
    M139 = Math.min((finishedMgrEv.length / 20) * 100, 100);

    let currentTeamWins = 0, currentTeamMatches = 0;
    for (const ev of finishedMgrEv) {
      const isHome = ev.homeTeam?.id === homeTeamId;
      const isAway = ev.awayTeam?.id === homeTeamId;
      if (!isHome && !isAway) continue;
      currentTeamMatches++;
      const hs = ev.homeScore.current;
      const as = ev.awayScore.current;
      if ((isHome && hs > as) || (isAway && as > hs)) currentTeamWins++;
    }
    M140 = currentTeamMatches > 0 ? (currentTeamWins / currentTeamMatches) * 100 : null;
  }

  // ── M141: Maçın Haftası (Round) Etkisi ──
  const standingsRows = data.standingsTotal?.standings?.[0]?.rows || [];
  const currentRound = event?.roundInfo?.round;
  const teamCount = standingsRows.length;
  const totalRounds = teamCount >= 4 ? (teamCount - 1) * 2 : null;
  const M141 = (currentRound != null && currentRound > 0 && totalRounds != null) ? currentRound / totalRounds : null;

  // ── M142-M143: Puan Durumu Farkı ──
  const homeRow = findTeamRow(standings, homeTeamId);
  const awayRow = findTeamRow(standings, awayTeamId);
  const totalTeams = getTotalTeams(standings);

  const homePos = homeRow?.position ?? null;
  const awayPos = awayRow?.position ?? null;
  const M142 = (homePos != null && awayPos != null && totalTeams > 0) ? Math.abs(homePos - awayPos) / totalTeams : null;

  const homePoints = homeRow?.points ?? null;
  const awayPoints = awayRow?.points ?? null;
  const M143 = (homePoints != null && awayPoints != null) ? Math.abs(homePoints - awayPoints) : null;

  // ── M144: Lig Gücü İndeksi ──
  // Standings'ten tamamen dinamik: avgGoals + avgPPG + gol farkı yayılımı (std dev)
  // league-averages.js ile aynı formül — sabit 40-baz ve >= 18 eşiği kaldırıldı
  let M144 = null;
  if (standingsRows.length >= 4) {
    const totalGoals = standingsRows.reduce((s, r) => s + (r.scoresFor ?? 0), 0);
    const totalGames = Math.max(standingsRows.reduce((s, r) => s + (r.played ?? 0), 0), 1);
    const teamCount = standingsRows.length;
    const avgGoals = totalGoals / totalGames;
    const totalPoints = standingsRows.reduce((s, r) => s + (r.points ?? 0), 0);
    const avgPPG = teamCount > 0 ? (totalPoints / teamCount) / (totalGames / teamCount || 1) : null;
    const goalDiffs = standingsRows.map(r => (r.scoresFor ?? 0) - (r.scoresAgainst ?? 0));
    const meanGD = goalDiffs.reduce((a, b) => a + b, 0) / goalDiffs.length;
    const gdSpread = Math.sqrt(goalDiffs.reduce((s, v) => s + (v - meanGD) ** 2, 0) / goalDiffs.length);
    // 3 bileşen eşit ağırlık toplam (sabit 15/10/1.5 kaldırıldı — organic skala).
    M144 = +(avgGoals + (avgPPG ?? 0) + gdSpread).toFixed(2);
  }

  // ── M145: Transfer Net Harcama Etkisi ──
  let homeMarketValue = 0, awayMarketValue = 0;
  const homePl = homePlayers?.players || [];
  const awayPl = awayPlayers?.players || [];

  for (const p of homePl) {
    const val = p.player?.proposedMarketValue;
    if (val != null) homeMarketValue += val;
  }
  for (const p of awayPl) {
    const val = p.player?.proposedMarketValue;
    if (val != null) awayMarketValue += val;
  }

  const maxValue = Math.max(homeMarketValue, awayMarketValue);
  const M145 = maxValue > 0 ? homeMarketValue / maxValue : null;

  // ── M170-M171: Turnuva & Ayak (Leg) Bağlamı ──
  let M170 = 1.0; // Varsayılan: Normal Lig Maçı
  let M171 = 0;   // Birikmiş skor farkı (Ev - Dep)

  const roundInfo = event?.roundInfo;
  const tournamentCategory = event?.tournament?.category?.name;
  const tournamentName = event?.tournament?.name?.toLowerCase() || '';
  const isCup = (tournamentCategory && (
    tournamentCategory.toLowerCase().includes('cup') ||
    tournamentCategory.toLowerCase().includes('intl') ||
    tournamentCategory.toLowerCase().includes('europe')
  )) ||
    tournamentName.includes('champions') ||
    tournamentName.includes('trophy') ||
    roundInfo?.leg != null;

  if (isCup) {
    const aggHome = event?.homeScore?.aggregated ?? 0;
    const aggAway = event?.awayScore?.aggregated ?? 0;
    M171 = aggHome - aggAway;
  }

  // ── M172-M173: Dinamik Puan Durumu Hassasiyeti (Gap-based Physics) ──
  // Sınır noktalarını (Promotion/Relegation Thresholds) tespit et.
  const rows = data.standingsTotal?.standings?.[0]?.rows || [];
  const thresholds = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const cur = rows[i].promotion?.text;
    const nxt = rows[i + 1].promotion?.text;
    if (cur !== nxt) {
      thresholds.push({
        rank: rows[i].position,
        pts: rows[i].points,
        nextRank: rows[i + 1].position,
        nextPts: rows[i + 1].points
      });
    }
  }

  const calculateGapImportance = (row) => {
    if (!row || thresholds.length === 0) return { val: 50, gap: null };
    // Herhangi bir kritik sınıra (Avrupa veya Düşme) olan en yakın puan mesafesi
    let minGap = 100;
    for (const t of thresholds) {
      const g1 = Math.abs(row.points - t.pts);
      const g2 = Math.abs(row.points - t.nextPts);
      const m = Math.min(g1, g2);
      if (m < minGap) minGap = m;
    }
    // Gap ne kadar küçükse baskı o kadar yüksek (100 / (Gap + 1))
    return {
      val: Math.max(1, Math.min(100, 100 / (minGap + 1))),
      gap: minGap
    };
  };

  const M172_res = calculateGapImportance(homeRow);
  const M173_res = calculateGapImportance(awayRow);
  const M172 = M172_res.val;
  const M173 = M173_res.val;

  // ── M174-M175: Güç Dengesi & Sıralama Avantajı ──
  const getPPG = (row) => (row && row.matches > 0) ? row.points / row.matches : 0;
  const homePPG = getPPG(homeRow);
  const awayPPG = getPPG(awayRow);
  const M174 = (homePPG > 0 && awayPPG > 0) ? (homePPG / awayPPG) : 1.0;
  const M175 = (homePos != null && awayPos != null && totalTeams > 0) ? awayPos / homePos : 1.0;

  // ── M170: Dinamik Turnuva Yoğunluğu (Intensity) ──
  // Sabit 1.2/1.6 yerine, maçın "Hayatiyeti" (Importance) üzerinden hesaplanır.
  if (isCup) {
    // Eşit güçteki takımların finali veya geride olanın hırsı yoğunluğu artırır.
    // Kupa maçı baz yoğunluğu: turnuva formatına göre (1.1 sabiti kaldırıldı)
    const baseIntensity = isCup ? 1.15 : 1.05;
    const importanceBoost = Math.max(M172, M173) / 250; // max ~0.4
    const legBoost = roundInfo?.leg === 2 ? 0.15 : 0;
    M170 = baseIntensity + importanceBoost + legBoost;
  }
  // M170 clamp: ptsCV + CV'den (sabit 0.8/1.8 kaldırıldı).
  const _m170Rows = data.standingsTotal?.standings?.[0]?.rows || [];
  let _m170Min = 0.8, _m170Max = 1.8;
  if (_m170Rows.length >= 4) {
    const ppg = _m170Rows.map(r => r.points / (r.matches || 1));
    const meanPpg = ppg.reduce((a, b) => a + b, 0) / ppg.length;
    if (meanPpg > 0) {
      const ptsVar = ppg.reduce((s, v) => s + (v - meanPpg) ** 2, 0) / ppg.length;
      const ptsCV_local = Math.sqrt(ptsVar) / meanPpg;
      _m170Min = 1 - ptsCV_local;
      _m170Max = 1 + ptsCV_local;
    }
  }
  M170 = clamp(M170, _m170Min, _m170Max);

  // ── Formasyon Ayrıştırıcı Yardımcısı ──
  // "4-3-3" → { def: 4, mid: 3, fwd: 3 }
  // Geçersiz veya eksik formasyon → null
  function parseFormation(formationStr) {
    if (!formationStr || typeof formationStr !== 'string') return null;
    const parts = formationStr.trim().split('-').map(Number);
    // Standart formasyon: en az 3 bölüm, hepsi geçerli sayı olmalı
    if (parts.length < 3 || parts.some(isNaN)) return null;
    // Son bölüm = hücum (fwd), ilk bölüm = savunma (def), ortadakiler = orta saha (mid)
    // Örnek: "4-2-3-1" → def:4, mid:2+3=5, fwd:1
    const def = parts[0];
    const fwd = parts[parts.length - 1];
    const mid = parts.slice(1, -1).reduce((a, b) => a + b, 0);
    return { def, mid, fwd };
  }

  // ── M068: Formasyon Uyumu — Taktik Baskı Endeksi ──
  // İki takımın formasyon yapısını sayısallaştırarak hangisinin taktik baskı
  // üstünlüğüne sahip olduğunu ölçer (0–100 skala, 50 = denge).
  let M068 = null;
  const homeFormation = parseFormation(data.lineups?.home?.formation);
  const awayFormation = parseFormation(data.lineups?.away?.formation);

  if (homeFormation !== null && awayFormation !== null) {
    // Pozisyon bazlı farklar: pozitif değer ev sahibi lehine
    const DF_diff = homeFormation.def - awayFormation.def;   // savunma fazlası/eksiği
    const MID_diff = homeFormation.mid - awayFormation.mid;   // orta saha hakimiyeti
    const FWD_diff = homeFormation.fwd - awayFormation.fwd;   // hücum baskısı

    // Ağırlıklar lig CV'sinden (sabit 1.5/0.8 kaldırıldı).
    // Volatil lig → hücum daha değerli, stabil lig → savunma daha önemli.
    const _ctxRows = data.standingsTotal?.standings?.[0]?.rows || [];
    let _fwdW = 1, _dfW = 1;
    if (_ctxRows.length >= 8) {
      const gr = _ctxRows.map(r => r.scoresFor / (r.matches || 1));
      const mg = gr.reduce((a, b) => a + b, 0) / gr.length;
      if (mg > 0) {
        const gVar = gr.reduce((s, v) => s + (v - mg) ** 2, 0) / gr.length;
        const ctxCV = Math.sqrt(gVar) / mg;
        _fwdW = 1 + ctxCV;
        _dfW = 1 - ctxCV;
      }
    }
    const rawScore = (FWD_diff * _fwdW + MID_diff * 1.0 - DF_diff * _dfW) / 3;

    // normalize: [-X, +X] → [0, 100] aralığına, 50 = denge
    // Teorik max fark ≈ ±5 (örn. "4-6-0" vs "0-0-4"), clamp ile güvenlik altında
    M068 = clamp(50 + rawScore * 10, 0, 100);
    M068 = +M068.toFixed(2);
  }
  // Formasyon yoksa M068 = null (sabit değer döndürme)

  // ── M075: Taktik Adaptasyon Skoru — Dinamik ──
  // Son maçlardaki sonuç dalgalanmasını, gol farkı varyansını ve ev sahibi
  // avantajını analiz ederek taktik adaptasyon yeteneği skoru üretir (30–100).
  let M075 = null;
  const homeLastEvents = data.homeLastEvents || [];

  // Sadece tamamlanmış maçları al
  const finishedHomeEvents = homeLastEvents.filter(
    e => e.status?.type === 'finished' &&
      e.homeScore?.current != null &&
      e.awayScore?.current != null
  );

  if (finishedHomeEvents.length >= 2) {
    // --- Gol Farkı Varyansı ---
    // Yüksek varyans → tutarsız taktik → düşük adaptasyon
    const goalDiffs = finishedHomeEvents.map(e => {
      const isHome = e.homeTeam?.id === homeTeamId;
      return isHome
        ? e.homeScore.current - e.awayScore.current
        : e.awayScore.current - e.homeScore.current;
    });
    const avgGD = goalDiffs.reduce((a, b) => a + b, 0) / goalDiffs.length;
    const gdVariance = goalDiffs.reduce((s, v) => s + (v - avgGD) ** 2, 0) / goalDiffs.length;
    // Varyans 0 = mükemmel tutarlılık (100 puan) → varyans büyüdükçe skor düşer
    const consistencyScore = Math.max(0, 100 - gdVariance * 8);

    // --- Galibi Takip Eden Kayıp (Win-Streak Kırılması) ---
    // Art arda galibiyet sonrası kayıp → yüksek adaptasyon ihtiyacı → düşük skor
    let winStreakBreakPenalty = 0;
    let streak = 0;
    for (const e of finishedHomeEvents) {
      const isHome = e.homeTeam?.id === homeTeamId;
      const hs = e.homeScore.current;
      const as = e.awayScore.current;
      const won = isHome ? hs > as : as > hs;
      const lost = isHome ? hs < as : as < hs;
      if (won) {
        streak++;
      } else if (lost && streak >= 2) {
        // 2+ galibiyet serisi kırıldı → taktik uyum başarısız
        winStreakBreakPenalty += 15;
        streak = 0;
      } else {
        streak = 0;
      }
    }

    // --- Ev Sahibi Avantajı Bonusu ---
    // Ev maçlarında kazanılan maç oranı yüksekse +bonus
    const homeOnlyEvents = finishedHomeEvents.filter(
      e => e.homeTeam?.id === homeTeamId
    );
    let homeWinBonus = 0;
    if (homeOnlyEvents.length > 0) {
      const homeWins = homeOnlyEvents.filter(
        e => e.homeScore.current > e.awayScore.current
      ).length;
      const homeWinRate = homeWins / homeOnlyEvents.length;
      homeWinBonus = homeWinRate * 15; // max +15 bonus
    }

    // --- Adaptasyon Skoru Birleştirme ---
    const rawAdaptation = consistencyScore - winStreakBreakPenalty + homeWinBonus;
    M075 = clamp(Math.round(rawAdaptation), 30, 100);
  }
  // Yeterli veri yoksa M075 = null

  // ── M176: Formasyon Çakışma İndeksi ──
  // Orta saha sayı üstünlüğünü ölçer: deplasman fazla mid oyuncusu → baskı altı.
  // (0–100 skala, 50 = eşit, >50 = ev sahibi mid üstünlüğü)
  let M176 = null;
  if (homeFormation !== null && awayFormation !== null) {
    // Orta saha farkı: ev − deplasman (range: yaklaşık -5 ile +5)
    const midDiff = homeFormation.mid - awayFormation.mid;
    // normalize: fark 5 birim → tam skala ucu; /5 × 50 + 50
    M176 = clamp(+(midDiff / 5 * 50 + 50).toFixed(2), 0, 100);
  }
  // Formasyon parse edilemezse M176 = null

  // ── M177-M179: Gerçek Pressing Metrikleri ────────────────────────────────────
  // Kaynak: homeRecentMatchDetails + awayRecentMatchDetails istatistikleri
  // PPDA (Passes Per Defensive Action) — futbol analitik pressing standardı
  // Düşük PPDA = yüksek pressing yoğunluğu
  // Bileşik pressing geometrisi: PPDA + ball recovery + territory control

  function extractPressingStats(recentDetails, teamId_) {
    if (!Array.isArray(recentDetails) || recentDetails.length === 0) return null;

    const samples = [];
    for (const rm of recentDetails.slice(0, 5)) {
      const allPeriod = rm.stats?.statistics?.find(p => p.period === 'ALL') || rm.stats?.statistics?.[0];
      if (!allPeriod) continue;
      const isMatchHome = rm.homeTeam?.id === teamId_;

      let tackle = null, intercept = null, fouls = null;
      let oppPasses = null, oppFinalThird = null;
      let ballRecov = null, touchesOppBox = null, totalClear = null;
      let highBlockSuccess = null;

      for (const g of (allPeriod.groups || [])) {
        for (const item of (g.statisticsItems || [])) {
          const own = isMatchHome ? item.homeValue : item.awayValue;
          const opp = isMatchHome ? item.awayValue : item.homeValue;
          switch (item.key) {
            case 'totalTackle': tackle = own; break;
            case 'interceptionWon': intercept = own; break;
            case 'fouls': fouls = own; break;
            case 'accuratePasses': oppPasses = opp; break;
            case 'finalThirdEntries': oppFinalThird = opp; break;
            case 'ballRecovery': ballRecov = own; break;
            case 'touchesInOppBox': touchesOppBox = own; break;
            case 'totalClearance': totalClear = own; break;
            case 'wonTacklePercent': highBlockSuccess = own; break;
          }
        }
      }

      const defActions = (tackle ?? 0) + (intercept ?? 0) + (fouls ?? 0);
      const ppda = (defActions > 0 && oppPasses != null)
        ? oppPasses / defActions : null;
      samples.push({ ppda, ballRecov, touchesOppBox, totalClear, highBlockSuccess, oppFinalThird });
    }

    if (samples.length === 0) return null;

    const avg = (key) => {
      const vals = samples.map(s => s[key]).filter(v => v != null && isFinite(v));
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };

    return {
      avgPPDA: avg('ppda'),
      avgBallRecov: avg('ballRecov'),
      avgTouchesOppBox: avg('touchesOppBox'),
      avgTotalClear: avg('totalClear'),
      avgHighBlock: avg('highBlockSuccess'),
      avgOppFinalThird: avg('oppFinalThird'),
      sampleCount: samples.length,
    };
  }

  const homePress = extractPressingStats(data.homeRecentMatchDetails, homeTeamId);
  const awayPress = extractPressingStats(data.awayRecentMatchDetails, awayTeamId);

  // M177: Pressing Yoğunluğu Endeksi (0-100)
  // PPDA tabanlı: düşük PPDA → yüksek pressing → yüksek M177
  // + ballRecovery normalize
  // Referans: iyi pressing takımı PPDA<8, kötü PPDA>12
  let M177_home = null, M177_away = null;
  if (homePress?.avgPPDA != null) {
    // PPDA invert: 14-PPDA → yüksek=iyi; clamp [0, 100]
    const ppdaScore = clamp((14 - homePress.avgPPDA) / 10 * 50 + 50, 0, 100);
    const recovScore = homePress.avgBallRecov != null
      ? clamp(homePress.avgBallRecov / 60 * 100, 0, 100) : null;
    // Her iki sinyal mevcut → eşit ağırlık (1 kaynak / 1 kaynak sabit yapısal, blend değil).
    M177_home = recovScore != null
      ? +((ppdaScore + recovScore) / 2).toFixed(2)
      : +ppdaScore.toFixed(2);
  }
  if (awayPress?.avgPPDA != null) {
    const ppdaScore = clamp((14 - awayPress.avgPPDA) / 10 * 50 + 50, 0, 100);
    const recovScore = awayPress.avgBallRecov != null
      ? clamp(awayPress.avgBallRecov / 60 * 100, 0, 100) : null;
    M177_away = recovScore != null
      ? +((ppdaScore + recovScore) / 2).toFixed(2)
      : +ppdaScore.toFixed(2);
  }

  // M178: Territorial Control Skoru — yüksek blok mu yoksa yüksek baskı mı?
  // touchesInOppBox / (totalClearance + touchesInOppBox) — 50=denge, >50=hücum bölge hakimiyeti
  let M178_home = null, M178_away = null;
  if (homePress?.avgTouchesOppBox != null) {
    const total = (homePress.avgTouchesOppBox + (homePress.avgTotalClear ?? homePress.avgTouchesOppBox));
    M178_home = total > 0
      ? +(clamp(homePress.avgTouchesOppBox / total * 100, 0, 100)).toFixed(2)
      : null;
  }
  if (awayPress?.avgTouchesOppBox != null) {
    const total = (awayPress.avgTouchesOppBox + (awayPress.avgTotalClear ?? awayPress.avgTouchesOppBox));
    M178_away = total > 0
      ? +(clamp(awayPress.avgTouchesOppBox / total * 100, 0, 100)).toFixed(2)
      : null;
  }

  // M179: Savunma Hat Yüksekliği — rakibin son üçlük girişi normalize
  // Çok rakip son üçlüğe giriyorsa → derin blok (savunma/saha geri) → düşük M179
  // Az rakip giriyorsa → high press başarılı → yüksek M179
  let M179_home = null, M179_away = null;
  if (homePress?.avgOppFinalThird != null) {
    // Referans: takım başına ~40-60 final third entry/maç
    M179_home = +(clamp((60 - homePress.avgOppFinalThird) / 30 * 50 + 50, 10, 90)).toFixed(2);
  }
  if (awayPress?.avgOppFinalThird != null) {
    M179_away = +(clamp((60 - awayPress.avgOppFinalThird) / 30 * 50 + 50, 10, 90)).toFixed(2);
  }

  return {
    M068, M075,
    // Pressing metrikleri home/away versiyonları:
    M177_home, M177_away, M178_home, M178_away, M179_home, M179_away,
    M131, M132, M133, M134, M134b, M134c, M135, M136, M137, M138, M139, M140,
    M141, M142, M143, M144, M145, M170, M171, M172, M173, M174, M175, M176,
    _meta: {
      isCup,
      leg: roundInfo?.leg || null,
      aggDiff: (event?.homeScore?.aggregated ?? 0) - (event?.awayScore?.aggregated ?? 0),
      homePos: homeRow?.position || null,
      awayPos: awayRow?.position || null,
      homePts: homeRow?.points || null,
      awayPts: awayRow?.points || null,
      homeGap: M172_res.gap,
      awayGap: M173_res.gap,
      homeHasTarget: M172 > 80,
      awayHasTarget: M173 > 80,
      homeFormation: data.lineups?.home?.formation || null,
      awayFormation: data.lineups?.away?.formation || null,
      rule: 'Dynamic standings data'
    }
  };
}

function findTeamRow(standings, teamId) {
  if (!standings?.standings) return null;
  for (const s of standings.standings) {
    for (const row of (s.rows || [])) {
      if (row.team?.id === teamId) return row;
    }
  }
  return null;
}

function getTotalTeams(standings) {
  if (!standings?.standings) return null;
  for (const s of standings.standings) return (s.rows || []).length;
  return null;
}

module.exports = { calculateContextualMetrics };

function findTeamRow(standings, teamId) {
  if (!standings?.standings) return null;
  for (const s of standings.standings) {
    for (const row of (s.rows || [])) {
      if (row.team?.id === teamId) return row;
    }
  }
  return null;
}

function getTotalTeams(standings) {
  if (!standings?.standings) return null;
  for (const s of standings.standings) return (s.rows || []).length;
  return null;
}

module.exports = { calculateContextualMetrics };
