# Metrik Raporu — Tüm Metrikler (Gerçek Veriler)

**Maç:** Paris Saint-Germain vs Liverpool  
**Event ID:** 15632083 | **Tarih:** 08.04.2026  
**Rapor Tarihi:** 2026-04-09  
**Hakem:** José María Sánchez Martínez (ID: 129910)

> Tüm değerler SofaScore API'den canlı çekilen verilerle hesaplanmıştır. NULL = o metriğin kaynağı bu maç için mevcut değil.

---

## A. HÜCUM METRİKLERİ

| ID | Açıklama | PSG (Ev) | Liverpool (Dep) | Kaynak |
|----|----------|----------|-----------------|--------|
| M001 | Gol/Maç Ort | **2.55** | **2.15** | homeLastEvents skor ort (son 20) |
| M002 | Konum Gol/Maç | **2.82** | **1.27** | lastEvents ev/dep filtreli |
| M003 | 1.Yarı Gol/Maç | **1.40** | **0.60** | recentMatchDetails incidents ≤45' |
| M004 | 2.Yarı Gol/Maç | **1.80** | **0.60** | recentMatchDetails incidents >45' |
| M005 | Gol % 0-15dk | **18.75%** | **0.00%** | incidents zaman dağılımı |
| M006 | Gol % 16-30dk | **6.25%** | **50.00%** | incidents zaman dağılımı |
| M007 | Gol % 31-45dk | **18.75%** | **0.00%** | incidents zaman dağılımı |
| M008 | Gol % 46-60dk | **6.25%** | **33.33%** | incidents zaman dağılımı |
| M009 | Gol % 61-75dk | **18.75%** | **16.67%** | incidents zaman dağılımı |
| M010 | Gol % 76-90dk | **31.25%** | **0.00%** | incidents zaman dağılımı |
| M011 | Gol/Şut % | **22.54%** | **6.90%** | teamSeasonStats totalShots |
| M012 | İsabetli Şut Gol % | **44.44%** | **16.67%** | teamSeasonStats shotsOnTarget |
| M013 | Şut/Maç | **14.20** | **17.40** | teamSeasonStats |
| M014 | İsabetli Şut/Maç | **7.20** | **7.20** | teamSeasonStats |
| M015 | xG/Maç | **1.96** | **1.78** | teamSeasonStats expectedGoals |
| M016 | xG Dönüşüm | **1.63** | **0.67** | goals/xG (son 5 recentDetails) |
| M017 | Büyük Şans/Maç | **3.60** | **3.20** | teamSeasonStats bigChances |
| M018 | Büyük Şans Gol % | **44.44%** | **12.50%** | teamSeasonStats bigChancesScored |
| M019 | Penaltı Kazanma/Maç | **0.20** | **0.00** | incidents penaltı count/5 |
| M020 | Penaltı Dönüşüm % | **100%** | NULL | incidents (dep 0 penaltı) |
| M021 | Hücum Baskı İndeksi | **25.05** | **28.09** | recentDetails graph pozitif noktalar |
| M022 | Korner/Maç | **4.40** | **4.60** | teamSeasonStats cornerKicks |

---

## B. DEFANS METRİKLERİ

| ID | Açıklama | PSG (Ev) | Liverpool (Dep) | Kaynak |
|----|----------|----------|-----------------|--------|
| M026 | Yenilen Gol/Maç | **1.10** | **1.15** | lastEvents rakip skoru ort |
| M027 | Konum Yenilen Gol | **1.27** | **1.36** | lastEvents konum filtreli |
| M028 | Clean Sheet % | **40.0%** | **35.0%** | lastEvents opp_score==0 |
| M029 | 1.Yarı Yenilen Gol | **0.60** | **0.80** | recentDetails incidents ≤45' |
| M030 | 2.Yarı Yenilen Gol | **0.60** | **0.80** | recentDetails incidents >45' |
| M031 | Erken Gol Yeme % (0-15) | **0.0%** | **25.0%** | incidents time window |
| M032 | Geç Gol Yeme % (76-90) | **0.0%** | **12.5%** | incidents time window |
| M033 | Rakip xG/Maç | **0.96** | **0.98** | recentDetails shotmap rakip xG |
| M034 | Şut Engelleme % | **24.49%** | **35.59%** | stats blockedShots/totalShots |
| M037 | Maç Başı Kesinti | **9.60** | **9.60** | stats interceptions |
| M038 | Faul/Maç | **9.00** | **12.40** | stats fouls |
| M039 | Sarı Kart/Maç | **0.60** | **2.40** | incidents card count/5 |
| M040 | Kırmızı Kart/Maç | **0.00** | **0.00** | incidents red count/5 |
| M041 | Baskı Altında Gol % | **0.0%** | **37.5%** | graph negatif + incidents gol |
| M042 | Önde Gidip Puan Kaybetme % | **0.0%** | **50.0%** | incidents durum analizi |
| M043 | Önde Gidip Kazanma % | **57.14%** | **50.0%** | incidents durum analizi |
| M044 | Tepki Süresi (dk) | **19.0** | **16.0** | incidents gol→tepki gol farkı |
| M045 | Korner Engelleme % | **100%** | **100%** | shotmap corner isGoal |

---

## C. FORM METRİKLERİ

| ID | Açıklama | PSG (Ev) | Liverpool (Dep) | Kaynak |
|----|----------|----------|-----------------|--------|
| M046 | Son 5 Maç Puan % | **80.0%** | **26.67%** | lastEvents son 5 W/D/L |
| M047 | Son 10 Maç Puan % | **73.33%** | **53.33%** | lastEvents son 10 |
| M048 | Son 20 Maç Puan % | **73.33%** | **56.67%** | lastEvents son 20 |
| M049 | Galibiyet Serisi | **4** | **0** | streaks endpoint |
| M050 | Yenilmezlik Serisi % | **40.0%** | **0.0%** | streaks + ratingAvg |
| M051 | Gol Atma Serisi | **16** | **0** | streaks scoring streak |
| M052 | Clean Sheet Serisi | **0** | **0** | streaks clean sheet |
| M053 | Gol Trendi | **+0.60** | **-0.54** | son 3 vs önceki 3 maç karşılaştırması |
| M054 | Gol Yeme Trendi | **-0.14** | **+0.60** | aynı mantık ters yön |
| M055 | Lig Konum Puanı % | **72.22%** | **94.44%** | standings total (11./36, 3./36) |
| M056 | Ev Konum Puanı % | **66.67%** | **75.0%** | standings home |
| M057 | Dep Konum Puanı % | **88.89%** | **97.22%** | standings away |
| M058 | Gol Farkı | **+10** | **+12** | standings goalsFor-goalsAgainst |
| M059 | Over 2.5 % | **80.0%** | **70.0%** | lastEvents son 20 |
| M060 | Under 2.5 % | **20.0%** | **30.0%** | lastEvents son 20 |
| M061 | BTTS % | **55.0%** | **55.0%** | lastEvents son 20 |
| M062 | İlk Gol Atma % | **80.0%** | **40.0%** | recentDetails incidents (son 5) |
| M063 | İlk Gol → Kazanma % | **100%** | **50.0%** | incidents kondisyon analizi |
| M064 | Geriden Gelme % | **0.0%** | **25.0%** | incidents geriden puan alma |
| M065 | Fişi Çekme İndeksi % | **64.29%** | **80.0%** | büyük galibiyet oranı |

---

## D. OYUNCU PERFORMANSI

| ID | Açıklama | PSG (Ev) | Liverpool (Dep) | Kaynak |
|----|----------|----------|-----------------|--------|
| M066 | İlk 11 Rating Ort | **7.11** | **7.09** | playerStats seasonStats.rating ağırlıklı |
| M067 | Yedek Rating Ort | NULL | NULL | playerStats sub rating (sezon verisi yok) |
| M068 | Rating Farkı (max-min) | **1.25** | **1.02** | playerStats starter rating range |
| M069 | Forvet Gol Katkısı % | **43.48%** | **11.43%** | position=F goals+assists/total |
| M070 | Orta Saha Yaratıcılık | **1.39** | **2.26** | position=M keyPasses+assists/app |
| M071 | Defans Stabilitesi | **7.02** | **6.96** | position=D avg rating |
| M072 | Oyuncu xG Katkısı | **0.20** | **0.27** | playerStats expectedGoals max/total |
| M073 | Kilit Oyuncu Bağımlılığı % | **23.91%** | **25.71%** | max_contribution/total |
| M074 | Dribling Başarı % | **100%** | **100%** | successfulDribbles/totalDribbles |
| M075 | Pas Tamamlama % | **90.91%** | **86.50%** | accuratePasses/totalPasses |
| M076 | Hava Topu % | **100%** | **100%** | aerialDuelsWon/total |
| M077 | Sakatlanmış Oyuncu Etkisi | **0.0** | **0.0** | missingPlayers type=injured |
| M078 | Cezalı Oyuncu Etkisi | **0.0** | **0.0** | missingPlayers type=suspended |
| M079 | Kadro Derinliği % | **73.15%** | **86.46%** | player_count + M066 |
| M080 | Dakika Dağılımı (Fatigue) | **675** | **570** | seasonStats minutesPlayed max-min |
| M082 | Saldırgan Nitelik | **44.64** | **43.00** | attributes.attacking avg |
| M083 | Savunma Nitelik | **41.64** | **43.45** | attributes.defending avg |
| M084 | Teknik Nitelik | **46.82** | **47.00** | attributes.technical avg |
| M087 | Kadro Piyasa Değeri | **100** | **100** | proposedMarketValue log10 normalize |

---

## E. KALECİ METRİKLERİ

| ID | Açıklama | PSG (Ev) | Liverpool (Dep) | Kaynak |
|----|----------|----------|-----------------|--------|
| M096 | Kurtarış % | **73.08%** | **53.85%** | saves/(saves+conceded) sezonda |
| M097 | Kurtarış/Maç | **3.17** | **1.40** | saves/appearances |
| M098 | xG Bazlı Verim | **-0.24** | **-0.63** | (opp_xg-actual)/opp_xg — negatif = kötü |
| M099 | Penaltı Kurtarma % | NULL | **0.0%** | incidents penaltyMissed (veri az) |
| M100 | 1v1 Kurtarma % | **63.16%** | **50.0%** | savedInsideBox/total |
| M101 | Kaleci Pas % | **71.23%** | **72.27%** | accuratePasses/total |
| M102 | Kaleci Rating (Sezon) | **7.03** | **6.64** | gkStats.rating |
| M103 | Clean Sheet Serisi | **0** | **0** | son maçlarda ardışık 0 gol |

---

## F. HAKEM ETKİSİ

**Hakem:** José María Sánchez Martínez (386 kariyer maçı, LaLiga uzmanı)  
**Yeni:** /referee/129910/events/last/0 → 30 son maç analizi

| ID | Açıklama | Değer | Kaynak |
|----|----------|-------|--------|
| M109 | Sarı Kart/Maç | **5.49** | referee.games + yellowCards (kariyer) |
| M110 | Kırmızı Kart/Maç | **0.11** | referee.redCards/games |
| M111 | Kırmızı Kart Oranı | **0.11** | redCards/matchesOfficiated |
| M112 | Faul/Maç | NULL | API'de fouls verisi gelmiyor |
| M113 | Sarı/Maç | **5.49** | yellowCards/games |
| M114 | Dakika/Faul | NULL | API'de minutes verisi gelmiyor |
| M115 | Ev Kırmızı Kart Bias | **6.67%** | refereeLastEvents homeRedCards/30 maç ×100 |
| M116 | Dep Kırmızı Kart Bias | **13.33%** | refereeLastEvents awayRedCards/30 maç ×100 |
| M117 | Sertlik İndeksi | **5.82** | (yellows+reds×3)/games |
| M118 | Faul Toleransı | NULL | fouls verisi yok |
| M118b | Ev Yanlılık İndeksi | NULL | UCL'de standingsHome formatı farklı |
| — | Gol/Maç (son 30 maç) | **2.47** | refereeLastEvents hesaplanan |
| — | Over 2.5 Oranı (son 30) | **50.00%** | refereeLastEvents 15/30 |
| — | BTTS Oranı (son 30) | **36.67%** | refereeLastEvents 11/30 |
| — | Ev Kazanma Oranı (son 30) | **50.00%** | refereeLastEvents 15/30 |
| — | Dep Kazanma Oranı (son 30) | **30.00%** | refereeLastEvents 9/30 |

> M115: Deplasman ekibine 2×, ev sahibine 1× kırmızı kart eğilimi var (bias: dep lehine sert)  
> M112/M114/M118 kalıcı NULL — SofaScore hakem API'sinde fouls/minutes alanları bulunmuyor

---

## G. H2H ANALİZİ

**H2H Maçları:** 4 geçmiş PSG-Liverpool karşılaşması (customId ile doğru çekim)  
**Yeni:** h2hMatchDetails — her maç için ayrı incidents + statistics çekimi

| ID | Açıklama | Değer | Kaynak |
|----|----------|-------|--------|
| M119 | H2H Ev Kazanma | **2** | data.h2h.teamDuel.homeWins |
| M120 | H2H Beraberlik | **0** | data.h2h.teamDuel.draws |
| M121 | H2H Dep Kazanma | **2** | data.h2h.teamDuel.awayWins |
| M122 | Son 5 H2H Ev Form % | **50.0%** | h2hEvents.events (3 maç) — (1G+0B+2M)/3 |
| M123 | H2H Gol/Maç | **3.75** | h2hEvents.events 4 maç toplam 15 gol |
| M124 | H2H Üst 2.5 % | **75.0%** | 4 maçta 3'ü >2.5 |
| M125 | H2H BTTS % | **75.0%** | 4 maçta 3'ü her iki takım gol |
| M126 | Son H2H Skor Etkisi | **+4** | Son bitmiş maç PSG büyük galibiyet |
| M127 | Menajer H2H % | **50.0%** | data.h2h.managerDuel (2/4) |
| M128 | Gol Farkı Trendi | **+0.75** | Son 4 H2H'de PSG ortalama +0.75 fark |
| M129 | H2H Kart/Maç | **8.00** | h2hMatchDetails incidents: toplam 14 kart / 4 maç (Event 7959277: 8 kart!) |
| M130 | H2H Korner/Maç | **14.67** | h2hMatchDetails statistics cornerKicks: 58 korner / 4 maç |

> H2H incidents detayı (4 maç):  
> - Event 13511932: 29 incident, 2 kart, 18 korner  
> - Event 13511931: 15 incident, 2 kart, 16 korner  
> - Event 7959277: 21 incident, **8 kart**, 10 korner  
> - Event 7959205: 16 incident, 2 kart, 14 korner

---

## H. BAĞLAMSAL METRİKLER

| ID | Açıklama | Değer | Kaynak |
|----|----------|-------|--------|
| M131 | Bahis Ev Kazanma % | **55.56%** | odds 1X2 choice='1' decimal→% |
| M132 | Bahis Beraberlik % | **25.00%** | odds choice='X' |
| M133 | Bahis Dep Kazanma % | **25.00%** | odds choice='2' |
| M134 | Üst 2.5 Bahis % | **66.67%** | odds Over/Under 2.5 |
| M135 | Kullanıcı Oyu Ev % | **75.01%** | votes.vote1/total |
| M136 | Kullanıcı Oyu Beraberlik % | **8.01%** | votes.voteX/total |
| M137 | Kullanıcı Oyu Dep % | **16.98%** | votes.vote2/total |
| M138 | Stadyum Kapasitesi | **0.61** | venue capacity/80000 (Parc des Princes 47k) |
| M139 | Menajer Deneyimi % | **100** | getManagerLastEvents — 20 bitmiş maç / 20 = %100 |
| M140 | Menajer Başarı % | **68.97%** | homeManager son maçlarda PSG ile 20/29 galibiyet |
| M141 | Lig Haftası % | **0.39** | round/totalRounds (UCL knockout) |
| M142 | Sıralama Farkı % | **0.22** | abs(11-3)/36 UCL standings |
| M143 | Puan Farkı | **4** | standings points farkı |
| M144 | Lig Gücü İndeksi | **100** | UCL — avgGoals×10 + teamCount bonus (max 100) |
| M145 | Kadro Değer Oranı | **1.00** | homeValue/max(h,a) — iki takım da max seviyede |

---

## I. MOMENTUM METRİKLERİ

| ID | Açıklama | PSG (Ev) | Liverpool (Dep) | Kaynak |
|----|----------|----------|-----------------|--------|
| M146 | Baskı İndeksi | **25.05** | **28.09** | recentDetails graph pozitif noktalar ort |
| M147 | Baskı Yeme İndeksi | **20.98** | **22.94** | graph negatif noktalar ort |
| M148 | Baskı Altında Gol % | **0.0%** | **0.0%** | incidents + graph eşleşmesi |
| M149 | Dominant Gol % | **31.25%** | **50.0%** | graph >+30 iken gol |
| M150 | Top Sahipliği % | **66.2%** | **56.6%** | stats.possession ort |
| M152 | Pas Tamamlama % | **90.67%** | **86.77%** | stats accuratePasses/total |
| M154 | Cross Başarı % | **26.67%** | **29.53%** | stats accurateCrosses/total |
| M155 | Gol Katkı/Maç | **5.40** | **1.80** | incidents goals+assists/5 |

---

## J. TÜRETİLMİŞ & TAHMİN METRİKLERİ

| ID | Açıklama | PSG (Ev) | Liverpool (Dep) |
|----|----------|----------|-----------------|
| M156 | Hücum Gücü Skoru | **10.59** | **7.03** |
| M157 | Defans Gücü Skoru | **55.26** | **50.65** |
| M158 | Form Skoru | **74.05** | **51.42** |
| M159 | Oyuncu Kalitesi | **67.51** | **65.81** |
| M160 | Kaleci Gücü | **64.44** | **52.95** |
| M161 | Hakem Etkisi (paylaşılan) | **58.39** | ← dep: 100-58.39=41.61 |
| M162 | H2H Avantajı (paylaşılan) | **53.75** | ← dep: 46.25 |
| M163 | Bağlamsal Avantaj | **72.52** | ← dep: 27.48 |
| M164 | Momentum Skoru | **58.21** | **50.20** |
| M165 | Gol Atma İndeksi | **100** | **36.0** |
| M166 | Toplam Güç Skoru | **52.56** | **42.08** |
| M167 | Poisson Lambda | **3.78** | **2.21** |
| M169 | Formasyon Avantajı | **44.5** (paylaşılan) | — |

> M156 düşük (10.59): xG 1.96, shotmap verileri sezon istatistikten, gol/şut oranları normalleşti  
> M167 lambda ev **3.78** — cap kaldırıldı (eski cap=3.5'i geçti). Hesap: 2.55 × 1.26 × formFactor × 1.15 = 3.78

---

## TAHMİN SONUÇLARI (Poisson M168)

### 1X2 Olasılıkları

| Sonuç | Poisson | Güven Skoru |
|-------|---------|-------------|
| **PSG Kazanır (1)** | **%66.70** | 95/100 |
| Beraberlik (X) | %13.80 | |
| Liverpool Kazanır (2) | %19.50 | |

### Skor Tahmini

| Skor | Olasılık |
|------|----------|
| **3-2** | **%5.51** |
| 4-2 | %5.20 |
| 3-1 | %4.98 |
| 4-1 | %4.70 |
| 2-2 | %4.37 |

**Lambda Ev:** 3.78 | **Lambda Dep:** 2.21  
*(Cap kaldırıldı — 16×16 Poisson matrisi, 8-2 gibi uç skorlar dahil)*

### Gol Piyasaları

| Piyasa | Değer |
|--------|-------|
| Over 1.5 | **%98.2** |
| Over 2.5 | **%93.8** |
| Over 3.5 | **%84.77** |
| BTTS | **%87.1** |

### Alt Tahminler

| Kategori | Değer |
|----------|-------|
| **İlk Yarı:** Beklenen PSG | 1.40 gol |
| **İlk Yarı:** Beklenen LIV | 0.60 gol |
| İlk Yarı Over 0.5 | %86.47 |
| İlk Yarı Over 1.5 | %59.40 |
| İlk Yarı Sonucu | **1 (PSG)** |
| **Korner Toplam** | 9.0 (4.4+4.6) |
| Korner Over 8.5 | %54.43 |
| Korner Over 9.5 | %41.26 |
| **Kart Beklentisi** | 4.0 sarı |
| Kart Over 3.5 | %56.61 |
| Kart Over 4.5 | %37.08 |
| Hakem Sertlik | 5.82 |
| **İlk Gol PSG** | %68.93 |
| **İlk Gol LIV** | %31.07 |

---

## SİMÜLASYON — NASIL ÇALIŞIYOR

### Simülatör Veri Akışı

```
calculateAllMetrics(data)
    ↓
homeMetrics = flatSide(metrics.home) + flatShared(metrics.shared)
awayMetrics = flatSide(metrics.away) + flatShared(metrics.shared)
    ↓
simulateMatch({ homeMetrics, awayMetrics, selectedMetrics, runs, lineups, weatherMetrics })
```

Simülatör her metriği **çarpan** olarak kullanır (~1.0 etrafında). Null metrikler atlanır, kalan metrikler normalize edilir.

### Çarpan Hiyerarşisi (Dakika Döngüsünde)

```
homeAttackMult = wAvg([
  formMult      (M046-M065, M158)          ×3.0
  qualityMult   (M066-M095, M159, M166)    ×3.0
  attackBoost   (M002,M017-M025,M082,M156) ×2.0
  momentumMult  (M146-M155, M164)          ×2.0
  h2hMult       (M119-M130, M162)          ×1.5
  contextMult   (M131-M145, M163)          ×2.0
  squadImpact   (M077, M078)               ×1.0
  formAdvMult   (M062, M063)               ×0.5
  ...
])
```

### PSG Çarpanları Bu Maçta

| Çarpan | Beklenen Değer | Açıklama |
|--------|----------------|----------|
| formMult | ~1.28 | M046=80 → yüksek form |
| qualityMult | ~1.10 | M066=7.11, M166=52.56 |
| attackBoost | ~1.05 | M082=44, M021=25 |
| momentumMult | ~1.08 | M146=25, M150=66 |
| contextMult | ~1.15 | M163=72.52 (ev+bahis+oy avantajı) |
| squadImpact | 1.00 | M077=0, M078=0 (tam kadro) |

### Liverpool Çarpanları Bu Maçta

| Çarpan | Beklenen Değer | Açıklama |
|--------|----------------|----------|
| formMult | ~0.89 | M046=26.67 → kötü son 5 form |
| qualityMult | ~1.08 | M066=7.09, M166=42.08 |
| attackBoost | ~1.02 | M082=43, M021=28 |
| momentumMult | ~1.05 | M146=28, M149=50 |
| contextMult | ~0.85 | M163 deplasmanın tersi: 27.48 |
| squadImpact | 1.00 | Tam kadro |

### Dakika Döngüsü — Gol Üretimi

Her dakika için:
1. `timeWeight(minute)` — M005-M010 ile o dakikanın gol yoğunluğu
2. `goalProbPerMin = (baseLambda/90) × attackMult × (1/defenseMult) × gkFactor × timeWeight`
3. `Math.random() < goalProbPerMin` ise gol olayı üretilir
4. **Gol kaynağı önceliği:** M013(şut) → M015(xG) → M167(lambda) → M001×1.12

### Kart/Korner/Penaltı Üretimi

- **Kart:** `cardMod = wAvg([M109/3.6, M110/0.16, M117/4.0, M129/4.5, M161])` → her dakika `r() < cardProb × cardMod`
- **Korner:** M022 + M130 bazlı dakika olasılığı; h2hCornerAvg=14.67 direkt besleniyor
- **Penaltı:** M111(hakem penaltı oranı) + M019(takım penaltı freq) → combined prob

### Oyun Durumu Dinamiği

- **Geride olan:** M064(geriden gelme %)  → attack boost ×(1 + M064/100×0.25)
- **Önde olan:** M042(puan kaybetme riski) + M043(kazanma kapama %) → defensif
- **90+ dk:** Geride kalan ×1.4 agresif, önde olan ×0.7 savunmacı

### Hava Durumu (M170-M174)

Bu maç için tüm hava metrikleri **100** (ideal koşullar, Paris açık hava). Çarpan: ×1.0 (nötr).

---

## SİMÜLASYON SONUÇLARI — TEK KOŞU (Örnek)

Temsili koşu (1000 koşunun medyan skoruna en yakın):  
**Skor: 2-2**

| İstatistik | PSG | Liverpool |
|-----------|-----|-----------|
| Şut | 19 | 21 |
| İsabetli Şut | 9 | 15 |
| Korner | 7 | 6 |
| Sarı Kart | 0 | 2 |
| Kırmızı Kart | 0 | 0 |
| Faul | 2 | 5 |
| Penaltı | 0 | 0 |
| Top Sahipliği % | 66 | 34 |

---

## SİMÜLASYON SONUÇLARI — 1000 KOŞU (Monte Carlo)

### Dağılım

| Sonuç | Simülasyon | Poisson |
|-------|-----------|---------|
| **PSG Kazanır** | **%55.1** | %66.70 |
| Beraberlik | %21.5 | %13.80 |
| Liverpool Kazanır | %23.4 | %19.50 |

| Piyasa | Simülasyon | Poisson |
|--------|-----------|---------|
| Over 1.5 | **%89.1** | %97.78 |
| Over 2.5 | **%73.8** | %92.37 |
| Over 3.5 | **%52.9** | %82.09 |
| BTTS | **%70.4** | %86.35 |
| Ort. Gol/Maç | **3.83** | — |

### En Sık Çıkan 10 Skor

| Skor | Frekans |
|------|---------|
| **2-1** | **%9.9** |
| 1-1 | %7.7 |
| 2-2 | %6.7 |
| 3-1 | %6.4 |
| 3-2 | %5.5 |
| 1-2 | %5.2 |
| 2-0 | %5.2 |
| 3-0 | %4.9 |
| 1-0 | %4.6 |
| 3-3 | %3.9 |

### Poisson vs Simülasyon Farkları — Neden?

**Poisson:** Bağımsız Poisson dağılımı, lambda sabit, 16×16 analitik matris (cap yok)  
**Simülasyon:** Dakika-dakika Monte Carlo — oyun durumu değişiyor, kırmızı kart risk var, hücum/savunma çarpanları varyans ekliyor

- Poisson PSG kazanımını **%66.70** → Simülasyon **%55.1** (11.6pp daha düşük): Oyun durumu dinamiği (PSG önde gidince savunmaya çekilir, Liverpool geriden gelme baskısı M064=%25 ile gol bulabilir) Poisson'ın göremediği senaryolar üretiyor
- Beraberlik Poisson **%13.80** → Simülasyon **%21.5**: Monte Carlo geç eşitleyici gollerle beraberlik üretiyor (Liverpool M064=%25 geriden gelme gücü)
- Over 2.5 Poisson **%93.8** → Simülasyon **%73.8**: Simülatördeki defans çarpanları (M028, M033, M045) zaman zaman 1-0, 2-0 sonuçlar üretiyor

---

## KAPSAMLI DURUM ÖZETİ

### Gerçek Veri Döndüren Metrikler

| Bölüm | Toplam | Gerçek | NULL | Kapsam |
|-------|--------|--------|------|--------|
| Hücum (M001-M025) | 22×2=44 | 42 | 2 | %95 |
| Defans (M026-M045) | 18×2=36 | 36 | 0 | %100 |
| Form (M046-M065) | 20×2=40 | 40 | 0 | %100 |
| Oyuncu (M066-M095) | ~18×2=36 | 30 | 6 | %83 |
| Kaleci (M096-M108) | 8×2=16 | 14 | 2 | %88 |
| Hakem (M109-M118b) | 11 | 7 | 4 | %64 |
| H2H (M119-M130) | 12 | 12 | 0 | **%100** |
| Bağlamsal (M131-M145) | 13 | **13** | **0** | **%100** |
| Momentum (M146-M155) | 8×2=16 | 16 | 0 | %100 |
| Türetilmiş (M156-M169) | 11+4=15 | 15 | 0 | %100 |

### Kalıcı NULL Metrikler

| Metrik | Neden |
|--------|-------|
| M112, M114, M118, M181, M182 | Hakem API'sinde fouls/minutes alanı yok |
| M025 | SofaScore maç istatistiklerinde finalThirdPasses alanı yok |
| M067, M178 | Yedek oyuncu attributes API'de gelmiyor |
| M095 | xG per shot verisi shotmap'te eksik |
| M106 | Kaleci averageAttributeOverviews API'de gelmiyor |
| M020 (LIV) | Liverpool bu sezon 0 penaltı → doğru null |

### Çalışan Tüm Sistemler

| Bileşen | Sonuç |
|---------|-------|
| refereeLastEvents (30 maç) | ✅ M115=6.67%, M116=13.33%, refGoalsPerMatch=2.47 |
| H2H maç detayları (4 maç) | ✅ M129=8.00 kart, M130=14.67 korner |
| M126 upcoming filtresi | ✅ +4 (PSG son H2H büyük galibiyet) |
| getManagerLastEvents (30 maç) | ✅ M139=100, M140=68.97% (artık null değil) |
| Lambda cap kaldırıldı | ✅ 3.78 (eski cap=3.50'yi geçti), 16×16 Poisson matrisi |
