'use strict';
/**
 * scripts/migrate-legacy-jsonl.js
 *
 * Eski backtest_training_data_*.jsonl dosyalarını learning store'a aktarır.
 *
 * Sınırlama: bu kayıtlarda metrik matrisi ve baseline yok → fingerprint
 *            oluşturulamıyor. Bu yüzden 'legacy' modelVersion altında saklanır
 *            ve k-NN benzerlik aramasında kullanılamaz (fingerprint olmadığı için).
 *            Kayıtlar yine de Brier/log-loss tarihçesi ve outcome ground truth
 *            için değerlidir.
 *
 * Kullanım:
 *   node scripts/migrate-legacy-jsonl.js
 *   node scripts/migrate-legacy-jsonl.js path/to/file.jsonl
 */

const fs = require('fs');
const path = require('path');
const store = require('../src/learning/store');

const LEGACY_VERSION = 'legacy-jsonl';

function migrate(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`[Migrate] dosya yok: ${filePath}`);
    return { read: 0, predictions: 0, outcomes: 0 };
  }
  store.initDB();

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  let predictions = 0, outcomes = 0;

  for (const line of lines) {
    let rec;
    try { rec = JSON.parse(line); } catch (_) { continue; }
    if (!rec || rec.matchId == null) continue;

    // Tarihten kickoff_ts üret (saatsel hassasiyet yok — günün ortası varsay)
    let kickoffTs = null;
    if (rec.date) {
      const d = new Date(rec.date + 'T15:00:00Z');
      if (!isNaN(d.getTime())) kickoffTs = Math.floor(d.getTime() / 1000);
    }

    store.recordPrediction({
      matchId: rec.matchId,
      modelVersion: LEGACY_VERSION,
      asOfTs: kickoffTs ? kickoffTs - 1 : Math.floor(Date.now() / 1000),
      kickoffTs,
      tournamentId: rec.tournamentId ?? null,
      homeTeamId: rec.homeTeamId ?? null,
      awayTeamId: rec.awayTeamId ?? null,
      lambdaHome: rec.poisson?.lambdaHome ?? null,
      lambdaAway: rec.poisson?.lambdaAway ?? null,
      probHome: rec.probHome ?? null,
      probDraw: rec.probDraw ?? null,
      probAway: rec.probAway ?? null,
      probO25: rec.probOU25 ?? null,
      probBTTS: rec.probBTTS ?? null,
      predictedScore: rec.predicted ?? null,
    });
    predictions++;

    // Outcome (gerçek skor JSONL içinde "actualScore" olarak)
    if (rec.actualScore && /^\d+-\d+$/.test(rec.actualScore)) {
      const [hs, as] = rec.actualScore.split('-').map(Number);
      store.recordOutcome({
        matchId: rec.matchId,
        kickoffTs,
        tournamentId: rec.tournamentId ?? null,
        homeTeamId: rec.homeTeamId ?? null,
        awayTeamId: rec.awayTeamId ?? null,
        homeScore: hs,
        awayScore: as,
        result1X2: rec.actualResult ?? null,
        ou25: rec.actualOU25 ?? null,
        btts: rec.actualBTTS ?? null,
        totalGoals: hs + as,
      });
      outcomes++;
    }
  }

  // Residual'ları toplu eşle
  const recon = require('../src/learning/recorder').reconcileResiduals();

  return { read: lines.length, predictions, outcomes, residuals: recon.updated };
}

const targets = process.argv.slice(2);
const files = targets.length > 0 ? targets : (
  fs.readdirSync(path.join(__dirname, '..'))
    .filter(f => /^backtest_training_data_.*\.jsonl$/.test(f))
    .map(f => path.join(__dirname, '..', f))
);

if (files.length === 0) {
  console.log('[Migrate] Aktarılacak JSONL dosyası bulunamadı.');
  process.exit(0);
}

const total = { read: 0, predictions: 0, outcomes: 0, residuals: 0 };
for (const f of files) {
  console.log(`[Migrate] ${f}`);
  const r = migrate(f);
  console.log(`           read=${r.read} predictions=${r.predictions} outcomes=${r.outcomes} residuals=${r.residuals}`);
  total.read += r.read;
  total.predictions += r.predictions;
  total.outcomes += r.outcomes;
  total.residuals += r.residuals;
}
console.log(`[Migrate] TOPLAM: ${JSON.stringify(total)}`);
console.log(`[Migrate] Store stats:`, store.getStats());
