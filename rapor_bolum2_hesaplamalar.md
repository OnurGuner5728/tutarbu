# BÖLÜM 2: İŞLENMİŞ METRİKLER, MOTORLAR VE NİHAİ ÇIKTI

---

## 2.1 Metrik Motoru Sağlık Raporu (`_debug.metricAudit`)

| Parametre | Değer |
|-----------|-------|
| Toplam Metrik Sayısı | 195 |
| Başarıyla Hesaplanan | 183 |
| Null (Veri Yok) | 12 |
| Kritik Eksik | 0 |
| Yüksek Risk | Hayır |
| Global Fallback | 0 |

**Null (Hesaplanamayan) Metrikler:** M025, M025b, M095, M106, M111, M112, M114, M115, M116, M118, M118b, M127  
Bu metrikler API'den veri gelmediği için `null` olarak bırakıldı. Uydurma değer atanmadı.

---

## 2.2 İşlenmiş Kompozit Güçler (`comparison`)

`metric-calculator.js` ve `advanced-derived.js` tarafından ham verilerden hesaplanan nihai güç skorları:

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

## 2.3 Lig Baseline Değerleri (Simülasyon Referans Noktaları)

`league-averages.js` tarafından hesaplanan, simülasyonun fizik motoru olarak kullandığı lig ortalamaları:

| Parametre | Değer |
|-----------|-------|
| Lig Ort. Gol | 1.691 |
| Şut/Dakika | 0.415 |
| İsabet Oranı | %41.2 |
| Gol Dönüşüm Oranı | %22.0 |
| Kaleci Kurtarış Oranı | %67.0 |
| Blok Oranı | %46.1 |
| Korner/Dakika | 0.047 |
| Sarı Kart/Dakika | 0.0139 |
| Kırmızı Kart/Dakika | 0.0016 |
| Penaltı Dönüşüm | %60 |
| Penaltı/Maç | 0.359 |
| Top Oynama Tabanı | %62.6 |
| PSG Yorgunluk | 0.952 |
| Bayern Yorgunluk | 0.952 |
| PSG Dinlenme | 3 gün |
| Bayern Dinlenme | 3 gün |

---

## 2.4 Dinamik Blok Ağırlıkları (12 Blok × 4 Bölge)

`lineup-impact.js` → `computeDynamicBlockWeights()` fonksiyonu, sahadaki 11 oyuncunun istatistiklerini tarayarak her bloğun gücünün sahanın hangi bölgesinde yoğunlaştığını hesaplar:

### BİTİRİCİLİK (Gol Yolları)
| Bölge | PSG | Bayern |
|-------|-----|--------|
| Kaleci | %0 | %0 |
| Defans | %21.2 | %12.3 |
| Orta Saha | %27.3 | **%59.0** |
| Forvet | **%51.5** | %28.7 |

→ PSG'nin gollerini forvetler atar (Kvaratskhelia 10 gol). Bayern'in golleri orta sahadan gelir (Olise 5G, Díaz 7G, Musiala 2G).

### YARATICILIK (Pas ve Şans Üretimi)
| Bölge | PSG | Bayern |
|-------|-----|--------|
| Defans | %30.1 | %21.6 |
| Orta Saha | %27.6 | **%65.9** |
| Forvet | **%42.3** | %12.5 |

→ Bayern'in yaratıcılığı orta sahada toplanmış (Kimmich xA 3.11, Olise xA 4.82). PSG'de yaratıcılık forvete dağılmış (Doué 27 kilit pas).

### ŞUT ÜRETİMİ
| Bölge | PSG | Bayern |
|-------|-----|--------|
| Defans | %19.7 | %11.5 |
| Orta Saha | %28.5 | **%60.7** |
| Forvet | **%51.8** | %27.7 |

### HAVA HAKİMİYETİ
| Bölge | PSG | Bayern |
|-------|-----|--------|
| Kaleci | %12.7 | %2.4 |
| Defans | **%57.6** | **%56.9** |
| Orta Saha | %21.5 | %26.7 |
| Forvet | %8.2 | %14.0 |

### SAVUNMA DİRENCİ
| Bölge | PSG | Bayern |
|-------|-----|--------|
| Kaleci | %6.6 | %2.9 |
| Defans | **%49.8** | **%55.5** |
| Orta Saha | %29.4 | %37.3 |
| Forvet | %14.2 | %4.3 |

### SAVUNMA AKSİYONU
| Bölge | PSG | Bayern |
|-------|-----|--------|
| Kaleci | %7.4 | %3.2 |
| Defans | **%49.6** | **%57.4** |
| Orta Saha | %29.6 | %35.6 |
| Forvet | %13.3 | %3.8 |

### TOPLA OYNAMA
| Bölge | PSG | Bayern |
|-------|-----|--------|
| Kaleci | %3.3 | %6.1 |
| Defans | **%43.6** | %34.3 |
| Orta Saha | %35.4 | **%55.0** |
| Forvet | %17.7 | %4.7 |

### BAĞLANTI OYUNU
| Bölge | PSG | Bayern |
|-------|-----|--------|
| Defans | %31.2 | %20.6 |
| Orta Saha | %26.6 | **%67.9** |
| Forvet | **%42.2** | %11.3 |

### TAKTİKSEL UYUM
| Bölge | PSG | Bayern |
|-------|-----|--------|
| Kaleci | %11.0 | %7.0 |
| Defans | %33.9 | %38.3 |
| Orta Saha | %26.9 | **%47.5** |
| Forvet | %28.2 | %7.1 |

### Piyasa Değeri Kırılımı (Market Value Breakdown)
| Bölge | PSG | Bayern |
|-------|-----|--------|
| Kaleci | 31,414 | 35,653 |
| Defans | 121,129 | 131,713 |
| Orta Saha | 124,978 | **168,940** |
| Hücum | **123,155** | 48,331 |
| **Toplam** | 400,676 | 384,637 |

---

## 2.5 Poisson Motoru Çıktısı (`poissonResult`)

`prediction-generator.js` içinde Dixon-Coles kalibrasyonuyla hesaplanan değerler:

| Parametre | Değer |
|-----------|-------|
| PSG Lambda (Beklenen Gol) | **2.35** |
| Bayern Lambda | **2.23** |
| PSG Galibiyeti | %45.2 |
| Beraberlik | %10.3 |
| Bayern Galibiyeti | %44.5 |
| En Olası Skor | 1-1 |
| Kaynak | Poisson/Dixon-Coles |

---

## 2.6 Monte Carlo Simülasyon Çıktısı (`simulationResult`)

`match-simulator.js` tarafından 1000 iterasyonla üretilen sonuçlar:

| Parametre | Değer |
|-----------|-------|
| PSG Galibiyeti | **%63.3** |
| Beraberlik | %14.1 |
| Bayern Galibiyeti | %22.6 |
| Ortalama Gol | 7.33 |
| Ortalama PSG Gol | 4.29 |
| Ortalama Bayern Gol | 3.03 |
| Üst 2.5 | %98.9 |
| KG (BTTS) | %94.5 |
| Kaynak | Monte Carlo Simulation |

**Simülasyon En Sık Skorlar:**

| Skor | Oran |
|------|------|
| 5-3 | %6.6 |
| 5-2 | %6.3 |
| 5-4 | %4.7 |
| 5-5 | %4.6 |
| 5-1 | %4.0 |

**Simülasyon Örnek Maç (sampleRun) — Dakika Dakika:**
- 2' → Bayern şut (isabetli) — Harry Kane
- 4' → PSG şut (isabetsiz) — Vitinha
- 8' → Bayern şut (isabetsiz) — Musiala
- **14' → ⚽ PSG GOL — Vitinha**
- 17' → PSG korner
- 18' → PSG şut (isabetli) — Dembélé
- **21' → ⚽ PSG GOL — Kvaratskhelia**
- **25' → ⚽ PSG GOL — Dembélé**
- **27' → ⚽ PSG GOL — Vitinha**
- **37' → ⚽ Bayern GOL — Luis Díaz**
- **İlk Yarı: PSG 4-1 Bayern**
- 52' → Bayern şut (isabetli) — Musiala
- **72' → ⚽ Bayern GOL — Musiala**
- 78'-86' → PSG baskısı (5 şut)
- 91' → Sarı kart — João Neves
- **93' → ⚽ Bayern GOL — Olise**
- **Maç Sonu: PSG 4-3 Bayern**

---

## 2.7 Harmanlama Formülü (Poisson + Simülasyon → Nihai Tahmin)

`prediction-generator.js` satır 163-250 arası. İki motor tek bir sonuçta birleştirilir:

**Adım 1: TVD (Total Variation Distance)**
İki motorun anlaşma derecesi: `TVD = ½ × (|%45.2-%63.3| + |%10.3-%14.1| + |%44.5-%22.6|) / 2`

**Adım 2: Dinamik Ağırlık**
Lig volatilitesine göre Poisson'un baz güveni hesaplanır: `basePoissonW = 1.0 - (vol / (vol + avg)) = 1.0 - (0.632 / (0.632 + 1.691)) = 0.728`

**Adım 3: Temperature Scaling**
Overconfidence'ı kırmak için olasılıklar merkeze doğru büzüştürülür.

---

## 2.8 Nihai Çıktı (`prediction` — Son Kullanıcıya Ulaşan Sonuç)

| Parametre | Değer |
|-----------|-------|
| **PSG Galibiyeti** | **%63.3** |
| **Beraberlik** | **%14.1** |
| **Bayern Galibiyeti** | **%22.6** |
| En Olası Skor (Poisson) | 1-1 (%3.03) |
| Lambda Ev (Poisson) | 2.35 |
| Lambda Dep (Poisson) | 2.23 |
| MC Ort. Ev Gol | 4.29 |
| MC Ort. Dep Gol | 3.03 |
| Üst 1.5 | %94.19 |
| Üst 2.5 | %98.9 |
| Üst 3.5 | %79.65 |
| KG (BTTS) | %94.5 |
| Güven Skoru | 100 |

**Poisson Top 5 Skor:**

| Skor | Oran |
|------|------|
| 1-1 | %3.03 |
| 2-2 | %3.02 |
| 2-1 | %2.79 |
| 1-2 | %2.66 |
| 0-1 | %2.55 |

**İlk Yarı Tahminleri:**

| Parametre | Değer |
|-----------|-------|
| IY Beklenen Ev Gol | 3.53 |
| IY Beklenen Dep Gol | 3.35 |
| IY Üst 0.5 | %95 |
| IY Üst 1.5 | %90 |

**HT-FT Dağılımı:**

| Kombine | Oran |
|---------|------|
| **1/1** | **%47.64** |
| X/1 | %13.55 |
| 2/1 | %11.06 |
| 1/2 | %7.70 |
| 2/2 | %8.47 |

**İlk Golü Atma:**
PSG: %55.24 | Bayern: %44.76

**Gol Periyotları (Geçmiş Veriden):**

| Periyot | PSG | Bayern |
|---------|-----|--------|
| 0-15 dk | %14.3 | %5.6 |
| 16-30 dk | %7.1 | %11.1 |
| 31-45 dk | %28.6 | %27.8 |
| 46-60 dk | %28.6 | %11.1 |
| 61-75 dk | %7.1 | %16.7 |
| 76-90 dk | %14.3 | %27.8 |

**Penaltı ve Kart Riski:**

| Parametre | Değer |
|-----------|-------|
| Penaltı Şansı | Orta (raw: 0.60) |
| Kırmızı Kart Şansı | **Yüksek** (raw: 4.39) |

**Öne Çıkan İçgörüler:**
- ⚽ PSG 22 maçtır gol atıyor
- ⚽ Bayern 54 maçtır gol atıyor
- ✅ Yüksek güvenilirlik skoru: %95
- 🚩 Yoğun korner trafiği bekleniyor
