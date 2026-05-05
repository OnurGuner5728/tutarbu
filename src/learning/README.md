# Learning Layer — Davranışsal Kondisyon Öğrenme Katmanı

## Amaç

Mevcut tahmin motoru (Poisson + Dixon-Coles + Monte Carlo) **fizik** üretir.
Bu katman **deneyim** üretir: bir maçın kondisyonuna (λ seviyesi, güç farkı, lig
profili, form, hakem, vb.) geçmişte benzemiş maçların **tahmin-vs-gerçeklik**
ilişkisini bulup, mevcut tahmine residual düzeltmesi olarak uygular.

Hardcoded davranışsal sabit kullanılmaz. Tüm parametreler (z-score, bandwidth,
recency half-life, league bonus, shrinkage κ) tarihsel havuzun istatistiğinden
türetilir.

## Modüller

| Modül | Sorumluluk |
|---|---|
| `store.js` | SQLite şeması (`data/learning.db`) — predictions, outcomes, residuals, fingerprints |
| `fingerprint.js` | Maçın 15 boyutlu kondisyon vektörü (λ, güç farkı, form, lig, hakem, ...) |
| `similarity.js` | k-NN: standardize Öklid mesafesi + Gaussian kernel ağırlık + posterior shrinkage |
| `recorder.js` | Snapshot (prediction+fingerprint) + outcome + residual hesabı |
| `blender.js` | Tarihsel residual'ı mevcut λ'lara uygula → düzeltilmiş Poisson dağılımı |
| `index.js` | Tek giriş noktası: `computeLearnedAdjustment`, `persistPrediction`, `persistOutcome` |

## Akış

```
generatePrediction()
   ├─ Poisson + MC + Dixon-Coles → λ, ρ, 1X2 olasılıkları
   ├─ learning.computeLearnedAdjustment({metricsResult, baseline, poissonResult, kickoffTs, matchId, tournamentId})
   │     ├─ buildFingerprint() → 15 boyutlu vektör
   │     ├─ store.getHistoricalCases({beforeKickoffTs}) — as-of disiplini
   │     ├─ similarity.computeAdjustment() → {dLambdaHome, dLambdaAway, confidence}
   │     └─ blender.applyAdjustment() → düzeltilmiş 1X2/O25/BTTS/exact
   └─ learning.persistPrediction(...) → snapshot + fingerprint kaydı

backtest-runner (maç sonu)
   └─ learning.persistOutcome(...) → outcome + residual otomatik
```

## As-of Disiplini

Backtest'te oynanmış maçın kendi sonucu kendi tahminine SIZAMAZ:

- `services/as-of-filter.js`: kickoff_ts'den sonraki tüm event'leri (team last events,
  H2H, hakem son maçları, menajer kariyeri) atar.
- `learning.computeLearnedAdjustment` yalnızca `kickoff_ts < query.kickoffTs` olan
  tarihsel case'leri döndürür.
- Backtest CLI: `node src/engine/backtest-runner.js <date> <limit> [pre-match|as-played]`
  varsayılan `pre-match` (sızıntı-engellenmiş).

## Sınırlamalar

1. **Standings ve team season stats** kümülatif veridir; API as-of vermez. Şu anda
   filtrelenmez ama `_asOfMeta.leakedFields` listesinde işaretlenir. İleride
   filtrelenmiş last_events üzerinden yeniden inşa gerekir.
2. **Soğuk başlangıç:** En az birkaç yüz fingerprint birikene kadar similarity
   adjustment'ları confidence düşük üretir. Soğuk dönemde davranış nötrdür
   (engine değişmez). Confidence pool yoğunluğundan türetilir, sabit eşik yok.
3. **Legacy JSONL migration** `legacy-jsonl` modelVersion altında saklanır;
   fingerprint'i olmadığı için similarity havuzunda kullanılmaz. Yalnızca
   tarihsel Brier/log-loss raporu için.

## Veritabanı Boyut Yönetimi

- `learning.db` ayrı bir SQLite dosyasıdır (`data/learning.db`).
- Şu an `getHistoricalCases` son 50.000 fingerprint ile sınırlıdır (kickoff_ts DESC).
- Pruning gerekirse `as_of_ts < X` koşuluyla DELETE yapılabilir.

## Komutlar

```bash
# Eski JSONL'yi store'a aktar (legacy modelVersion)
node scripts/migrate-legacy-jsonl.js

# Statik literal envanteri çıkar
node scripts/audit-statics.js

# Backtest'i pre-match (sızıntısız) modda koştur
node src/engine/backtest-runner.js 2026-04-26 50 pre-match
```

## Gelecek Faz

- **Faz 2 — GBM residual modeli:** Faz 1 birikmiş fingerprint+residual'ları üzerine
  ridge regression veya xgboost-node ile sürekli rakip model. Şu an k-NN tabanlı.
- **Faz 3 — Team/manager/referee state vektörleri:** Yığılmış residual'dan
  kişi/takım bazlı bias çıkarımı.
- **Faz 4 — Meta-blender:** Pure Poisson, pure MC, k-NN-residual, market-implied
  arasında lig bazlı isotonic blend.
