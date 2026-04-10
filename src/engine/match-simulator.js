/**
 * match-simulator.js
 * 90-minute minute-by-minute match simulation engine.
 * Decoupled from static constants and fully driven by dynamic baselines.
 */

'use strict';

const { SIM_CONFIG } = require('./sim-config');
const { recordBaselineTrace, recordSimWarning } = require('./audit-helper');
const { computeWeatherMultipliers } = require('../services/weather-service');
const { METRIC_METADATA } = require('./metric-metadata');

// ─────────────────────────────────────────────────────────────────────────────
// Behavioral Units (Blocks)
// ─────────────────────────────────────────────────────────────────────────────

const SIM_BLOCKS = {
  // I. ATTACK
  BITIRICILIK: [
    { id: 'M011', weight: 3, sign: 1 }, { id: 'M012', weight: 2, sign: 1 },
    { id: 'M016', weight: 2, sign: 1 }, { id: 'M018', weight: 2, sign: 1 },
    { id: 'M020', weight: 1, sign: 1 }, { id: 'M156', weight: 1, sign: 1 }
  ],
  YARATICILIK: [
    { id: 'M015', weight: 3, sign: 1 }, { id: 'M017', weight: 2, sign: 1 },
    { id: 'M021', weight: 3, sign: 1 }, { id: 'M070', weight: 3, sign: 1 },
    { id: 'M072', weight: 2, sign: 1 }
  ],
  SUT_URETIMI: [
    { id: 'M013', weight: 3, sign: 1 }, { id: 'M014', weight: 3, sign: 1 },
    { id: 'M001', weight: 2, sign: 1 }, { id: 'M002', weight: 2, sign: 1 }
  ],
  HAVA_HAKIMIYETI: [
    { id: 'M036', weight: 2, sign: 1 }, { id: 'M076', weight: 2, sign: 1 },
    { id: 'M085', weight: 1, sign: 1 }
  ],
  DURAN_TOP: [
    { id: 'M023', weight: 2, sign: 1 }, { id: 'M024', weight: 2, sign: 1 },
    { id: 'M019', weight: 1, sign: 1 }
  ],

  // II. DEFENSE
  SAVUNMA_DIRENCI: [
    { id: 'M026', weight: 3, sign: -1 }, { id: 'M028', weight: 3, sign: 1 },
    { id: 'M033', weight: 2, sign: -1 }, { id: 'M157', weight: 2, sign: 1 }
  ],
  SAVUNMA_AKSIYONU: [
    { id: 'M034', weight: 2, sign: 1 }, { id: 'M035', weight: 2, sign: 1 },
    { id: 'M037', weight: 2, sign: 1 }, { id: 'M044', weight: 1, sign: -1 }
  ],
  GK_REFLEKS: [
    { id: 'M096', weight: 3, sign: 1 }, { id: 'M098', weight: 3, sign: 1 },
    { id: 'M102', weight: 2, sign: 1 }, { id: 'M108', weight: 2, sign: 1 }
  ],
  GK_ALAN_HAKIMIYETI: [
    { id: 'M100', weight: 2, sign: 1 }, { id: 'M101', weight: 1, sign: 1 },
    { id: 'M107', weight: 2, sign: 1 }
  ],

  // III. PSYCHOLOGY
  ZİHİNSEL_DAYANIKLILIK: [
    { id: 'M064', weight: 3, sign: 1 }, { id: 'M165', weight: 2, sign: 1 },
    { id: 'M043', weight: 2, sign: 1 }
  ],
  PSIKOLOJIK_KIRILGANLIK: [
    { id: 'M042', weight: 3, sign: 1 }, { id: 'M041', weight: 2, sign: 1 },
    { id: 'M090', weight: 1, sign: 1 }
  ],
  DISIPLIN: [
    { id: 'M038', weight: 1, sign: -1 }, { id: 'M039', weight: 2, sign: -1 },
    { id: 'M040', weight: 3, sign: -1 }
  ],
  MOMENTUM_AKIŞI: [
    { id: 'M164', weight: 3, sign: 1 }, { id: 'M146', weight: 2, sign: 1 },
    { id: 'M149', weight: 2, sign: 1 }
  ],

  // IV. CONTEXT & STRATEGY
  FORM_KISA: [
    { id: 'M046', weight: 3, sign: 1 }, { id: 'M049', weight: 2, sign: 1 },
    { id: 'M053', weight: 2, sign: 1 }, { id: 'M092', weight: 1, sign: 1 }
  ],
  FORM_UZUN: [
    { id: 'M047', weight: 3, sign: 1 }, { id: 'M048', weight: 2, sign: 1 },
    { id: 'M158', weight: 2, sign: 1 }
  ],
  MAC_BASLANGICI: [
    { id: 'M062', weight: 3, sign: 1 }, { id: 'M031', weight: 2, sign: -1 },
    { id: 'M005', weight: 1, sign: 1 }
  ],
  MAC_SONU: [
    { id: 'M032', weight: 3, sign: -1 }, { id: 'M080', weight: 2, sign: 1 },
    { id: 'M010', weight: 1, sign: 1 }
  ],
  MENAJER_STRATEJISI: [
    { id: 'M139', weight: 2, sign: 1 }, { id: 'M140', weight: 3, sign: 1 }
  ],
  TURNUVA_BASKISI: [
    { id: 'M141', weight: 3, sign: 1 }, { id: 'M163', weight: 2, sign: 1 }
  ],
  GOL_IHTIYACI: [
    { id: 'M165', weight: 3, sign: 1 }, { id: 'M141', weight: 1, sign: 1 }
  ],

  // V. OPERATIONAL
  TOPLA_OYNAMA: [
    { id: 'M025', weight: 3, sign: 1 }, { id: 'M150', weight: 3, sign: 1 }
  ],
  BAGLANTI_OYUNU: [
    { id: 'M152', weight: 2, sign: 1 }, { id: 'M154', weight: 2, sign: 1 }
  ],
  KADRO_DERINLIGI: [
    { id: 'M067', weight: 2, sign: 1 }, { id: 'M079', weight: 2, sign: 1 },
    { id: 'M088', weight: 1, sign: 1 }
  ],
  H2H_DOMINASYON: [
    { id: 'M119', weight: 2, sign: 1 }, { id: 'M122', weight: 3, sign: 1 },
    { id: 'M162', weight: 2, sign: 1 }
  ],
  HAKEM_DINAMIKLERI: [
    { id: 'M111', weight: 2, sign: 1 }, { id: 'M118b', weight: 3, sign: 1 },
    { id: 'M117', weight: 1, sign: 1 }
  ],
  TAKTIKSEL_UYUM: [
    { id: 'M169', weight: 3, sign: 1 }
  ]
};

function getM(metrics, selected, id) {
  if (!selected.has(id)) return null;
  const v = metrics?.[id];
  return (v != null && isFinite(v)) ? v : null;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Compute metric-derived base probabilities for simulation.
 * Driven by the provided baseline object instead of static coefficients.
 */
function computeProbBases(metrics, sel, units, baseline, audit) {
  const gm = (id) => getM(metrics, sel, id);

  // Helper for baseline fallback with tracing
  const getBase = (key, metricId, unitKey) => {
    const val = gm(metricId);
    if (val != null) return val;
    const fallback = (units[unitKey] ?? 1.0) * baseline[key];
    recordBaselineTrace(audit, `Used dynamic baseline for ${key} (derived from ${unitKey})`);
    return fallback;
  };

  const shotsPerMatch = gm('M013');
  const shotsPerMin = shotsPerMatch != null ? shotsPerMatch / 90 : baseline.shotsPerMin * (units.SUT_URETIMI ?? 1.0);

  const m014 = gm('M014');
  const onTargetRate = (m014 != null && shotsPerMatch != null && shotsPerMatch > 0)
    ? m014 / shotsPerMatch
    : baseline.onTargetRate;

  const goalConvRate = getBase('goalConvRate', 'M011', 'BITIRICILIK');
  const blockRate = getBase('blockRate', 'M034', 'SAVUNMA_AKSIYONU');
  
  const m022 = gm('M022');
  const cornerPerMin = m022 != null ? m022 / 90 : baseline.cornerPerMin * (units.DURAN_TOP ?? 1.0);

  const m039 = gm('M039');
  const yellowPerMin = m039 != null ? m039 / 90 : baseline.yellowPerMin;

  const m040 = gm('M040');
  const redPerMin = m040 != null ? m040 / 90 : baseline.redPerMin;

  const m020 = gm('M020');
  const penConvRate = m020 != null ? m020 / 100 : baseline.penConvRate;

  const m096 = gm('M096');
  const gkSaveRate = m096 != null ? m096 / 100 : baseline.gkSaveRate * (units.GK_REFLEKS ?? 1.0);

  const m019 = gm('M019');
  const penPerMatch = m019 != null ? m019 : baseline.penPerMatch;

  // M051: sezon boyunca ortalama topla oynama (possession %) — 0-1 scale
  const m051 = gm('M051');
  const possessionBase = m051 != null
    ? m051 / 100
    : 0.50; // leagueAvg: iki takım birbirine eşit, %50 nötr başlangıç

  // avgGKSave: sunucu tarafında hesaplanıp client'a iletilecek (simulatorEngine AVG_GK_SAVE sabitini kaldırmak için)
  const avgGKSave = METRIC_METADATA.M096.leagueAvg / 100;

  return {
    shotsPerMin, onTargetRate, goalConvRate,
    blockRate, cornerPerMin, yellowPerMin,
    redPerMin, penConvRate, gkSaveRate, penPerMatch,
    possessionBase, avgGKSave
  };
}

function calculateUnitImpact(blockId, metrics, selected, audit) {
  const block = SIM_BLOCKS[blockId];
  if (!block) return 1.0;
  
  let totalWeight = 0;
  let weightedFactor = 0;
  let missingAny = false;

  for (const item of block) {
    const { id, weight, sign } = item;
    const val = getM(metrics, selected, id);
    if (val == null) {
      missingAny = true;
      continue;
    }

    // Since we are decoupling from METRIC_METADATA here where possible,
    // we use a generic normalization logic based on the value nature.
    // However, units like 'percent', 'index', 'score' are standardized.
    let normalized = 1.0;
    
    // We still need to know the 'type' of metric to normalize it.
    // For now, we assume the metric-calculator has already normalized many things
    // or we use standard ranges.
    if (val > 100) { // Likely a raw count
        normalized = 1.0 + clamp((val - 50) / 100, -0.15, 0.15); // Dynamic heuristic
    } else {
        normalized = 0.85 + (val / 100) * 0.3; // Percent/Index/Score heuristic
    }

    if (sign === -1) normalized = 2.0 - normalized;
    weightedFactor += normalized * weight;
    totalWeight += weight;
  }

  if (missingAny) {
    recordSimWarning(audit, `Unit ${blockId} calculation incomplete - using baseline scaling`);
  }

  return totalWeight > 0 ? weightedFactor / totalWeight : 1.0;
}

function simulateSingleRun({ homeMetrics, awayMetrics, selectedMetrics, lineups, weatherMetrics, baseline, rng, audit }) {
  const r = rng || Math.random;
  const { goalMult: weatherGoalMult, errorMult: weatherErrorMult } = computeWeatherMultipliers(weatherMetrics || {});
  const sel = selectedMetrics instanceof Set ? selectedMetrics : new Set(selectedMetrics || []);
  const hPlayers = lineups?.home?.players || lineups?.home || null;
  const aPlayers = lineups?.away?.players || lineups?.away || null;

  const goals = { home: 0, away: 0 };
  const stats = {
    home: { shots: 0, shotsOnTarget: 0, corners: 0, yellowCards: 0, redCards: 0, fouls: 0, penalties: 0 },
    away: { shots: 0, shotsOnTarget: 0, corners: 0, yellowCards: 0, redCards: 0, fouls: 0, penalties: 0 },
  };
  const events = [];
  const minuteLog = [];

  const homeUnits = {};
  const awayUnits = {};
  for (const blockId in SIM_BLOCKS) {
    homeUnits[blockId] = calculateUnitImpact(blockId, homeMetrics, sel, audit);
    awayUnits[blockId] = calculateUnitImpact(blockId, awayMetrics, sel, audit);
  }

  const hProb = computeProbBases(homeMetrics, sel, homeUnits, baseline, audit);
  const aProb = computeProbBases(awayMetrics, sel, awayUnits, baseline, audit);

  const state = {
    home: { momentum: homeUnits.MOMENTUM_AKIŞI, morale: 1.0, urgency: 1.0, redCardPenalty: 0 },
    away: { momentum: awayUnits.MOMENTUM_AKIŞI, morale: 1.0, urgency: 1.0, redCardPenalty: 0 }
  };

  const expelledPlayers = { home: new Set(), away: new Set() };
  const playerYellows = { home: {}, away: {} };
  const subsDone = { home: 0, away: 0 };

  const homePenBudget = getM(homeMetrics, sel, 'M019') ?? baseline.penPerMatch;
  const awayPenBudget = getM(awayMetrics, sel, 'M019') ?? baseline.penPerMatch;
  const penCurrentBudget = { home: homePenBudget, away: awayPenBudget };

  const geo3 = (a, b, c) => Math.cbrt(Math.max(a, 0.01) * Math.max(b, 0.01) * Math.max(c, 0.01));
  const geo2 = (a, b) => Math.sqrt(Math.max(a, 0.01) * Math.max(b, 0.01));

  const getAttackPower = (side, oppSide, minute) => {
    const u = side === 'home' ? homeUnits : awayUnits;
    const s = side === 'home' ? state.home : state.away;
    const oppU = oppSide === 'home' ? homeUnits : awayUnits;
    
    const atkUnit = geo3(u.BITIRICILIK, u.YARATICILIK, u.SUT_URETIMI);
    const formUnit = geo2(u.FORM_KISA, u.FORM_UZUN);
    const stateUnit = geo2(s.momentum, s.morale);
    const urgency = (minute > SIM_CONFIG.TIME.CRITICAL_MOMENT) ? s.urgency : 1.0;
    const oppDefFactor = 1 / geo2(oppU.SAVUNMA_DIRENCI, oppU.GK_REFLEKS);
    
    return clamp(atkUnit * formUnit * stateUnit * urgency * oppDefFactor * (1 - s.redCardPenalty), SIM_CONFIG.LIMITS.POWER.MIN, SIM_CONFIG.LIMITS.POWER.MAX);
  };

  const getDefensePower = (side) => {
    const u = side === 'home' ? homeUnits : awayUnits;
    const s = side === 'home' ? state.home : state.away;
    const defUnit = geo3(u.SAVUNMA_DIRENCI, u.SAVUNMA_AKSIYONU, u.GK_REFLEKS);
    const orgUnit = geo2(u.DISIPLIN, u.GK_ALAN_HAKIMIYETI);
    return clamp(defUnit * orgUnit * (1 - s.redCardPenalty), SIM_CONFIG.LIMITS.POWER.MIN, SIM_CONFIG.LIMITS.POWER.MAX);
  };

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
    return p?.player?.name || p?.name || SIM_CONFIG.LABELS.PLAYER;
  }

  const subbedInNames = { home: new Set(), away: new Set() };

  function pickSub(players, side) {
    if (!players || !players.length) return null;
    const expelled = expelledPlayers[side];
    const alreadySubbed = subbedInNames[side];
    const getName = p => p?.player?.name || p?.name || '';
    let pool = players.filter(p => p && p.substitute && !expelled.has(getName(p)) && !alreadySubbed.has(getName(p)));
    if (!pool.length) {
      pool = players.filter(p => p && !expelled.has(getName(p)) && !alreadySubbed.has(getName(p)));
    }
    if (!pool.length) return null;
    const p = pool[Math.floor(r() * pool.length)];
    const name = getName(p) || SIM_CONFIG.LABELS.SUB;
    alreadySubbed.add(name);
    p.substitute = false;
    return name;
  }

  const getEffectiveUnits = (side) => {
    const u = side === 'home' ? homeUnits : awayUnits;
    const s = side === 'home' ? state.home : state.away;
    const effective = { ...u };
    const rcMult = (1 - s.redCardPenalty);
    effective.MOMENTUM_AKIŞI = clamp(u.MOMENTUM_AKIŞI * s.momentum * rcMult, SIM_CONFIG.LIMITS.MOMENTUM.MIN, SIM_CONFIG.LIMITS.MOMENTUM.MAX);
    effective.ZİHİNSEL_DAYANIKLILIK = clamp(u.ZİHİNSEL_DAYANIKLILIK * s.morale * rcMult, SIM_CONFIG.LIMITS.MORALE.MIN, SIM_CONFIG.LIMITS.MORALE.MAX);
    effective.GOL_IHTIYACI = clamp(u.GOL_IHTIYACI * s.urgency * rcMult, SIM_CONFIG.LIMITS.URGENCY.MIN, SIM_CONFIG.LIMITS.URGENCY.MAX);
    effective.BITIRICILIK = u.BITIRICILIK * s.morale * rcMult;
    effective.YARATICILIK = u.YARATICILIK * s.morale * rcMult;
    effective.SAVUNMA_DIRENCI = u.SAVUNMA_DIRENCI * s.morale * rcMult;
    return effective;
  };

  for (let minute = 1; minute <= SIM_CONFIG.TIME.MATCH_END; minute++) {
    const minuteEvents = [];
    const pushEvent = (ev) => {
      events.push(ev);
      minuteEvents.push(ev);
    };

    if (minute === 46) {
      pushEvent({ minute: 45, type: 'halftime', homeGoals: goals.home, awayGoals: goals.away });
    }

    if (minute > SIM_CONFIG.TIME.CRITICAL_MOMENT) {
      const timeRatio = (minute - 60) / (95 - 60);
      if (goals.away > goals.home) state.home.urgency = 1.0 + homeUnits.GOL_IHTIYACI * timeRatio;
      if (goals.home > goals.away) state.away.urgency = 1.0 + awayUnits.GOL_IHTIYACI * timeRatio;
    }

    const twHome = minute <= SIM_CONFIG.TIME.EARLY_GAME_END ? homeUnits.MAC_BASLANGICI : (minute > SIM_CONFIG.TIME.LATE_GAME_START ? homeUnits.MAC_SONU : 1.0);
    const twAway = minute <= SIM_CONFIG.TIME.EARLY_GAME_END ? awayUnits.MAC_BASLANGICI : (minute > SIM_CONFIG.TIME.LATE_GAME_START ? awayUnits.MAC_SONU : 1.0);

    for (const side of ['home', 'away']) {
      const isHome = side === 'home';
      const atkPower = getAttackPower(side, isHome ? 'away' : 'home', minute) * (isHome ? twHome : twAway);
      const oppDefPower = getDefensePower(isHome ? 'away' : 'home');
      
      const attkProb = isHome ? hProb : aProb;
      const defProb  = isHome ? aProb : hProb;
      const shotProb = clamp(attkProb.shotsPerMin * atkPower / oppDefPower, SIM_CONFIG.LIMITS.PROBABILITY.MIN, SIM_CONFIG.LIMITS.PROBABILITY.MAX);

      if (r() < shotProb) {
        stats[side].shots++;
        const accuracy = (isHome ? homeUnits.BAGLANTI_OYUNU : awayUnits.BAGLANTI_OYUNU);
        const onTargetProb = clamp(attkProb.onTargetRate * accuracy / (weatherErrorMult || 1.0), SIM_CONFIG.LIMITS.ON_TARGET.MIN, SIM_CONFIG.LIMITS.ON_TARGET.MAX);
        const blockProb = clamp(defProb.blockRate * oppDefPower / Math.max(atkPower, 0.1), SIM_CONFIG.LIMITS.BLOCK.MIN, SIM_CONFIG.LIMITS.BLOCK.MAX);

        if (r() < blockProb) {
          pushEvent({ minute, type: 'shot_blocked', team: side, player: pickActivePlayer(isHome ? hPlayers : aPlayers, ['F', 'M', 'A'], side) });
        } else if (r() < onTargetProb) {
          stats[side].shotsOnTarget++;
          const flow = atkPower / Math.max(oppDefPower, 0.01);
          const gkAdj = clamp((1 - defProb.gkSaveRate) / Math.max(1 - baseline.gkSaveRate, 0.01), SIM_CONFIG.LIMITS.GK_ADJ.MIN, SIM_CONFIG.LIMITS.GK_ADJ.MAX);
          const goalProb = clamp(attkProb.goalConvRate * gkAdj * flow, SIM_CONFIG.LIMITS.PROBABILITY.MIN, SIM_CONFIG.LIMITS.PROBABILITY.MAX) * (weatherGoalMult || 1.0);

          if (r() < goalProb) {
            goals[side]++;
            pushEvent({ minute, type: 'goal', team: side, player: pickActivePlayer(isHome ? hPlayers : aPlayers, ['F', 'M', 'A'], side) });
            const sResil = isHome ? homeUnits.ZİHİNSEL_DAYANIKLILIK : awayUnits.ZİHİNSEL_DAYANIKLILIK;
            const cFragil = isHome ? awayUnits.PSIKOLOJIK_KIRILGANLIK : homeUnits.PSIKOLOJIK_KIRILGANLIK;
            const cResil = isHome ? awayUnits.ZİHİNSEL_DAYANIKLILIK : homeUnits.ZİHİNSEL_DAYANIKLILIK;
            if (isHome) {
              state.home.morale = clamp(state.home.morale + sResil / 10, SIM_CONFIG.LIMITS.MORALE.MIN, SIM_CONFIG.LIMITS.MORALE.MAX);
              state.home.momentum = clamp(state.home.momentum + sResil / 10, SIM_CONFIG.LIMITS.MOMENTUM.MIN, SIM_CONFIG.LIMITS.MOMENTUM.MAX);
              state.away.morale = clamp(state.away.morale - cFragil / 10 + cResil / 20, SIM_CONFIG.LIMITS.MORALE.MIN, SIM_CONFIG.LIMITS.MORALE.MAX);
            } else {
              state.away.morale = clamp(state.away.morale + sResil / 10, SIM_CONFIG.LIMITS.MORALE.MIN, SIM_CONFIG.LIMITS.MORALE.MAX);
              state.away.momentum = clamp(state.away.momentum + sResil / 10, SIM_CONFIG.LIMITS.MOMENTUM.MIN, SIM_CONFIG.LIMITS.MOMENTUM.MAX);
              state.home.morale = clamp(state.home.morale - cFragil / 10 + cResil / 20, SIM_CONFIG.LIMITS.MORALE.MIN, SIM_CONFIG.LIMITS.MORALE.MAX);
            }
          } else {
            pushEvent({ minute, type: 'shot_on_target', team: side, player: pickActivePlayer(isHome ? hPlayers : aPlayers, ['F', 'M', 'A'], side) });
          }
        } else {
          pushEvent({ minute, type: 'shot_off_target', team: side, player: pickActivePlayer(isHome ? hPlayers : aPlayers, ['F', 'M', 'A'], side) });
        }
      }

      const durTop = isHome ? homeUnits.DURAN_TOP : awayUnits.DURAN_TOP;
      const cornerProb = clamp(attkProb.cornerPerMin * durTop * atkPower / oppDefPower, SIM_CONFIG.LIMITS.CORNER.MIN, SIM_CONFIG.LIMITS.CORNER.MAX);
      if (r() < cornerProb) {
        stats[side].corners++;
        pushEvent({ minute, type: 'corner', team: side });
      }

      if (state[side].redCardPenalty === 0) {
        if (r() < penCurrentBudget[side] / 90) {
          penCurrentBudget[side] = 0;
          stats[side].penalties++;
          const penPlayer = pickActivePlayer(isHome ? hPlayers : aPlayers, ['F', 'M'], side);
          if (r() < attkProb.penConvRate) {
            goals[side]++;
            pushEvent({ minute, type: 'goal', team: side, player: penPlayer, subtype: 'penalty' });
          } else {
            pushEvent({ minute, type: 'penalty_missed', team: side, player: penPlayer });
          }
        }
      }

      const discUnit = isHome ? homeUnits.DISIPLIN : awayUnits.DISIPLIN;
      const yellowProb = clamp(attkProb.yellowPerMin / Math.max(discUnit, 0.1), 0.0001, SIM_CONFIG.LIMITS.CARDS.YELLOW_MAX);
      if (r() < yellowProb) {
        const cardName = pickActivePlayer(isHome ? hPlayers : aPlayers, null, side) || SIM_CONFIG.LABELS.PLAYER;
        const yellows = playerYellows[side];
        yellows[cardName] = (yellows[cardName] || 0) + 1;
        stats[side].yellowCards++;
        if (yellows[cardName] >= 2 && !expelledPlayers[side].has(cardName)) {
          expelledPlayers[side].add(cardName);
          stats[side].redCards++;
          state[side].redCardPenalty = clamp(state[side].redCardPenalty + SIM_CONFIG.PENALTIES.RED_CARD_INCREMENT, 0, SIM_CONFIG.PENALTIES.RED_CARD_MAX);
          pushEvent({ minute, type: 'red_card', team: side, player: cardName, subtype: 'second_yellow' });
        } else if (!expelledPlayers[side].has(cardName)) {
          const redProb = clamp(attkProb.redPerMin / Math.max(discUnit, 0.1), 0, SIM_CONFIG.LIMITS.CARDS.RED_MAX);
          if (r() < redProb) {
            expelledPlayers[side].add(cardName);
            stats[side].redCards++;
            state[side].redCardPenalty = clamp(state[side].redCardPenalty + SIM_CONFIG.PENALTIES.RED_CARD_INCREMENT, 0, SIM_CONFIG.PENALTIES.RED_CARD_MAX);
            pushEvent({ minute, type: 'red_card', team: side, player: cardName });
          } else {
            pushEvent({ minute, type: 'yellow_card', team: side, player: cardName });
          }
        }
      }

      if (minute > 45 && subsDone[side] < SIM_CONFIG.SUBS.MAX) {
        if (r() < (SIM_CONFIG.SUBS.MAX - subsDone[side]) / (95 - minute + 1)) {
          const subIn = pickSub(isHome ? hPlayers : aPlayers, side);
          if (subIn) {
            subsDone[side]++;
            pushEvent({ minute, type: 'substitution', team: side, playerIn: subIn, playerOut: pickActivePlayer(isHome ? hPlayers : aPlayers, null, side) });
          }
        }
      }
    }

    // M051-tabanlı possession: iki takımın sezon ortalamaları normalize edilir
    const rawHomePoss = hProb.possessionBase * 100;
    const rawAwayPoss = aProb.possessionBase * 100;
    const possTotal = rawHomePoss + rawAwayPoss;
    const normalizedHomePoss = possTotal > 0 ? (rawHomePoss / possTotal) * 100 : 50;
    const currentHomePos = clamp(
      normalizedHomePoss + (state.home.momentum - state.away.momentum) * 10,
      SIM_CONFIG.LIMITS.POSSESSION.MIN, SIM_CONFIG.LIMITS.POSSESSION.MAX
    );
    minuteLog.push({ 
      minute, 
      events: minuteEvents, 
      behavioralState: { home: getEffectiveUnits('home'), away: getEffectiveUnits('away') }, 
      possession: { home: Math.round(currentHomePos), away: 100 - Math.round(currentHomePos) } 
    });
  }

  return { result: { homeGoals: goals.home, awayGoals: goals.away, winner: goals.home > goals.away ? 'home' : (goals.away > goals.home ? 'away' : 'draw') }, stats: { home: { ...stats.home, possession: Math.round(50 + (homeUnits.TOPLA_OYNAMA - awayUnits.TOPLA_OYNAMA) * 20) }, away: { ...stats.away, possession: 100 - Math.round(50 + (homeUnits.TOPLA_OYNAMA - awayUnits.TOPLA_OYNAMA) * 20) } }, events, minuteLog, units: { home: homeUnits, away: awayUnits } };
}

function simulateMultipleRuns(params) {
  const { runs = 1000 } = params;
  let homeWins = 0, draws = 0, awayWins = 0;
  let over15 = 0, over25 = 0, btts = 0;
  let totalGoals = 0, totalHomeGoals = 0, totalAwayGoals = 0;
  const scoreMap = {};
  let bestSampleRun = null;
  let bestSampleDist = Infinity;
  const allRuns = [];

  for (let i = 0; i < runs; i++) {
    const run = simulateSingleRun(params);
    const hg = run.result.homeGoals;
    const ag = run.result.awayGoals;
    const total = hg + ag;
    if (run.result.winner === 'home') homeWins++;
    else if (run.result.winner === 'away') awayWins++;
    else draws++;
    if (total > 1.5) over15++;
    if (total > 2.5) over25++;
    if (hg > 0 && ag > 0) btts++;
    totalGoals += total;
    totalHomeGoals += hg;
    totalAwayGoals += ag;
    const key = `${hg}-${ag}`;
    scoreMap[key] = (scoreMap[key] || 0) + 1;
    if (i < 100 || i % 10 === 0) allRuns.push(run);
    if (i === 0) bestSampleRun = run;
  }

  const avgHome = totalHomeGoals / runs;
  const avgAway = totalAwayGoals / runs;
  for (const run of allRuns) {
    const dist = Math.abs(run.result.homeGoals - avgHome) + Math.abs(run.result.awayGoals - avgAway);
    if (dist < bestSampleDist) {
      bestSampleDist = dist;
      bestSampleRun = run;
    }
  }

  const pct = v => +((v / runs) * 100).toFixed(1);
  return { runs, distribution: { homeWin: pct(homeWins), draw: pct(draws), awayWin: pct(awayWins), over15: pct(over15), over25: pct(over25), btts: pct(btts), avgGoals: +(totalGoals / runs).toFixed(2), scoreFrequency: Object.entries(scoreMap).sort((a, b) => b[1] - a[1]).slice(0, 10).reduce((acc, [score, cnt]) => { acc[score] = pct(cnt); return acc; }, {}) }, sampleRun: bestSampleRun };
}

function simulateMatch(params) {
  const { runs = 1, lineups, audit } = params;

  // Lineup Pool Audit - Trace exactly how many players were active in this simulation
  if (audit && audit.addSimTrace) {
    audit.addSimTrace('lineup_pool_size', {
      home: lineups?.home?.players?.length || 0,
      away: lineups?.away?.players?.length || 0,
      isFallback: lineups?.isFallback || false
    });
  }

  if (runs > 1) return simulateMultipleRuns(params);
  return simulateSingleRun(params);
}

module.exports = { simulateMatch, simulateSingleRun, simulateMultipleRuns, calculateUnitImpact, computeProbBases, SIM_BLOCKS };
