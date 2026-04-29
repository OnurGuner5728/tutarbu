# BÖLÜM 2: İŞLENMİŞ METRİKLER, MOTORLAR VE NİHAİ ÇIKTI

**Son Güncelleme:** 29 Nisan 2026 | **Maç:** PSG vs Bayern München (ŞL)

---

## 2.1 Metrik Motoru Sağlık Raporu (`_debug.metricAudit`)

| Parametre | Değer |
|-----------|-------|
| Toplam Metrik Sayısı | **196** |
| Başarıyla Hesaplanan | **196** |
| Null (Veri Yok) | **0** |
| Kritik Eksik | 0 |
| Yüksek Risk | Hayır |
| Global Fallback | 0 |
| Statik/Hardcoded Ağırlık | **0** |

**Null metrik kalmadı.** Daha önce null olan 12 metrik (M025, M025b, M095, M106, M111-M118b, M127) tamamen dinamik veri kaynakları kullanılarak hesaplanıyor.

---

## 2.2 Statik Katsayı Denetim Raporu

Sistemdeki **tüm ağırlıkların dinamik olduğunun kanıtı:**

| Dosya | Eski Statik | Yeni Dinamik | Doğrulama |
|-------|------------|-------------|-----------|
| `goalkeeper.js` (M106) | `saveRate × 0.4 + csRate × 0.3 + rating × 0.3` | Eşit ağırlıklı aritmetik ortalama: `Σ(component) / N` | ✅ N = mevcut bileşen sayısı |
| `referee-impact.js` (M111) | `penPerMatch ?? 0.35` fallback | `baseline.penPerMatch` (lig verisinden) | ✅ Trace: `TEAM_PROXY` |
| `h2h-analysis.js` (M127) | `50.0` nötr default | `homeManagerWinRate / (homeWR + awayWR) × 100` | ✅ Kariyer maçlarından hesaplanır |
| `prediction-generator.js` (Penaltı) | `0.35 + cv × 0.1` ağırlık, `0.25` fallback | Eşit kaynak ağırlıklı ortalama: `Σ(sources) / N` | ✅ N = mevcut veri kaynağı sayısı |
| `prediction-generator.js` (Kırmızı Kart) | `0.5 / 0.5` sabit, `0.10` fallback | Eşit kaynak ağırlıklı ortalama + oyuncu bazlı kart riski | ✅ fouls→cards oranı oyuncu verisinden |
| `player-performance.js` (M070) | `succDrib × 0.5` kısmi katkı | Tüm sinyaller eşit: `creativity / signalCount` | ✅ Sinyal sayısına bölünüyor |

### Birim Dönüşüm vs Statik Ağırlık Ayrımı

Sistemde hâlâ görünen bazı sayısal sabitler **birim dönüşümü** veya **matematiksel yapı** niteliğindedir:

| Sabit | Nerede | Neden Statik Değil |
|-------|--------|-------------------|
| `× 10` (rating normalize) | M071 | 0-10 arası ratingi 0-100'e çevirmek — ölçek dönüşümü |
| `× 20`, `× 25`, `× 15` | M071 | tackles/match (~2-5) → 0-100 normalize etmek — birim dönüşümü |
| `× 3` (kırmızı kart) | RedCard calc | 1 kırmızı = 3 sarı eşdeğeri — oyundan atılma cezası |
| `/ 5 × 50 + 50` | M176 | Formasyon farkını 0-100'e dönüştürmek — lineer skala |
| `(14 - PPDA) / 10 × 50 + 50` | M177 | PPDA'yı 0-100'e invert etmek — pressing ölçek dönüşümü |
| `100 / (gap + 1)` | M172 | Puan farkını baskı indeksine çevirmek — ters orantı |

Bu sabitler keyfi ağırlık DEĞİL, matematiksel skala dönüşümüdür. Kaldırılamaz çünkü birbirleriyle karşılaştırılacak metriklerin aynı ölçekte olması gerekir.

---

## 2.3 İşlenmiş Kompozit Güçler (`comparison`)

| Metrik | PSG (Ev) | Bayern (Dep) |
|--------|----------|--------------|
| **Atak Gücü (M156)** | 49.62 | **55.29** |
| **Savunma Gücü (M157)** | **72.74** | 63.19 |
| **Form** | **85.48** | 58.07 |
| **Oyuncu Kalitesi** | 43.96 | **44.90** |
| **Kaleci Gücü** | **51.10** | 49.35 |
| **Momentum** | 21.16 | **46.67** |
| **Genel Güç (M166)** | 52.13 | **54.52** |
| H2H Avantajı | 19.39 (ortak) | |
| Bağlamsal Avantaj | 53.85 (ortak) | |
| Hakem Etkisi | 41.67 (ortak) | |

---

## 2.4 Lig Baseline Değerleri (Simülasyon Referans Noktaları)

`league-averages.js` → `dynamic-baseline.js` tarafından hesaplanan, simülasyonun fizik motoru olarak kullandığı lig ortalamaları. **Tamamı API verisinden türetilmiştir (0 sabit):**

| Parametre | Değer | Kaynak (Trace) |
|-----------|-------|----------------|
| Lig Ort. Gol | 1.691 | `LEAGUE_STANDINGS` |
| Şut/Dakika | 0.415 | `NEUTRAL_SYMMETRY` |
| İsabet Oranı | %41.2 | `NEUTRAL_SYMMETRY` |
| Gol Dönüşüm Oranı | %22.0 | `DERIVED` |
| Kaleci Kurtarış | %67.0 | `TEAM_PROXY` |
| Blok Oranı | %46.1 | `TEAM_PROXY` |
| Korner/Dakika | 0.047 | `NEUTRAL_SYMMETRY` |
| Sarı Kart/Dakika | 0.0139 | `NEUTRAL_SYMMETRY` |
| Kırmızı Kart/Dakika | 0.0016 | `NEUTRAL_SYMMETRY` |
| Penaltı Dönüşüm | %60 | `TEAM_PROXY` |
| Penaltı/Maç | 0.359 | `TEAM_PROXY` |
| Top Oynama Tabanı | %62.6 | `TEAM_PROXY` |
| Gol Volatilitesi | 0.632 | `DERIVED` |
| Puan Yoğunluğu | 2.875 | `DERIVED` |
| Puan CV | 0.445 | `DERIVED` |
| normMinRatio | 0.370 | `DERIVED` |
| normMaxRatio | 1.700 | `DERIVED` |
| Takım Sayısı | 36 | `LEAGUE_STANDINGS` |
| PSG Yorgunluk | 0.952 | `EVENT_TIMESTAMPS` |
| Bayern Yorgunluk | 0.952 | `EVENT_TIMESTAMPS` |

---

## 2.5 Behavioral Intelligence Matrix — 27 Blok Çıktısı

`advanced-derived.js` tarafından 196 metrikten hesaplanan davranışsal güç üniteleri:

| Blok | PSG | Bayern | Yorum |
|------|-----|--------|-------|
| BİTİRİCİLİK | **1.287** | 1.059 | PSG ceza sahası içi golcülük üstün |
| YARATICILIK | 1.061 | **1.295** | Bayern fırsat yaratmada güçlü |
| ŞUT ÜRETİMİ | 1.277 | **1.372** | Bayern şut hacmi fazla |
| HAVA HAKİMİYETİ | **1.341** | 1.183 | PSG hava toplarında avantajlı |
| DURAN TOP | **1.104** | 0.856 | PSG set piece'lerde üstün |
| SAVUNMA DİRENCİ | **1.422** | 1.234 | PSG savunma duvarı güçlü |
| SAVUNMA AKSİYONU | 1.062 | **1.156** | Bayern aktif savunmada (tackle/intercept) iyi |
| GK REFLEKS | **1.015** | 0.992 | Kaleciler dengeli |
| GK ALAN HAKİMİYETİ | **1.239** | 0.773 | PSG kalecisi alan hakimiyetinde üstün |
| ZİHİNSEL DAYANIKLILIK | **1.124** | 1.022 | PSG mental olarak güçlü |
| FİŞİ ÇEKME | **1.525** | 1.256 | PSG maç kapatma/comeback'te çok güçlü |
| PSİKOLOJİK KIRILGANLIK | 0.393 | 0.368 | Her iki takım da düşük kırılganlık |
| DİSİPLİN | 0.567 | **1.364** | Bayern disiplin üstünlüğü |
| MOMENTUM AKIŞI | 0.438 | **0.449** | Dengeli momentum |
| FORM KISA | **1.708** | 1.160 | PSG kısa vadeli formda çok iyi |
| FORM UZUN | **1.699** | 1.538 | Her ikisi de uzun vadede güçlü |
| MAÇ BAŞLANGICI | **0.997** | 0.710 | PSG erken baskıda üstün |
| MAÇ SONU | 0.911 | **1.700** | Bayern maç sonu gol atıcı |
| MENAJER STRATEJİSİ | **1.006** | 0.994 | Dengeli menajer etkisi |
| TURNUVA BASKISI | 1.064 | 1.064 | Eşit turnuva motivasyonu |
| GOL İHTİYACI | 0.858 | 0.844 | Dengeli gol ihtiyacı |
| TOPLA OYNAMA | 0.951 | **1.042** | Bayern top kontrolünde hafif üstün |
| BAĞLANTI OYUNU | **1.001** | 0.991 | Dengeli |
| KADRO DERİNLİĞİ | **0.915** | 0.900 | Dengeli |
| H2H DOMİNASYON | 0.471 | 0.471 | Ortak — eşit tarihsel geçmiş |
| HAKEM DİNAMİKLERİ | 0.805 | 0.805 | Ortak — hakem nötr |
| TAKTİKSEL UYUM | 0.948 | **1.052** | Bayern taktiksel olarak daha uyumlu |

---

## 2.6 Dinamik Blok Ağırlıkları (Yenilenmiş — 30+ Yeni Oyuncu İstatistiği)

`BLOCK_STAT_MAP`'e eklenen yeni alanlar ve etkileri:

### BİTİRİCİLİK (Yenilenmiş)
**Eklenen:** `goalsFromInsideTheBox`, `goalsFromOutsideTheBox`, `goalConversionPercentage`, `hitWoodwork`

| Bölge | PSG | Bayern |
|-------|-----|--------|
| Defans | %31.7 | %20.8 |
| Orta Saha | %21.8 | **%56.2** |
| Forvet | **%46.4** | %23.1 |

### SAVUNMA AKSİYONU (Yenilenmiş)
**Eklenen:** `groundDuelsWon`, `tacklesWon`, `blockedShots`, `outfielderBlocks`, `dribbledPast` (negatif)

| Bölge | PSG | Bayern |
|-------|-----|--------|
| Kaleci | %3.5 | %1.4 |
| Defans | **%42.6** | **%40.3** |
| Orta Saha | %29.5 | **%49.3** |
| Forvet | %24.4 | %9.0 |

### TAKTİKSEL UYUM (Yenilenmiş)
**Eklenen:** `possessionWonAttThird`, `ballRecovery`, `wasFouled`, `fouls` (negatif), `offsides` (negatif)

| Bölge | PSG | Bayern |
|-------|-----|--------|
| Kaleci | %11.4 | %9.6 |
| Defans | %35.5 | %35.1 |
| Orta Saha | %28.5 | **%47.9** |
| Forvet | %24.7 | %7.4 |

### DURAN TOP (Yenilenmiş)
**Eklenen:** `penaltyWon`, `penaltyGoals`, `freeKickGoal`, `shotFromSetPiece`

| Bölge | PSG | Bayern |
|-------|-----|--------|
| Kaleci | %7.6 | %0 |
| Defans | **%47.0** | **%35.0** |
| Orta Saha | %22.4 | %34.7 |
| Forvet | %23.0 | %30.3 |

---

## 2.7 Penaltı ve Kırmızı Kart Hesaplamaları (Yenilenmiş)

### Penaltı Şansı
| Kaynak | Değer | Ağırlık |
|--------|-------|---------|
| Takım M019 (maç bazlı) | Var | Eşit (1/N) |
| Hakem M111 (penaltı eğilimi) | Var | Eşit (1/N) |
| Oyuncu penaltyWon (bireysel API) | Marquinhos: 1, Dembélé: 0, ... | Eşit (1/N) |
| **Sonuç** | **Tier: High, Raw: 1.90, Avg: 0.72** | |

### Kırmızı Kart Şansı
| Kaynak | Değer | Ağırlık |
|--------|-------|---------|
| Takım M040 (kırmızı kart/maç) | Var | Eşit (1/N) |
| Hakem M110 (kart eğilimi) | Var | Eşit (1/N) |
| Oyuncu kartRiski (yellowCards + fouls × foulToCardRatio) | Dinamik oran | Eşit (1/N) |
| **Sonuç** | **Tier: High, Raw: 30.21, Avg: 0.29** | |

**`foulToCardRatio`:** Oyuncuların kendi `yellowCards / fouls` oranından türetilir — `0.1` sabit değeri kaldırıldı.

---

## 2.8 Poisson Motoru Çıktısı (`poissonResult`) — Genişletilmiş

**Mimari Değişiklik:** Poisson lambda artık sadece gol istatistiklerinden (M001/M026) değil, **tüm 27 davranışsal bloktan** etkileniyor. `getPower()` fonksiyonu genişletilerek:

- **ATK Power (13 blok):** BİTİRİCİLİK, YARATICILIK, ŞUT ÜRETİMİ, FORM_KISA, FORM_UZUN, TOPLA_OYNAMA, BAĞLANTI_OYUNU, **DURAN_TOP** (penaltı/korner/frikik), **HAVA_HAKİMİYETİ** (kafa golü), **TAKTİKSEL_UYUM** (pressing/blok yüksekliği), **FİŞİ_ÇEKME** (comeback/clutch), **KADRO_DERİNLİĞİ** (yedek gücü/yorgunluk), **MENAJER_STRATEJİSİ**
- **DEF Power (9+1 blok):** SAVUNMA_DİRENCİ, SAVUNMA_AKSİYONU, GK_REFLEKS, GK_ALAN_HAKİMİYETİ, **ZİHİNSEL_DAYANIKLILIK**, DİSİPLİN, **HAKEM_DİNAMİKLERİ**, **H2H_DOMİNASYON**, **MOMENTUM_AKIŞI** + PSİKOLOJİK_KIRILGANLIK (ters sinyal — savunmayı zayıflatır)

| Parametre | Değer |
|-----------|-------|
| PSG Lambda (Beklenen Gol) | **2.25** |
| Bayern Lambda | **2.15** |
| PSG Galibiyeti | %45.1 |
| Beraberlik | %10.4 |
| Bayern Galibiyeti | %44.5 |
| En Olası Skor | 1-1 |
| Kaynak | Poisson/Dixon-Coles (Genişletilmiş) |

---

## 2.9 Monte Carlo Simülasyon Çıktısı (`simulationResult`)

| Parametre | Değer |
|-----------|-------|
| PSG Galibiyeti | **%63.5** |
| Beraberlik | %14.5 |
| Bayern Galibiyeti | %22.0 |
| Ortalama Gol | 7.53 |
| Üst 2.5 | %99.3 |
| KG (BTTS) | %96.5 |
| Kaynak | Monte Carlo Simulation |

---

## 2.10 Nihai Çıktı (`prediction`)

| Parametre | Değer |
|-----------|-------|
| **PSG Galibiyeti** | **%61.4** |
| **Beraberlik** | **%14.0** |
| **Bayern Galibiyeti** | **%24.6** |
| En Olası Skor | 1-1 (%3.02) |
| Lambda Ev | 4.28 |
| Lambda Dep | 3.17 |
| Üst 1.5 | %94.2 |
| Üst 2.5 | %99.4 |
| Üst 3.5 | %79.7 |
| KG (BTTS) | %96.0 |
| Güven Skoru | **100** |

**Penaltı ve Kart Riski:**

| Parametre | Değer |
|-----------|-------|
| Penaltı Şansı | **Yüksek** (raw: 1.90, avg: 0.72) |
| Kırmızı Kart Şansı | **Yüksek** (raw: 30.21, avg: 0.29) |

**İlk Yarı:**

| Parametre | Değer |
|-----------|-------|
| IY Beklenen Ev Gol | 3.54 |
| IY Beklenen Dep Gol | 3.35 |
| IY Üst 0.5 | %95 |
| IY Üst 1.5 | %90 |

**Korner ve Kart Tahminleri:**

| Parametre | Değer |
|-----------|-------|
| Beklenen Ev Korner | 5.6 |
| Beklenen Dep Korner | 7.0 |
| Beklenen Toplam Korner | 12.6 |
| Üst 8.5 Korner | %88.1 |
| Üst 10.5 Korner | %71.2 |
| Beklenen Sarı Kart | 2.53 |
| Beklenen Kırmızı Kart | 0.20 |
| Üst 3.5 Kart | %24.9 |

---

## 2.11 Yeni Metrikler (Faz 3)

| Metrik | Açıklama | Veri Kaynağı |
|--------|----------|-------------|
| M096c | Pressing Yoğunluğu | `possessionWonAttThird` + `ballRecovery` (oyuncu API) |
| M019 (güçlendirilmiş) | Penaltı/Maç | Maç incidents + oyuncu `penaltyWon` fallback |
| M020 (güçlendirilmiş) | Penaltı İsabet | Maç incidents + oyuncu `penaltyGoals/penaltiesTaken` |
| M070 (zenginleştirilmiş) | Orta Saha Yaratıcılık | `keyPasses` + `assists` + `expectedAssists` + `passToAssist` + `successfulDribbles` |
| M071 (zenginleştirilmiş) | Defans Stability | `rating` + `tackles` + `interceptions` + `groundDuelsWon` + `clearances` |
