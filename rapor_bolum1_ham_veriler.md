# BÖLÜM 1: HAM VERİLER (Raw Data Dump)

**Maç:** Paris Saint-Germain vs FC Bayern München  
**Turnuva:** UEFA Champions League, Knockout Stage  
**Stadyum:** Parc des Princes | **Hakem:** Sandro Schärer  
**Formasyon:** PSG 4-3-3 | Bayern 4-2-3-1  
**Son Güncelleme:** 29 Nisan 2026 | **Metrik Sayısı:** 196/196 (0 Null)  

---

## 1.1 API Katmanı: 33 Paralel İstek

Sistem `data-fetcher.js` üzerinden tek seferde 33 paralel API isteği atar. Tamamı başarılı döndü (0 hata):

| # | Endpoint | Süre (ms) | Kritik mi? |
|---|----------|-----------|------------|
| 1 | getEvent | 112 | Hayır |
| 2 | lineups | 293 | **EVET** |
| 3 | h2h | 0 (cache) | Hayır |
| 4 | h2hEvents | 0 | Hayır |
| 5 | odds | 324 | Hayır |
| 6 | oddsChanges | 526 | Hayır |
| 7 | missingPlayers | 706 | Hayır |
| 8 | streaks | 913 | Hayır |
| 9 | form | 1109 | Hayır |
| 10 | managers | 1311 | Hayır |
| 11 | votes | 1516 | Hayır |
| 12 | homeTeam | 192 | Hayır |
| 13 | homePlayers | 1210 | Hayır |
| 14 | homeLastEvents0 | 1378 | Hayır |
| 15 | homeLastEvents1 | 1526 | Hayır |
| 16 | awayTeam | 1233 | Hayır |
| 17 | awayPlayers | 1904 | Hayır |
| 18 | awayLastEvents0 | 1999 | Hayır |
| 19 | awayLastEvents1 | 2108 | Hayır |
| 20 | standingsTotal | 0 | Hayır |
| 21 | standingsHome | 0 | Hayır |
| 22 | standingsAway | 0 | Hayır |
| 23 | homeTeamSeasonStats | 0 | Hayır |
| 24 | awayTeamSeasonStats | 0 | Hayır |
| 25 | homeTopPlayers | 0 | Hayır |
| 26 | awayTopPlayers | 0 | Hayır |
| 27 | refereeStats | 5 | Hayır |
| 28 | refereeLastEvents | 0 | Hayır |
| 29 | homeManagerLastEvents | 0 | Hayır |
| 30 | awayManagerLastEvents | 0 | Hayır |
| 31 | h2hMatchDetails | 0 | Hayır |
| 32 | homePlayerStats | 0 | Hayır |
| 33 | awayPlayerStats | 0 | Hayır |

---

## 1.2 PSG Kadrosu — Bireysel Oyuncu Ham Verileri

Her oyuncunun SofaScore API'sinden dönen **sezonluk** istatistikleri (ŞL turnuvasına özel):

### 1. Matvey Safonov (Kaleci)
| Metrik | Değer |
|--------|-------|
| Rating | 6.97 |
| Kurtarış (saves) | 27 |
| Yenilen Gol | 11 |
| Clean Sheet | 4 |
| İsabetli Pas | 131 |
| İsabetsiz Pas | 87 |
| Müdahale (clearances) | 24 |
| Maç | 9 (810 dk) |
| Piyasa Değeri | €15.9M |

### 2. Achraf Hakimi (Defans)
| Metrik | Değer |
|--------|-------|
| Rating | 6.75 |
| Gol | 1 | xG | 0.86 |
| Asist | 6 | xA | 1.36 |
| Şut | 16 | İsabetli | 6 |
| Büyük Şans Yaratma | 3 |
| İsabetli Pas | 708 | İsabetsiz | 85 |
| Kilit Pas | 23 |
| Müdahale (tackles) | 21 |
| Top Kesme (interceptions) | 7 |
| Uzaklaştırma (clearances) | 10 |
| Dribling Başarılı | 7 |
| Maç | 12 (1034 dk) |
| Piyasa Değeri | €82M |

### 3. Marquinhos (Defans)
| Metrik | Değer |
|--------|-------|
| Rating | 7.15 |
| Gol | 2 | xG | 1.35 |
| Asist | 0 | xA | 0.81 |
| Şut | 7 | İsabetli | 2 |
| İsabetli Pas | 783 | İsabetsiz | 66 |
| Müdahale | 14 | Top Kesme | 8 |
| Uzaklaştırma | 32 |
| Maç | 13 (1125 dk) |
| Piyasa Değeri | €29M |

### 4. Willian Pacho (Defans)
| Metrik | Değer |
|--------|-------|
| Rating | 6.91 |
| Gol | 2 | xG | 0.55 |
| Asist | 1 | xA | 0.15 |
| İsabetli Pas | 880 | İsabetsiz | 75 |
| Müdahale | 25 | Top Kesme | 13 |
| Uzaklaştırma | 64 |
| Maç | 15 (1350 dk) |
| Piyasa Değeri | €66M |

### 5. Nuno Mendes (Defans)
| Metrik | Değer |
|--------|-------|
| Rating | 7.13 |
| Gol | 2 | xG | 1.34 |
| Asist | 2 | xA | 2.27 |
| Şut | 15 | İsabetli | 6 |
| Büyük Şans Yaratma | 7 |
| İsabetli Pas | 761 | Kilit Pas | 22 |
| Müdahale | 23 | Top Kesme | 17 |
| Dribling Başarılı | 28 |
| Maç | 15 (1198 dk) |
| Piyasa Değeri | €72M |

### 6. Warren Zaïre-Emery (Orta Saha)
| Metrik | Değer |
|--------|-------|
| Rating | 6.57 |
| Gol | 0 | xG | 1.01 |
| Asist | 1 | xA | 1.43 |
| Şut | 14 | İsabetli | 2 |
| Büyük Şans Yaratma | 5 |
| İsabetli Pas | 703 | Kilit Pas | 20 |
| Müdahale | 22 | Top Kesme | 13 |
| Maç | 15 (1228 dk) |
| Piyasa Değeri | €49M |

### 7. Vitinha (Orta Saha)
| Metrik | Değer |
|--------|-------|
| Rating | **7.69** |
| Gol | 6 | xG | 3.17 |
| Asist | 1 | xA | 2.67 |
| Şut | 38 | İsabetli | 14 |
| Büyük Şans Yaratma | 3 |
| İsabetli Pas | **1418** | Kilit Pas | 19 |
| Müdahale | 24 | Top Kesme | 15 |
| Maç | 15 (1349 dk) |
| Piyasa Değeri | €102M |

### 8. João Neves (Orta Saha)
| Metrik | Değer |
|--------|-------|
| Rating | 7.13 |
| Gol | 2 | xG | 1.50 |
| Asist | 3 | xA | 1.35 |
| Şut | 15 | İsabetli | 7 |
| İsabetli Pas | 543 | Kilit Pas | 12 |
| Müdahale | 26 | Top Kesme | 16 |
| Maç | 12 (934 dk) |
| Piyasa Değeri | €116M |

### 9. Désiré Doué (Forvet)
| Metrik | Değer |
|--------|-------|
| Rating | **7.46** |
| Gol | 5 | xG | 1.70 |
| Asist | 4 | xA | 2.91 |
| Şut | 21 | İsabetli | 8 |
| Büyük Şans Yaratma | 6 |
| İsabetli Pas | 351 | Kilit Pas | **27** |
| Dribling Başarılı | 21 |
| Maç | 11 (675 dk) |
| Piyasa Değeri | €93M |

### 10. Ousmane Dembélé (Forvet)
| Metrik | Değer |
|--------|-------|
| Rating | 7.13 |
| Gol | 6 | xG | 5.31 |
| Asist | 2 | xA | 1.66 |
| Şut | 29 | İsabetli | 12 |
| Büyük Şans Kaçırma | 7 |
| İsabetli Pas | 298 | Kilit Pas | 20 |
| Maç | 11 (673 dk) |
| Piyasa Değeri | €97M |

### 11. Khvicha Kvaratskhelia (Forvet)
| Metrik | Değer |
|--------|-------|
| Rating | **7.69** |
| Gol | **10** | xG | 3.81 |
| Asist | 5 | xA | 1.80 |
| Şut | **44** | İsabetli | 16 |
| İsabetli Pas | 454 | Kilit Pas | 16 |
| Dribling Başarılı | 23 |
| Maç | 14 (967 dk) |
| Piyasa Değeri | €93M |

---

## 1.3 Bayern Kadrosu — Bireysel Oyuncu Ham Verileri

### 1. Manuel Neuer (Kaleci)
| Metrik | Değer |
|--------|-------|
| Rating | 6.90 |
| Kurtarış | 31 |
| Yenilen Gol | 16 |
| Clean Sheet | 2 |
| İsabetli Pas | 257 | İsabetsiz | 105 |
| Maç | 10 (900 dk) |
| Piyasa Değeri | €4.1M |

### 2. Josip Stanišić (Defans)
| Metrik | Değer |
|--------|-------|
| Rating | 6.73 |
| Gol | 1 | xG | 1.28 |
| Asist | 1 | xA | 1.23 |
| Müdahale | 18 | Top Kesme | 8 |
| Maç | 9 (702 dk) |
| Piyasa Değeri | €31M |

### 3. Dayot Upamecano (Defans)
| Metrik | Değer |
|--------|-------|
| Rating | 6.79 |
| Gol | 1 | xG | 1.47 |
| İsabetli Pas | 582 |
| Müdahale | 24 | Top Kesme | 19 |
| Uzaklaştırma | 28 |
| Maç | 11 (928 dk) |
| Piyasa Değeri | €65M |

### 4. Jonathan Tah (Defans)
| Metrik | Değer |
|--------|-------|
| Rating | 6.88 |
| İsabetli Pas | **738** | İsabetsiz | 28 |
| Müdahale | 16 | Top Kesme | 8 |
| Uzaklaştırma | 44 |
| Maç | 13 (1052 dk) |
| Piyasa Değeri | €28M |

### 5. Alphonso Davies (Defans)
| Metrik | Değer |
|--------|-------|
| Rating | 6.62 |
| Gol | 0 | Asist | 1 |
| İsabetli Pas | 118 |
| Müdahale | 5 | Top Kesme | 2 |
| Dribling Başarılı | 4 |
| Maç | 7 (190 dk) |
| Piyasa Değeri | €49M |

### 6. Joshua Kimmich (Orta Saha)
| Metrik | Değer |
|--------|-------|
| Rating | **7.44** |
| Gol | 0 | xG | 1.53 |
| Asist | 2 | xA | **3.11** |
| Şut | 11 | İsabetli | 4 |
| Büyük Şans Yaratma | 4 |
| İsabetli Pas | **936** | Kilit Pas | **29** |
| Müdahale | 16 | Top Kesme | 7 |
| Maç | 12 (1070 dk) |
| Piyasa Değeri | €43M |

### 7. Aleksandar Pavlović (Orta Saha)
| Metrik | Değer |
|--------|-------|
| Rating | 7.24 |
| Gol | 1 | xG | 1.62 |
| Asist | 1 | xA | 1.37 |
| İsabetli Pas | **1043** | İsabetsiz | 49 |
| Müdahale | 19 | Top Kesme | 8 |
| Maç | 13 (1084 dk) |
| Piyasa Değeri | €80M |

### 8. Michael Olise (Orta Saha)
| Metrik | Değer |
|--------|-------|
| Rating | **7.66** |
| Gol | 5 | xG | 4.33 |
| Asist | **6** | xA | **4.82** |
| Şut | **41** | İsabetli | 18 |
| Büyük Şans Yaratma | **8** |
| İsabetli Pas | 502 | Kilit Pas | **32** |
| Dribling Başarılı | **42** |
| Maç | 12 (991 dk) |
| Piyasa Değeri | **€125M** |

### 9. Jamal Musiala (Orta Saha)
| Metrik | Değer |
|--------|-------|
| Rating | 6.64 |
| Gol | 2 | xG | 1.66 |
| Dribling Başarılı | 5 |
| Maç | 5 (236 dk) |
| Piyasa Değeri | **€126M** |

### 10. Luis Díaz (Orta Saha)
| Metrik | Değer |
|--------|-------|
| Rating | **7.41** |
| Gol | **7** | xG | 4.71 |
| Asist | 3 | xA | 3.50 |
| Şut | 30 | İsabetli | 14 |
| Büyük Şans Yaratma | 8 |
| Dribling Başarılı | 27 |
| Maç | 11 (897 dk) |
| Piyasa Değeri | €76M |

### 11. Harry Kane (Forvet)
| Metrik | Değer |
|--------|-------|
| Rating | **8.00** |
| Gol | **13** | xG | **9.11** |
| Asist | 2 | xA | 2.45 |
| Şut | **43** | İsabetli | **24** |
| Büyük Şans Yaratma | 7 | Kaçırma | 5 |
| İsabetli Pas | 247 | Kilit Pas | 15 |
| Dribling Başarılı | 16 |
| Maç | 12 (949 dk) |
| Piyasa Değeri | €71M |

---

## 1.4 H2H (Karşılıklı Geçmiş) — Son 9 Maç

| # | Ev Sahibi | Skor | Deplasman |
|---|-----------|------|-----------|
| 1 | PSG | 1-**2** | Bayern |
| 2 | PSG | **2-0** | Bayern |
| 3 | Bayern | **1-0** | PSG |
| 4 | Bayern | **2-0** | PSG |
| 5 | PSG | 0-**1** | Bayern |
| 6 | PSG | 0-**1** | Bayern |
| 7 | Bayern | 2-**3** | PSG |
| 8 | PSG | 0-**1** | Bayern |
| 9 | Bayern | **3-1** | PSG |

**H2H Özet:** PSG 2 Galibiyet — 0 Beraberlik — Bayern 7 Galibiyet

---

## 1.5 Lig, Puan Durumu ve Taktik Verileri

| Metrik | Değer |
|--------|-------|
| Lig Ort. Gol (maç başı) | 1.691 |
| Lig Gol Volatilitesi | 0.632 |
| Medyan Gol Oranı | 1.688 |
| Lig Takım Sayısı | 36 |
| PSG Sıralama | 11. |
| Bayern Sıralama | 2. |
| PSG Puanı | 14 |
| Bayern Puanı | 21 |
| PSG Bölge | Playoff |
| Bayern Bölge | Playoff |
| PSG Beklenen PPG | 2.096 |
| Bayern Beklenen PPG | 2.363 |
| PSG Gerçek PPG | 1.750 |
| Bayern Gerçek PPG | 2.625 |
| PSG Direnç | -0.347 |
| Bayern Direnç | +0.263 |
| Kupa Maçı | Evet |
| Lig Gücü (SPI) | 902.51 |

**Pressing Verileri:**

| | PSG | Bayern |
|---|-----|--------|
| Pressing Yoğunluğu | 78.68 | 80.21 |
| Bölge Hakimiyeti | 60.45 | 73.46 |
| Çizgi Yüksekliği | 69.00 | 80.67 |

**Bahis Oranları:**

Oranlar doğrudan tahmin çıktısına kopyalanmaz ama hesaplamalarda dolaylı olarak kullanılır:
- **M131-M133:** Implied probability → behavioral contextual bloğa girer
- **M188-M189:** Açılış→kapanış oran hareketi → GOL_İHTİYACI bloğunda piyasa sinyali
- **M134:** Over/Under 2.5 implied probability

| | Açılış | Güncel | Değişim |
|---|--------|--------|---------|
| PSG (1) | 2.20 | 2.30 | ↑ PSG'ye para gelmedi |
| Beraberlik (X) | 3.75 | 4.00 | ↑ |
| Bayern (2) | 3.00 | 2.70 | ↓ Bayern'e para geldi |

**Shin Fair Probability (margin temizlenmiş):** PSG ~%41 | Beraberlik ~%24 | Bayern ~%35

**Kullanıcı Oyları:** PSG %37.6 — Beraberlik %11.2 — Bayern %51.2  
**Fikstür Yoğunluğu:** PSG 3.5 gün arayla — Bayern 3.2 gün arayla

---

## 1.6 Hakem Verileri

| Metrik | Değer |
|--------|-------|
| Hakem Etkisi (M161) | 41.67 |
| Maç Başı Gol Ort. | 3.57 |
| Üst 2.5 Oranı | %60 |
| KG Oranı | %53.33 |
| Ev Sahibi Kazanma | %40 |
| Deplasman Kazanma | %40 |
| Analiz Edilen Maç | 30 |

---

## 1.7 Eksik Oyuncular

Eksik oyuncu listesi: **BOŞ** (Her iki takımda da sakat/cezalı oyuncu yok)

---

## 1.8 Faz 3 ile Entegre Edilen Yeni Oyuncu İstatistik Alanları

Aşağıdaki oyuncu istatistikleri **daha önce API'den çekilip kullanılmayan** alanlardı. Artık tamamı aktif olarak hesaplamalara dahil edilmiştir:

### Hücum Alanları (BLOCK_STAT_MAP → BİTİRİCİLİK, YARATICILIK, ŞUT ÜRETİMİ)
| Alan | Blok | Açıklama |
|------|------|----------|
| `goalsFromInsideTheBox` | BİTİRİCİLİK | Ceza sahası içi bitiricilik |
| `goalsFromOutsideTheBox` | BİTİRİCİLİK | Uzak mesafe bitiricilik |
| `goalConversionPercentage` | BİTİRİCİLİK | Gol dönüşüm oranı |
| `hitWoodwork` | BİTİRİCİLİK | Direk isabet → fırsat göstergesi |
| `expectedAssists` | YARATICILIK | Beklenen asist (xA) |
| `passToAssist` | YARATICILIK | Asist öncesi son pas |
| `totalAttemptAssist` | YARATICILIK | Asist girişimi |
| `shotsFromInsideTheBox` | ŞUT ÜRETİMİ | Ceza sahası şutu |
| `shotsFromOutsideTheBox` | ŞUT ÜRETİMİ | Uzak mesafe şutu |
| `shotsOffTarget` | ŞUT ÜRETİMİ | İsabetsiz şut |
| `headedGoals` | HAVA HAKİMİYETİ | Kafa golü |

### Savunma Alanları (BLOCK_STAT_MAP → SAVUNMA_AKSİYONU)
| Alan | Blok | Açıklama |
|------|------|----------|
| `groundDuelsWon` | SAVUNMA AKSİYONU | Yer düellosu kazanma |
| `totalDuelsWon` | SAVUNMA AKSİYONU | Toplam düello kazanma |
| `tacklesWon` | SAVUNMA AKSİYONU | Başarılı müdahale |
| `blockedShots` | SAVUNMA AKSİYONU | Şut engelleme |
| `outfielderBlocks` | SAVUNMA AKSİYONU | Saha oyuncusu blok |
| `dribbledPast` | SAVUNMA AKSİYONU | Geçilme (negatif sinyal) |

### Duran Top Alanları (BLOCK_STAT_MAP → DURAN_TOP)
| Alan | Blok | Açıklama |
|------|------|----------|
| `penaltyWon` | DURAN TOP + Penaltı Şansı | Penaltı kazanma |
| `penaltyGoals` | DURAN TOP + M020 | Penaltı golü |
| `penaltyConceded` | Penaltı Şansı | Penaltı verdirme |
| `freeKickGoal` | DURAN TOP | Serbest vuruş golü |
| `shotFromSetPiece` | DURAN TOP | Set piece'ten şut |

### Pas & Taktik Alanları (BLOCK_STAT_MAP → TOPLA OYNAMA, TAKTİKSEL UYUM)
| Alan | Blok | Açıklama |
|------|------|----------|
| `accurateFinalThirdPasses` | TOPLA OYNAMA | Son bölge pası |
| `accurateLongBalls` | TOPLA OYNAMA | Uzun pas başarısı |
| `accurateOppositionHalfPasses` | TOPLA OYNAMA | Rakip yarı sahada pas |
| `touches` | TOPLA OYNAMA | Topa dokunma |
| `possessionLost` | TOPLA OYNAMA | Top kaybı (negatif) |
| `possessionWonAttThird` | TAKTİKSEL UYUM + M096c | Hücum bölgesinde top kazanma |
| `ballRecovery` | TAKTİKSEL UYUM + M096c | Top geri kazanma |
| `wasFouled` | TAKTİKSEL UYUM | Faul kazanma |
| `fouls` | TAKTİKSEL UYUM + Kırmızı Kart | Faul yapma (negatif) |
| `offsides` | TAKTİKSEL UYUM | Ofsayt (negatif) |
| `accurateCrosses` | BAĞLANTI OYUNU | Ortanın isabeti |
| `totalCross` | BAĞLANTI OYUNU | Orta hacmi |
| `dispossessed` | BAĞLANTI OYUNU | Top kaybedilme (negatif) |

### Kart Riski Alanları (calculateRedCardChance)
| Alan | Kullanım | Açıklama |
|------|----------|----------|
| `yellowCards` | Kırmızı Kart Riski | Sarı kart sayısı |
| `redCards` | Kırmızı Kart Riski | Kırmızı kart (3x eşdeğer) |
| `fouls` | Kırmızı Kart Riski | Faul (dinamik fouls/cards oranıyla) |

**Toplam:** 30+ yeni alan, 10 blok ve 3 hesaplama fonksiyonuna entegre edildi.
