/**
 * simulatorEngine.js — Tarayıcı tarafı, dakika-başı simülasyon motoru.
 * Sunucu tarafından hesaplanan birim skorları ve gerçek metrik olasılıklarını alır.
 * Sıfır keyfi katsayı — tüm temel olasılıklar gerçek veriden türetilir.
 *
 * KRİTİK: Bu dosyada "magic number" YASAKTIR. Tüm nötr sabitler
 * SIM_CONFIG.NEUTRAL_DEFAULTS üzerinden referans edilir.
 */

// SIM_CONFIG client-side'da mevcut değildir (CommonJS) — inline sabitleri kullanıyoruz.
// Bu değerler sim-config.js/NEUTRAL_DEFAULTS ile birebir eşleşir.
const ND = {
  UNIT: 1.0,         // SIM_CONFIG.NEUTRAL_DEFAULTS.UNIT_IDENTITY
  POSSESSION: 0.50,  // SIM_CONFIG.NEUTRAL_DEFAULTS.POSSESSION_SYMMETRY
  COUNTER: 0,        // SIM_CONFIG.NEUTRAL_DEFAULTS.COUNTER_INIT
  WEATHER: 1.0,      // SIM_CONFIG.NEUTRAL_DEFAULTS.WEATHER_IDENTITY
};

const r = () => Math.random();
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Geometrik ortalama — eşit ağırlıklı, keyfi ağırlık katsayısı yok
const geo3 = (a, b, c) => Math.cbrt(Math.max(a, 0.01) * Math.max(b, 0.01) * Math.max(c, 0.01));
const geo2 = (a, b) => Math.sqrt(Math.max(a, 0.01) * Math.max(b, 0.01));

// ─── Model Yapı Sabitleri (server'daki sim-config.js ile eşleşir) ────────────
// Bu değerler olasılık katsayısı değil, simülasyon ölçeği tanımlarıdır.
// Kırmızı kart gücü penaltısı: araştırmalar 10'a düşen takımın atak gücünü
// ~40-60% kaybettiğini göstermektedir. goalMult/errorMult createEngine içinde
// weatherMult parametresinden destructure edilir — modül seviyesinde tanımsız.

const RC_MAX = 0.8;  // Maksimum ceza (en fazla %80 güç kaybı)
// Morale sistemi referans sınırları: birimler 1.0 etrafında normalize,
// 0.4 = tam çöküş, 1.6 = zirve motivasyon (birimin ±60% bandı)
const MORALE_SHIFT_SCALE = 10; // Eskiden kullanılan sabit (kaldırıldı ancak fallback referansı için tutuluyor)

// CASCADES: kaldırıldı — COMFORT_GOAL_THRESHOLD artık takımın gol/maç ortalamasından dinamik hesaplanıyor
export function createEngine({ homeUnits, awayUnits, lineups, weatherMult = {}, probBases = {}, leagueBaseline = {}, dynamicTimeWindows = null }) {
  // Dinamik EPS: lig gol ortalamasından türetilir — match-simulator ile tutarlı.
  const EPS = (leagueBaseline.leagueAvgGoals || 1) / 1000;
  const { goalMult = ND.WEATHER, errorMult = ND.WEATHER } = weatherMult;
  const hPlayers = lineups?.home?.players || lineups?.home || null;
  const aPlayers = lineups?.away?.players || lineups?.away || null;

  // Dynamic baseline — server tarafından hesaplanıp gönderilir.
  // Tüm nötr fallback'lar ND (Neutral Defaults) üzerinden.
  const LB = leagueBaseline;

  // Dinamik zaman pencereleri: M005-M010 gol dağılımından türetilir, veri yoksa statik fallback
  const earlyBase = dynamicTimeWindows?.EARLY_GAME_END ?? 20;
  const lateBase = dynamicTimeWindows?.LATE_GAME_START ?? 75;

  // probBases sunucudan gelmediğinde (multi-run mode vb.) leagueBaseline devreye girer.
  // Hardcoded sayısal sabit YOK — tüm fallback'lar LB üzerinden.
  const pb = {
    home: {
      shotsPerMin: probBases?.home?.shotsPerMin ?? LB.shotsPerMin,
      onTargetRate: probBases?.home?.onTargetRate ?? LB.onTargetRate,
      goalConvRate: probBases?.home?.goalConvRate ?? LB.goalConvRate,
      blockRate: probBases?.home?.blockRate ?? LB.blockRate,
      cornerPerMin: probBases?.home?.cornerPerMin ?? LB.cornerPerMin,
      yellowPerMin: probBases?.home?.yellowPerMin ?? LB.yellowPerMin,
      redPerMin: probBases?.home?.redPerMin ?? LB.redPerMin,
      penConvRate: probBases?.home?.penConvRate ?? LB.penConvRate,
      gkSaveRate: probBases?.home?.gkSaveRate ?? LB.gkSaveRate,
      penPerMatch: probBases?.home?.penPerMatch ?? LB.penPerMatch,
      possessionBase: probBases?.home?.possessionBase ?? LB.possessionBase ?? ND.POSSESSION,
      avgGKSave: probBases?.home?.avgGKSave ?? LB.gkSaveRate,
    },
    away: {
      shotsPerMin: probBases?.away?.shotsPerMin ?? LB.shotsPerMin,
      onTargetRate: probBases?.away?.onTargetRate ?? LB.onTargetRate,
      goalConvRate: probBases?.away?.goalConvRate ?? LB.goalConvRate,
      blockRate: probBases?.away?.blockRate ?? LB.blockRate,
      cornerPerMin: probBases?.away?.cornerPerMin ?? LB.cornerPerMin,
      yellowPerMin: probBases?.away?.yellowPerMin ?? LB.yellowPerMin,
      redPerMin: probBases?.away?.redPerMin ?? LB.redPerMin,
      penConvRate: probBases?.away?.penConvRate ?? LB.penConvRate,
      gkSaveRate: probBases?.away?.gkSaveRate ?? LB.gkSaveRate,
      penPerMatch: probBases?.away?.penPerMatch ?? LB.penPerMatch,
      possessionBase: probBases?.away?.possessionBase ?? LB.possessionBase ?? ND.POSSESSION,
      avgGKSave: probBases?.away?.avgGKSave ?? LB.gkSaveRate,
    },
  };

  function u(side, key) {
    const units = side === 'home' ? homeUnits : awayUnits;
    return units[key] ?? ND.UNIT;
  }

  const state = {
    home: { momentum: clamp(u('home', 'MOMENTUM_AKIŞI'), 0.5, 2.0), morale: 1.0, urgency: 1.0, redCardPenalty: 0 },
    away: { momentum: clamp(u('away', 'MOMENTUM_AKIŞI'), 0.5, 2.0), morale: 1.0, urgency: 1.0, redCardPenalty: 0 },
  };

  // NOT: homeUnits, awayUnits ve probBases sunucudan gelirken PVKD zaten uygulanmış olur.
  // (match-simulator.js simulateSingleRun + server.js computeProbBases posQF parametresiyle)
  // Bu tarafta tekrar uygulamak çift sayıma yol açar — PVKD bloğu burada bulunmaz.

  // Momentum → Possession duyarlılık katsayısı: lig gol dağılımından türetilir
  // Formül: possRange × leagueGoalVolatility / (leagueAvgGoals × momentumRange)
  // Volatil lig → momentum baskısı daha fazla possession değişimi yaratır
  const _mRange = 2.0 - 0.5; // SIM_CONFIG.LIMITS.MOMENTUM range
  const _pRange = 70 - 30;   // SIM_CONFIG.LIMITS.POSSESSION range
  const _lgVol = LB.leagueGoalVolatility ?? null;

  // Dinamik normalizasyon envelope — match-simulator.js ile BİREBİR AYNI kaynak.
  // LB.normMinRatio = min takım gol/maç ÷ lig ortalaması (league-averages.js türetir)
  // LB.normMaxRatio = max takım gol/maç ÷ lig ortalaması
  // Veri yoksa 1.0 identity (normalizasyon uygulanmaz).
  const _normMin = (LB.normMinRatio != null && LB.normMinRatio > 0) ? LB.normMinRatio : 1.0;
  const _normMax = (LB.normMaxRatio != null && LB.normMaxRatio > 0) ? LB.normMaxRatio : 1.0;
  // GOL_IHTIYACI üst satürasyonu: 1.0 etrafında simetrik uzantı
  const _ihtUpper = _normMax + (1.0 - _normMin);
  const momentumPossCoeff = (_lgVol != null && LB.leagueAvgGoals != null && LB.leagueAvgGoals > 0)
    ? _pRange * _lgVol / (LB.leagueAvgGoals * _mRange)
    : _pRange / (4 * _mRange); // saf geometri: ~6.67

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

  // Kırmızı kart ceza sınırları: match-simulator ile tutarlı — sıfır sabit.
  const _rcPenMax = RC_MAX;
  const _rcCV = (LB.leagueGoalVolatility != null && LB.leagueAvgGoals != null && LB.leagueAvgGoals > 0)
    ? LB.leagueGoalVolatility / LB.leagueAvgGoals : null;
  const _rcMedianCV = (LB.medianGoalRate != null && LB.leagueAvgGoals != null && LB.leagueAvgGoals > 0)
    ? Math.abs(LB.medianGoalRate - LB.leagueAvgGoals) / LB.leagueAvgGoals : null;
  const _rcMinPenalty = (_rcCV != null) ? _rcPenMax * _rcCV * _rcCV : null;
  const _rcMaxPenalty = (_rcCV != null && _rcMedianCV != null)
    ? _rcPenMax * _rcCV / (_rcCV + _rcMedianCV) : null;

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
    // Anlık durum: momentum × morale — formUnit stabilitesine göre sönümleme
    const rawState = geo2(s.momentum, s.morale);
    const stateDamp = Math.max(0.01, 1.0 - formUnit);
    const stateUnit = 1.0 + (rawState - 1.0) * stateDamp;
    // Aciliyet (Urgency) dinamik başlatma — earlyBase/lateBase dinamik zaman pencerelerinden
    const urgencyStart = Math.max(0, lateBase - (lateBase - earlyBase) * Math.max(0, clamp(u(side, 'GOL_IHTIYACI'), 1.0, _ihtUpper) - 1.0));
    const urgency = (min > urgencyStart) ? s.urgency : 1.0;

    // ── Maç Yönetimi (Konfor Freni) ──
    // Konfor eşiği takımın beklenen gol ortalamasından türetilir:
    // Düşük gol ort. (0.8) → 1 gol fark yeterli, yüksek (2.5) → 3 gol fark gerekli
    const expectedGoals = pb[side].shotsPerMin * 90 * pb[side].onTargetRate * pb[side].goalConvRate;
    const comfortThreshold = Math.max(1, Math.ceil(expectedGoals));
    let comfortBrake = 1.0;
    const goalDiff = goals[side] - goals[oppSide];
    if (goalDiff >= comfortThreshold) {
      // comfortBrake = (ZİHİNSEL/FİŞİ) × (takımın beklenen gol/maç ÷ lig ortalaması gol/maç)
      // → nötr nokta "1.0" değil, takımın kendi gol profili
      // Bayern (2.5 gol/maç) önde olunca da basar; Atletico (0.9) geriler
      const oppSide_ = side === 'home' ? 'away' : 'home';
      const oppExpGoals = pb[oppSide_].shotsPerMin * 90 * pb[oppSide_].onTargetRate * pb[oppSide_].goalConvRate;
      const matchAvgGoals = (expectedGoals + oppExpGoals) / 2;
      const leagueRef = LB.leagueAvgGoals ?? matchAvgGoals;
      comfortBrake = (u(side, 'ZİHİNSEL_DAYANIKLILIK') / u(side, 'FİŞİ_ÇEKME')) * (expectedGoals / leagueRef);
    }

    // Rakip savunma etkisi rawFlow = atkPower / defPower üzerinden zaten yansıtılıyor.
    // oppDefFactor burada KALDIRILDI — aksi hâlde savunma çift sayılır.
    return clamp(atkUnit * formUnit * stateUnit * urgency * comfortBrake * (1 - s.redCardPenalty), 0.5, 2.0);
  }

  function getDefensePower(side) {
    const s = state[side];
    const oppSide = side === 'home' ? 'away' : 'home';
    // 3 savunma biriminin geometrik ortalaması
    const defUnit = geo3(u(side, 'SAVUNMA_DIRENCI'), u(side, 'SAVUNMA_AKSIYONU'), u(side, 'GK_REFLEKS'));
    // Organizasyon: disiplin × kaleci alan hakimiyeti
    const orgUnit = geo2(u(side, 'DISIPLIN'), u(side, 'GK_ALAN_HAKIMIYETI'));

    // ── Skoru Koruma & Park the Bus ──
    // Konfor eşiği takımın beklenen gol ortalamasından dinamik hesaplanır
    const expGoals = pb[side].shotsPerMin * 90 * pb[side].onTargetRate * pb[side].goalConvRate;
    const defComfortThreshold = Math.max(1, Math.ceil(expGoals));
    let comfortBoost = 1.0;
    const goalDiff = goals[side] - goals[oppSide];
    if (goalDiff >= defComfortThreshold) {
      comfortBoost = clamp(1 / Math.max(u(side, 'FİŞİ_ÇEKME'), EPS), _normMin, _normMax);
    }

    return clamp(defUnit * orgUnit * comfortBoost * (1 - s.redCardPenalty), 0.5, 2.0);
  }

  function getEffectiveUnits(side) {
    const units = side === 'home' ? homeUnits : awayUnits;
    const s = state[side];
    const effective = { ...units };
    const rcMult = (1 - s.redCardPenalty);
    effective['MOMENTUM_AKIŞI'] = clamp(u(side, 'MOMENTUM_AKIŞI') * s.momentum * rcMult, 0.2, 3.0);
    effective['ZİHİNSEL_DAYANIKLILIK'] = clamp(u(side, 'ZİHİNSEL_DAYANIKLILIK') * s.morale * rcMult, 0.2, 3.0);
    effective['GOL_IHTIYACI'] = clamp(u(side, 'GOL_IHTIYACI') * s.urgency * rcMult, 0.2, 4.0);
    effective['BITIRICILIK'] = (units['BITIRICILIK'] ?? ND.UNIT) * s.morale * rcMult;
    effective['YARATICILIK'] = (units['YARATICILIK'] ?? ND.UNIT) * s.morale * rcMult;
    effective['SAVUNMA_DIRENCI'] = (units['SAVUNMA_DIRENCI'] ?? ND.UNIT) * s.morale * rcMult;
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

      // Urgency başlangıcı: neutral takım lateBase'de başlar, GOL_IHTIYACI arttıkça öne çekilir
      const homeUrgencyStart = Math.max(0, lateBase - (lateBase - earlyBase) * Math.max(0, clamp(u('home', 'GOL_IHTIYACI'), 1.0, _ihtUpper) - 1.0));
      const awayUrgencyStart = Math.max(0, lateBase - (lateBase - earlyBase) * Math.max(0, clamp(u('away', 'GOL_IHTIYACI'), 1.0, _ihtUpper) - 1.0));

      if (minute > homeUrgencyStart || minute > awayUrgencyStart) {
        if (goals.away > goals.home && minute > homeUrgencyStart) {
          const timeRatio = (minute - homeUrgencyStart) / (95 - homeUrgencyStart);
          state.home.urgency = 1.0 + u('home', 'GOL_IHTIYACI') * timeRatio;
        }
        if (goals.home > goals.away && minute > awayUrgencyStart) {
          const timeRatio = (minute - awayUrgencyStart) / (95 - awayUrgencyStart);
          state.away.urgency = 1.0 + u('away', 'GOL_IHTIYACI') * timeRatio;
        }
      }

      // Erken oyun fazı: neutral takım earlyBase'e kadar sürer, GOL_IHTIYACI yüksekse kısalır.
      // density/(density+1) saturasyon formu — clamp + sabit 0.6/0.08/0.8 kaldırıldı.
      const _urgencyEarlyFactor = (LB.leaguePointDensity != null && LB.leaguePointDensity >= 0)
        ? LB.leaguePointDensity / (LB.leaguePointDensity + 1)
        : 0;
      const homeEarlyEnd = Math.max(0, earlyBase - earlyBase * _urgencyEarlyFactor * Math.max(0, u('home', 'GOL_IHTIYACI') - 1.0));
      const awayEarlyEnd = Math.max(0, earlyBase - earlyBase * _urgencyEarlyFactor * Math.max(0, u('away', 'GOL_IHTIYACI') - 1.0));
      const twHome = minute <= homeEarlyEnd ? u('home', 'MAC_BASLANGICI') : (minute > homeUrgencyStart ? u('home', 'MAC_SONU') : 1.0);
      const twAway = minute <= awayEarlyEnd ? u('away', 'MAC_BASLANGICI') : (minute > awayUrgencyStart ? u('away', 'MAC_SONU') : 1.0);

      for (const side of ['home', 'away']) {
        const isHome = side === 'home';
        const players = isHome ? hPlayers : aPlayers;
        const tw = isHome ? twHome : twAway;
        const oppSide = isHome ? 'away' : 'home';

        const attkProb = pb[side];
        const defProb = pb[oppSide];

        const atkPower = getAttackPower(side, minute) * tw;
        const oppDefPower = getDefensePower(oppSide);

        // Azalan verimler: pow(rawFlow, blockRate) — doğal logaritmik sönümleme
        // dampCoeff = defProb.blockRate (M034 verisi) — statik sınır yok, veri konuşur
        const rawFlow = atkPower / Math.max(oppDefPower, EPS);
        const dampCoeff = defProb.blockRate;
        const dampedFlow = Math.pow(Math.max(rawFlow, 0.01), dampCoeff);
        const shotProb = clamp(attkProb.shotsPerMin * dampedFlow, 0.001, 1 - EPS);

        if (r() < shotProb) {
          stats[side].shots++;

          // Blok: M034-tabanlı, rakip savunma/atak gücü oranıyla ayarlanır
          const defAction = u(oppSide, 'SAVUNMA_AKSIYONU');
          const blockProb = clamp(defProb.blockRate * defAction * oppDefPower / Math.max(atkPower, EPS), 0.001, 0.60);

          // KRİTİK: onTargetRate = M014/M013 (gerçek sezon SOT oranı) — BAGLANTI_OYUNU burada çift sayma olur
          // adjustedOnTargetRate: blok sonrası kalan şutların isabetli olma olasılığı
          // P(isabet | bloklanmamış) = rawOnTargetRate / (1 - blockRate)
          const adjustedOnTargetRate = attkProb.onTargetRate / Math.max(1 - defProb.blockRate, EPS);
          const onTargetProb = clamp(adjustedOnTargetRate / Math.max(errorMult, EPS), 0.01, 0.90);

          if (r() < blockProb) {
            minuteEvents.push({ minute, type: 'shot_blocked', team: side, player: pickActivePlayer(players, ['F', 'M', 'A'], side) });

          } else if (r() < onTargetProb) {
            stats[side].shotsOnTarget++;

            // gkAdj: rakip KK oranı lig ortalamasına göre normalize — veri yoksa lig ortalaması (gkAdj=1.0)
            const refAvgGKSave = (pb.home.avgGKSave + pb.away.avgGKSave) / 2;
            const defGKSave = defProb.gkSaveRate ?? refAvgGKSave;
            const rawGkAdj = (1 - defGKSave) / Math.max(1 - refAvgGKSave, 0.01);
            const gkAdj = Math.sqrt(Math.max(rawGkAdj, 0.01));
            // Kalite üstünlüğü daha temiz fırsatlar üretir — flow çarpanı kaldırıldı
            const goalProb = clamp(attkProb.goalConvRate * gkAdj, 0.001, 1 - EPS) * goalMult;

            if (r() < goalProb) {
              goals[side]++;
              const scorer = pickActivePlayer(players, ['F', 'M', 'A'], side);
              minuteEvents.push({ minute, type: 'goal', team: side, player: scorer });

              // Morale cascade: goalConvRate / expected shots ile normalize ederek per-gol etkisi hesaplanır
              const scorerKillerInst = u(side, 'FİŞİ_ÇEKME');
              const concFragil = u(oppSide, 'PSIKOLOJIK_KIRILGANLIK');
              const goalDampening = 1.0 / (goals[side] + 1);
              // goalConvRate / (shotsPerMin × 90) = gol başına normalize edilmiş boost (~0.02-0.04)
              const expectedShots = Math.max(attkProb.shotsPerMin * 90, 1);
              const normalizedConv = attkProb.goalConvRate / expectedShots;
              const positiveBoost = normalizedConv * scorerKillerInst * goalDampening;
              const oppExpectedShots = Math.max(defProb.shotsPerMin * 90, 1);
              const negNormalizedConv = defProb.goalConvRate / oppExpectedShots;
              const negativeDrop = negNormalizedConv * concFragil * goalDampening;

              state[side].morale = clamp(state[side].morale + positiveBoost, _normMin, _normMax);
              state[side].momentum = clamp(state[side].momentum + positiveBoost * attkProb.onTargetRate, _normMin, _normMax + _normMax - 1);

              state[oppSide].morale = clamp(state[oppSide].morale - negativeDrop, _normMin, _normMax);

            } else {
              minuteEvents.push({ minute, type: 'shot_on_target', team: side, player: pickActivePlayer(players, ['F', 'M', 'A'], side) });
            }

          } else {
            minuteEvents.push({ minute, type: 'shot_off_target', team: side, player: pickActivePlayer(players, ['F', 'M', 'A'], side) });
          }
        }

        // Korner — takımın kendi üretim kapasitesine dayalı, baskıdan bağımsız
        const cornerProb = clamp(attkProb.cornerPerMin, 0.001, LB.cornerPerMin != null ? LB.cornerPerMin * 3 : 1 - EPS);
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
              const pScorResil = u(side, 'ZİHİNSEL_DAYANIKLILIK');
              const pScorKillerInst = u(side, 'FİŞİ_ÇEKME');
              const pConcFragil = u(oppSide, 'PSIKOLOJIK_KIRILGANLIK');

              // Penaltı morale cascade — normalize edilmiş
              const goalDampening = 1.0 / (goals[side] + 1);
              const expectedShots = Math.max(attkProb.shotsPerMin * 90, 1);
              const posBoost = (attkProb.goalConvRate / expectedShots) * pScorKillerInst * goalDampening;
              const oppExpShots = Math.max(defProb.shotsPerMin * 90, 1);
              const negDrop = (defProb.goalConvRate / oppExpShots) * pConcFragil * goalDampening;

              state[side].morale = clamp(state[side].morale + posBoost, _normMin, _normMax);
              state[oppSide].morale = clamp(state[oppSide].morale - negDrop, _normMin, _normMax);
            } else {
              minuteEvents.push({ minute, type: 'penalty_missed', team: side, player: penPlayer });
            }
          }
        }

        // ── SARI / KIRMIZI KART (M039/M040-tabanlı) ───────────────────────────
        // 1/discUnit: disiplinli takımda oran azalır, disiplinsizde artar — saf ters orantı
        const discUnit = u(side, 'DISIPLIN');
        const yellowProb = clamp(attkProb.yellowPerMin / Math.max(discUnit, EPS), 0.0001, 0.20);
        if (r() < yellowProb) {
          const cardPlayer = pickActivePlayer(players, null, side) || 'Oyuncu';
          const yellows = playerYellows[side];
          yellows[cardPlayer] = (yellows[cardPlayer] || ND.COUNTER) + 1;
          stats[side].yellowCards++;

          if (yellows[cardPlayer] >= 2 && !expelledPlayers[side].has(cardPlayer)) {
            expelledPlayers[side].add(cardPlayer);
            stats[side].redCards++;

            // Kırmızı kart motor çöküşü (RC_INCREMENT) tamamen Disiplin ve Dayanıklılık gücüne tezat orantılı işler
            const resilience = geo2(u(side, 'DISIPLIN'), u(side, 'ZİHİNSEL_DAYANIKLILIK'));
            const organicPenalty = (_rcMinPenalty != null && _rcMaxPenalty != null)
              ? (() => {
                const activePlayers = Math.max(1, 11 - expelledPlayers[side].size);
                const basePen = RC_MAX / activePlayers;
                return clamp(basePen / Math.max(resilience, EPS), _rcMinPenalty, _rcMaxPenalty);
              })()
              : 0;

            state[side].redCardPenalty = clamp(state[side].redCardPenalty + organicPenalty, 0, RC_MAX);
            minuteEvents.push({ minute, type: 'red_card', team: side, player: cardPlayer, subtype: 'second_yellow' });
          } else if (!expelledPlayers[side].has(cardPlayer)) {
            const redProb = clamp(attkProb.redPerMin / Math.max(discUnit, EPS), 0, 0.10);
            if (r() < redProb) {
              expelledPlayers[side].add(cardPlayer);
              stats[side].redCards++;

              const resilience = geo2(u(side, 'DISIPLIN'), u(side, 'ZİHİNSEL_DAYANIKLILIK'));
              const organicPenalty = (_rcMinPenalty != null && _rcMaxPenalty != null)
                ? (() => {
                  const activePlayers = Math.max(1, 11 - expelledPlayers[side].size);
                  const basePen = RC_MAX / activePlayers;
                  return clamp(basePen / Math.max(resilience, EPS), _rcMinPenalty, _rcMaxPenalty);
                })()
                : 0;

              state[side].redCardPenalty = clamp(state[side].redCardPenalty + organicPenalty, 0, RC_MAX);
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
        normalizedHomePoss + (state.home.momentum - state.away.momentum) * momentumPossCoeff,
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
