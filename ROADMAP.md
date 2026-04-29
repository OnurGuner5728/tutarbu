# Sistem Yol Haritası — Bookmaker Seviyesi Tahmin

## Durum Göstergeleri
- ✅ Tamamlandı
- 🔄 Devam ediyor  
- ⏳ Bekliyor
- 📋 Planlandı

---

## PHASE 1 — Temel Kalite İyileştirmeleri

### P1-1 ✅ Lambda Dinamikleştirme (Tamamlandı)
- normMinRatio → lambda floor (0.35 sabit kaldırıldı)
- normMaxRatio → lambda ceiling (1.5 sabit kaldırıldı)
- DampFactor floor → CV bazlı (0.85 sabit kaldırıldı)
- xGCorrectionFactor bounds → CV bazlı dinamik
- Öneri B cap → normMaxRatio bazlı
- Profile weight bounds → veri miktarına adaptif

### P1-2 ✅ ComfortBrake + DecayPerGoal Dinamikleştirme (Tamamlandı)
- teamExpGoals → leagueAvgGoals fallback (deflated rates düzeltildi)
- decayPerGoal cap → leagueAvgGoals + leagueGoalVolatility bazlı

### P0-1 ✅ Backtest Deduplication (Tamamlandı)
**Dosya:** `src/engine/backtest-runner.js`
- `processedMatchIds = new Set()` ile mükerrer maç ID'leri atlanır

### P0-2 ✅ Dixon-Coles ρ Düzeltmesi (Tamamlandı — KRİTİK)
**Dosya:** `src/metrics/advanced-derived.js`
- ESKİ (YANLIŞ): `ptsCV / leagueAvgGoals` → pozitif değer → beraberlik olasılığı AZALIYORDU
- YENİ (DOĞRU): `-(D_obs - D_poisson) / (P00×λ²+ P11)` → negatif değer → beraberlik olasılığı ARTIYOR
- D_obs: `leagueFingerprint.leagueDrawRate` (temporal weighted) > `leagueDrawRate_std` > `drawTendency×0.25`

### P0-3 ✅ Poisson + Simulation Ayrı Track (Tamamlandı)
**Dosya:** `src/engine/prediction-generator.js`
- `poissonResult`: saf Poisson/Dixon-Coles sonucu (blend öncesi)
- `simulationResult`: saf Monte Carlo sonucu (blend öncesi)
**Dosya:** `src/engine/backtest-runner.js`
- Her maç için `poissonHits1X2` ve `simHits1X2` ayrı sayılır
- Summary'de `Poisson-Only` vs `Simulation-Only` vs `Hybrid` karşılaştırması

### P0-4 ✅ Referee-impact Duplicate Export Fix (Tamamlandı)
**Dosya:** `src/metrics/referee-impact.js`
- Duplicate `module.exports` ve `createEmptyRefereeMetricsWithMeta` tanımı kaldırıldı

### P0-5 ✅ Gerçek Server Backtest Endpoint (Tamamlandı)
**Dosya:** `src/server.js`
- `GET /api/backtest?date=YYYY-MM-DD&limit=N&tournament=top|all`
- Server-Sent Events (SSE) akışı — her maç anlık gönderilir
- Tam server pipeline (`fetchAllMatchData → metrics → baseline → generatePrediction`)
- Summary: tier bazlı accuracy, Brier/LogLoss, motor karşılaştırması, JSON dosyasına kayıt
**Dosya:** `src/BacktestPage.jsx`
- Gerçek zamanlı backtest UI — tarih seçimi, progress log, sonuç tablosu
- Tier renk kodlaması (HIGH/MEDIUM/LOW)
- Motor karşılaştırması (Poisson vs Sim vs Hibrit)
**Dosya:** `src/App.jsx`
- Sidebar'a Backtest butonu eklendi (BarChart2 ikonu)
- BacktestPage üst seviye overlay olarak entegre edildi

### P1-3 ✅ Fixture Congestion / Yorgunluk (Tamamlandı)
**Dosya:** `src/engine/dynamic-baseline.js`
- homeRestDays / awayRestDays hesabı (lastEvents → startTimestamp farkı)
- homeFatigue / awayFatigue (sigmoid bazlı, CV ölçekli)

**Dosya:** `src/engine/match-simulator.js`
- getAttackPower'a fatigueMultiplier entegrasyonu

### P1-4 ✅ Coverage-Controlled Prediction (Tamamlandı)
**Dosya:** `src/engine/prediction-generator.js`
- `coverageControl` objesi eklendi
- `confidenceTier`: HIGH / MEDIUM / LOW
- `dynamicThreshold`: CV bazlı dinamik eşik
- `isHighConfidence`: boolean flag

### P1-5 ✅ Shin Transform (Tamamlandı)
**Dosya:** `src/metrics/contextual.js`
- M131-M133 (1X2 implied prob) → Shin transform ile fair probability
- Overround/longshot bias giderildi

### P1-6 ✅ Brier Score + Log Loss (Tamamlandı)
**Dosya:** `src/engine/backtest-runner.js`
- Her maç için Brier score ve Log loss hesabı
- Summary'de avg Brier + avg Log Loss gösterimi
- Referans değer (random 1/3-1/3-1/3): Brier=0.667, LogLoss=1.099

---

## PHASE 2 — Piyasa Sinyalleri

### P2-1 ✅ Pressure Formulas (Tamamlandı)
**Dosya:** `src/metrics/contextual.js`
- RelegationPressure: σ((PtsSafety - PtsTeam) / (MatchesLeft+1))
- TitlePressure: σ((TargetPts - PtsTeam) / (MatchesLeft+1))
- TableCompression: 1 / (1 + GapAbove + GapBelow)
- Metrikler: M180-M185 (home/away çift)

**Dosya:** `src/engine/match-simulator.js`
- GOL_IHTIYACI bloğu → M180/M182 (RelegationPressure/TitlePressure) ile zenginleştirme

### P2-2 📋 ResistanceIndex
**Dosya:** `src/metrics/contextual.js`
- E[ActualPts - ExpectedPts | high-pressure matches]
- ExpectedPts: Poisson win prob × 3 + draw prob × 1
- Yüksek baskı maçları: M172/M173 > threshold

### P2-3 📋 ΔMarketMove (Opening vs Closing Odds)
**Koşul:** SofaScore'dan historical odds snapshot alınabiliyorsa
- Opening odds time-series endpoint tespiti gerekli
- logit(p_close) - logit(p_open) → line movement feature

---

## PHASE 3 — HT/FT Modeli

### P3-1 ✅ İlk Yarı Poisson İyileştirmesi (Tamamlandı)
**Dosya:** `src/engine/prediction-generator.js`
- M003-M010 (period goals) → HT lambda türetimi
- HT lambda = FT lambda × (HT fraction from M005+M006+M007)
- HT 1X2 olasılıkları Poisson bazlı

### P3-2 📋 HT/FT 9-Sınıflı Market Tahmini
- 9 sonuç: 1/1, 1/X, 1/2, X/1, X/X, X/2, 2/1, 2/X, 2/2
- P(HT=H, FT=H) hesabı → conditional probabilities
- State-conditioned 2nd half updater

---

## PHASE 4 — Veri Birikimi & ML Katmanı

### P4-1 ✅ ML Training Format (Tamamlandı)
**Dosya:** `src/engine/backtest-runner.js`
- Her maç için tam feature vektörü kayıt
- `backtest_training_data_YYYY.jsonl` formatında birikim
- Hedef değişkenler: actualResult, actualOU25, actualBTTS, actualScore

### P4-2 📋 CatBoost/XGBoost Discriminative Layer
**Koşul:** Min 500 maç birikiyor (yaklaşık 50 backtest)
- Feature set: tüm M001-M185 + pressure indeksleri + rest days
- Hedef: 1X2 fair probability
- Ensemble: Poisson + MC + ML ağırlıklı harman

### P4-3 📋 Kalibrasyon İyileştirmesi
**Dosya:** `src/engine/calibration.js`
- Birikülen backtest Brier/LogLoss verisiyle isotonic regression
- Lig bazlı kalibrasyon eğrisi güncelleme

---

## PHASE 5 — Canlı Entegrasyon (Gelecek Dönem)

### P5-1 📋 Live Bayesian Updater Skeleton
- Event-stream entegrasyonu (gol, kart, değişiklik)
- State-conditioned lambda güncelleme
- P(outcome | current_state) hesabı

### P5-2 📋 In-Play API Entegrasyonu
- `data.liveEvents` stream bağlantısı
- Dakika bazlı olasılık güncelleme

---

---

## extraordinary.md Compliance Tablosu

| # | Özellik | Durum | Dosya | Not |
|---|---------|-------|-------|-----|
| 1 | Dixon-Coles λ (bivariate Poisson) | ✅ | advanced-derived.js | |
| 2 | **Dixon-Coles ρ negatif düzeltme** | ✅ DÜZELTILDI | advanced-derived.js | Eski kod yanlış pozitifti |
| 3 | NegBinom overdispersion blend | ✅ | score-profile.js | leagueFingerprint bazlı |
| 4 | Shin transform (odds → fair prob) | ✅ | contextual.js | M131-M133 |
| 5 | Coverage-controlled prediction | ✅ | prediction-generator.js | HIGH/MEDIUM/LOW tier |
| 6 | Brier score + Log Loss | ✅ | backtest-runner.js, server.js | |
| 7 | Temperature scaling (dynamic) | ✅ | prediction-generator.js | CV bazlı |
| 8 | Isotonic/Platt calibration | 🔄 | calibration.js | Veri birikimi gerekiyor |
| 9 | RelegationPressure / TitlePressure | ✅ | contextual.js (M180-M183) | σ formülü |
| 10 | TableCompression | ✅ | contextual.js (M184-M185) | |
| 11 | SurpriseIndex | ✅ | prediction-generator.js | M131 vs model |
| 12 | **ResistanceIndex** | ✅ YENI | contextual.js (M186-M187) | Standings Poisson PPG farkı; M186→ZİHİNSEL_DAYANIKLILIK |
| 13 | **ΔMarketMove** | ✅ YENI | contextual.js (M188-M189) | choice.openValue extract; logit(close)-logit(open); →GOL_IHTIYACI |
| 14 | Fixture congestion (rest days) | ✅ | dynamic-baseline.js | homeFatigue/awayFatigue |
| 15 | Weather integration | ✅ | weather-service.js, match-simulator.js | goalMult/errorMult/fatigueMult |
| 16 | Referee lastEvents deep analysis | ✅ | referee-impact.js | M109-M122 |
| 17 | H2H joint distribution | ✅ | score-profile.js | matchScoreProfile |
| 18 | Manager H2H (managerDuel) | ✅ | h2h-analysis.js (M127) | |
| 19 | League fingerprint (temporal) | ✅ | league-fingerprint.js | drawRate, over25Rate, BTTS |
| 20 | Player availability-weighted | 🔄 | player-performance.js (M077/M078) | Pozisyon bazlı iyileştirilebilir |
| 21 | **HT/FT 9-class market** | ✅ YENI | prediction-generator.js | conditional probs |
| 22 | **Simülasyon HT dağılımı** | ✅ YENI | match-simulator.js | htScoreMap, htDist |
| 23 | **Backtest gerçek server pipeline** | ✅ YENI | server.js /api/backtest | SSE streaming |
| 24 | **BacktestPage UI** | ✅ YENI | BacktestPage.jsx | Tüm filtreler, HT/FT, motorlar |
| 25 | ML discriminative layer (CatBoost) | 📋 P4-2 | — | Min 500 maç gerekiyor |
| 26 | Per-league specialist models | 📋 | — | ML layer sonrası |
| 27 | Live Bayesian updater | 📋 P5-1 | — | Canlı entegrasyon aşaması |
| 28 | Bronze/Silver/Gold data layers | 📋 | — | Üretim altyapısı |
| 29 | Odds time-series | 📋 | — | API snapshot altyapısı gerekiyor |

**Semboller:** ✅ Tamamlandı | 🔄 Kısmi | ❌ Uygulanamıyor/Veri yok | 📋 Planlı

---

## Kalibrasyon Referans Değerleri

| Metrik | Random (1/3) | İyi Model | Hedef |
|--------|-------------|-----------|-------|
| Brier Score | 0.667 | < 0.50 | < 0.45 |
| Log Loss | 1.099 | < 0.90 | < 0.85 |
| 1X2 Accuracy | ~33% | > 65% | > 75% |
| Coverage@HIGH | 100% | ~40% | ~30-40% |
| Accuracy@HIGH | ~33% | > 80% | > 85% |

---

## Backtest Sonuçları Özeti

| Tarih | 1X2 | O/U | BTTS | Exact | Brier | LogLoss |
|-------|-----|-----|------|-------|-------|---------|
| 2026-04-23 (önceki) | 70% | 40% | 80% | 40% | - | - |
| 2026-04-23 (sonrası) | 70% | 40% | 80% | 40% | - | - |
| 2026-04-25 (yeni) | 90% | 60% | 60% | 50% | - | - |
| *Sonraki testler bekleniyor* | | | | | | |

---

## Dosya Değişiklik Özeti

| Dosya | Phase | Değişiklikler |
|-------|-------|---------------|
| `src/metrics/advanced-derived.js` | P1-1 | Lambda bounds, dampFactor, xGFactor, profileWeight |
| `src/engine/match-simulator.js` | P1-1, P1-2, P1-3, P2-1 | ComfortBrake, decayPerGoal, fatigueMultiplier, GOL_IHTIYACI |
| `src/engine/dynamic-baseline.js` | P1-3 | homeRestDays, awayRestDays, homeFatigue, awayFatigue |
| `src/metrics/contextual.js` | P1-5, P2-1 | Shin transform, M180-M185 pressure formulas |
| `src/engine/prediction-generator.js` | P1-4, P3-1 | coverageControl, HT Poisson improvement |
| `src/engine/backtest-runner.js` | P1-6, P4-1 | Brier/LogLoss, ML training format |
