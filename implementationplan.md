# Tam Dinamik Simülasyon Motoru — Genişletilmiş Plan

## A. Statik Limitlerin Tamamen Kaldırılması

`sim-config.js` LIMITS bloğundaki **her** statik fallback, lig verisinden türetilecek. Matematiksel kurallar (olasılık ∈ [0,1]) dışında hiçbir sabit kalmayacak.

### Kaldırılacak statik değerler ve dinamik kaynakları

| Statik Limit | Mevcut Değer | Dinamik Kaynak |
|---|---|---|
| `POSSESSION.MIN/MAX` | 30/70 | ✅ Zaten düzeltildi: `possessionLimits.min/max` (standings) |
| `PROBABILITY.MIN/MAX` | 0.001/0.90 | → `{MIN: 0, MAX: 1}` — **matematiksel kural**, sınır gereksiz |
| `ON_TARGET.MIN/MAX` | 0.01/0.90 | → `baseline.onTargetRate / 4` ↔ `min(1, onTargetRate × 4)` |
| `BLOCK.MIN/MAX` | 0.001/0.60 | → `baseline.blockRate / 4` ↔ `min(1, blockRate × 4)` |
| `CORNER.MIN/MAX` | 0.001/0.50 | → `baseline.cornerPerMin / 4` ↔ `cornerPerMin × 4` |
| `CORNER_GOAL.MIN/MAX` | 0.01/0.20 | → `baseline.cornerGoalRate / 4` ↔ `cornerGoalRate × 4` |
| `CARDS.YELLOW_MAX` | 0.20 | → `baseline.yellowPerMin × 90 / 5` (lig ortalamasının 2x'i) |
| `CARDS.RED_MAX` | 0.10 | → `baseline.redPerMin × 90 / 2` |
| `LAMBDA.MIN/MAX` | 0.3/3.5 | ✅ Zaten düzeltildi: `lambdaLimits.min/max` |
| `FORM_MORALE` | 0.7/1.3/0.3 | ✅ Zaten dinamik: `normMinRatio/normMaxRatio` |

> [!IMPORTANT]
> Kalan tek matematiksel kurallar: olasılık ∈ [0, 1], possession ∈ [0, 100], çarpanlar ≥ 0.

---

## B. Kullanılmayan Metriklerin Tam Entegrasyonu

`computeProbBases` şu 15 alanı hesaplıyor ama simülasyon döngüsü **hiçbirini** kullanmıyor:

| Alan | Metrik | Şu An | Entegrasyon Planı |
|---|---|---|---|
| `foulRate` | M038 | ❌ | → Faul olayı olasılığı (yeni olay türü) |
| `pressIntensity` | M025 | ❌ | → Pressing state başlangıcı + territory etkisi |
| `secondBallRate` | M035 | ❌ | → Blok/korner sonrası ikinci top kazanma olasılığı |
| `highBlockSuccessRate` | M037 | ❌ | → Territory geri kazanım hızı |
| `freeKickThreatRate` | M023 | ❌ | → Serbest vuruş tehlike olasılığı (faul sonrası) |
| `firstHalfGoalRate` | M005 | ❌ (sadece earlyBase) | → İlk yarı momentum başlangıç çarpanı |
| `lateGoalRate` | M010 | ❌ (sadece MAC_SONU) | → Son 15dk momentum amplifikasyonu |
| `cleanSheetRate` | M028 | ❌ | → Savunma morale koruma çarpanı |
| `goalsAgainstRate` | M026 | ❌ | → Gol yeme sonrası morale düşüş çarpanı |
| `xGOverPerformance` | M011/M001 | ❌ | → Gol dönüşüm kalitesi (goalConvRate modülatörü) |
| `savePctAboveExpected` | M096/M098 | ❌ | → Big save olasılığı + morale etkisi |
| `penaltySaveRate` | M102 | ❌ | → Penaltı kurtarma olasılığı (GK) |
| `yellowAccumulation` | M039 | ❌ | → Kart birikimi → ikinci sarı riski |
| `penWinRate` | M019 | kısmi | → Penaltı kazanma olasılığı (faul sonrası) |
| `avgGKSave` | baseline | kısmi | → Lig ortalaması GK referansı |

**Ek metrikler (metric-calculator'da hesaplanıyor, probBases'e henüz alınmamış):**

| Metrik | Açıklama | Entegrasyon |
|---|---|---|
| M177 | Pressing yoğunluğu (PPDA) | → `state.pressing` başlangıcı |
| M178 | Territorial control | → `state.territory` başlangıcı |
| M179 | Savunma hat yüksekliği | → Ofsayt olasılığı |
| M180/M181 | Küme düşme baskısı | → urgency amplifikasyonu |
| M182/M183 | Şampiyonluk baskısı | → urgency amplifikasyonu |
| M186/M187 | ResistanceIndex | → Morale direnci çarpanı |
| M096b | Yorgunluk endeksi | → Fatigue başlangıç değeri |

---

## C. Tam Olay Kataloğu

### Mevcut olaylar (6)
`shot_on_target`, `shot_off_target`, `shot_blocked`, `goal`, `corner`, `yellow_card`, `red_card`, `penalty_missed`, `substitution`, `halftime`

### Eklenecek olaylar (6+)
`foul`, `free_kick`, `throw_in`, `offside`, `goal_kick`, `big_save`

### Her olayın olasılık formülü

**Faul** (her dakika, her iki takım):
```
foulProb = foulRate × (1/DISIPLIN) × urgencyMult × pressingMult × territoryMult
```
- `urgencyMult = 1 + max(0, urgency - 1)`: Acil takım daha çok faul yapar
- `pressingMult = 1 + pressing × 0.5`: Yüksek press → daha fazla faul
- `territoryMult`: Rakip sahada daha fazla faul

**Taç atışı** (her dakika, possession sahibi):
```
throwInProb = (1 - TOPLA_OYNAMA) × (1 - BAGLANTI_OYUNU) × territoryEdge
```
- Top kontrolü zayıf takım daha çok taç verir
- `territoryEdge`: Kanat baskısı (territory yüksekse, kenar hattı kullanımı artar)

**Ofsayt** (hücum fazında):
```
offsideProb = territory × atkPower × (1 / oppDefLine) × (1 / TAKTIKSEL_UYUM)
```
- Yüksek territory + baskı yapan takım → daha fazla ofsayt riski
- `oppDefLine`: Rakibin savunma hat yüksekliği (M179) — yüksek hat = daha çok ofsayt

**Serbest vuruş (tehlikeli)** (faul sonrası):
```
freeKickDangerProb = freeKickThreatRate × DURAN_TOP × territory
```
- Sadece rakip yarı sahada yapılan faullerden türer

**Goal kick** (şut sonrası, gol/isabetli değilse):
```
goalKickProb = (1 - onTargetRate) × (1 - blockRate) × 0.3
```
- Isabetsiz ve bloklanmamış şutların bir kısmı aut olur

**Big save** (isabetli şut + gol değilse):
```
bigSaveProb = savePctAboveExpected × GK_REFLEKS × shotDifficulty
```
- Sadece isabetli şut olup gol olmadığında tetiklenir
- Normal save vs big save ayrımı: `savePctAboveExpected > 0` → büyük kurtarış

---

## D. Genişletilmiş Game State + Başlangıç Değerleri

```js
state = {
  home: {
    momentum: MOMENTUM_AKIŞI,           // mevcut
    morale: f(FORM_KISA, lgCV),          // mevcut
    urgency: 1.0,                         // mevcut
    redCardPenalty: 0,                    // mevcut
    tacticalStance: 0.0,                  // YENİ: [-1, +1]
    territory: M178 / 100 ?? 0.5,         // YENİ: [0, 1]
    pressing: M177 / 100 ?? 0.5,          // YENİ: [0, 1]
    fatigue: M096b ?? 0,                  // YENİ: [0, 1]
    recentActions: [],                    // YENİ: son 5dk olay listesi
  }
}
```

- `tacticalStance` başlangıcı: `0.0` (nötr). Maç içi gol farkına göre kayar.
- `territory` başlangıcı: M178 (territorial control) mevcutsa kullan, yoksa 0.5.
- `pressing` başlangıcı: M177 (PPDA pressing) mevcutsa kullan, yoksa `pressIntensity ?? 0.5`.
- `fatigue` başlangıcı: M096b (yorgunluk endeksi) + `baseline.homeFatigue/awayFatigue`.

---

## E. Merkezi State Güncelleme: `applyEventImpact()`

### Ölçekleme Formülü

```js
function computeEventDelta(eventType, side, oppSide, minute) {
  // 1. Lig ölçeği — tüm etkilerin büyüklüğünü belirler
  const lgScale = baseline.leagueGoalVolatility / baseline.leagueAvgGoals;

  // 2. Olay katsayısı — gol = 1.0 referans, diğerleri LİG VERİSİNDEN türetilir
  const eventCoeff = deriveEventCoeff(eventType);

  // 3. Birim çarpanı — ilgili davranış birimlerinin geometrik ortalaması
  const unitMod = computeUnitModifier(eventType, side, oppSide);

  // 4. Azalan verimler — son 5dk'daki aynı yöndeki olaylar
  const diminishing = 1 / (1 + countRecentSameDirection(side, minute) × lgScale);

  // 5. Zaman çarpanı — maç sonu yaklaştıkça etkiler büyür
  const timeMod = 1 + (minute / 90) × (MAC_SONU / MAC_BASLANGICI - 1);

  return lgScale × eventCoeff × unitMod × diminishing × timeMod;
}
```

### `deriveEventCoeff()` — Lig Verisinden Türetilen Olay Ağırlıkları

Gol = 1.0 referans. Diğer olaylar, ligin olay frekanslarından oransal olarak türetilir:
```js
function deriveEventCoeff(eventType) {
  const lgGoals = baseline.leagueAvgGoals;        // ör: 2.5/maç
  const lgShots = baseline.shotsPerMin × 90;       // ör: 25/maç
  const lgCorners = baseline.cornerPerMin × 90;    // ör: 10/maç
  const lgYellows = baseline.yellowPerMin × 90;    // ör: 3/maç
  const lgFouls = meanFoulRate × 90;               // ör: 22/maç

  // Her olayın "gol eşdeğeri" = 1/frekans oranı
  // Mantık: nadir olay → büyük etki, sık olay → küçük etki
  switch(eventType) {
    case 'goal':            return 1.0;
    case 'shot_on_target':  return lgGoals / lgShots;        // ~0.10
    case 'shot_blocked':    return lgGoals / (lgShots × 2);  // ~0.05
    case 'shot_off_target': return lgGoals / (lgShots × 4);  // ~0.025
    case 'corner':          return lgGoals / lgCorners;       // ~0.25
    case 'yellow_card':     return lgGoals / lgYellows;       // ~0.83
    case 'red_card':        return lgGoals / lgYellows × 3;   // ~2.5
    case 'foul':            return lgGoals / lgFouls;         // ~0.11
    case 'free_kick':       return lgGoals / lgCorners;       // ~0.25
    case 'throw_in':        return lgGoals / (lgFouls × 3);   // ~0.04
    case 'offside':         return lgGoals / lgShots;         // ~0.10
    case 'big_save':        return lgGoals / lgShots × 1.5;   // ~0.15
    case 'penalty_missed':  return 1.0;                       // = gol eşdeğeri
  }
}
```

> [!IMPORTANT]
> Tüm katsayılar `baseline.leagueAvgGoals`, `baseline.shotsPerMin`, `baseline.cornerPerMin`, `baseline.yellowPerMin` gibi dinamik lig değerlerinden hesaplanır. Statik sayı yok. İngiltere Premier Ligi ile Türkiye Süper Amatör'de farklı katsayılar üretilir.

### `computeUnitModifier()` — Birim × Olay Çapraz Referans Matrisi

Her olay tipi için hangi davranış birimlerinin modülatör olarak kullanıldığı:

| Olay | Atan Takım Birimleri | Karşı Takım Birimleri |
|---|---|---|
| `goal` | `geo3(FİŞİ_ÇEKME, MOMENTUM_AKIŞI, BITIRICILIK)` | `geo2(PSIKOLOJIK_KIRILGANLIK, 1/ZİHİNSEL_DAYANIKLILIK)` |
| `shot_on_target` | `geo2(SUT_URETIMI, MOMENTUM_AKIŞI)` | `1/SAVUNMA_DIRENCI` (küçük) |
| `shot_blocked` | — | `geo2(SAVUNMA_AKSIYONU, ZİHİNSEL_DAYANIKLILIK)` |
| `shot_off_target` | `1/geo2(SUT_URETIMI, YARATICILIK)` | — |
| `corner` | `geo2(DURAN_TOP, HAVA_HAKIMIYETI)` | — |
| `free_kick` | `DURAN_TOP` | — |
| `foul` (yapan) | — | `SAVUNMA_AKSIYONU` (savunan momentum ↑) |
| `yellow_card` | `1/DISIPLIN × PSIKOLOJIK_KIRILGANLIK` | — |
| `red_card` | `PSIKOLOJIK_KIRILGANLIK / ZİHİNSEL_DAYANIKLILIK` | `FİŞİ_ÇEKME` |
| `big_save` | `1/BITIRICILIK` (moral düşüşü) | `GK_REFLEKS × ZİHİNSEL_DAYANIKLILIK` |
| `penalty_missed` | `PSIKOLOJIK_KIRILGANLIK` | `GK_REFLEKS` |
| `throw_in` | minimal (`TOPLA_OYNAMA × 0.1`) | — |
| `offside` | `1/TAKTIKSEL_UYUM` | — |
| `goal_kick` | — | `GK_ALAN_HAKIMIYETI` |
| `substitution` | `KADRO_DERINLIGI × MENAJER_STRATEJISI` | — |
| `halftime` | `MENAJER_STRATEJISI` (regresyon) | `MENAJER_STRATEJISI` (regresyon) |

### Her Olay → Hangi State Alanını Etkiler

| Olay | momentum | morale | territory | pressing | tacticalStance |
|---|---|---|---|---|---|
| `goal` | ↑↑↑/↓↓ | ↑↑↑/↓↓↓ | ↑/↓ | ↑/↓ | ±stance |
| `shot_on_target` | ↑/↓ | — | ↑ | — | — |
| `shot_blocked` | ↓/↑ | — | ↓/↑ | — | — |
| `shot_off_target` | ↓ | — | — | — | — |
| `corner` | ↑ | — | ↑ | — | — |
| `free_kick` | ↑ | — | ↑ | — | — |
| `foul` | ↑(yiyen) | — | ↓(yapan) | — | — |
| `yellow_card` | — | ↓ | — | ↓ | — |
| `red_card` | ↓↓/↑ | ↓↓↓/↑ | ↓/↑ | ↓ | ↓(10 kişi) |
| `big_save` | ↓/↑↑ | ↓/↑ | ↓/↑ | — | — |
| `penalty_missed` | ↓↓/↑↑ | ↓↓/↑ | — | — | — |
| `throw_in` | ± tiny | — | ± tiny | — | — |
| `offside` | ↓ tiny | — | ↑ tiny | — | — |
| `goal_kick` | —/↑ tiny | — | ↑(GK) | — | — |
| `substitution` | — | ± | — | — | ± |
| `halftime` | → regresyon | → regresyon | → 0.5 | → başlangıç | → f(skor farkı) |

---

## F. TacticalStance — Comfort Brake'in Dinamik Evrimi

Mevcut comfort brake mantığı `tacticalStance` alanına absorbe edilir:

```js
// Her gol sonrası stance güncelleme:
const goalDiff = goals[side] - goals[oppSide];
const comfortThreshold = ceil(expectedGoals);  // mevcut

if (goalDiff >= comfortThreshold) {
  // Fark açıldı → defansa çekilme
  const bloodlust = geo3(FİŞİ_ÇEKME, GOL_IHTIYACI, TURNUVA_BASKISI);
  const oppCollapse = PSIKOLOJIK_KIRILGANLIK / ZİHİNSEL_DAYANIKLILIK;
  const stanceShift = -1 × (1 / bloodlust) × (1 / oppCollapse);
  state.tacticalStance = clamp(tacticalStance + stanceShift, -1, +1);
} else if (goalDiff < 0) {
  // Gerideyiz → hücuma geç
  const needShift = GOL_IHTIYACI × urgency × lgScale;
  state.tacticalStance = clamp(tacticalStance + needShift, -1, +1);
}
```

**tacticalStance possession'ı etkiler:**
```js
const tacticalShift = (home.tacticalStance - away.tacticalStance)
  × geo2(TOPLA_OYNAMA_home, MENAJER_STRATEJISI_home)
  × lgScale × 5;  // 5 = possRange/20 gibi — ama bu da lgRange'den türetilmeli
```

Aslında `5` de statik! → `possRange / (leagueTeamCount / 4)` ile değiştirilmeli.

---

## G. Doğal Regresyon Sistemi (Her Dakika)

```js
// Momentum regresyonu — her dakika
const momDecay = 1 / (geo2(TOPLA_OYNAMA, BAGLANTI_OYUNU) × leagueTeamCount);
state.momentum += (initialMomentum - state.momentum) × momDecay;

// Territory regresyonu — her dakika
const terrDecay = 1 / (BAGLANTI_OYUNU × leagueTeamCount / 2);
state.territory += (0.5 - state.territory) × terrDecay;

// Pressing regresyonu — yorgunluk bazlı
const pressDecay = fatigue × (1 / KADRO_DERINLIGI);
state.pressing = max(0, state.pressing - pressDecay);
```

**Devre arası özel regresyon (dk 46):**
```js
const htRegression = MENAJER_STRATEJISI × lgScale;
state.momentum += (initialMomentum - state.momentum) × htRegression;
state.morale += (initialMorale - state.morale) × htRegression × 0.5;
state.territory = 0.5;  // Restart — her iki takım kendi yarısında başlar
state.tacticalStance = recalculate(goalDiff);  // Menajer devre arası taktik revize eder
```

---

## H. Possession'ın Tam Dinamik Formülü

```js
const momShift = (home.momentum - away.momentum) × momentumPossCoeff;
const terrShift = (home.territory - away.territory) × terrPossCoeff;
const pressShift = (home.pressing - away.pressing) × pressPossCoeff;
const stanceShift = (home.tacticalStance - away.tacticalStance) × stancePossCoeff;

currentHomePos = clamp(
  normalizedHomePoss + momShift + terrShift + pressShift + stanceShift,
  DYN_LIMITS.POSSESSION.MIN,  // ligdeki en düşük (%28 veya %18 — ne geliyorsa)
  DYN_LIMITS.POSSESSION.MAX   // ligdeki en yüksek (%72 veya %90 — ne geliyorsa)
);
```

Tüm `*PossCoeff` değerleri:
```js
terrPossCoeff = possRange × lgVol / (lgAvg × 2);
pressPossCoeff = possRange × lgVol / (lgAvg × 3);
stancePossCoeff = possRange / leagueTeamCount;
```

---

## I. Değiştirilecek Dosyalar Özeti

### [MODIFY] [sim-config.js](file:///c:/Users/guner/OneDrive/Masaüstü/tutarbu/src/engine/sim-config.js)
- Tüm statik LIMITS değerleri `getDynamicLimits()`'te dinamik hesaplanacak
- `PROBABILITY: {MIN: 0, MAX: 1}` — tek matematiksel kural
- Possession `%30-70` sınırı → standings'ten gelen gerçek aralık (düzeltildi)

### [MODIFY] [match-simulator.js](file:///c:/Users/guner/OneDrive/Masaüstü/tutarbu/src/engine/match-simulator.js)
- `state` objesine 4 yeni alan: `tacticalStance`, `territory`, `pressing`, `fatigue`, `recentActions`
- Yeni `applyEventImpact()` fonksiyonu: merkezi state güncelleme motoru
- Yeni `deriveEventCoeff()`: lig verisinden olay ağırlıkları
- 6 yeni olay türü: `foul`, `free_kick`, `throw_in`, `offside`, `goal_kick`, `big_save`
- Dakika başı doğal regresyon sistemi
- Comfort brake → `tacticalStance` absorpsiyonu
- Tüm kullanılmayan probBases alanlarının simülasyon döngüsüne entegrasyonu
- `currentHomePos` hesabına territory + pressing + stance katkıları

### [MODIFY] [dynamic-baseline.js](file:///c:/Users/guner/OneDrive/Masaüstü/tutarbu/src/engine/dynamic-baseline.js)
- `foulRate` lig ortalaması ekleme (standings veya team proxy)
- `offsideRate` lig ortalaması (standings veya team proxy)
- `throwInRate` türetme (possession loss proxy)

### [MODIFY] [computeProbBases()](file:///c:/Users/guner/OneDrive/Masaüstü/tutarbu/src/engine/match-simulator.js)
- M177 (pressing), M178 (territory), M179 (savunma hat yüksekliği) probBases'e ekleme
- M180-M185 (baskı indeksleri) probBases'e ekleme

---

## J. Verification Plan

### Automated Tests
1. `node debug-sim.js` — possession **her dakika farklı** olmalı
2. minuteLog'dan tüm yeni olay türlerini doğrula (foul, throw_in, offside, vb.)
3. Momentum/morale grafiği — gol/kart/big_save sonrası belirgin kaymalar
4. Territory grafiği — baskı yapan takım yüksek territory
5. 100 koşu: ortalama home/away gol/şut/korner istatistikleri
6. Possession min/max → standings'ten gelen gerçek aralıkta mı (30-70 DEĞİL)
7. Comfort brake (tacticalStance) çalışıyor mu — fark açıldığında stance negatif

### Multi-League Tests
- Yüksek CV ligi (Eredivisie/Bundesliga): Daha fazla gol, daha büyük momentum salınımları
- Düşük CV ligi (Serie A/Ligue 1): Daha az gol, daha stabil momentum
- Amatör lig: Çok yüksek possession aralığı (belki %20-%80), yüksek faul oranı
