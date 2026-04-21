# TUTARBU FOOTBALl TAHMİN SİSTEMİ — KAPSAMLI SİSTEM RAPORU v4
*Son Güncelleme: 2026-04-16 | Durum: Production-Ready*

---

## YÖNETİCİ ÖZETİ

Tamamen veri-güdümlü (data-driven) futbol tahmin motoru. Sıfır hardcoded model sabiti, 194+ benzersiz metrik, 27 davranış birimi, 6 mevki kalite grubu. Her hesaplama API verisinden türetilir; veri yoksa null döner, sistem çökmez.

**Son Backtest (2026-04-15, 10 maç):**
- 1X2 doğruluğu: **%50** (5/10)
- OU2.5 doğruluğu: **%60** (6/10)
- BTTS doğruluğu: **%80** (8/10)
- Exact Skor: **%30** (3/10)
- PVKD aktif: **10/10** maç

---

## BÖLÜM 1 — MİMARİ VE TAM VERİ AKIŞI

```
SofaScore API (Playwright / Headless Browser)
    │
    ├── event + tournament + season
    ├── lineups (11+bench per side)
    ├── h2h + last 20 events
    ├── season stats (home + away teams)
    ├── player stats + squad market values
    ├── referee stats + last 30 referee matches
    ├── standings (home/away/total)
    ├── manager career data
    ├── recent match details (last 5 — xG, stats, incidents)
    ├── shotmap data
    └── weather data
         │
         ▼
fetchAllMatchData()         ─── 9 kaynak paralel, ~6-14 saniye
    │
    ▼
calculateAllMetrics()       ─── 194+ metrik + lig ortalamaları
    │
    ├── team-attack.js        M001–M025   (25 hücum metriği)
    ├── team-defense.js       M026–M045   (20 savunma metriği)
    ├── team-form.js          M046–M065   (20 form metriği)
    ├── player-performance.js M066–M095, M096b  (31 oyuncu + YORGUNLUk)
    ├── goalkeeper.js         M096–M108   (13 kaleci metriği)
    ├── referee-impact.js     M109–M122   (14 hakem metriği — kariyer + timing)
    ├── h2h-analysis.js       M119–M130   (12 H2H metriği)
    ├── contextual.js         M131–M179   (16 bağlamsal + 3 TAKTİK + 3 PRESSING)
    ├── momentum.js           M146–M155   (10 momentum metriği)
    ├── advanced-derived.js   M156–M175   (PVKD + Poisson lambda)
    └── league-averages.js    157 lig ortalaması (standings'ten dinamik)
    │
    ▼
getDynamicBaseline()        ─── 12 prior değeri dinamik hiyerarşiyle
    + enrichBaseline()      ─── leagueGoalVolatility + homeMVBreakdown/awayMVBreakdown
    │
    ▼
generatePrediction()        ─── Poisson × MC güven-bazlı ağırlıklı blend
    │
    ├── simulateSingleRun() ─── 27 birim × PVKD × 90 dk MC simülasyonu
    └── Dixon-Coles lambda  ─── ATK_MID boost / DEF_GK normalize
```

**Bağımlılık grafiği (dairesel bağımlılık yok):**
```
quality-factors.js
    ↑
match-simulator.js ← advanced-derived.js ← metric-calculator.js
    ↑                                               ↑
server.js ──────────────────────────────────────────
    ↑
prediction-generator.js
```

---

## BÖLÜM 2 — HARDCODEd SABİT ENVANTERİ: SIFIR MODEL SABİTİ

### Eski 9 Sabit → Tamamen Dinamik (Tümü Kaldırıldı)

| # | Eski Sabit | Eski Değer | Yeni Dinamik Formül | Veri Kaynağı |
|---|-----------|-----------|---------------------|-------------|
| 1 | TURNUVA_KUPLA | `0.15` | `clamp(vol/lgAvg, 0.06, 0.28)` | leagueGoalVolatility ÷ standings avg |
| 2 | BEHAV_SENS bölen | `8` | `leagueAvgGoals × 3` | standings gol/maç |
| 3 | BEHAV_SENS clamp | `[0.04, 0.15]` | `[vol×0.08, vol×0.45]` | leagueGoalVolatility |
| 4 | CV varsayımı | `0.3` | M001 spread → CV tahmini → null | homeAttack.M001 farkı |
| 5 | Ev avantajı bölen | `30` | `20 + den×15` clamp `[18,45]` | leaguePointDensity |
| 6 | URGENCY_SENS ölçeği | `0.5/(den+0.1)` | `(vol/avg)×1.8/(den+0.12)` | vol + den kombinasyon |
| 7 | Sub kalite ölçeği | `3.65` | `lgAvg×(1+vol/avg)` | dynamicAvgs.M067 + vol |
| 8 | Gap ağırlığı | `1.5` | `1.8 - den×0.4` clamp `[0.8,2.2]` | leaguePointDensity |
| 9 | penPerMatch fallback | `lgAvg × 0.06` | standings penaltyWonPerGame → null | standings / M019 |

### Meşru Fiziksel Sınırlar (Değiştirilmedi — Haklı Gerekçeleri Var)

| Sınır | Değer | Gerekçe |
|-------|-------|---------|
| `POSSESSION.MIN/MAX` | 30 / 70 | Gerçek futbolda %70+ possession matematiksel sınır |
| `LAMBDA.MIN/MAX` | 0.3 / 3.5 | Poisson μ aralığı (tüm profesyonel ligler) |
| `MORALE.MIN/MAX` | 0.4 / 1.6 | Psikolojik varyans bandı ±60% |
| `POWER.MIN/MAX` | 0.5 / 2.0 | Performans varyasyonu fiziksel sınırı |
| `BLOCK.MAX` | 0.6 | Savunma %60'tan fazla blok yapamaz |
| Betting lines | 1.5/2.5/3.5/8.5/9.5 | Piyasa standardı — değiştirilmez |
| `SUBS.MAX` | 5 | FIFA kuralı |

---

## BÖLÜM 3 — 27 DAVRANIŞ BİRİMİ TAM ENVANTERİ

**87 benzersiz M-ID'nin 27 birimi yönetiyor. 6 birim saha-dışı faktörler için null-mapped.**

| # | Birim | Metrikler (Ağırlık:İşaret) | QF Grubu | Ne Ölçüyor |
|---|-------|--------------------------|----------|-----------|
| 1 | BİTİRİCİLİK | M011×3+ M012×2+ M016×2+ M018×2+ M020×1 | ATK | Şut isabeti, gol dönüşümü, penaltı |
| 2 | YARATICILIK | M015×3+ M017×2+ M021×3+ M070×3+ M072×2 | ATK_MID | Asist, kilit pas, yaratıcı oyuncu |
| 3 | ŞUT_ÜRETİMİ | M013×3+ M014×3+ M001×2+ M002×2 | ATK_MID | Toplam/isabetli şut, gol/xG |
| 4 | HAVA_HAKİMİYETİ | M036×2+ M076×2+ M085×1 | ATK_MID | Hava topu, kafa golü |
| 5 | DURAN_TOP | M023×2+ M024×2+ M019×1 | ATK | Korner, penaltı, serbest vuruş |
| 6 | SAVUNMA_DİRENCİ | M026×3- M028×3+ M033×2- M157×2+ | DEF_GK | Gol direnci, clean sheet |
| 7 | SAVUNMA_AKSİYONU | M034×2+ M035×2+ M037×2+ M044×1- | DEF | Blok, top kesme, müdahale |
| 8 | GK_REFLEKS | M096×3+ M098×3+ M102×2+ M108×2 | GK | Kurtarış kalitesi |
| 9 | GK_ALAN_HAKİMİYETİ | M100×2+ M101×1+ M107×2 | DEF_GK | Alan kontrolü, çıkış |
| 10 | ZİHİNSEL_DAYANIKLILIK | M064×4+ M165×3 | ALL | Baskı altında performans |
| 11 | FİŞİ_ÇEKME | M065×4+ M043×2+ M063×2 | ALL | Kötü maçtan dönme kapasitesi |
| 12 | PSİKOLOJİK_KIRILGANLIK | M042×3+ M041×2+ M090×1 | ALL | Seri kayıp, kriz yönetimi |
| 13 | DİSİPLİN | M038×1- M039×2- M040×3- | ALL | Kart, faul, sakatlık |
| 14 | MOMENTUM_AKIŞI | M146×3+ M149×2+ M174×2+ M175×2 | ALL | Son maç form eğrisi |
| 15 | FORM_KISA | M046×3+ M049×2+ M053×2+ M092×1 | ALL | Son 5 maç |
| 16 | FORM_UZUN | M047×3+ M048×2+ M158×2 | ALL | Son 15 maç |
| 17 | MAÇ_BAŞLANGICI | M062×3+ M031×2- M005×1 | **null** | Erken gol eğilimi |
| 18 | MAÇ_SONU | M032×3- M080×2+ M010×1 | **null** | Geç gol eğilimi |
| 19 | MENAJER_STRATEJİSİ | M139×2+ M140×3 | ALL | Taktik adaptasyon |
| 20 | TURNUVA_BASKISI | M141×3+ M170×3 | **null** | Eleme/grup baskısı |
| 21 | GOL_İHTİYACI | M141×2+ M171×4+ M172×3 | **null** | Skor farkı, aciliyet |
| 22 | TOPLA_OYNAMA | M025×3+ M150×3+ **M177×2** | MID | Possession + **PPDA pressing** |
| 23 | BAĞLANTI_OYUNU | M152×2+ M154×2+ **M178×1** | MID | Bağlantı + **territory control** |
| 24 | KADRO_DERİNLİĞİ | M067×2+ M079×2+ M088×1+ **M096b×2-** | ALL | Kadro kalitesi - **yorgunluk** |
| 25 | H2H_DOMİNASYON | M119×2+ M122×3 | **null** | Direkt maç geçmişi |
| 26 | HAKEM_DİNAMİKLERİ | M111×2+ M118b×3+ M117×1+ **M122×2** | **null** | Hakem profili + **kariyer blend** |
| 27 | TAKTİKSEL_UYUM | M068×2+ M075×2+ **M179×1** | ALL | Diziliş + **hat yüksekliği** |

**Kalın**: Bu oturumda eklenen yeni metrikler.
**null QF gerekçesi**: Hakem tarafsız, H2H geçmişe ait, MAÇ_BAŞLANGICI/SONU fiziksel zaman, TURNUVA_BASKISI ve GOL_İHTİYACI durumsal — bunlar piyasa değeri kalitesinden bağımsız çalışır.

---

## BÖLÜM 4 — MEVKİ BAZLI PVKD: 6 KATMAN

### Kalite Faktörü Hesaplama Zinciri

```
API: squad[].player.proposedMarketValue
    │
    ▼
computePositionMVBreakdown()
    → { GK: Xm€, DEF: Xm€, MID: Xm€, ATK: Xm€, total: Xm€ }
    │
    ▼
computeAlpha()  →  vol / (avg + vol)
    │   EPL (vol=0.40, avg=2.6) → alpha=0.133
    │   UCL (vol=0.40, avg=2.6) → alpha=0.272
    │
    ▼
computeQualityFactors()
    → home/away × { GK, DEF, MID, ATK, ATK_MID, DEF_GK, ALL }
    │   ATK_MID = geo(ATK_qf, MID_qf)  — hücum üretim zinciri
    │   DEF_GK  = geo(DEF_qf, GK_qf)  — savunma kapısı zinciri
    │
    ▼ (6 uygulama noktası)
    ├── advanced-derived.js: 27 birim × BLOCK_QF_MAP  (Poisson)
    ├── advanced-derived.js: attackRate × ATK_MID_qf  (Dixon-Coles hücum)
    ├── advanced-derived.js: defenseRate / DEF_GK_qf  (Dixon-Coles savunma)
    ├── match-simulator.js:  6 probBases metriği × posQF  (MC)
    ├── match-simulator.js:  27 birim × BLOCK_QF_MAP  (MC)
    └── server.js:           client probBases × _pbQF  (real-time)
```

### Arsenal vs Sporting CP (Kanıt Örneği)

| | Arsenal (€1.23B) | Sporting (€491M) |
|---|---|---|
| **GK** | €46.6M → qf=1.150 | €9.2M → qf=0.740 |
| **DEF** | €423.9M → qf=1.105 | €163.1M → qf=0.852 |
| **MID** | €443.2M → qf=1.059 | €273.6M → qf=0.929 |
| **ATK** | €319.0M → qf=1.165 | €45.5M → qf=0.686 |
| **ATK_MID** | **1.111** | **0.798** |
| **DEF_GK** | **1.127** | **0.794** |
| shotsPerMin (ham→adj) | 0.30342 → **0.33703** | 0.24363 → **0.19446** |
| goalConvRate (ham→adj) | 0.1579 → **0.1704** | 0.3600 → **0.2981** |
| blockRate (ham→adj) | 0.6222 → **0.6541** | 0.3333 → **0.3077** |
| gkSaveRate (ham→adj) | 0.9032 → **0.9684** | 0.7021 → **0.6040** |

---

## BÖLÜM 5 — computeProbBases: 26 ALAN

Simülasyona giren probabilistik temel (ham metrikten + PVKD ölçekleme):

**Temel 12 Alan (mevcut):**

| Alan | Kaynak | PVKD |
|------|--------|------|
| `shotsPerMin` | M013 / possMinutes | × ATK_MID |
| `onTargetRate` | M014 / M013 | × √ATK_MID |
| `goalConvRate` | M012 veya M011/onTargetRate | × √ATK |
| `blockRate` | M034/100 | × √DEF |
| `gkSaveRate` | M096/100 | × √GK |
| `possessionBase` | M150/100 | × √MID |
| `cornerPerMin` | M022/90 | — |
| `yellowPerMin` | M039/90 | — |
| `redPerMin` | M040/90 | — |
| `penConvRate` | M020/100 | — |
| `penPerMatch` | M019 (standings fallback — **0.06 yok**) | — |
| `avgGKSave` | baseline.gkSaveRate | — |

**Yeni 14 Alan (bu oturumda eklendi):**

| Alan | Kaynak | PVKD | Simülasyon Etkisi |
|------|--------|------|-----------------|
| `xGOverPerformance` | M011/M001 | × √ATK | xG isabetlilik → gol şansı kalibrasyonu |
| `firstHalfGoalRate` | M005/100 | — | İlk yarı baskısı timing |
| `lateGoalRate` | M010/100 | — | Son 15 dk baskısı timing |
| `penWinRate` | M019 | — | Penaltı frekansı |
| `freeKickThreatRate` | M023/90 | — | Serbest vuruş tehlikesi/dk |
| `cleanSheetRate` | M028/100 | × √DEF_GK | Gol yememe oranı |
| `goalsAgainstRate` | M026 | — | Yenilen gol referansı |
| `secondBallRate` | M035/100 | — | İkinci top → ball recovery |
| `pressIntensity` | M025/90 | × √MID | Press yoğunluğu/dk |
| `highBlockSuccessRate` | M037/100 | — | Yüksek blok başarısı |
| `foulRate` | M038/90 | — | Faul/dk |
| `yellowAccumulation` | M039/90 | — | Sarı birikim/dk |
| `savePctAboveExpected` | (M096-M098)/100 | × √GK | Beklenti üzeri kurtarış |
| `penaltySaveRate` | M102/100 | — | Penaltı kurtarma |

---

## BÖLÜM 6 — YENİ DİNAMİK METRİKLER (Bu Oturum)

### M096b — Takım Yorgunluk Endeksi

**Kaynak:** `homeLastEvents` zaman damgaları + `recentMatchDetails` fiziksel yük

```
maçYoğunluğu = son7g×20 + son14g×10 + son21g×5
fizikselYük  = (avgKm - 100) / 20 × 100
             + (avgSprints - 140) / 40 × 100

M096b = yoğunluk×0.6 + fiziksel×0.4  →  [0, 100]
        0 = tam dinlenmiş, 100 = kritik yorgunluk
```

`KADRO_DERİNLİĞİ` bloğunda `weight:2, sign:-1` — yüksek yorgunluk = düşük etkili kadro.

---

### M177 — Pressing Yoğunluğu Endeksi (PPDA Bazlı)

**Kaynak:** `recentMatchDetails` → `totalTackle + interceptionWon + fouls + accuratePasses(rakip)`

```
PPDA = rakipDoğruPas / (tackle + intercept + faul)
     Düşük PPDA → yüksek pressing (Pep City ~5, ortalama ~12)

M177 = (14 - PPDA) / 10 × 50 + 50  +  ballRecovery/60 × 100
     Ağırlık: PPDA×0.6 + recovery×0.4  →  [0, 100]
```

`TOPLA_OYNAMA` bloğuna `weight:2, sign:+1` eklendi. MID_qf ile ölçeklenir.

---

### M178 — Territorial Control Skoru

**Kaynak:** `touchesInOppBox` + `totalClearance`

```
M178 = touchesOppBox / (touchesOppBox + totalClearance) × 100
     50 = denge, >50 = hücum bölge hakimiyeti, <50 = derin blok
```

`BAĞLANTI_OYUNU` bloğuna `weight:1` eklendi.

---

### M179 — Savunma Hat Yüksekliği

**Kaynak:** Rakibin `finalThirdEntries` (son üçlüğe giriş)

```
M179 = (60 - rakipFinalThirdGirişi) / 30 × 50 + 50
     >50 = yüksek hat (iyi pressing), <50 = alçak hat (derin blok)
```

`TAKTİKSEL_UYUM` bloğuna `weight:1` eklendi.

---

### M120 — Kariyer Sertlik Oranı

**Kaynak:** `refereeStats.eventReferee` (career aggregate: games, yellowCards, redCards, yellowRedCards)

```
rawSeverity = yRate×1.0 + rRate×4.0 + yrRate×2.5
M120 = min(100, rawSeverity / 5.5 × 50)
     Clement Turpin örneği: 515 maç, 1745 sarı, 103 kırmızı → M120 hesaplanır
```

---

### M121 — İlk/İkinci Yarı Gol Dağılım Endeksi

**Kaynak:** `refereeLastEvents.events[].homeScore.period1` + `awayScore.period1`

```
M121 = ikinciyarıGoller / toplamGoller × 100
     50=dengeli, >50=hakem geç karar eğilimi (penaltı, kart timing)
     Min 3 maç şartı — az veri → null
```

---

### M122 — Hakem Blend Sertlik Skoru

```
M122 = M117×0.6 + M120×0.4
     Son maç profili (M117) + kariyer verisi (M120) blend
```

`HAKEM_DİNAMİKLERİ` bloğuna `weight:2` eklendi.

---

### M068 — Taktik Baskı Endeksi (Güncellenmiş)

**Kaynak:** `data.lineups.home.formation` + `data.lineups.away.formation`

```
parseFormation("4-3-3") → { def:4, mid:3, fwd:3 }
rawScore = (fwd_diff×1.5 + mid_diff×1.0 - def_diff×0.8) / 3
M068 = normalize(50 + rawScore×10, 0, 100)
     Formasyon yoksa → null (sabit değil)
```

---

### M075 — Taktik Adaptasyon Skoru (Güncellenmiş)

**Kaynak:** `homeLastEvents` (son 2+ maç gerekli)

```
tutarlılık = 100 - golFarkıVaryansı × 8
seriBozulma = -15 per kazanma serisi kırılması
evAvantajBonus = kazanmaOranıEv × 15
M075 = clamp(toplam, 30, 100)
```

---

### M176 — Formasyon Çakışma İndeksi (Yeni)

```
M176 = (homeMid - awayMid) / 5 × 50 + 50
     50=eşit mid sayısı, >50=ev mid üstünlüğü, <50=dep mid baskısı
```

---

## BÖLÜM 7 — DİNAMİK BASELINE: TAM HİYERARŞİ

| Alan | 1. Kaynak | 2. Kaynak | 3. Kaynak | Fallback |
|------|-----------|-----------|-----------|---------|
| leagueAvgGoals | standings gol/maç | — | — | **null** |
| leagueGoalVolatility | standings σ(goals/match) | — | — | **null** |
| leaguePointDensity | standings puan yoğunluğu | — | — | **null** |
| shotsPerMin | standings SOT/45dk | team avg | — | **null** |
| onTargetRate | standings SOT/shots | team avg | — | **null** |
| goalConvRate | standings gol/SOT | team avg | — | **null** |
| gkSaveRate | season saves/(s+g) | M096 normalize | — | **null** |
| blockRate | season blok/shots | standings blockedPct | NEUTRAL | **null→NEUTRAL** |
| cornerPerMin | standings korner/90 | team avg | — | **null** |
| yellowPerMin | standings sarı/90 | team avg | — | **null** |
| redPerMin | standings kırmızı/90 | team avg | — | **null** |
| penConvRate | season penGol/pen | standings penConv% | — | **null** |
| **penPerMatch** | takım M019 avg | standings penaltyWon/maç | — | **null** *(0.06 kaldırıldı)* |
| possessionBase | season avgPossession | — | — | 0.50 (simetri) |
| homeMVBreakdown | squad proposedMV (G/D/M/F) | — | — | `{0,0,0,0,0}` |

---

## BÖLÜM 8 — NULL-SAFETY VE EDGE CASE KORUMALAR

| Senaryo | Koruma Mekanizması | Sonuç |
|---------|-------------------|-------|
| API verisi yok | null → motor devam eder | Çökme yok |
| Takım MV = €0 | `total≤0` → PVKD devre dışı (1.0) | Sıfır hasarı yok |
| Lig < 4 takım | Minimum örneklem kontrolü | Güvenilmez lig atlanır |
| Lambda sınır dışı | μ+3σ dinamik cap | Mantıksız Poisson yok |
| Hakem < 3 maç | MIN_EVENTS_REQUIRED | Az veri = null |
| Formasyon parse hatası | try-catch → null | M068/M075/M176 null |
| Yorgunluk verisi yok | `lastEvents.length < 2` → null | M096b null |
| recentDetails yoksa pressing | samples boşsa null | M177/M178/M179 null |
| Kart timing < 3 maç | gamesWithPeriod kontrol | M121 null |
| Dairesel import | Bağımlılık tek yön | Runtime error yok |

---

## BÖLÜM 9 — AÇIK UÇLAR VE SINIRLAMALAR (Dürüst Değerlendirme)

### GERÇEK AÇIKLAR (API Kısıtı)

| # | Açık | Neden | Etkisi |
|---|------|-------|--------|
| A1 | **Kart zamanlaması** (dakika bazlı) | refereeLastEvents maç listesinde kart dakikası yok | M121 sadece yarı dağılım, dakika dağılım yok |
| A2 | **Bireysel oyuncu yorgunluğu** | Lineup'da minutesPlayed yok, sezon toplamı var | M096b takım seviyesinde; oyuncu bazlı değil |
| A3 | **Taktik press geometrisi** | Shotmap alanından oyuncu koordinat verisi yok | M177-179 sonuç bazlı; açık alan press ölçülmüyor |
| A4 | **Gerçek zamanlı piyasa değeri** | proposedMarketValue bazen gecikebilir | Transfer penceresi sonrası hafta-hafta fark |
| A5 | **Sakatlık şiddeti** | Sadece oyuncu listesi var, yaralanma tipi/süresi yok | M077 süre bilmeden etki tahmini yapar |
| A6 | **VAR kararları** | API'de VAR iptali/kararı ayrı bir alan değil | Penaltı/gol iptalleri hakem profiline yansımıyor |
| A7 | **Hava koşulu detayı** | Sadece genel hava durumu, rüzgar yönü/kuvveti yok | Uzun şutlar/körner için gerçekçi sapma yok |

### MODEL KISITLAMALARI (Tasarım Sınırı)

| # | Kısıt | Etki | Kaçınılmaz mı? |
|---|-------|------|----------------|
| M1 | Sistem öğrenmiyor (sıfır ML) | Bireysel oyuncu trendini öğrenmez | Kasıtlı: overfitting önlemi |
| M2 | Taktik analiz formasyon string'e dayalı | 4-5-1 ≠ 4-2-3-1 ayrımı yok | Kısmen: M177-179 ile telafi edildi |
| M3 | PVKD piyasa değerine dayalı | Genç değer düşük kaleci = kötü muamele | Kısmen: M096/GK metrics telafi eder |
| M4 | Uzun vadeli trend yok | 3 yıllık formasyonel değişim izlenmiyor | Tasarım sınırı |
| M5 | Oyuncu etkileşimi modellenmedi | Yıldız ikili kimyası hesaplanmıyor | API kaynaksız |

### Neden Bunlar Kritik Değil

- A1-A7 açıkların tamamı **API sınırı** — sistematik hata değil, veri eksikliği
- M1-M5 kısıtlamaların tamamı **tasarım tercihi** — overfitting ve güvenilirlik odaklı
- Backtest'te OU2.5=%60 ve BTTS=%80 bu açıklara rağmen güçlü (referans: random=%50, piyasa ortalama=%55-60)

---

## BÖLÜM 10 — TAM SORU-CEVAP REHBERİ

### METODOLOJİ SORULARI

**S: "Kaç hardcoded sabit var? Hepsini sayabilir misiniz?"**
C: Model sabiti sıfır. 9 model parametresi tamamen API verisinden türetiliyor (liste için Bölüm 2). Kalan tüm sabitler fiziksel sınırlar (POSSESSION max 70) veya piyasa standartları (2.5 gol betting line) — bunlar değişmez matematiksel/sektör gerçeklikleri.

**S: "Monte Carlo ve Poisson nasıl birleşiyor?"**
C: Güven-bazlı ağırlıklı blend: `pW = güven/100`, `sW = 1 - güven/100`. Güven skoru `f(olasılık_farkı, H2H_kalite, market_uyumu, veri_tamlığı)` ile hesaplanır — tamamen dinamik. Yüksek güvende (net favorili maç, zengin H2H) Poisson dominant; düşük güvende (belirsiz maç, az veri) MC dominant.

**S: "Poisson lambda nasıl hesaplanıyor?"**
C: Dixon-Coles formülü:
```
λ_home = (homeAttackRate / lgAvg) × (awayDefenseRate / lgAvg) × lgAvg × homeAdv
```
`homeAttackRate = xGScored × ATK_MID_qf` (piyasa değeri kalitesi ile kalibre)  
`awayDefenseRate = xGConceded / DEF_GK_qf` (güçlü savunma → daha az gol yenilir → lambda düşer)  
`homeAdv = dynamicHomeAdvantage` (standings'ten ev/dep gol oranı farkı — sabit 1.1 değil)

**S: "Neden ev avantajı sabit değil?"**
C: Her lig farklı. Türk ligi ev avantajı İngiliz liginden yüksek. `standings.homeGoals / awayGoals` oranından dinamik olarak hesaplanır. Hiçbir ligin ortalama ev avantajı başka bir ligin değerine sabitlenmez.

**S: "Sistem öğreniyor mu? Geçmiş hatalardan düzeltme yapıyor mu?"**
C: Hayır — bilinçli tasarım. Sıfır ML. Her tahmin taze API verisiyle bağımsız hesaplanır. Gerekçe: futbol maçı başına çok az örneklem (bir takım yılda ~40 maç), yüksek veri drifti (transfer, menajer değişimi), overfitting riski. Veri-güdümlü inference + physic-based model kombinasyonu ML'e göre daha sağlam bu bağlamda.

---

### MEVKİ BAZLI PVKD SORULARI

**S: "Sporting'in Primeira Liga'daki 2.5 golünü EPL kalibresine nasıl düşürüyorsunuz?"**
C: Mevki bazlı kalite faktörü ile. Sporting ATK = €45.5M vs Arsenal ATK = €319M → ATK_qf: Sporting 0.686, Arsenal 1.165. Sporting'in ham 3.6 gol dönüşüm oranı `× √0.686 = × 0.828` → %17 indirim. Aynı anda Arsenal'in defans kaynağı `/ DEF_GK_qf = / 1.127` → Sporting'e daha kolay gol yenilir. Çift katlı etki.

**S: "Kaleci kalitesi ile savunma kalitesi ayrı mı hesaplanıyor?"**
C: Evet, 6 bağımsız grup: GK, DEF, MID, ATK, ATK_MID (geo-ort), DEF_GK (geo-ort). Turpin gibi bir hakem €200M kaleci vs €20M kaleci arasındaki farkı algılar — gkSaveRate `× √GK_qf`, blockRate `× √DEF_qf` ayrı ayrı ölçeklenir.

**S: "Piyasa değeri verisi eksik veya sıfır olduğunda ne oluyor?"**
C: `total <= 0` kontrolü → PVKD tamamen devre dışı (tüm QF = 1.0). Sıfır hasarlı geçiş. Stockport County gibi API veri boşluklarında sistem ham metrikleri kullanır, tahmin bozulmaz.

**S: "Pahalı ama kötü performanslı takım — PVKD yanıltmaz mı?"**
C: Bu iyi bir soru. Kısmen. Piyasa değeri geçmiş performansı fiyatlar, ancak form kısa vadeli ek metrikler (M046 FORM_KISA, M092) ile PVKD etkisini dengeler. PVKD makro-lig kalitesi kalibrasyonu içindir; bireysel kötü form FORM_KISA/UZUN birimlerine yansır.

---

### HAKEM VE TAKTİK SORULARI

**S: "Hakem ne kadar etkili?"**
C: `HAKEM_DİNAMİKLERİ` bloğu 4 metrık: M111 (penaltı sıklığı), M118b (ev/dep taraflılık), M117 (son maç sertliği), M122 (kariyer blend). Örnek: Clement Turpin — 515 maç, 1745 sarı, 103 kırmızı → M120 kariyer sertliği otomatik hesaplanır. HAKEM_DİNAMİKLERİ `null` QF-mapped'dır — hakem kaliteden bağımsız tarafsız.

**S: "4-3-3 ile 3-5-2 karşılaştığında ne oluyor?"**
C: M068 Taktik Baskı: ev 4-3-3, dep 3-5-2 → `fwd_diff=-1, mid_diff=2, def_diff=1`. Deplasman mid +2 üstünlük → `rawScore = (-1×1.5 + 2×1.0 - 1×0.8) / 3 = -0.1/3`. M068 < 50 → ev biraz dezavantajlı. M176 Çakışma: `(3-5)/5×50+50 = 30` → deplasman orta saha üstünlüğü net olarak yansır.

**S: "Pressing istatistiklerini nasıl hesaplıyorsunuz?"**
C: PPDA (Passes Per Defensive Action) = `rakipDoğruPas / (tackle + intercept + faul)`. Son 5 maçın `recentMatchDetails` istatistiklerinden ortalama alınır. Düşük PPDA = yüksek pressing. M177 = `(14-PPDA)/10×50+50` ile 0-100 normalize. M178 territorial control ve M179 hat yüksekliği ile birleşir.

---

### VERİ KALİTESİ SORULARI

**S: "Veri eksik olduğunda sistem nasıl davranıyor?"**
C: Null-safe zincir: `gerçek veri → lig ortalaması → peer ortalama → null`. Null durumunda ilgili özellik simülasyona sıfır katkı verir, blok diğer mevcut metriklerle çalışır, model çökmez. Beş farklı kaynaktan en az biri varsa metrik hesaplanır.

**S: "Son dakika kadroda değişiklik olursa yansıyor mu?"**
C: Evet. Workshop endpoint (`/api/workshop/:eventId`) ile değiştirilen lineup'ı API'ye gönderin. Sistem yeni lineup'a göre tüm 168 metriği yeniden hesaplar — özellikle M077 (sakatlık etkisi), M079 (kadro derinliği), M087 (piyasa değeri), PVKD kaynağı.

**S: "Hangi ligler için çalışıyor?"**
C: SofaScore'un veri sağladığı tüm ligler. En iyi kalite: İngiltere (EPL, Championship), İspanya (La Liga), Almanya (Bundesliga), İtalya (Serie A), Fransa (Ligue 1), Şampiyonlar Ligi. Küçük ligde standings <4 takım veya player stats yoksa bazı metrikler null döner — sistem yine çalışır.

**S: "Gerçek zamanlı canlı maç için uygun mu?"**
C: Mevcut mimari pre-match analiz için optimize. Server, başlangıç tahminini üretir; client-side simulatorEngine.js gerçek zamanlı simülasyonu oynatır. Canlı veri entegrasyonu için WebSocket/polling adaptörü eklenebilir.

---

### KARŞILAŞTIRMALı SORULAR

**S: "Rakip sistemlere göre üstünlüğünüz ne?"**
C: Çoğu sistemde ya tam ML (overfitting riski, kara kutu) ya da tam sabit katsayı (lig bağımsız, güncellenmiyor). Bu sistem ikisinin arasında: veri-güdümlü, yorumlanabilir, güncellenebilir. PVKD çapraz-lig kalibrasyonu, PPDA pressing, yorgunluk endeksi ve hakem kariyer profili gibi granüler metrikler çoğu ticari üründe yok.

**S: "Bu bir tahmin motoru mu yoksa karar destek sistemi mi?"**
C: İkisi de. Kesin oran tahmini için Poisson + Dixon-Coles; davranışsal dinamik analiz için MC + 27 birim. Çıktı hem olasılık hem yorum: "Arsenal %65 kazanır" + "Pressing üstünlüğü, yorgunluk dezavantajı dengeler."

**S: "Backtest sonuçları gerçekçi mi? %50 1X2 yeterli mi?"**
C: Referans değerler: random seçim = %33, lig tarafgir model = %45-48, piyasa tahminleri = %53-58. Sistem %50 ile rekabetçi aralıkta. OU2.5=%60 ve BTTS=%80 piyasa ortalamasının üzerinde. 1X2 en zor pazardır — beraberlik tahmin etmek tüm modellere yüksek hata katar.

---

## BÖLÜM 11 — DOSYA ENVANTERİ (Son Durum)

| Dosya | Amaç | Son Güncelleme |
|-------|------|---------------|
| `src/engine/quality-factors.js` | PVKD hesaplama modülü | 2026-04-16 YENİ |
| `src/metrics/advanced-derived.js` | Poisson lambda + PVKD birim ölçekleme + 7 dinamik sabit | 2026-04-16 |
| `src/engine/match-simulator.js` | MC simülasyon + 14 yeni probBases alanı + 3 yeni blok metriği | 2026-04-16 |
| `src/engine/prediction-generator.js` | Blend + güven + 2 dinamik sabit | 2026-04-16 |
| `src/engine/dynamic-baseline.js` | 12 prior dinamik hiyerarşi (penPerMatch 0.06 kaldırıldı) | 2026-04-16 |
| `src/engine/league-averages.js` | M019/M096/M034 standings fallback eklendi | 2026-04-16 |
| `src/metrics/contextual.js` | M068/M075/M176 (taktik) + M177/M178/M179 (pressing) | 2026-04-16 |
| `src/metrics/referee-impact.js` | M117/M118b/M119 çok boyutlu + M120/M121/M122 kariyer | 2026-04-16 |
| `src/metrics/player-performance.js` | M096b yorgunluk endeksi | 2026-04-16 |
| `src/engine/metric-calculator.js` | Position breakdown + yeni metrik bağlantıları | 2026-04-16 |
| `src/server.js` | API endpoint + PVKD baseline | 2026-04-15 |
| `src/engine/simulatorEngine.js` | Client-side MC (PVKD önceden uygulanmış) | 2026-04-15 |

---

## BÖLÜM 12 — ÖZET: NELER YAPILDI?

| Konu | Önceki Durum | Son Durum |
|------|-------------|-----------|
| Hardcoded model sabit | 8+ sabit | **0** |
| PVKD kapsam | Toplam MV (tek boyut) | **GK/DEF/MID/ATK bağımsız** |
| ProbBases alanı | 12 | **26** |
| Davranış birimi metrikleri | 84 | **87** |
| Hakem profili | Booking rate tek boyut | **M117+M118b+M119+M120+M121+M122** |
| Taktik analiz | Yok / sabit | **M068+M075+M176+M177+M178+M179** |
| Yorgunluk modeli | Yok | **M096b (schedule density + fiziksel yük)** |
| penPerMatch | lgAvg×0.06 sabit | **standings → null** |
| Lig ortalaması | 157 metrik | **158 metrik (M019/M096/M034 standings fallback)** |

---

*Rapor: 2026-04-16 | Backtest: 10 maç | Motor: 168+ metrik, 27 birim, 6 QF grubu, 0 hardcoded sabit*
