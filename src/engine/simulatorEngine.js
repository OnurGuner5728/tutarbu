/**
 * simulatorEngine.js — Tarayıcı tarafı, dakika-başı simülasyon motoru.
 * Sunucu tarafından hesaplanan birim skorları ve gerçek metrik olasılıklarını alır.
 * Sıfır keyfi katsayı — tüm temel olasılıklar gerçek veriden türetilir.
 */

const r = () => Math.random();
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Geometrik ortalama — eşit ağırlıklı, keyfi ağırlık katsayısı yok
const geo3 = (a, b, c) => Math.cbrt(Math.max(a, 0.01) * Math.max(b, 0.01) * Math.max(c, 0.01));
const geo2 = (a, b) => Math.sqrt(Math.max(a, 0.01) * Math.max(b, 0.01));

// ─── Model Yapı Sabitleri (server'daki sim-config.js ile eşleşir) ────────────
// Bu değerler olasılık katsayısı değil, simülasyon ölçeği tanımlarıdır.
// Kırmızı kart gücü penaltısı: araştırmalar 10'a düşen takımın atak gücünü
// ~40-60% kaybettiğini gösterir (Bauer et al. 2009, J.Quant.Anal.Sports).
const RC_INCREMENT = 0.5;  // Her kırmızı kartta birikimli ceza artışı
const RC_MAX       = 0.8;  // Maksimum ceza (en fazla %80 güç kaybı)
// Morale sistemi referans sınırları: birimler 1.0 etrafında normalize,
// 0.4 = tam çöküş, 1.6 = zirve motivasyon (birimin ±60% bandı)
const MORALE_SHIFT_SCALE = 10; // birim değer / bu sayı = morale kayması miktarı

export function createEngine({ homeUnits, awayUnits, lineups, weatherMult = {}, probBases = {} }) {
  const { goalMult = 1.0, errorMult = 1.0 } = weatherMult;
  const hPlayers = lineups?.home?.players || lineups?.home || null;
  const aPlayers = lineups?.away?.players || lineups?.away || null;

  // NOT: Bu fallback değerleri metric-metadata.js'deki M-kodu leagueAvg değerlerinden türetilmiştir.
  // probBases sunucudan gelmediğinde (multi-run mode vb.) bu değerler devreye girer.
  // M013=13, M014=4.5, M011=33, M034=12, M022=5.0, M039=1.8, M040=0.08, M020=75, M096=69, M019=0.12
  const pb = {
    home: {
      shotsPerMin:  probBases?.home?.shotsPerMin  ?? (13 / 90),   // M013 leagueAvg=13
      onTargetRate: probBases?.home?.onTargetRate ?? (4.5 / 13),  // M014/M013 leagueAvg=4.5/13
      goalConvRate: probBases?.home?.goalConvRate ?? 0.33,        // M011 leagueAvg=33%
      blockRate:    probBases?.home?.blockRate    ?? 0.12,        // M034 leagueAvg=12%
      cornerPerMin: probBases?.home?.cornerPerMin ?? (5.0 / 90), // M022 leagueAvg=5.0
      yellowPerMin: probBases?.home?.yellowPerMin ?? (1.8 / 90), // M039 leagueAvg=1.8
      redPerMin:    probBases?.home?.redPerMin    ?? (0.08 / 90),// M040 leagueAvg=0.08
      penConvRate:  probBases?.home?.penConvRate  ?? 0.75,       // M020 leagueAvg=75%
      gkSaveRate:   probBases?.home?.gkSaveRate   ?? 0.69,       // M096 leagueAvg=69%
      penPerMatch:  probBases?.home?.penPerMatch  ?? 0.12,       // M019 leagueAvg=0.12
      possessionBase: probBases?.home?.possessionBase ?? 0.50,  // M051 leagueAvg=50%
      avgGKSave:    probBases?.home?.avgGKSave    ?? 0.69,       // M096 leagueAvg=69% (referans)
    },
    away: {
      shotsPerMin:  probBases?.away?.shotsPerMin  ?? (13 / 90),
      onTargetRate: probBases?.away?.onTargetRate ?? (4.5 / 13),
      goalConvRate: probBases?.away?.goalConvRate ?? 0.33,
      blockRate:    probBases?.away?.blockRate    ?? 0.12,
      cornerPerMin: probBases?.away?.cornerPerMin ?? (5.0 / 90),
      yellowPerMin: probBases?.away?.yellowPerMin ?? (1.8 / 90),
      redPerMin:    probBases?.away?.redPerMin    ?? (0.08 / 90),
      penConvRate:  probBases?.away?.penConvRate  ?? 0.75,
      gkSaveRate:   probBases?.away?.gkSaveRate   ?? 0.69,
      penPerMatch:  probBases?.away?.penPerMatch  ?? 0.12,
      possessionBase: probBases?.away?.possessionBase ?? 0.50,
      avgGKSave:    probBases?.away?.avgGKSave    ?? 0.69,
    },
  };

  function u(side, key) {
    const units = side === 'home' ? homeUnits : awayUnits;
    return units[key] ?? 1.0;
  }

  const state = {
    home: { momentum: clamp(u('home', 'MOMENTUM_AKIŞI'), 0.5, 2.0), morale: 1.0, urgency: 1.0, redCardPenalty: 0 },
    away: { momentum: clamp(u('away', 'MOMENTUM_AKIŞI'), 0.5, 2.0), morale: 1.0, urgency: 1.0, redCardPenalty: 0 },
  };

  const goals = { home: 0, away: 0 };
  const stats = {
    home: { shots: 0, shotsOnTarget: 0, corners: 0, yellowCards: 0, redCards: 0, fouls: 0, penalties: 0 },
    away: { shots: 0, shotsOnTarget: 0, corners: 0, yellowCards: 0, redCards: 0, fouls: 0, penalties: 0 },
  };

  const expelledPlayers = { home: new Set(), away: new Set() };
  const playerYellows = { home: {}, away: {} };
  const subsDone = { home: 0, away: 0 };
  const subbedInNames = { home: new Set(), away: new Set() };
  const MAX_SUBS = 5;

  // Penaltı bütçesi: M019-tabanlı, ilk penaltıda tüm bütçe sıfırlanır
  const penBudget = { home: pb.home.penPerMatch, away: pb.away.penPerMatch };

  let minute = 0;

  // ── Oyuncu seçiciler ────────────────────────────────────────────────────────
  function pickActivePlayer(players, positions, side) {
    if (!players || !players.length) return null;
    const expelled = expelledPlayers[side];
    const pool = players.filter(p => {
      if (!p || p.substitute) return false;
      const name = p?.player?.name || p?.name || '';
      if (expelled.has(name)) return false;
      const pos = (p.player?.position || p.position || '').toUpperCase()[0];
      return !positions || positions.includes(pos);
    });
    const list = pool.length ? pool : players.filter(p => !p.substitute && !expelled.has(p?.player?.name || p?.name));
    if (!list.length) return null;
    const p = list[Math.floor(r() * list.length)];
    return p?.player?.name || p?.name || 'Oyuncu';
  }

  function pickSub(players, side) {
    if (!players || !players.length) return null;
    const expelled = expelledPlayers[side];
    const alreadySubbed = subbedInNames[side];
    const getName = p => p?.player?.name || p?.name || '';
    let pool = players.filter(p => p && p.substitute && !expelled.has(getName(p)) && !alreadySubbed.has(getName(p)));
    if (!pool.length) pool = players.filter(p => p && !expelled.has(getName(p)) && !alreadySubbed.has(getName(p)));
    if (!pool.length) return null;
    const p = pool[Math.floor(r() * pool.length)];
    const name = getName(p) || 'Yedek Oyuncu';
    alreadySubbed.add(name);
    p.substitute = false;
    return name;
  }

  // ── Güç hesaplamaları (geometrik ortalama — sıfır keyfi ağırlık) ────────────
  function getAttackPower(side, min) {
    const s = state[side];
    const oppSide = side === 'home' ? 'away' : 'home';
    // 3 saldırı biriminin geometrik ortalaması
    const atkUnit = geo3(u(side, 'BITIRICILIK'), u(side, 'YARATICILIK'), u(side, 'SUT_URETIMI'));
    // Form: kısa ve uzun vade geometrik ortalaması
    const formUnit = geo2(u(side, 'FORM_KISA'), u(side, 'FORM_UZUN'));
    // Anlık durum: momentum × morale geometrik ortalaması
    const stateUnit = geo2(s.momentum, s.morale);
    // Aciliyet: maç sonu penceresine normalize (60-95 dk)
    const urgency = (min > 60) ? s.urgency : 1.0;
    // Rakip savunmasının ters geometrik ortalaması — yüksek savunma → atak etkisi azalır
    const oppDefFactor = 1 / geo2(u(oppSide, 'SAVUNMA_DIRENCI'), u(oppSide, 'GK_REFLEKS'));
    return clamp(atkUnit * formUnit * stateUnit * urgency * oppDefFactor * (1 - s.redCardPenalty), 0.2, 5.0);
  }

  function getDefensePower(side) {
    const s = state[side];
    // 3 savunma biriminin geometrik ortalaması
    const defUnit = geo3(u(side, 'SAVUNMA_DIRENCI'), u(side, 'SAVUNMA_AKSIYONU'), u(side, 'GK_REFLEKS'));
    // Organizasyon: disiplin × kaleci alan hakimiyeti
    const orgUnit = geo2(u(side, 'DISIPLIN'), u(side, 'GK_ALAN_HAKIMIYETI'));
    return clamp(defUnit * orgUnit * (1 - s.redCardPenalty), 0.2, 5.0);
  }

  function getEffectiveUnits(side) {
    const units = side === 'home' ? homeUnits : awayUnits;
    const s = state[side];
    const effective = { ...units };
    const rcMult = (1 - s.redCardPenalty);
    effective['MOMENTUM_AKIŞI'] = clamp(u(side, 'MOMENTUM_AKIŞI') * s.momentum * rcMult, 0.2, 3.0);
    effective['ZİHİNSEL_DAYANIKLILIK'] = clamp(u(side, 'ZİHİNSEL_DAYANIKLILIK') * s.morale * rcMult, 0.2, 3.0);
    effective['GOL_IHTIYACI'] = clamp(u(side, 'GOL_IHTIYACI') * s.urgency * rcMult, 0.2, 4.0);
    effective['BITIRICILIK'] = (units['BITIRICILIK'] ?? 1) * s.morale * rcMult;
    effective['YARATICILIK'] = (units['YARATICILIK'] ?? 1) * s.morale * rcMult;
    effective['SAVUNMA_DIRENCI'] = (units['SAVUNMA_DIRENCI'] ?? 1) * s.morale * rcMult;
    return effective;
  }

  // ── Public API ───────────────────────────────────────────────────────────────
  return {
    getMinute: () => minute,
    getGoals: () => ({ ...goals }),
    isDone: () => minute >= 95,

    step() {
      if (minute >= 95) return null;
      minute++;

      const minuteEvents = [];

      if (minute === 46) {
        minuteEvents.push({ minute: 45, type: 'halftime', homeGoals: goals.home, awayGoals: goals.away });
      }

      // Aciliyet: GOL_IHTIYACI birimi × geçen sürenin maç sonu penceresine oranı
      if (minute > 60) {
        const timeRatio = (minute - 60) / (95 - 60);
        if (goals.away > goals.home) state.home.urgency = 1.0 + u('home', 'GOL_IHTIYACI') * timeRatio;
        if (goals.home > goals.away) state.away.urgency = 1.0 + u('away', 'GOL_IHTIYACI') * timeRatio;
      }

      const twHome = minute <= 20 ? u('home', 'MAC_BASLANGICI') : (minute > 75 ? u('home', 'MAC_SONU') : 1.0);
      const twAway = minute <= 20 ? u('away', 'MAC_BASLANGICI') : (minute > 75 ? u('away', 'MAC_SONU') : 1.0);

      for (const side of ['home', 'away']) {
        const isHome = side === 'home';
        const players = isHome ? hPlayers : aPlayers;
        const tw = isHome ? twHome : twAway;
        const oppSide = isHome ? 'away' : 'home';

        const attkProb = pb[side];
        const defProb  = pb[oppSide];

        const atkPower   = getAttackPower(side, minute) * tw;
        const oppDefPower = getDefensePower(oppSide);

        // ── ŞUT (M013-tabanlı) ────────────────────────────────────────────────
        const shotProb = clamp(attkProb.shotsPerMin * atkPower / Math.max(oppDefPower, 0.01), 0.001, 0.90);

        if (r() < shotProb) {
          stats[side].shots++;

          // Blok: M034-tabanlı, rakip savunma/atak gücü oranıyla ayarlanır
          const defAction = u(oppSide, 'SAVUNMA_AKSIYONU');
          const blockProb = clamp(defProb.blockRate * defAction * oppDefPower / Math.max(atkPower, 0.01), 0.001, 0.60);

          // İsabetli şut: M014/M013-tabanlı, bağlantı birimi ve hava durumu ile ayarlanır
          const accuracy = u(side, 'BAGLANTI_OYUNU') / Math.max(errorMult, 0.5);
          const onTargetProb = clamp(attkProb.onTargetRate * accuracy, 0.01, 0.90);

          if (r() < blockProb) {
            minuteEvents.push({ minute, type: 'shot_blocked', team: side, player: pickActivePlayer(players, ['F', 'M', 'A'], side) });

          } else if (r() < onTargetProb) {
            stats[side].shotsOnTarget++;

            // Gol: M011-tabanlı, rakip KK oranı her iki tarafın avgGKSave ortalamasına göre ayarlanır (gkAdj)
            const refAvgGKSave = (pb.home.avgGKSave + pb.away.avgGKSave) / 2;
            const gkAdj = clamp((1 - defProb.gkSaveRate) / Math.max(1 - refAvgGKSave, 0.01), 0.2, 4.0);
            // flow: doğal oran, keyfi sınır yok
            const flow = atkPower / Math.max(oppDefPower, 0.01);
            const goalProb = clamp(attkProb.goalConvRate * gkAdj * flow, 0.001, 0.90) * goalMult;

            if (r() < goalProb) {
              goals[side]++;
              const scorer = pickActivePlayer(players, ['F', 'M', 'A'], side);
              minuteEvents.push({ minute, type: 'goal', team: side, player: scorer });

              // Morale: yalnızca psikoloji birimleri — sabit büyüklük yok
              const scorerResil  = u(side, 'ZİHİNSEL_DAYANIKLILIK');
              const concFragil   = u(oppSide, 'PSIKOLOJIK_KIRILGANLIK');
              const concResil    = u(oppSide, 'ZİHİNSEL_DAYANIKLILIK');
              state[side].morale    = clamp(state[side].morale    + scorerResil / MORALE_SHIFT_SCALE,                              0.4, 1.6);
              state[side].momentum  = clamp(state[side].momentum  + scorerResil / MORALE_SHIFT_SCALE,                              0.5, 2.0);
              state[oppSide].morale = clamp(state[oppSide].morale - concFragil  / MORALE_SHIFT_SCALE + concResil / (MORALE_SHIFT_SCALE * 2), 0.4, 1.6);

            } else {
              minuteEvents.push({ minute, type: 'shot_on_target', team: side, player: pickActivePlayer(players, ['F', 'M', 'A'], side) });
            }

          } else {
            minuteEvents.push({ minute, type: 'shot_off_target', team: side, player: pickActivePlayer(players, ['F', 'M', 'A'], side) });
          }
        }

        // ── KORNER (M022-tabanlı) ─────────────────────────────────────────────
        const durTop = u(side, 'DURAN_TOP');
        const cornerProb = clamp(attkProb.cornerPerMin * durTop * atkPower / Math.max(oppDefPower, 0.01), 0.001, 0.50);
        if (r() < cornerProb) {
          stats[side].corners++;
          minuteEvents.push({ minute, type: 'corner', team: side });
        }

        // ── PENALTİ (M019-tabanlı) ────────────────────────────────────────────
        if (state[side].redCardPenalty === 0) {
          const curBudget = penBudget[side];
          const penProb = Math.max(curBudget, 0) / 90;
          if (r() < penProb) {
            penBudget[side] = 0; // Bütçenin tamamı tüketilir
            stats[side].penalties++;
            const penPlayer = pickActivePlayer(players, ['F', 'M'], side);
            minuteEvents.push({ minute, type: 'penalty', team: side, player: penPlayer });

            if (r() < attkProb.penConvRate) {  // M020-tabanlı
              goals[side]++;
              minuteEvents.push({ minute, type: 'goal', team: side, player: penPlayer, subtype: 'penalty' });
              const pScorResil  = u(side, 'ZİHİNSEL_DAYANIKLILIK');
              const pConcFragil = u(oppSide, 'PSIKOLOJIK_KIRILGANLIK');
              const pConcResil  = u(oppSide, 'ZİHİNSEL_DAYANIKLILIK');
              state[side].morale    = clamp(state[side].morale    + pScorResil  / 10,                     0.4, 1.6);
              state[oppSide].morale = clamp(state[oppSide].morale - pConcFragil / 10 + pConcResil / 20,   0.4, 1.6);
            } else {
              minuteEvents.push({ minute, type: 'penalty_missed', team: side, player: penPlayer });
            }
          }
        }

        // ── SARI / KIRMIZI KART (M039/M040-tabanlı) ───────────────────────────
        // 1/discUnit: disiplinli takımda oran azalır, disiplinsizde artar — saf ters orantı
        const discUnit = u(side, 'DISIPLIN');
        const yellowProb = clamp(attkProb.yellowPerMin / Math.max(discUnit, 0.1), 0.0001, 0.20);
        if (r() < yellowProb) {
          const cardPlayer = pickActivePlayer(players, null, side) || 'Oyuncu';
          const yellows = playerYellows[side];
          yellows[cardPlayer] = (yellows[cardPlayer] || 0) + 1;
          stats[side].yellowCards++;

          if (yellows[cardPlayer] >= 2 && !expelledPlayers[side].has(cardPlayer)) {
            expelledPlayers[side].add(cardPlayer);
            stats[side].redCards++;
            state[side].redCardPenalty = clamp(state[side].redCardPenalty + RC_INCREMENT, 0, RC_MAX);
            minuteEvents.push({ minute, type: 'red_card', team: side, player: cardPlayer, subtype: 'second_yellow' });
          } else if (!expelledPlayers[side].has(cardPlayer)) {
            const redProb = clamp(attkProb.redPerMin / Math.max(discUnit, 0.1), 0, 0.10);
            if (r() < redProb) {
              expelledPlayers[side].add(cardPlayer);
              stats[side].redCards++;
              state[side].redCardPenalty = clamp(state[side].redCardPenalty + RC_INCREMENT, 0, RC_MAX);
              minuteEvents.push({ minute, type: 'red_card', team: side, player: cardPlayer });
            } else {
              minuteEvents.push({ minute, type: 'yellow_card', team: side, player: cardPlayer });
            }
          }
        }

        // ── OYUNCU DEĞİŞİKLİĞİ ───────────────────────────────────────────────
        // Beklenen değişiklik sayısı: MAX_SUBS sınırına kadar, kalan dakikalara dinamik dağılım
        if (minute > 45 && subsDone[side] < MAX_SUBS) {
          const remainingMins = 95 - minute + 1;
          const remainingSubs = MAX_SUBS - subsDone[side];
          // Kalan subs / kalan dakika = her dakika için dinamik olasılık
          const subProb = remainingSubs / remainingMins;
          if (r() < subProb) {
            const subIn = pickSub(players, side);
            if (subIn) {
              subsDone[side]++;
              const subOut = pickActivePlayer(players, null, side);
              minuteEvents.push({ minute, type: 'substitution', team: side, playerIn: subIn, playerOut: subOut });
            }
          }
        }
      }

      // ── Topla Oynama (possession) — M051-tabanlı ────────────────────────────
      // M051-tabanlı possession: gerçek sezon possession % baz alınır, momentum farkı ile dinamik ayar
      const homePossBase = pb.home.possessionBase * 100; // M051 → %
      const awayPossBase = pb.away.possessionBase * 100;
      // İki takımın sezon possession'larını normalize et (toplamları 100 olsun)
      const possTotal = homePossBase + awayPossBase;
      const normalizedHomePoss = possTotal > 0 ? (homePossBase / possTotal) * 100 : 50;
      // Momentum farkı dinamik ayar
      const homePoss = clamp(
        normalizedHomePoss + (state.home.momentum - state.away.momentum) * 10,
        30, 70
      );

      return {
        minute,
        events: minuteEvents,
        behavioralState: { home: getEffectiveUnits('home'), away: getEffectiveUnits('away') },
        possession: { home: Math.round(homePoss), away: 100 - Math.round(homePoss) },
        goals: { ...goals },
        stats: {
          home: { ...stats.home, possession: Math.round(homePoss) },
          away: { ...stats.away, possession: 100 - Math.round(homePoss) },
        },
      };
    },
  };
}
