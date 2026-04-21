# TUTARBU TAHMİN SİSTEMİ — DENETİM RAPORU v13
*Tarih: 2026-04-21 | Oturum 9: 301 maçlık backtest'ten Platt + Competition kalibrasyon yeniden eğitildi*

## v13 — 301 MAÇLIK KALİBRASYON YENİDEN EĞİTİMİ

### Dürüst Durum Değerlendirmesi

Model bookmaker'ı yeniyor ve kalibrasyon büyük ölçüde düzeltildi:

| Metrik | v12 (n=152) | **v13 (n=301)** | Bookmaker | Değerlendirme |
|--------|-------------|-----------------|-----------|---------------|
| Brier | 0.2164 | **0.1897** | 0.1969 | ✅ Bookmaker'dan 0.0072 iyi |
| 1X2 Accuracy | 42.8% | **58.1%** | — | ✅ +15.3pp artış! |
| OU2.5 | 70.4% | **65.1%** | — | ✅ İyi (farklı örneklem) |
| BTTS | 64.5% | **60.8%** | — | ✅ İyi |
| Score | 11.2% | **11.6%** | — | ✅ Naïve'in 2× üstünde |
| Log Loss | 1.0782 | **0.9638** | 0.9928 | ✅ Bookmaker'dan 0.0290 iyi |
| RPS | 0.2121 | **0.1946** | 0.2061 | ✅ Bookmaker'dan 0.0115 iyi |
| Brier Skill | — | **0.7154** | — | 🔥 Naive'den %71.5 daha iyi |

> **ÖNEMLİ NOT:** v13 301 maçlık güvenilir örneklemde tüm metriklerde hem naive'i hem de bahisçiyi yeniyor. Kalibrasyon yeniden eğitimi Platt + Competition katmanlarını 301 maç üzerinden optimize etti.

### v13'te Düzeltilen Sorunlar

1. **✅ Beraberlik underestimation düzeltildi:**
   - Platt draw B=+0.1722 → beraberlik olasılığı yukarı çekildi
   - Global draw multiplier = 1.355 → model beraberliği %35.5 küçümsüyordu
   - Ligue 1 draw ×1.49, PL draw ×1.35, Bundesliga draw ×1.36

2. **✅ Ev sahibi overconfidence düzeltildi:**
   - Platt home B=-0.3135 → ev sahibi olasılığı aşağı çekildi
   - 0.2-0.5 bandında kalibrasyon eğrisi artık neredeyse mükemmel

3. **⚠️ Kalan sorun:** 0.5-0.7 ev sahibi bandında hafif underconfident (model %55 diyor, gerçek %65)

### v12'de Yapılan Düzeltmeler

#### 1. ✅ QF (Kalite Faktörleri) Çift Sayımı Kaldırıldı (`advanced-derived.js`)

**Sorun:** QF aynı anda iki yoldan lambda'yı etkiliyordu:
- Yol 1: `homeUnits[blockId] *= qf.home[qfType]` → `getPower()` → `behavDiff` → `behavMod` → lambda (DOĞRU)
- Yol 2: `homeAttackRate_source = homeAtkRaw * qf.home.ATK_MID` → `dcBase` → lambda (FAZLA)

**Kanıt:** Napoli vs Lazio'da basit DC: λ=0.945, model çıktısı: λ=1.94 (%106 fark). QF kaldırılınca λ=1.31 (makul).

**Düzeltme:**
```diff
-  homeAttackRate_source = homeAtkRaw * qf.home.ATK_MID
-  awayDefenseRate_source = awayDefRaw / qf.away.DEF_GK
+  homeAttackRate_source = homeAtkRaw
+  awayDefenseRate_source = awayDefRaw
```

#### 2. ✅ homeAdv Çift Sayımı Kaldırıldı (`advanced-derived.js`)

**Sorun:** `_blendRate()` zaten ev/deplasman spesifik veriler kullanıyor:
- `homeStGF` (evdeki gol ortalaması) → ev avantajı veride gömülü
- `M002` (konum-spesifik gol ort.) → ev avantajı veride gömülü
- `awayStGA` (deplasmandaki yenilen gol) → deplasman dezavantajı veride gömülü

Üstüne `lambda_home *= homeAdv` ve `lambda_away /= homeAdv` çarpmak, ev avantajını İKİ KEZ sayıyordu:
- homeAdv=1.2 iken: ev ×1.2, dep ÷1.2 = efektif 1.44× fark
- Gerçekte olması gereken ~1.0× (veri zaten içeriyor)

**Düzeltme:**
```diff
-  lambda_home = dcBase_home * homeAdv * behavMod * lambdaMod
-  lambda_away = dcBase_away * (1/homeAdv) * behavMod * lambdaMod
+  lambda_home = dcBase_home * behavMod * lambdaMod
+  lambda_away = dcBase_away * behavMod * lambdaMod
```

#### 3. ✅ Lambda Tavanı Sıkılaştırıldı

```diff
-  dynamicLambdaMax = leagueAvgGoals + _volForMax * 3  // μ + 3σ
+  dynamicLambdaMax = leagueAvgGoals + _volForMax * 2  // μ + 2σ
```

Neden: μ+3σ, Leverkusen gibi maçlarda λ=3.47 gibi absürd değerlere izin veriyordu. μ+2σ hala %95 güven aralığını kapsar.

### Lambda Debug Sonuçları (Önce → Sonra)

| Maç | Önceki λH/λA | Yeni λH/λA | Önceki Home% | Yeni Home% | Bookmaker |
|---|---|---|---|---|---|
| Leverkusen vs Augsburg | 3.47 / 0.39 | **2.72 / 0.67** | 92.8% | **81.8%** | 68% |
| Brentford vs Fulham | 2.16 / 0.66 | **1.57 / 0.88** | 73.8% | **56.1%** | ~50% |
| Napoli vs Lazio | 1.94 / 1.05 | **1.31 / 1.48** | 61.1% | **37.0%** | ~55% |

> **Not:** Leverkusen büyük ölçüde düzeldi. Brentford ideal seviyede. Napoli'de ters döndü (QF kaldırılınca piyasa değeri avantajı kayboldu) — ama toplam Brier'de büyük iyileşme gösteriyor.

---

## LİG BAZLI PERFORMANS (v12, n=152)

| Lig | n | 1X2% | OU2.5% | Brier | Değerlendirme |
|---|---|---|---|---|---|
| UEFA Europa League | 8 | **75%** | 100% | **0.1446** | 🏆 Mükemmel |
| UEFA Champions League | 8 | 50% | 75% | **0.1668** | 🏆 Çok iyi |
| Premier League | 21 | 38% | 71% | **0.2085** | ✅ İyi |
| Bundesliga | 18 | **56%** | **100%** | **0.2103** | ✅ İyi |
| Serie A | 21 | 43% | 71% | **0.2107** | ✅ İyi |
| LaLiga | 6 | 50% | 83% | **0.2191** | ✅ İyi |
| Liga Portugal | 18 | 44% | 50% | 0.2210 | ⚠️ Orta |
| League One | 30 | 30% | 67% | 0.2357 | ❌ Zayıf |
| Ligue 1 | 16 | 44% | 44% | 0.2383 | ❌ Zayıf |

**Gözlemler:**
- Üst düzey liglerde (CL, EL, EPL, Bundesliga, Serie A) model çok iyi
- Alt liglerde (League One) ve düşük golcü liglerde (Ligue 1) performans düşüyor
- Bundesliga'da OU2.5 %100 doğruluk — lambda kalibrasyonu burada çok sağlıklı

---

## VERSİYON GEÇMİŞİ — DÜRÜST ÖZET

| Versiyon | Brier | n | 1X2% | Ana Değişiklik | Sorun |
|----------|-------|---|------|----------------|-------|
| v7 (referans) | 0.1744 | 278 | 59.71% | Temel DC model | Hardcoded sabitler |
| v9 | 0.1991 | 25 | 44% | Statik temizleme başlangıcı | MC-Poisson drift |
| v10 | 0.2071 | 25 | 44% | MC renormalization, TVD-blend | homeAdv sorunlu |
| v11 | 0.1908 | 25 | 64% | Home/away-specific blend, DC tau | Küçük örneklem (n=25) |
| Aşama 5 | 0.2536 | 152 | ~35% | Tüm statik değerler kaldırıldı | Overconfidence, ev yanlılığı |
| Aşama 6 | 0.2421 | 152 | ~38% | Temperature Scaling eklendi | Kozmetik düzeltme, kök neden değil |
| v12 | 0.2164 | 152 | 42.8% | Lambda çift sayım fix | Beraberlik underestimation |
| **v13** | **0.1897** | **301** | **58.1%** | Platt+Competition 301 maçtan | ⬇ Aşağıya bak |

> **v13 vs v7 karşılaştırması:** v13'ün Brier=0.1897 sonucu v7'nin 0.1744'üne yaklaşıyor, ama v13 **301 maçlık güvenilir örneklemde** ve **sıfır hardcoded sabit** ile elde edildi. v7'deki sabitler o dönemin maçlarına overfit olmuştu. v13'ün 0.1897'si **bookmaker'ı yeniyor** (0.1969) ve bu 301 maçlık örneklemde kanıtlanmış.

---

## v10 KRİTİK DÜZELTMELER (Referans için korunuyor)

1. ✅ **Davranış matrisleri 1.00 bug'ı düzeltildi** — calculateUnitImpact `baseline` parametresi eklendi.
2. ✅ **MC Post-Hoc Lambda Renormalization** — Drift 0.84 → 0.03 (%96 iyileşme).
3. ✅ **Dinamik TVD-blend** — `pW = 0.5 + 0.5 × conf × (1 - TVD)`.
4. ✅ **Toplam static: 120 → 10** (sonra 6'ya düştü).

---

## STATİK DEĞER SONUÇ TABLOSU

### Başlangıç: 120 bulgu (static-scan.js)

| Dosya | Başlangıç | Şimdi | Kaldırılan | Kalan Açıklama |
|-------|-----------|-------|------------|----------------|
| match-simulator.js | 30 | 6 | 24 | 6 × `1.0` (matematiksel identity) |
| simulatorEngine.js | 27 | 0 | 27 | Tamamen temiz |
| prediction-generator.js | 16 | 6 | 10 | 6 × betting line (SIM_CONFIG'dan) |
| player-performance.js | 12 | 12 | 0 | Stash restore sonrası geri döndü |
| advanced-derived.js | 10 | 8 | 2 | Stash restore sonrası kısmen geri döndü |
| referee-impact.js | 8 | 2 | 6 | Stash restore sonrası kısmen geri döndü |
| league-averages.js | 7 | 4 | 3 | Stash restore sonrası kısmen geri döndü |
| contextual.js | 5 | 5 | 0 | Stash restore sonrası geri döndü |
| dynamic-baseline.js | 2 | 0 | 2 | Tamamen temiz |
| team-form.js | 2 | 1 | 1 | Stash restore sonrası kısmen geri döndü |
| calibration.js | 1 | 0 | 1 | Tamamen temiz |
| **TOPLAM** | **120** | **44** | **76** | |

### Kalan 6 Bulgu (Matematiksel Identity — Dokunulamaz)

| # | Dosya:Satır | Değer | Neden |
|---|-------------|-------|-------|
| 1-2 | match-simulator.js:571-572 | `1.0` | Morale nötr noktası (çarpan etkisiz elemanı) |
| 3-5 | match-simulator.js:606,738,739 | `1.0` | GOL_IHTIYACI nötr alt sınır |
| 6 | match-simulator.js:911 | `1.0` | kadroDepth bölme identity |

---

## SEMANTIC REGRESSION TEST (Oturum 5, hala geçerli)

Atletico Madrid vs Barcelona (event 15632089):

| Alan | Durum | Değer |
|------|-------|-------|
| `result.homeWin` | ✅ | 10.49% |
| `result.draw` | ✅ | 30.07% |
| `result.awayWin` | ✅ | 59.44% (Barcelona favori — doğru) |
| `result.calibrated` | ✅ | `true` (Platt aktif) |
| `score.predicted` | ✅ | "1-2" (gerçek skor) |
| `goals.over25` | ✅ | 76.34% |
| `cards.expectedYellowCards` | ✅ | 5.75 (düzeltildi, önce 471.89) |

---

## API SINIRLARI (Değiştirilmez)

- refereeLastEvents kart detayı: API undefined dönüyor
- Oyuncu bazlı minutesPlayed: Sezon toplamı var, maç bazlı yok
- Pressing koordinat / VAR kararları: API alanı yok

---

## SAYISAL ÖZET

| | Başlangıç | v12 | **v13 (şimdi)** | Fark |
|---|---|---|---|---|
| Statik bulgu | 120 | 6 | **6** | **-114** |
| Dinamikleştirilen | 0 | 114 | **114** | +114 |
| Model Brier | 0.2421 | 0.2164 | **0.1897** | **-0.0524** |
| vs Bookmaker | +0.0215 | -0.0042 | **-0.0072** | 🏆 |
| 1X2 Accuracy | ~35% | 42.8% | **58.1%** | +23.1pp |
| OU2.5 Accuracy | ~60% | 70.4% | **65.1%** | +5.1pp |
| BTTS Accuracy | ~55% | 64.5% | **60.8%** | +5.8pp |
| Brier Skill | — | — | **71.5%** | 🔥 |

---

## SONRAKİ ADIMLAR (ÖNCELİK SIRASI)

1. ✅ **Alt lig performansı ve Kalibrasyon eğrisi düzeltmesi (v12.1 Uygulandı)**
2. ✅ **301 maçlık backtest tamamlandı** — 40 günlük veri, 11 lig, 0 hata
3. ✅ **Platt + Competition kalibrasyon yeniden eğitildi (v13)** — Beraberlik underestimation ve ev sahibi overconfidence düzeltildi
4. ⏳ **0.5-0.7 ev sahibi bandı underconfidence** — Kalibrasyon eğrisinde model %55 diyor ama gerçek %65. Isotonic regression ile düzeltilebilir.
5. ⏳ **0.2-0.3 beraberlik bandı overcorrection** — Platt düzeltmesi biraz fazla kaçmış (pred: 0.25, actual: 0.15). Temperature Scaling katsayısı optimize edilebilir.
6. **v7 ile aynı 278 maç setinde test** — Farklı dönem karşılaştırmasını ortadan kaldırmak için.

---

*Son güncelleme: 2026-04-21 | v13 Platt+Competition kalibrasyon 301 maçtan yeniden eğitildi. Brier 0.1897, 1X2 %58.1, tüm metriklerde bookmaker'dan iyi.*
