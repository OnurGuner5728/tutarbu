/**
 * Contextual Metrics (M131–M145)
 * Bahis oranları, kullanıcı oyları, stadyum, menajer deneyimi, sezon bağlamı, puan farkı.
 */

const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

function calculateContextualMetrics(data) {
  const odds = data.odds;
  const oddsChanges = data.oddsChanges;
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
  let M134b = null, M134c = null, M134d = null, ahLine = null;
  // Ham decimal oranlar (UI'da göstermek için)
  let rawOdds1 = null, rawOddsX = null, rawOdds2 = null;

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
          if (choice.name === '1') { M131 = (1 / decimal) * 100; rawOdds1 = +decimal.toFixed(2); }
          if (choice.name === 'X') { M132 = (1 / decimal) * 100; rawOddsX = +decimal.toFixed(2); }
          if (choice.name === '2') { M133 = (1 / decimal) * 100; rawOdds2 = +decimal.toFixed(2); }
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

    // Both Teams To Score (KG Var) — marketId=29 veya mName içerir
    // "Yes"/"GG" = KG Var oldu — Shin transform uygulanır
    const isBTTS = mId === 29 || mId === 28 ||
      mName.includes('both teams') || mName.includes('btts') ||
      mName.includes('gg/ng') || mName.includes('goal/no goal') ||
      mName.includes('her iki taraf');
    if (isBTTS) {
      for (const choice of (market.choices || [])) {
        const decimal = parseOddsDecimal(choice);
        if (decimal == null) continue;
        const cName = (choice.name || '').toLowerCase();
        if (cName === 'yes' || cName === 'gg' || cName === 'goal' || cName === 'var') {
          M134d = (1 / decimal) * 100;
        }
      }
    }
  }

  // ── M135-M137: Kullanıcı Oyları ──
  // Veri yoksa: 50 (nötr) — MOMENTUM_AKIŞI'nda sinyalsiz geçmek yerine
  // kalabalığın belirsiz olduğunu temsil eder (ekstra bilgi yok)
  let M135 = 50, M136 = null, M137 = 50;
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

  // ── M068: Taktik Hakimiyet Endeksi (Gerçek Takım Verileri) ──
  // Eski yöntemdeki statik formasyon sayımını (4-3-3 vs 4-4-2) gerçek
  // pas başarı oranları ve genel ratinglerle harmanlar.
  let M068 = null;
  const homeFormation = parseFormation(data.lineups?.home?.formation);
  const awayFormation = parseFormation(data.lineups?.away?.formation);

  const getTeamControlProxy = (playerStats) => {
    if (!playerStats || playerStats.length === 0) return null;
    let sumPass = 0, sumRating = 0, count = 0;
    for (const p of playerStats) {
      const stats = p.statistics || p.seasonStats?.statistics;
      if (stats) {
        sumPass += stats.accuratePassesPercentage || 0;
        sumRating += stats.rating || 0;
        count++;
      }
    }
    return count > 0 ? { pass: sumPass / count, rating: sumRating / count } : null;
  };

  const homeControl = getTeamControlProxy(data.homePlayerStats);
  const awayControl = getTeamControlProxy(data.awayPlayerStats);

  if (homeFormation !== null && awayFormation !== null) {
    const DF_diff = homeFormation.def - awayFormation.def;
    const MID_diff = homeFormation.mid - awayFormation.mid;
    const FWD_diff = homeFormation.fwd - awayFormation.fwd;

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

    // Formasyon yapısal skoru
    const formScore = (FWD_diff * _fwdW + MID_diff * 1.5 - DF_diff * _dfW) / 3.5;

    // Pas ve Rating bazlı oyun kontrol skoru
    let statScore = 0;
    if (homeControl && awayControl) {
      const passDiff = homeControl.pass - awayControl.pass; // e.g., 85% - 80% = +5
      const ratingDiff = homeControl.rating - awayControl.rating; // e.g., 7.1 - 6.8 = +0.3
      statScore = (passDiff * 0.5) + (ratingDiff * 10);
    }

    // Blend: Formasyon farkı + İstatistiksel Kontrol
    const rawScore = formScore * 5 + statScore;

    M068 = clamp(50 + rawScore, 0, 100);
    M068 = +M068.toFixed(2);
  } else if (homeControl && awayControl) {
    // Formasyon yok ama istatistik var
    const passDiff = homeControl.pass - awayControl.pass;
    const ratingDiff = homeControl.rating - awayControl.rating;
    const statScore = (passDiff * 0.5) + (ratingDiff * 10);
    M068 = clamp(50 + statScore, 0, 100);
    M068 = +M068.toFixed(2);
  }

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

  // ── Açılış Oranları (ΔMarketMove için) ───────────────────────────────────────
  // SofaScore /odds/1/all endpoint'i choice.openValue (açılış decimal oranı) döndürür.
  // Aynı oranı şimdi de çekiyoruz; tek fark: kapanış = decimalValue, açılış = openValue.
  let M131_open = null, M132_open = null, M133_open = null;
  let rawOpenOdds1 = null, rawOpenOddsX = null, rawOpenOdds2 = null;
  let oddsChange1 = null, oddsChangeX = null, oddsChange2 = null;
  for (const market of markets) {
    const mId = market.marketId;
    const mName = (market.marketName || '').toLowerCase();
    if (mId === 1 || mName === '1x2' || mName === 'full time') {
      for (const choice of (market.choices || [])) {
        // Açılış oranı: openValue → startOddsDecimal → openDecimalValue → openingDecimalValue → initialDecimalValue
        const openDec = (() => {
          // SofaScore choice objesindeki olası açılış oranı alanları
          const raw = choice.openValue ?? choice.startOddsDecimal ??
                      choice.openDecimalValue ?? choice.openingDecimalValue ??
                      choice.initialDecimalValue ?? null;
          if (raw != null) {
            const d = parseFloat(raw);
            return (!isNaN(d) && d > 1) ? d : null;
          }
          // initialFractionalValue'dan dönüştür
          if (choice.initialFractionalValue != null) {
            const parts = String(choice.initialFractionalValue).split('/');
            if (parts.length === 2) {
              const num = parseFloat(parts[0]), den = parseFloat(parts[1]);
              if (!isNaN(num) && !isNaN(den) && den > 0) return (num + den) / den;
            }
          }
          return null;
        })();
        // Change alanı (SofaScore'un oran değişimi sinyali)
        const chg = choice.change ?? choice.changeValue ?? null;
        
        if (choice.name === '1') {
          if (openDec != null) { M131_open = (1 / openDec) * 100; rawOpenOdds1 = +openDec.toFixed(2); }
          if (chg != null) oddsChange1 = chg;
        }
        if (choice.name === 'X') {
          if (openDec != null) { M132_open = (1 / openDec) * 100; rawOpenOddsX = +openDec.toFixed(2); }
          if (chg != null) oddsChangeX = chg;
        }
        if (choice.name === '2') {
          if (openDec != null) { M133_open = (1 / openDec) * 100; rawOpenOdds2 = +openDec.toFixed(2); }
          if (chg != null) oddsChange2 = chg;
        }
      }
    }
  }

  // ── Shin Transform: M131-M133 Fair Probability ────────────────────────────────
  // Basit normalizasyon (1/o / Σ(1/o)) longshot yanlılığını içerir.
  // Shin (1993): insider bilgisi modelinden türetilmiş fair probability dönüşümü.
  // Overround ve longshot bias birlikte giderilir.
  if (M131 != null && M132 != null && M133 != null) {
    const w1 = M131 / 100, wX = M132 / 100, w2 = M133 / 100;
    const W = w1 + wX + w2;
    if (W > 1.001) {
      const z = Math.max(0, Math.min(0.5, (W - 1) / W)); // margin fraction
      const shin = (wi) => {
        const qi = wi / W;
        if (z >= 1) return qi;
        const disc = Math.sqrt(z * z + 4 * (1 - z) * qi * qi);
        return (disc - z) / (2 * (1 - z));
      };
      const s1 = shin(w1), sX = shin(wX), s2 = shin(w2);
      const sSum = s1 + sX + s2;
      if (sSum > 0) {
        M131 = +(s1 / sSum * 100).toFixed(2);
        M132 = +(sX / sSum * 100).toFixed(2);
        M133 = +(s2 / sSum * 100).toFixed(2);
      }
    }
  }

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

  // ── M180-M185: Piyasa Baskı İndeksleri ───────────────────────────────────────
  // extraordinary.md formülleri: σ = sigmoid, tablo pozisyonundan dinamik baskı
  const σ = (x) => 1 / (1 + Math.exp(-x));

  // Puan tablosu: sıralanmış, mevcut tur bilgisi
  const sortedRows = [...rows].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  const leaderPts = sortedRows[0]?.points ?? null;
  const totalRoundsCalc = teamCount >= 4 ? (teamCount - 1) * 2 : null;
  const matchesLeftCalc = (totalRoundsCalc != null && currentRound != null)
    ? Math.max(0, totalRoundsCalc - currentRound) : null;

  // Küme düşme sınırı: relegation/playoff zone'un en yüksek puanı
  const relegRows = rows.filter(r =>
    r.promotion?.text?.toLowerCase().includes('relegation') ||
    r.promotion?.text?.toLowerCase().includes('playoff') ||
    r.promotion?.text?.toLowerCase().includes('düşme')
  );
  const safetyBoundaryPts = relegRows.length > 0
    ? Math.max(...relegRows.map(r => r.points ?? 0)) : null;

  // M180: Ev sahibi küme düşme baskısı
  const M180 = (homePoints != null && safetyBoundaryPts != null && matchesLeftCalc != null)
    ? +σ((safetyBoundaryPts - homePoints) / (matchesLeftCalc + 1)).toFixed(4) : null;

  // M181: Deplasman küme düşme baskısı
  const M181 = (awayPoints != null && safetyBoundaryPts != null && matchesLeftCalc != null)
    ? +σ((safetyBoundaryPts - awayPoints) / (matchesLeftCalc + 1)).toFixed(4) : null;

  // Şampiyonluk hedefi: yalnızca üst %40'da olan takımlar için anlamlı
  const topN = Math.ceil(rows.length * 0.40);

  // M182: Ev sahibi şampiyonluk/Avrupa baskısı
  const M182 = (homePos != null && homePos <= topN &&
    homePoints != null && leaderPts != null && matchesLeftCalc != null)
    ? +σ((leaderPts - homePoints) / (matchesLeftCalc + 1)).toFixed(4) : null;

  // M183: Deplasman şampiyonluk/Avrupa baskısı
  const M183 = (awayPos != null && awayPos <= topN &&
    awayPoints != null && leaderPts != null && matchesLeftCalc != null)
    ? +σ((leaderPts - awayPoints) / (matchesLeftCalc + 1)).toFixed(4) : null;

  // M184: Tablo sıkışıklığı — ev sahibi çevresi
  // TableCompression = 1 / (1 + |GapAbove| + |GapBelow|)
  const homeGapAbove = (homePos != null && homePos > 1 && sortedRows[homePos - 2])
    ? Math.abs((homeRow?.points ?? 0) - (sortedRows[homePos - 2]?.points ?? 0)) : 0;
  const homeGapBelow = (homePos != null && sortedRows[homePos])
    ? Math.abs((homeRow?.points ?? 0) - (sortedRows[homePos]?.points ?? 0)) : 0;
  const M184 = +(1 / (1 + homeGapAbove + homeGapBelow)).toFixed(4);

  // M185: Tablo sıkışıklığı — deplasman çevresi
  const awayGapAbove = (awayPos != null && awayPos > 1 && sortedRows[awayPos - 2])
    ? Math.abs((awayRow?.points ?? 0) - (sortedRows[awayPos - 2]?.points ?? 0)) : 0;
  const awayGapBelow = (awayPos != null && sortedRows[awayPos])
    ? Math.abs((awayRow?.points ?? 0) - (sortedRows[awayPos]?.points ?? 0)) : 0;
  const M185 = +(1 / (1 + awayGapAbove + awayGapBelow)).toFixed(4);

  // ── M186-M187: ResistanceIndex ────────────────────────────────────────────────
  // extraordinary.md: E[ActualPts - ExpectedPts | high-pressure matches]
  // Burada baskı filtresi standings verisinde yoksa global hesap yapılır.
  // ExpectedPPG: takımın gol atma/yeme lambdalarından Poisson ile beklenen puan.
  // ResistanceIndex > 0: takım beklentinin üzerinde performans → "dirençli"
  // ResistanceIndex < 0: beklentinin altında → "dirençsiz"
  const _pMF = (k, lam) => {
    if (lam <= 0) return k === 0 ? 1 : 0;
    let logFact = 0;
    for (let i = 2; i <= k; i++) logFact += Math.log(i);
    return Math.exp(-lam + k * Math.log(Math.max(lam, 1e-10)) - logFact);
  };
  const _expectedPPG = (lamFor, lamAgainst) => {
    if (!lamFor || !lamAgainst || lamFor <= 0 || lamAgainst <= 0) return null;
    let pW = 0, pD = 0;
    for (let h = 0; h <= 8; h++) {
      for (let a = 0; a <= 8; a++) {
        const p = _pMF(h, lamFor) * _pMF(a, lamAgainst);
        if (h > a) pW += p;
        else if (h === a) pD += p;
      }
    }
    return pW * 3 + pD;
  };

  const _rowPlayed = (row) => row?.matches ?? row?.played ?? 0;
  const homeActualPPG = (homeRow && _rowPlayed(homeRow) > 0) ? (homeRow.points || 0) / _rowPlayed(homeRow) : null;
  const awayActualPPG = (awayRow && _rowPlayed(awayRow) > 0) ? (awayRow.points || 0) / _rowPlayed(awayRow) : null;
  const homeLamFor = (homeRow && _rowPlayed(homeRow) > 0) ? (homeRow.scoresFor ?? homeRow.goalsFor ?? 0) / _rowPlayed(homeRow) : null;
  const homeLamAgainst = (homeRow && _rowPlayed(homeRow) > 0) ? (homeRow.scoresAgainst ?? homeRow.goalsAgainst ?? 0) / _rowPlayed(homeRow) : null;
  const awayLamFor = (awayRow && _rowPlayed(awayRow) > 0) ? (awayRow.scoresFor ?? awayRow.goalsFor ?? 0) / _rowPlayed(awayRow) : null;
  const awayLamAgainst = (awayRow && _rowPlayed(awayRow) > 0) ? (awayRow.scoresAgainst ?? awayRow.goalsAgainst ?? 0) / _rowPlayed(awayRow) : null;

  const homeExpPPG = _expectedPPG(homeLamFor, homeLamAgainst);
  const awayExpPPG = _expectedPPG(awayLamFor, awayLamAgainst);
  const M186 = (homeActualPPG != null && homeExpPPG != null)
    ? +(homeActualPPG - homeExpPPG).toFixed(4) : null;
  const M187 = (awayActualPPG != null && awayExpPPG != null)
    ? +(awayActualPPG - awayExpPPG).toFixed(4) : null;

  // ── M188-M189: ΔMarketMove (Açılış → Kapanış Piyasa Hareketi) ────────────────
  // extraordinary.md: logit(p_close) - logit(p_open)
  // > 0: piyasa kapanışa doğru bu sonucu MORE likely gördü (para geldi)
  // < 0: piyasa bu sonucu LESS likely gördü (para gitmedi)
  // null: açılış oranı API'den gelmedi
  const _logit = (p) => {
    const pc = Math.max(0.001, Math.min(0.999, p / 100));
    return Math.log(pc / (1 - pc));
  };
  // Açılış oranlarına da Shin uygula (kapanış M131 ile tutarlı)
  let M131_openShin = null, M132_openShin = null, M133_openShin = null;
  if (M131_open != null && M132_open != null && M133_open != null) {
    const wo1 = M131_open/100, woX = M132_open/100, wo2 = M133_open/100;
    const Wo = wo1 + woX + wo2;
    if (Wo > 1.001) {
      const zo = Math.max(0, Math.min(0.5, (Wo-1)/Wo));
      const shinO = (wi) => { const qi=wi/Wo; if(zo>=1)return qi; const d=Math.sqrt(zo*zo+4*(1-zo)*qi*qi); return (d-zo)/(2*(1-zo)); };
      const s1=shinO(wo1),sX=shinO(woX),s2=shinO(wo2),sS=s1+sX+s2;
      if(sS>0){ M131_openShin=s1/sS*100; M132_openShin=sX/sS*100; M133_openShin=s2/sS*100; }
    } else {
      M131_openShin = M131_open; M132_openShin = M132_open; M133_openShin = M133_open;
    }
  }

  const M188 = (M131 != null && M131_openShin != null)
    ? +(_logit(M131) - _logit(M131_openShin)).toFixed(4) : null; // Home market move
  const M189 = (M133 != null && M133_openShin != null)
    ? +(_logit(M133) - _logit(M133_openShin)).toFixed(4) : null; // Away market move

  return {
    M068, M075,
    // Pressing metrikleri home/away versiyonları:
    M177_home, M177_away, M178_home, M178_away, M179_home, M179_away,
    // Piyasa baskı indeksleri
    M180, M181, M182, M183, M184, M185,
    // ResistanceIndex + ΔMarketMove
    M186, M187, M188, M189,
    M131, M132, M133, M134, M134b, M134c, M134d, M135, M136, M137, M138, M139, M140,
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
      // Piyasa hareketi meta
      openingOddsAvailable: M131_openShin != null,
      openingHome: M131_openShin != null ? +M131_openShin.toFixed(2) : null,
      openingDraw: M132_openShin != null ? +M132_openShin.toFixed(2) : null,
      openingAway: M133_openShin != null ? +M133_openShin.toFixed(2) : null,
      // Ham decimal oranlar (kapanış)
      rawOdds: (rawOdds1 != null) ? { home: rawOdds1, draw: rawOddsX, away: rawOdds2 } : null,
      // Ham decimal oranlar (açılış)
      rawOpenOdds: (rawOpenOdds1 != null) ? { home: rawOpenOdds1, draw: rawOpenOddsX, away: rawOpenOdds2 } : null,
      // Oran değişim sinyalleri (SofaScore change field)
      oddsChange: (oddsChange1 != null || oddsChangeX != null || oddsChange2 != null)
        ? { home: oddsChange1, draw: oddsChangeX, away: oddsChange2 }
        : null,
      // ── Tüm Marketler (Genişletilmiş Bahis Paneli) ──
      allMarkets: (() => {
        if (!markets.length) return null;
        const parsed = [];
        for (const market of markets) {
          const mId = market.marketId;
          const mName = market.marketName || `Market ${mId}`;
          const group = market.choiceGroup ?? null;
          const choices = (market.choices || []).map(c => {
            const closing = parseOddsDecimal(c);
            // Açılış oranı
            let opening = null;
            if (c.initialFractionalValue) {
              const parts = String(c.initialFractionalValue).split('/');
              if (parts.length === 2) {
                const num = parseFloat(parts[0]), den = parseFloat(parts[1]);
                if (!isNaN(num) && !isNaN(den) && den > 0) opening = +((num + den) / den).toFixed(2);
              }
            }
            return {
              name: c.name,
              closing,
              opening,
              change: c.change ?? null,
              drift: (closing != null && opening != null) ? +(closing - opening).toFixed(2) : null,
            };
          }).filter(c => c.closing != null);
          if (choices.length === 0) continue;
          parsed.push({ id: mId, name: mName, group, choices });
        }
        return parsed.length > 0 ? parsed : null;
      })(),
      // ResistanceIndex meta
      homeResistance: M186, awayResistance: M187,
      homeExpPPG: homeExpPPG != null ? +homeExpPPG.toFixed(3) : null,
      awayExpPPG: awayExpPPG != null ? +awayExpPPG.toFixed(3) : null,
      homeActualPPG: homeActualPPG != null ? +homeActualPPG.toFixed(3) : null,
      awayActualPPG: awayActualPPG != null ? +awayActualPPG.toFixed(3) : null,
      // ── Bölge Detayı: Her takımın hangi bölgede olduğu ──
      homeZone: (() => {
        if (!homeRow?.promotion?.text) return null;
        const t = homeRow.promotion.text.toLowerCase();
        if (t.includes('champions')) return 'CL';
        if (t.includes('europa')) return 'EL';
        if (t.includes('conference')) return 'ECL';
        if (t.includes('promotion') && !t.includes('playoff')) return 'Promotion';
        if (t.includes('playoff') && !t.includes('relegation')) return 'Playoff';
        if (t.includes('relegation') && t.includes('playoff')) return 'Rel. Playoff';
        if (t.includes('relegation') || t.includes('düşme')) return 'Relegation';
        return homeRow.promotion.text || null;
      })(),
      awayZone: (() => {
        if (!awayRow?.promotion?.text) return null;
        const t = awayRow.promotion.text.toLowerCase();
        if (t.includes('champions')) return 'CL';
        if (t.includes('europa')) return 'EL';
        if (t.includes('conference')) return 'ECL';
        if (t.includes('promotion') && !t.includes('playoff')) return 'Promotion';
        if (t.includes('playoff') && !t.includes('relegation')) return 'Playoff';
        if (t.includes('relegation') && t.includes('playoff')) return 'Rel. Playoff';
        if (t.includes('relegation') || t.includes('düşme')) return 'Relegation';
        return awayRow.promotion.text || null;
      })(),
      homeZoneRaw: homeRow?.promotion?.text || null,
      awayZoneRaw: awayRow?.promotion?.text || null,
      // ── Fikstür Yoğunluğu ──
      // Son 5 maçtaki ortalama maç arası gün sayısı
      // Düşük gün = yoğun fikstür → yorgunluk/rotasyon riski
      fixtureCongest: (() => {
        const calcCongestion = (lastEvents) => {
          if (!Array.isArray(lastEvents) || lastEvents.length < 2) return null;
          const finished = lastEvents
            .filter(e => e.status?.type === 'finished' && e.startTimestamp)
            .sort((a, b) => b.startTimestamp - a.startTimestamp)
            .slice(0, 5);
          if (finished.length < 2) return null;
          let totalDays = 0;
          for (let i = 0; i < finished.length - 1; i++) {
            totalDays += Math.abs(finished[i].startTimestamp - finished[i + 1].startTimestamp) / 86400;
          }
          const avgDays = totalDays / (finished.length - 1);
          return +avgDays.toFixed(1);
        };
        return {
          home: calcCongestion(data.homeLastEvents),
          away: calcCongestion(data.awayLastEvents),
        };
      })(),
      // ── Kullanıcı Oylamaları ──
      votes: (M135 != null && M136 != null && M137 != null)
        ? { home: +M135.toFixed(1), draw: +M136.toFixed(1), away: +M137.toFixed(1) }
        : null,
      // ── Pressing Metrikleri ──
      pressing: {
        home: { intensity: M177_home, territory: M178_home, lineHeight: M179_home },
        away: { intensity: M177_away, territory: M178_away, lineHeight: M179_away },
      },
      // ── Taktik & Menajer ──
      tacticalDominance: M068,
      tacticalAdaptation: M075,
      stadiumCapacity: M138,
      managerExperience: M139,
      managerWinRate: M140,
      rankAdvantage: M175,
      formationClash: M176,
      leagueStrength: M144,
      transferValue: M145,
      pointDiff: M143,
      posDiff: M142,
      tournamentIntensity: M170,
      // ── Oran Hareketi Analizi (oddsChanges API) ──
      // API format: { changedOdds: [{ timestamp, choice1: { name, fractionalValue, changeFromInitial, changeFromLast }, ... }] }
      oddsMovement: (() => {
        const entries = oddsChanges?.changedOdds;
        if (!entries || entries.length === 0) return null;

        // fractional → decimal çevirici
        const frac2dec = (fv) => {
          if (!fv) return null;
          const parts = String(fv).split('/');
          if (parts.length !== 2) return null;
          const num = parseFloat(parts[0]), den = parseFloat(parts[1]);
          if (isNaN(num) || isNaN(den) || den === 0) return null;
          return +((num + den) / den).toFixed(2);
        };

        // İlk entry = açılış, son entry = kapanış
        const first = entries[0];
        const last = entries[entries.length - 1];

        // Her outcome (1, X, 2) için hareket analizi
        const outcomes = {};
        for (const key of ['choice1', 'choice2', 'choice3']) {
          const name = first[key]?.name;
          if (!name) continue;
          const openOdds = frac2dec(first[key]?.fractionalValue);
          const closeOdds = frac2dec(last[key]?.fractionalValue);
          const totalChangeFromInitial = last[key]?.changeFromInitial ?? null;

          // Kaç kez düştü, kaç kez yükseldi
          let ups = 0, downs = 0;
          for (let i = 1; i < entries.length; i++) {
            const cfl = entries[i][key]?.changeFromLast;
            if (cfl != null) {
              if (cfl > 0) ups++;
              else if (cfl < 0) downs++;
            }
          }
          const total = ups + downs;
          // direction: shortening = oran düşüyor = para giriyor
          const direction = downs > ups ? 'shortening' : ups > downs ? 'drifting' : 'stable';

          outcomes[name] = {
            openOdds, closeOdds,
            totalChangePercent: totalChangeFromInitial != null ? +totalChangeFromInitial.toFixed(1) : null,
            ups, downs, total,
            direction,
          };
        }

        // Timeline (basit özet — her hareket noktası)
        const timeline = entries.map(e => ({
          time: parseInt(e.timestamp) * 1000, // ms
          odds: {
            '1': frac2dec(e.choice1?.fractionalValue),
            'X': frac2dec(e.choice2?.fractionalValue),
            '2': frac2dec(e.choice3?.fractionalValue),
          },
        }));

        return {
          totalChanges: entries.length - 1, // ilk entry açılış, geri kalanı hareket
          outcomes,
          timeline,
        };
      })(),
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
