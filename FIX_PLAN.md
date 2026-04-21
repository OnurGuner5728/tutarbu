# Tam Düzeltme Planı — Skor Tahmin Sisteminin Dinamikleştirilmesi (v3)

**Tarih:** 2026-04-21  
**Prensip:**  
1. **Sıfır manuel katsayı.** Her eşik, ağırlık, shrinkage sınırı veriden türetilir.  
2. **Sıfır lig seçimi.** Validation her lig için kendi iç tutarlılığı üzerinden yapılır.  
3. **Sıfır sim-config bağımlılığı** (matematiksel kimlik hariç).  
4. **Tüm hesaplanan alanlar backtest JSON'una kaydedilir.**

---

## 0. Lig Parmak İzi — Kaynak Kararı

### Havuz (Katman A) — EK API YOK
- Birleşim: `homeLastEvents.events ∪ awayLastEvents.events ∪ h2hEvents.events`
- **Dedup:** Her event'in `id` alanı tekil — Set ile filtre.
- **Tournament filter:** Sadece `tournament.uniqueTournament.id === currentTournamentId` olan maçlar.
- **Zamansal ağırlıklandırma:** Her maç `w = exp(-Δt / τ)` ile tartılır.  
  `Δt` = maç tarihi ile bugün arası gün farkı.  
  **`τ` dinamik:** Pool'un tarih aralığından — `τ = median(Δt)` (veriden türüyor, sabit 90 gün yok).  
  Sonuç: yarı-ağırlık median maç yaşında. Yeterince yeni maçlar %100'e yakın, en eski maç ~%37.

### Agregat (Katman B) — standings'ten
- `leagueAvgGoals_std = Σ(scoresFor) / Σ(matches)` (tüm satırların toplamı)
- `leagueDrawRate_std = Σ(draws) / Σ(matches)` (eğer `draws` kolonu varsa)
- `leagueHomeWinRate_std`, `leagueAwayWinRate_std`

### Çıktı (union)
```
{
  leagueScoredDist[k], leagueConcededDist[k], leagueJointDist["h-a"],
  leagueBTTSRate, leagueOver25Rate, leagueOver15Rate, leagueOver35Rate,
  leagueDrawRate, leagueHomeWinRate, leagueAwayWinRate,
  leagueAvgGoals, leagueGoalVariance, leagueCV,
  poolSize, poolTournamentCount, poolDateRangeDays,
  tempDecayTau, reliability  // n/(n+sqrt(n))
}
```

### Validation — **lig-agnostik iç tutarlılık**
Validation dış referans KULLANMAZ. Her lig kendi iki kaynağıyla karşılaştırılır:

1. **Pool ↔ Standings tutarlılığı:**  
   `|leagueAvgGoals_pool - leagueAvgGoals_std| / leagueAvgGoals_std < 2·σ_pool`  
   (σ_pool = pool örneklem hatasının standart sapması = √(variance/n)).  
   Doğal istatistiksel tolerans — sabit 7% yok.

2. **Dağılım normalizasyonu:** `Σ leagueScoredDist[k] ≈ 1.0` (numerical precision).

3. **Örneklem yeterliliği:** `poolSize ≥ √(tournamentTeamCount × 2)` olmalı.  
   (Örn. 20 takımlı lig → minimum ~6-7 maç. Veriden türüyor.)

4. Üç test başarısız olursa `leagueProfile.reliability = 0` → blend'de ağırlık sıfır, sistem sessizce devam eder (fallback değil; sinyal yok → sinyalsiz hesap).

---

## 1. Aşama Listesi

### **Aşama 1: Lig Parmak İzi**
**Yeni dosya:** `src/engine/league-fingerprint.js`

**(a) Analiz:**  
- `scripts/analyze-league-fingerprint.js` — mevcut backtest JSON'undaki 39 maçın raw payload'larını okuyup havuzu üretir ve validation testlerini çalıştırır.  
- **Geçiş kriteri:** 39 maçın ≥%80'inde 3 iç tutarlılık testi geçsin.

**(b) Kod:**
- `computeLeagueFingerprint(data, today)` → havuzu üretir.
- `blendScoreDistribution` yeni `leagueProfile` parametresi alır.
- Blend hiyerarşisi (reliability-ağırlıklı):  
  `matchProfile > teamProfile > leagueProfile > Poisson`
- Profil bucket içi ağırlık: `rel_i / Σ rel_j`.

**(c) Kaydet:** `leagueFingerprint` tüm alanları backtest sonucuna yazılır.

---

### **Aşama 2: Takım Parmak İzini Güçlendir**
**Dosya:** `src/engine/score-profile.js`

- `maxMatches` pool'un `events.length` değerinden türetilir (tavan değil, veriden).
- Return field ekle: `bttsRate`, `over25Rate`, `cleanSheetRate`, `scoringRate` (hepsi matches array'inden — maliyet sıfır).
- `extractMatchScoreProfile` için aynısı.
- Zamansal decay burada da uygulanır (τ = median Δt).

---

### **Aşama 3: Dinamik BTTS & O/U Kalibrasyonu**

**(a) NaN/0 durumu:**  
Manuel guard yok. Eğer `P_btts = 0` ise bu Poisson'un (λ_h=0 veya λ_a=0) durumudur — bu zaten üst katmanda `null lambda` demektir ve M168 hiç hesaplanmaz. Normal işlemde `P_btts > 0` garanti; gerçekten 0 gelirse sistem null döner.

**(b) Blend:**  
`E[BTTS] = Σ (rel_i × bttsRate_i)` (home, away, match, league profiles'dan).  
`k = E[BTTS] / P_btts`  
BTTS'li skorlara `k`, olmayanlara `(1 - E) / (1 - P)` çarpanı, renormalize.

**(c) Dinamik clamp:**  
`k` üst sınırı = `1 + leagueCV` (volatil ligde daha serbest, istikrarlıda dar).  
`k` alt sınırı = `1 / üst_sınır` (simetrik log skala).

**(d) Aynı işlem O/U 2.5 için:**  
`E[Over25] = Σ (rel_i × over25Rate_i)`, benzer çarpan uygulaması.

**Kanıt:**  
Backtest JSON'una `P_btts_before`, `E_btts`, `P_btts_after`, `k_applied` yazılır. İç tutarlılık: 39 maçta `|P_after - E| < |P_before - E|` olmalı (kalibrasyon monoton iyileşme).

---

### **Aşama 4: λ Düşüklüğünü Gider — Simetrik Dinamik Shrinkage**

**(a) Dinamik eşikler:**  
Şu an yok — eşikler `avgScored_profile ± 1.5σ_empirik` olacak.  
`σ_empirik = √(variance_scored_profile)` — zaten `extractTeamScoreProfile` `variance` field'ı döndürüyor.

**(b) Kod:**  
```
deviation = |λ_model - avgScored_profile| / σ_empirik
if deviation > z_threshold:
    λ_final = geometric_mean(λ_model, avgScored_profile)
```
`z_threshold` dinamik: profil güvenilirliğinden = `1 + reliability`  
(reliability=0 → z=1 çok hassas; reliability=1 → z=2 daha geniş tolerans).

**(c) Kaydet:** `lambda_raw`, `lambda_empirical`, `lambda_final`, `shrinkage_applied`, `z_score`.

---

### **Aşama 5: Ev Avantajı Damperi**

`effectiveHomeAdv = baseHomeAdv × exp(-|ln(homePPG/awayPPG)| × leagueCV)`  
- leagueCV dinamik (zaten var).
- Eşit takım → çarpan 1.0.
- Katsayı manuel değil, **leagueCV**.

**Kaydet:** `baseHomeAdv`, `ppgRatio`, `dampFactor`, `effectiveHomeAdv`.

---

### **Aşama 6: Maçın Önemi → λ (kanıtla entegrasyon)**

**(a) Kanıt prosedürü (entegrasyondan önce):**  
Pool'daki her maçta:  
- Maç anındaki `gap` (promotion/relegation threshold mesafesi) — o tarihteki standings snapshot olmadığı için, **maç tarihi ile mevcut standings arası sıralama değişim büyüklüğü** yaklaşımı kullanılır.
- O maçtaki atılan gol sayısı.

Regresyon:  
```
goalsScored = α + β × gapImportance + ε
```
β sıfırdan anlamlı ölçüde farklı mı? (t-test, p<0.05).

- β > 0 ve anlamlı → kritik maç gol artırıyor, entegrasyon yönü +.
- β < 0 anlamlı → düşürüyor, yön -.
- Anlamsız → **entegrasyon yapılmaz**, bu aşama atlanır.

**(b) Kod (β anlamlıysa):**  
`λ_home *= 1 + M172_normalized × β_scaled`  
`β_scaled = β × σ_goals / mean_goals` (normalizasyon — manuel 0.05 yok, regresyondan geliyor).

**(c) Kaydet:** `beta_importance`, `pValue`, `appliedAdjustment`.

---

### **Aşama 7: Hardcoded Sabitleri Dinamikleştir — Korner & Kart Dahil**

**(a) Korner threshold'ları:**  
`data.homeRecentMatchDetails + awayRecentMatchDetails + h2hMatchDetails` — istatistiklerde `cornerKicks` var. Pool oluştur:  
- `leagueCornerAvg = mean(corners_per_match)`
- `leagueCornerStd = std(corners_per_match)`
- `CORNER_L = leagueCornerAvg - leagueCornerStd`  
- `CORNER_M = leagueCornerAvg`  
- `CORNER_H = leagueCornerAvg + leagueCornerStd`

**(b) Kart threshold'ları:** aynı mantık `yellowCards + redCards` toplamı üzerinden.

**(c) LAMBDA clamp:**  
`LAMBDA.MIN = max(0.05, leagueAvgGoals - 3·σ_goals)`  
`LAMBDA.MAX = leagueAvgGoals + 3·σ_goals`

**(d) POWER/MOMENTUM/MORALE clamp:**  
Zaten `normMinRatio² / normMaxRatio²` var — wire edilmeyen yerleri `grep` ile bul ve bağla.

**(e) FORM_MORALE.SCALE:**  
`= ptsCV` (dinamik).

**(f) M170 sabitleri (contextual.js):**  
| Sabit | → |
|---|---|
| `baseIntensity` cup 1.15 | `1 + ptsCV` |
| `legBoost` 0.15 | `ptsCV × median(ptsCV, leagueCV)` — iki CV'nin harmonik kombinasyonu |
| `importanceBoost /250` | `/(100 / ptsCV)` |

**(g) Kaydet:** Her dinamikleşen değerin `static_before`, `dynamic_after`, `derivationSource` field'ı.

---

## 2. Uygulama Sırası

```
Aşama 1 (Lig fingerprint + validation script)
Aşama 2 (Team fingerprint bttsRate/over25Rate + temporal decay)
Aşama 3 (BTTS/OU kalibrasyon — CV-bound k)
Aşama 4 (λ simetrik shrinkage — reliability-bound z)
Aşama 5 (HomeAdv damper — CV-bound)
Aşama 6 (Önem → λ — regresyonla kanıt, gerekirse entegrasyon)
Aşama 7 (Hardcoded → dinamik, korner/kart dahil)
                ↓
Runner patch: top-5 scoreDist + tüm ara değerler JSON'a
Runner patch: event ID dedup
                ↓
Syntax + import sanity
                ↓
50 maçlık backtest (dedup'lı)
                ↓
analyze-backtest v2 — ara değerler ve β istatistikleri dahil
                ↓
Her aşamanın katkısını ayıran karşılaştırma raporu
```

---

## 3. Kanıtlama Disiplini — Her Aşama İçin Zorunlu

1. **Türetme formülü** matematiksel/istatistiksel motivasyon.
2. **İç tutarlılık kanıtı** — dış referans yok; veri kendi kendisiyle tutarlı mı?
3. **Clamp'ler dinamik** — CV, reliability, σ'dan türüyor.
4. **Offline test** — mevcut backtest JSON'undaki raw payload üzerinden script ile doğrula.
5. **Null semantiği** — kaynak yok → `null` döner, fallback yok.

Her aşama tamamlandığında `FIX_LOG.md`'de şu form:
```
## Aşama X
- Formül: ...
- İç tutarlılık testi: [geçti/düştü]
- Offline sanity: [örnek çıktı]
- Entegrasyon: [yapıldı/atlandı — sebep]
```

---

## 4. Beklenen Etki (muhafazakâr, 39 maç örneklem gerçekçi)

| Metrik | Mevcut | Hedef alt | Hedef üst |
|---|---|---|---|
| 1X2 | 52% | 55% | 62% |
| O/U 2.5 | 48% | 56% | 65% |
| BTTS | 40% | 54% | 62% |
| Kesin skor | 14% | 18% | 24% |

Üst band güçlü kanıt gerektirir (aşama 3+4+6 üçünün de net katkı vermesi). Alt band sadece aşama 1+3+5 ile erişilebilir.

---

## 5. Risk

- **Pool yanlılığı:** homeLastEvents'in çoğu kendi ev maçıdır → ev sahibi lehine yanlılık olabilir. Dedup + tournament filter + temporal decay hafifletir, regresyonla ölçülür (Aşama 6 kanıt mekanizması).
- **β anlamsızlığı:** Aşama 6 atlanırsa 1X2 kazanımı alt bandda kalır.
- **Küçük örneklem:** 39 maç — her düzeltmenin katkısı istatistiksel gürültüden ayırt edilemeyebilir. Karşılaştırma raporunda confidence interval gösterilir.

---

## 6. Değiştirilmeyen Tek Şey

`NEUTRAL_DEFAULTS` (sim-config) — `UNIT_IDENTITY: 1.0`, `POSSESSION_SYMMETRY: 0.50` gibi matematiksel kimlik noktaları. Bunlar veri değil, cebirsel nötr eleman. (1×x=x). Dokunulmaz çünkü dinamikleştirilemez — zaten değer değil, simetri noktası.
