/**
 * sim-config.js
 * Centralized configuration for the simulation engine.
 * Contains model constants, physics limits, and logic thresholds.
 */

'use strict';

const SIM_CONFIG = {
  // ─── Time Windows ────────────────────────────────────────────────────────────
  TIME: {
    EARLY_GAME_END: 20,
    CRITICAL_MOMENT: 60,
    LATE_GAME_START: 75,
    MATCH_END: 95,
  },

  // ─── Clamps & Limits ─────────────────────────────────────────────────────────
  LIMITS: {
    POWER: { MIN: 0.2, MAX: 5.0 },
    MOMENTUM: { MIN: 0.5, MAX: 2.0 },
    MORALE: { MIN: 0.4, MAX: 1.6 },
    URGENCY: { MIN: 0.2, MAX: 4.0 },
    POSSESSION: { MIN: 30, MAX: 70 },
    PROBABILITY: { MIN: 0.001, MAX: 0.90 },
    ON_TARGET: { MIN: 0.01, MAX: 0.90 },
    BLOCK: { MIN: 0.001, MAX: 0.60 },
    GK_ADJ: { MIN: 0.2, MAX: 4.0 },
    CORNER: { MIN: 0.001, MAX: 0.50 },
    CARDS: { YELLOW_MAX: 0.20, RED_MAX: 0.10 },
  },

  // ─── Penalties ───────────────────────────────────────────────────────────────
  PENALTIES: {
    RED_CARD_INCREMENT: 0.5,
    RED_CARD_MAX: 0.8,
  },

  // ─── Operational ─────────────────────────────────────────────────────────────
  SUBS: {
    MAX: 5,
  },

  // ─── Default Labels ──────────────────────────────────────────────────────────
  LABELS: {
    PLAYER: 'unknown_player',
    SUB: 'unknown_sub',
  }
};

module.exports = { SIM_CONFIG };
