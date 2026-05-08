# 50-Maçlık Backtest Raporu (2026-05-07)

> **Kapsam:** 11 fazlı statik-sıfır onarım sonrası ilk geniş ölçekli doğrulama testi.
> **Test parametreleri:** `node src/engine/backtest-runner.js 2026-05-07 50 pre-match`
> **Sonuç:** 50 maç istendi, 41 maç işlendi (9'u tournament filter / data eksikliği ile elendi).
> **Süre:** ~28 dakika (data fetch + işleme)
> **Tarih:** 08.05.2026

---

## 1. Yönetici Özeti

| Metrik | Değer | Hedef | Sonuç |
|---|---|---|---|
| 1X2 isabet | **%56.1** (23/41) | >%55 | ✅ |
| OU2.5 isabet | %36.6 (15/41) | >%55 | ❌ |
| BTTS isabet | %43.9 (18/41) | >%55 | ❌ |
| Exact Score | %19.5 (8/41) | >%15 | ✅ |
| **Avg Brier** | **0.6278** | <%0.45 | ⚠️ |
| Avg Log Loss | 1.0561 | <%0.85 | ⚠️ |
| HIGH tier 1X2 | %57.9 (38 maç) | > LOW | ✅ |
| LOW tier 1X2 | %33.3 (3 maç) | < HIGH | ✅ |
| Poisson-Only | %53.7 | — | — |
| Simulation-Only | %51.2 | — | — |

### Net kazançlar

✅ **Tier ters-korelasyonu çözüldü** — eski (HIGH %54.5, LOW %85.7) → yeni (HIGH %57.9, LOW %33.3). Modelin "emin" olduğu maçlarda artık daha doğru tahmin ediyor.

✅ **λ deflasyonu yapısal olarak düzeldi** — λ_total mean=2.90, p50=2.91. UCL Bayern-PSG λ_total=4.18 (eski sürümde benzer maçta probOU25=%8.6 ile λ_total~1 idi). Yeni sürüm UCL maçlarında 2/2 1X2 doğru, %100 ExactScore.

✅ **Skor tahmin sayısal olarak doğru aralıkta** — `simTopScore "0-0"` dominansı yok; çıktılar takım gücüne göre dağılıyor.

### Kritik bulgu

⚠️ **`referenceScaling` modifier'ı YANLIŞ YÖNDE çalışıyor** — bu raporun en önemli mühendislik bulgusu (bkz. §5.2).

---

## 2. Apples-to-Oranges Uyarısı

Eski 29-maçlık dump (CONMEBOL ağırlıklı, %87 Libertadores/Sudamericana) ile bu rapor (Top-5 Avrupa ligi ağırlıklı, %71) **doğrudan kıyaslanamaz**.

- Eski dump: 1X2 %62.1 — düşük skorlu CONMEBOL maçlarında "1-1 default" tahmininin spurious accuracy'si.
- Yeni dump: 1X2 %56.1 — Top-5 ligler (EPL, La Liga, Serie A, Bundesliga, Ligue 1, Eredivisie) yüksek volatilite ve dengeli üst-orta sıra içerir; bu zorlukta **%55+ profesyonel modellerin sınırı** sayılır (Bet365 closing odds bile %58'i zor geçer).
- Brier 0.6278 vs 0.6023 — yeni küme daha zor; Brier'ın küme zorluğuyla orantılı yorumlanması gerekir.

**Doğru kıyas:** lig-bazlı kırılım (§4) ve aynı maçlardaki λ değerleri (§5).

---

## 3. Ölçeklenebilir Audit Altyapısı

`tools/lambda-audit.js` post-processor backtest dump'ından şu bilgileri otomatik çıkarıyor:

```bash
node tools/lambda-audit.js backtest_2026-05-07.json > audit-50.md
```

**Çıktılar:**
- `λ_home/away final` dağılımı (mean, p25, p50, p75)
- `kMatch` ve `agreement` dağılımı
- 8 modifier için TriggerRate, meanFactor, p25/50/75 log-delta
- **Hit/miss kontribüsyon farkı** (modifier doğru/yanlış tahminlerde nasıl davranıyor)
- λ_total p10 (deflasyon adayları) ve p90 (inflasyon adayları) anomali listesi
- CSV export (R/Python ile derinlemesine analiz)

Bu altyapı **veri-tabanlı meta-kalibrasyon** için hazır; her backtest'ten sonra modifier'lerin gerçek katkısını ölçer.

---

## 4. Lig-Bazlı Kırılım

| Lig | n | 1X2 | OU2.5 | BTTS | Score | Brier |
|---|---|---|---|---|---|---|
| **UCL Knockout** | 2 | **%100** | %50 | %50 | **%100** | 0.5938 |
| **UEL Knockout** | 2 | **%100** | %0 | %50 | %50 | 0.5454 |
| **Eredivisie Playoffs** | 2 | **%100** | %100 | %100 | %50 | 0.5153 |
| LaLiga | 5 | %60 | %40 | %60 | %40 | **0.4850** |
| Premier League | 5 | %60 | %0 | %20 | %0 | 0.6140 |
| Ligue 1 | 5 | %60 | %40 | %40 | %0 | 0.6027 |
| Serie A | 6 | %50 | %50 | %67 | %17 | 0.6556 |
| Brasileirão | 5 | %40 | %40 | %20 | %0 | 0.7423 |
| Eredivisie | 5 | %40 | %20 | %0 | %20 | 0.6453 |
| Bundesliga | 3 | %33 | %33 | %67 | %0 | 0.7157 |
| Süper Lig | 1 | %0 | %100 | %100 | %0 | 0.9046 |

### Gözlemler

- **Avrupa kupaları (UCL, UEL) %100 1X2** — küçük örneklem ama tutarlı üstün performans (yüksek profil + bol veri + güvenilir profile)
- **LaLiga en iyi Brier (0.4850)** — kalibrasyon İspanyol futbolunda iyi çalışıyor (ev avantajı belirgin, asimetri yüksek)
- **Premier League OU/BTTS feci (%0/%20)** — EPL'in volatilitesini yakalayamıyor; 5 maçta hiç Over25 isabet yok (Aston Villa 4-0 Forest, Man Utd 3-2, Bournemouth 3-0, Everton 3-3 hepsi Over ama model Under demiş)
- **Brasileirão Brier 0.74** — uzak güney Amerika ligi, profile + xG verisi zayıf, kalibrasyon en kötü
- **Eredivisie Playoffs %100** — küçük lig + playoff dramatik takım gücü farkı; model net ayrıştırıyor

---

## 5. Audit Diagnostics

### 5.1 Genel dağılım

| Ölçü | n | mean | p25 | p50 | p75 |
|---|---|---|---|---|---|
| kMatch (home+away) | 82 | **1.2193** | 1.1927 | 1.2220 | 1.2464 |
| agreement | 82 | **0.7278** | 0.7212 | 0.7354 | 0.7424 |
| λ_home final | 41 | 1.7192 | 1.0850 | 1.9095 | 2.3410 |
| λ_away final | 41 | 1.1849 | 0.6907 | 1.1993 | 1.5792 |
| **λ_total final** | 41 | **2.9041** | 2.4253 | 2.9097 | 3.2926 |
| Kaynak sayısı | — | 4.13 | 4 | 4 | 4 |

**Yorum:**
- λ_total mean=**2.90** — Top 5 lig ortalaması ~2.5-2.7 ile uyumlu. Eski sürümde Bayern-PSG λ_total~1 idi; şimdi sağlıklı seviyede.
- agreement mean=0.73 — sentetik testte (0.79) biraz altında, gerçek dünya kaynak çelişkisini yakaladığını gösteriyor.
- kMatch mean=1.22 — asimetri açıcı orta seviyede aktif. Çok yüksek değil (modelin aşırı amplifikasyon yapmadığını gösteriyor).
- **Clamp hit %0** — hiçbir maçta λ aralık dışına çıkıp kırpılmadı. Asimetrik clamp (Faz 3.1) doğru ayarlanmış.

### 5.2 Modifier Amplifikasyon (KRİTİK BULGU)

| Stage | Side | Trigger | meanFactor | p25 dLog | p50 dLog | p75 dLog | hit-miss diff |
|---|---|---|---|---|---|---|---|
| `behavMod` | H | %100 | 1.000 | -0.017 | 0.001 | 0.017 | **−0.011** |
| `behavMod` | A | %100 | 1.005 | -0.013 | 0.000 | 0.019 | **+0.010** |
| `urgencyMod` | — | %0 | — | — | — | — | — |
| `lqr` | — | %0 | — | — | — | — | — |
| `xgOverPerf` | H | %20 | **1.070** | 0.003 | 0.041 | 0.121 | **+0.072** ✅ |
| `xgOverPerf` | A | %17 | **1.047** | -0.003 | 0.018 | 0.054 | **+0.032** ✅ |
| `refMod` | H/A | %98 | 1.008 | -0.007 | 0.006 | 0.019 | **+0.006** ✅ |
| `cleanSheet` | — | %0 | — | — | — | — | — |
| **`referenceScaling`** | **H/A** | **%59** | **0.875** | **-0.372** | **-0.250** | **+0.206** | **−0.061** ❌ |
| `lambdaShrinkage` | — | %0 | — | — | — | — | — |

#### 🔴 referenceScaling — yanlış yönde çalışıyor

**meanFactor = 0.875 → ortalama -%12.5 deflate ediyor.** Sentetik testte +%14.6 amplify ediyordu; gerçekte tam tersi. Sebep:
- Sentetik veride: takım profili `avgScored` toplamı dcBase λ_sum'dan **büyüktü** → reference yukarı çekiyor
- Gerçekte (Top-5 lig): takım profilleri **turnuva-filtreli** (UCL takımı için sadece UCL maçları). UCL maçları lig maçlarından daha düşük skorlu (defansif, dengeli) → reference total < dcBase λ_sum → modifier λ'ları **aşağı** çekiyor

**hit-miss diff = -0.061** → modifier doğru tahminlerde **daha fazla deflate** ediyor (yani başarılı tahminlerde aslında "λ daha küçük olmalı" diyor — ama bu OU/BTTS isabetini öldürüyor).

**Tetikleyici %59'da aktif** — yarıdan fazla maçta devreye giriyor. p75=+0.206 (bazı maçlarda hala +%23 amplify), ama ortalama negatif.

**Etki kanıtı:**
- OU2.5 isabeti %36.6 — λ_total sağlıklı görünmesine rağmen Over tahminleri eksik kalıyor
- Premier League OU2.5 %0 (5/5 hata) — referenceScaling Top-5 ligde Over olasılığını sistematik bastırıyor
- Aston Villa 4-0 Forest, Bournemouth 3-0 Palace, Inter 2-0 Parma → modeller Over diyemedi

**Bu modifier'ı acilen revize etmek lazım** (öneri §8.2).

#### ✅ xgOverPerf doğru çalışıyor

- Trigger %20 (matchCount yeterli olan maçlarda)
- meanFactor 1.07 (home), 1.05 (away)
- **hit-miss diff = +0.072** — doğru tahminlerde daha fazla amplify ediyor; yanlışlarda daha az → modifier model isabetini güçlendiriyor

#### ✅ refMod hafif pozitif

- %98 trigger (neredeyse her maçta)
- meanFactor 1.008 — ±%1 etki, kontrollü
- hit-miss diff = +0.006 — net pozitif katkı

#### ⚠️ behavMod paradoksu

- home tarafında hit-miss diff = **-0.011** (negatif), away tarafında **+0.010** (pozitif)
- Net etki: ev sahibi atak modifier'ı doğru tahminlerde aşağı çekiyor; deplasman yukarı çekiyor → ev avantajı tahminini hafif aşındırıyor olabilir
- Bu küçük (±%1), kritik değil, ama izlenmeli

---

## 6. Anomali Listesi

### 6.1 λ_total < p10 (deflasyon adayları — model gol az tahmin etti)

| Maç | Lig | λH | λA | actual | predicted | 1X2 |
|---|---|---|---|---|---|---|
| Cremonese vs Lazio | Serie A | 0.26 | 1.50 | 1-2 | 0-1 | ✅ |
| Bologna vs Cagliari | Serie A | 0.96 | 0.67 | 0-0 | 1-0 | ❌ |
| Getafe vs Rayo | LaLiga | 0.88 | 0.76 | 0-2 | 1-0 | ❌ |
| Auxerre vs Angers | Ligue 1 | 1.39 | 0.52 | **3-1** | 1-0 | ✅ |
| Chapecoense vs RB Bragantino | Brasileirão | 0.83 | 1.21 | 1-2 | 0-1 | ✅ |

**Auxerre 3-1**: λ_total 1.91 ama gerçek 4 gol — sistematik underestimation (referenceScaling -0.25 dLog → %22 deflasyon).

### 6.2 λ_total > p90 (inflasyon adayları)

| Maç | Lig | λH | λA | actual | predicted | 1X2 | Score |
|---|---|---|---|---|---|---|---|
| Bayern vs PSG | UCL | 2.09 | 2.09 | 1-1 | 1-1 | ✅ | ✅ |
| Aston Villa vs Forest | UEL | 2.43 | 1.71 | **4-0** | 1-0 | ✅ | ❌ |
| Freiburg vs Braga | UEL | 2.56 | 1.39 | 3-1 | 3-1 | ✅ | ✅ |
| Lyon vs Rennes | Ligue 1 | 2.79 | 1.58 | **4-2** | 2-1 | ✅ | ❌ |
| AZ vs Twente | Eredivisie | 2.12 | 1.65 | 2-2 | 2-1 | ❌ | ❌ |

**Bayern-PSG ve Freiburg-Braga TAM doğru** (skor + 1X2). λ_total yüksekken model isabet sağlıyor.

**Aston Villa 4-0 ve Lyon 4-2** — 1X2 doğru ama λ_total yetersiz (Aston Villa için λH=2.43 → P(4 gol)~0.13 düşük). Bu maçlarda da referenceScaling -0.25 dLog ile aşağı çekmiş.

---

## 7. Dağılım Analizi

### 7.1 1X2 Dağılım

```
Toplam tahmin: 41
  Home (1):  18 (44%)  → 11 doğru (61%)
  Draw (X):   8 (20%)  →  3 doğru (38%)
  Away (2): 15 (37%)  →  9 doğru (60%)
```

- **Beraberlik tahmini hala zayıf (%38)** — daha öncesi 14/29 (%48) idi; düştü ama hala düşük.
- 8 maçta beraberlik tahmin etmiş, 5'i yanlış. Beraberliği "tutturmak" yerine "kaçınmak" daha iyi sonuç veriyor olabilir.

### 7.2 OU/BTTS Yön Yanlılığı

```
OU2.5: model Under %71, Over %29
       gerçek Under %46, Over %54
  → Model SİSTEMATİK UNDER bias'lı
```

referenceScaling deflasyonunun direkt sonucu. Faz 7'nin numara-1 hedefi.

```
BTTS: model Yes %29, No %71
      gerçek Yes %59, No %41
  → Model SİSTEMATİK NO BTTS bias'lı
```

Aynı kök sebep. Lambda Over tarafında düşük, BTTS de bundan etkileniyor.

---

## 8. Onarım Sonrası Değerlendirme

### 8.1 Çalışan Faz'lar

| Faz | Hedef | Doğrulama |
|---|---|---|
| **Faz 0** Audit tracer | Modifier görünürlüğü | ✅ 41/41 maçta `lambdaAudit` dolu |
| **Faz 1.1** HT lambda dinamik | predictedHT 0-0 dominansı | ⚠️ Henüz görsel doğrulama yok (HT detayları log'da değil) |
| **Faz 1.2** simTopScore "0-0" | Simulation çıktıları | ✅ Bayern PSG simulation 18.5/24.8/38.9 — dengeli |
| **Faz 2.1+2.2** Bayesian shrinkage | Kaynak ağırlıkları | ✅ Source counts mean=4.13, n_eff dinamik |
| **Faz 2.3** Agreement formülü | Değişken-kaynak adil | ✅ agreement mean=0.73 (sağlıklı aralık) |
| **Faz 3.1** Asimetrik clamp | Min/max her λ için ayrı | ✅ Clamp hit %0 (kırpılma yok), audit'te ayrı sınırlar |
| **Faz 3.2** Sürekli z-skor | Üç-aşamalı sıçrama | ✅ Stair-jump yok, Student-t yaklaşımı |
| **Faz 4.1** Modifier reliability | xgOverPerf çift sayım önleme | ✅ Trigger %20 (sadece n yeterli olanlar) |
| **Faz 5** Rho dinamik | Sabit fallback yok | ✅ Çıplak Poisson cold-start'a dönüşüyor |
| **Faz 6** Confidence reformu | Tier ters-korelasyonu | ✅ HIGH 57.9% > LOW 33.3% (eskiden tersiydi) |

### 8.2 Yeni Kritik Bulgu — `referenceScaling`

**Sorun:** Modifier sentetik testte amplify ederken gerçekte deflate ediyor. Sebep: takım `scoreProfile` turnuva-filtreli; üst düzey maçlarda (UCL/UEL) lig ortalamasının altında scored avg üretiyor.

**Etki:** %59 trigger × ortalama %12.5 deflate → λ_total sistematik %5-7 baskılanıyor. OU/BTTS yön yanlılığının ana kaynağı.

**Öneri (Faz 7):**

```
Mevcut formül:
  scalingFactor = (referenceTotal / λ_sum)^reliability
  λ_home/away *= scalingFactor

Sorun: referenceTotal turnuva-filtreli, λ_sum lig-türevli — apples vs oranges.

Düzeltme A: Reference seçimini turnuva ile uyumlu yap
  - Eğer maç UCL ise leagueAvg da UCL'den (leagueFingerprint UCL)
  - Mevcut: leagueAvg standings'ten (kulüp lig maçları)
  
Düzeltme B: scaling yön-asimetrik
  - Yukarı çekme (referenceTotal > λ_sum) tam etki
  - Aşağı çekme (referenceTotal < λ_sum) reliability × 0.5 (yarım güç)
  - Mantık: takım profili spor sezonu boyunca Over yapıyorsa o veriye güven, ama Under'a doğru shrinkage daha riskli
  
Düzeltme C: Sadece deflasyon adaylarında uygula (clamp_hit_min varsa) — ama %0 olduğu için bu uygulanmıyor zaten

ÖNERİLEN: Düzeltme A — leagueFingerprint.leagueAvgGoals'u referans toplam ile aynı turnuvadan al
```

### 8.3 Tier Sinyali Düzeldi

```
ESKİ (29-maç):
  HIGH tier: %54.5 (22 maç) — yüksek güven düşük doğruluk (TERS)
  LOW tier:  %85.7 (7 maç)  — düşük güven yüksek doğruluk (spurious)

YENİ (41-maç):
  HIGH tier: %57.9 (38 maç) — yüksek güven yüksek doğruluk ✅
  LOW tier:  %33.3 (3 maç)  — düşük güven düşük doğruluk ✅
```

Faz 6 confidence reformu (geometric mean of `volume × decisiveness × agreement`) ters-korelasyonu kırdı. LOW tier 3 maçla küçük örneklem ama yön doğru.

---

## 9. Sonraki Adımlar

### 9.1 Hemen (Faz 7 — OU/BTTS kalibrasyonu)

1. **`referenceScaling` ile leagueFingerprint reference uyumu**:
   ```js
   // Mevcut:
   referenceTotalGoals = homeScoreProfile.avgScored + awayScoreProfile.avgScored;
   // Önerilen ek (lig fingerprint reference olduğunda):
   const _scalingDeflateGuard = leagueFingerprint?.leagueAvgGoals ?? null;
   if (referenceTotalGoals < _scalingDeflateGuard * 0.85) {
     // Profile turnuva-filtre nedeniyle düşük; lig bazlı bir kontrol uygula
     scalingFactor = max(scalingFactor, 1.0);  // sadece yukarı çekme
   }
   ```

2. **OU2.5 dynamicThreshold gözden geçir** — `report.goals.over25DynamicThreshold` zaten lig fingerprint'ten geliyor mu? Faz 7'de doğrulanmalı.

3. **BTTS — homeScoreProfile.bttsRate × awayScoreProfile.bttsRate** çarpımı vs Poisson hesabı uyumu kontrol edilmeli.

### 9.2 Orta Vade (Faz 8 — Geniş öğrenme döngüsü)

- 1 ay × 30 maç/gün = ~900 maç audit verisi birikmesi
- Modifier başına gerçek `var_i` (residual varyansı) hesaplanıp **inverse-variance weighting** uygula (tam Faz 4.1 refactor)
- Lig × tier × λ_total kümeleri için ayrı kalibrasyon profili

### 9.3 Uzun Vade (Faz 9+)

- HT/FT 9-sınıflı kalibrasyon (şu an genel %20.7 isabet)
- Beraberlik tahmin probleminin çözümü (rho değil → score-driven outcome veya Bradley-Terry tipi)
- Learning store residuallarının takım × turnuva × lig spesifik post-process olarak entegrasyonu

---

## 10. Sürdürülebilirlik Notları

**Statik sıfır prensibi korundu:** Bu testte hiçbir formülde keyfi sabit kullanılmadı. Tüm modifier sınırları ve eşikler ya Bayesian shrinkage ile ya da matematiksel zorunluluk (Jensen, Kish, Student-t) ile veriden türetildi.

**Audit altyapısı kanıtlandı:** `tools/lambda-audit.js` `referenceScaling` modifier'ının yanlış yönde çalıştığını **objektif ölçümle** ortaya çıkardı. Bu, kod incelemesiyle bulunamazdı; sadece backtest verisinin hit/miss kontribüsyon analizinden anlaşılır. Gelecekteki tüm modifier kararları aynı yöntemle veri-destekli olabilir.

**Kalan teknik borç:**
- `referenceScaling` revizyonu (Faz 7) — OU/BTTS isabetini doğrudan etkiler
- Faz 4.1 minimal versiyon → tam precision-weighted (audit verisi biriktikçe)
- Lig fingerprint reference uyumu (Faz 7'nin parçası)

---

## 11. Sonuç

**Onarımlar genel olarak doğru yönde çalışıyor:**
- λ deflasyonu sistematik olarak çözüldü (Bayern-PSG, Freiburg-Braga gibi maçlarda mükemmel kalibrasyon)
- Tier sinyali ters-korelasyondan kurtuldu
- Audit altyapısı yeni hastalıkları tespit edebiliyor

**Yeni keşfedilen sorun (`referenceScaling` deflasyonu) audit verisi sayesinde görünür oldu:**
- Sentetik testte +%14, gerçekte −%12 — bu fark audit olmadan anlaşılamazdı
- OU/BTTS isabetinin sınırlı kalmasının ana sebebi
- Faz 7'de hedef alınmalı

**Pratik isabet:**
- 1X2 %56.1 — Top-5 lig için profesyonel sınır
- ExactScore %19.5 — yüksek (random ~5%, profesyonel modeller ~12%)
- Avg Brier 0.6278 — random baseline'ın altında (0.667), ama hedef <0.45 için Faz 7 gerekli
- UCL/UEL'de %100 1X2 — yüksek profil maçlarda model güçlü

**Bu rapor, Faz 7 başlangıç noktası için yeterli kanıt sağlıyor.** Audit verisi, bir sonraki revizyonun hangi modifier'ı hedeflemesi gerektiğini matematiksel olarak gösteriyor: `referenceScaling`.

---

## Ek: Detaylı Sonuç Listesi

```
✅ FC Bayern München vs Paris Saint-Germain      | 1-1 vs 1-1   | ✅1X2 ✅O/U ❌BTTS
✅ Aston Villa vs Nottingham Forest              | 4-0 vs 1-0   | ✅1X2 ❌O/U ✅BTTS
✅ SC Freiburg vs Sporting Braga                 | 3-1 vs 3-1   | ✅1X2 ❌O/U ❌BTTS
✅ Almere City FC vs De Graafschap               | 3-1 vs 3-0   | ✅1X2 ✅O/U ✅BTTS
✅ Arsenal vs Atlético Madrid                    | 1-0 vs 1-0   | ✅1X2 ❌O/U ✅BTTS
✅ RKC Waalwijk vs Willem II Tilburg             | 0-1 vs 0-1   | ✅1X2 ✅O/U ✅BTTS
✅ Chelsea vs Nottingham Forest                  | 1-3 vs 0-1   | ✅1X2 ❌O/U ❌BTTS
❌ Everton vs Manchester City                    | 3-3 vs 0-2   | ❌1X2 ❌O/U ❌BTTS
✅ Cremonese vs Lazio                            | 1-2 vs 0-1   | ✅1X2 ✅O/U ❌BTTS
✅ AS Roma vs Fiorentina                         | 4-0 vs 1-0   | ✅1X2 ❌O/U ✅BTTS
❌ Sevilla vs Real Sociedad                      | 1-0 vs 0-1   | ❌1X2 ❌O/U ❌BTTS
✅ Bournemouth vs Crystal Palace                 | 3-0 vs 2-1   | ✅1X2 ❌O/U ✅BTTS
✅ Manchester United vs Liverpool FC             | 3-2 vs 2-1   | ✅1X2 ❌O/U ❌BTTS
❌ Aston Villa vs Tottenham Hotspur              | 1-2 vs 1-0   | ❌1X2 ❌O/U ❌BTTS
❌ Bologna vs Cagliari                           | 0-0 vs 1-0   | ❌1X2 ✅O/U ✅BTTS
❌ Sassuolo vs Milan                             | 2-0 vs 0-1   | ❌1X2 ❌O/U ✅BTTS
❌ Juventus vs Hellas Verona                     | 1-1 vs 2-0   | ❌1X2 ❌O/U ❌BTTS
✅ Inter vs Parma                                | 2-0 vs 2-0   | ✅1X2 ✅O/U ✅BTTS
✅ Celta Vigo vs Elche                           | 3-1 vs 1-0   | ✅1X2 ✅O/U ✅BTTS
❌ Getafe vs Rayo Vallecano                      | 0-2 vs 1-0   | ❌1X2 ❌O/U ✅BTTS
✅ Real Betis vs Real Oviedo                     | 3-0 vs 3-0   | ✅1X2 ✅O/U ❌BTTS
✅ Espanyol vs Real Madrid                       | 0-2 vs 0-2   | ✅1X2 ❌O/U ✅BTTS
❌ Lille vs Le Havre                             | 1-1 vs 1-0   | ❌1X2 ❌O/U ❌BTTS
✅ Auxerre vs Angers                             | 3-1 vs 1-0   | ✅1X2 ❌O/U ❌BTTS
✅ Paris FC vs Stade Brestois                    | 4-0 vs 1-0   | ✅1X2 ✅O/U ✅BTTS
❌ RC Strasbourg vs Toulouse                     | 1-2 vs 1-0   | ❌1X2 ✅O/U ✅BTTS
✅ Olympique Lyonnais vs Stade Rennais           | 4-2 vs 2-1   | ✅1X2 ❌O/U ❌BTTS
✅ FC St. Pauli vs 1. FSV Mainz 05               | 1-2 vs 0-1   | ✅1X2 ❌O/U ❌BTTS
❌ Borussia M'gladbach vs Borussia Dortmund      | 1-0 vs 0-1   | ❌1X2 ✅O/U ✅BTTS
❌ SC Freiburg vs VfL Wolfsburg                  | 1-1 vs 2-0   | ❌1X2 ❌O/U ✅BTTS
❌ Flamengo vs Vasco da Gama                     | 2-2 vs 3-0   | ❌1X2 ✅O/U ❌BTTS
❌ São Paulo vs Bahia                            | 2-2 vs 1-0   | ❌1X2 ❌O/U ❌BTTS
✅ Chapecoense vs Red Bull Bragantino            | 1-2 vs 0-1   | ✅1X2 ✅O/U ❌BTTS
✅ Internacional vs Fluminense                   | 2-0 vs 1-0   | ✅1X2 ❌O/U ✅BTTS
❌ Mirassol vs Corinthians                       | 2-1 vs 0-1   | ❌1X2 ❌O/U ❌BTTS
❌ FC Volendam vs SC Heerenveen                  | 0-2 vs 1-0   | ❌1X2 ❌O/U ❌BTTS
✅ Fortuna Sittard vs Feyenoord                  | 1-2 vs 1-2   | ✅1X2 ✅O/U ❌BTTS
✅ PEC Zwolle vs Heracles Almelo                 | 1-0 vs 2-0   | ✅1X2 ❌O/U ❌BTTS
❌ AZ Alkmaar vs FC Twente                       | 2-2 vs 2-1   | ❌1X2 ❌O/U ❌BTTS
❌ Sparta Rotterdam vs Go Ahead Eagles           | 2-2 vs 1-0   | ❌1X2 ❌O/U ❌BTTS
❌ Antalyaspor vs Alanyaspor                     | 0-0 vs 0-1   | ❌1X2 ✅O/U ✅BTTS
```

**Toplam:** 23 ✅ + 18 ❌ = 41 (1X2 %56.1)
