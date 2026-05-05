'use strict';
/**
 * learning/recorder.js
 *
 * - recordMatchSnapshot: Bir maç için tahmin yapıldığında çağrılır.
 *   Hem learning_predictions hem learning_fingerprints'e yazar.
 *
 * - recordMatchOutcome: Maç bittiğinde gerçek skoru ve türetilmiş target'ları
 *   learning_outcomes'a yazar; ardından eşleşen prediction varsa residual hesaplar.
 *
 * - reconcileResiduals: Eşlenmemiş prediction × outcome çiftlerini tarar ve
 *   eksik residual'ları doldurur (toplu migration / catch-up için).
 */

const store = require('./store');

const SMOOTH = 0.5; // log-smoothing — Anscombe-tipi (matematiksel sabit, hardcoded davranışsal değil)

function safeLog(x) {
  return Math.log(Math.max(1e-9, x));
}

function computeResiduals({ prediction, outcome }) {
  if (!prediction || !outcome) return null;

  const lh = prediction.lambdaHome;
  const la = prediction.lambdaAway;
  const ah = outcome.homeScore;
  const aa = outcome.awayScore;

  let dLambdaHome = null, dLambdaAway = null, dLambdaTotal = null, dLambdaDiff = null;
  if (Number.isFinite(lh) && Number.isFinite(ah)) {
    dLambdaHome = safeLog(ah + SMOOTH) - safeLog(lh + SMOOTH);
  }
  if (Number.isFinite(la) && Number.isFinite(aa)) {
    dLambdaAway = safeLog(aa + SMOOTH) - safeLog(la + SMOOTH);
  }
  if (Number.isFinite(lh) && Number.isFinite(la) && Number.isFinite(ah) && Number.isFinite(aa)) {
    dLambdaTotal = safeLog(ah + aa + SMOOTH) - safeLog(lh + la + SMOOTH);
    dLambdaDiff  = safeLog(ah - aa + SMOOTH + Math.abs(ah - aa))
                 - safeLog(lh - la + SMOOTH + Math.abs(lh - la));
    // dLambdaDiff için yukarıdaki dönüşüm istikrarlı değil — yerine signed difference:
    dLambdaDiff = (ah - aa) - (lh - la);
  }

  // 1X2 olasılıkları (0-100 ölçeği) → 0-1
  const pH = (prediction.probHome ?? 0) / 100;
  const pD = (prediction.probDraw ?? 0) / 100;
  const pA = (prediction.probAway ?? 0) / 100;
  const oH = outcome.result1X2 === '1' ? 1 : 0;
  const oD = outcome.result1X2 === 'X' ? 1 : 0;
  const oA = outcome.result1X2 === '2' ? 1 : 0;

  const brier1X2 = (pH - oH) ** 2 + (pD - oD) ** 2 + (pA - oA) ** 2;
  const logLoss1X2 = -(oH * Math.log(Math.max(1e-12, pH))
                     + oD * Math.log(Math.max(1e-12, pD))
                     + oA * Math.log(Math.max(1e-12, pA)));

  const pActual = oH ? pH : (oD ? pD : pA);
  const surpriseIndex = -Math.log(Math.max(1e-12, pActual));

  // Hit'ler
  let predicted1X2 = null;
  if (pH >= pD && pH >= pA) predicted1X2 = '1';
  else if (pA >= pD && pA >= pH) predicted1X2 = '2';
  else predicted1X2 = 'X';
  const hit1X2 = predicted1X2 === outcome.result1X2;

  const predOU = (prediction.probO25 ?? 0) > 50 ? 'Over' : 'Under';
  const hitOU25 = predOU === outcome.ou25;

  const predBTTS = (prediction.probBTTS ?? 0) > 50 ? 'Yes' : 'No';
  const hitBTTS = predBTTS === outcome.btts;

  const hitScore = prediction.predictedScore != null
    && outcome.homeScore != null && outcome.awayScore != null
    && prediction.predictedScore === `${outcome.homeScore}-${outcome.awayScore}`;

  return {
    dLambdaHome, dLambdaAway, dLambdaTotal, dLambdaDiff,
    surpriseIndex,
    brier1X2, logLoss1X2,
    hit1X2, hitOU25, hitBTTS, hitScore,
  };
}

/**
 * Tahmin snapshot'ı + fingerprint kaydet.
 *
 * @param {object} args
 * @param {object} args.predictionRec  store.recordPrediction() formatında obj
 * @param {object} args.fingerprint    {vector, schemaVersion}
 */
function recordMatchSnapshot({ predictionRec, fingerprint }) {
  if (!predictionRec || !fingerprint) return false;
  store.recordPrediction(predictionRec);
  store.recordFingerprint({
    matchId       : predictionRec.matchId,
    modelVersion  : predictionRec.modelVersion,
    asOfTs        : predictionRec.asOfTs,
    tournamentId  : predictionRec.tournamentId,
    seasonId      : predictionRec.seasonId,
    homeTeamId    : predictionRec.homeTeamId,
    awayTeamId    : predictionRec.awayTeamId,
    kickoffTs     : predictionRec.kickoffTs,
    vector        : fingerprint.vector,
    schemaVersion : fingerprint.schemaVersion,
  });
  return true;
}

/**
 * Outcome'u kaydet ve eşleşen tüm prediction'lar için residual hesapla.
 */
function recordMatchOutcome(outcomeRec) {
  if (!outcomeRec || outcomeRec.matchId == null) return false;

  // Türetilmiş alanlar
  if (outcomeRec.homeScore != null && outcomeRec.awayScore != null) {
    const total = outcomeRec.homeScore + outcomeRec.awayScore;
    outcomeRec.totalGoals = total;
    outcomeRec.result1X2 = outcomeRec.homeScore > outcomeRec.awayScore
      ? '1' : (outcomeRec.homeScore < outcomeRec.awayScore ? '2' : 'X');
    outcomeRec.ou25 = total > 2.5 ? 'Over' : 'Under';
    outcomeRec.btts = (outcomeRec.homeScore > 0 && outcomeRec.awayScore > 0) ? 'Yes' : 'No';
    if (outcomeRec.htHome != null && outcomeRec.htAway != null) {
      const ht = outcomeRec.htHome > outcomeRec.htAway ? '1'
                : (outcomeRec.htHome < outcomeRec.htAway ? '2' : 'X');
      outcomeRec.htft = `${ht}/${outcomeRec.result1X2}`;
    }
  }

  store.recordOutcome(outcomeRec);

  // Tüm prediction sürümleri için residual hesapla
  const db = store._getDB();
  if (!db) return true;
  const preds = db.prepare(`
    SELECT match_id, model_version, as_of_ts, lambda_home, lambda_away,
           prob_home, prob_draw, prob_away, prob_o25, prob_btts, predicted_score
    FROM learning_predictions WHERE match_id = ?
  `).all(outcomeRec.matchId);

  for (const p of preds) {
    const r = computeResiduals({
      prediction: {
        lambdaHome: p.lambda_home,
        lambdaAway: p.lambda_away,
        probHome: p.prob_home,
        probDraw: p.prob_draw,
        probAway: p.prob_away,
        probO25: p.prob_o25,
        probBTTS: p.prob_btts,
        predictedScore: p.predicted_score,
      },
      outcome: outcomeRec,
    });
    if (r) {
      store.recordResidual({
        matchId: p.match_id,
        modelVersion: p.model_version,
        asOfTs: p.as_of_ts,
        ...r,
      });
    }
  }
  return true;
}

/**
 * Toplu reconcile: outcome var olan tüm match'ler için, residual'ı eksik olan
 * prediction'ları yeniden hesaplar.
 */
function reconcileResiduals() {
  const db = store._getDB();
  if (!db) return { updated: 0 };

  const rows = db.prepare(`
    SELECT p.match_id, p.model_version, p.as_of_ts,
           p.lambda_home, p.lambda_away,
           p.prob_home, p.prob_draw, p.prob_away,
           p.prob_o25, p.prob_btts, p.predicted_score,
           o.home_score, o.away_score, o.ht_home, o.ht_away,
           o.kickoff_ts, o.tournament_id, o.home_team_id, o.away_team_id,
           o.result_1x2, o.ou25, o.btts, o.htft, o.total_goals
    FROM learning_predictions p
    INNER JOIN learning_outcomes o ON o.match_id = p.match_id
    LEFT JOIN learning_residuals r
      ON r.match_id = p.match_id
     AND r.model_version = p.model_version
     AND r.as_of_ts = p.as_of_ts
    WHERE r.match_id IS NULL
  `).all();

  let updated = 0;
  for (const row of rows) {
    const r = computeResiduals({
      prediction: {
        lambdaHome: row.lambda_home,
        lambdaAway: row.lambda_away,
        probHome: row.prob_home,
        probDraw: row.prob_draw,
        probAway: row.prob_away,
        probO25: row.prob_o25,
        probBTTS: row.prob_btts,
        predictedScore: row.predicted_score,
      },
      outcome: {
        homeScore: row.home_score,
        awayScore: row.away_score,
        result1X2: row.result_1x2,
        ou25: row.ou25,
        btts: row.btts,
      },
    });
    if (r) {
      store.recordResidual({
        matchId: row.match_id,
        modelVersion: row.model_version,
        asOfTs: row.as_of_ts,
        ...r,
      });
      updated++;
    }
  }
  return { updated };
}

module.exports = {
  recordMatchSnapshot,
  recordMatchOutcome,
  reconcileResiduals,
  computeResiduals,
};
