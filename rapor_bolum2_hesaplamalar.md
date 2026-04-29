# BÖLÜM 2: İŞLENMİŞ METRİKLER, MOTORLAR VE NİHAİ ÇIKTI

**Son Güncelleme:** 29 Nisan 2026 | **Maç:** PSG vs Bayern München (ŞL)

---

## 2.1 Metrik Motoru Sağlık Raporu

| Parametre | Değer |
|-----------|-------|
| Toplam Metrik Sayısı | **196** |
| Başarıyla Hesaplanan | **196** |
| Null (Veri Yok) | **0** |
| Statik/Hardcoded Ağırlık | **0** |

Daha önce null olan 12 metrik (M025, M025b, M095, M106, M111-M118b, M127) tamamen dinamik veri kaynakları kullanılarak hesaplanıyor. Uydurma değer atanmıyor.

---

## 2.2 Behavioral Intelligence Matrix — 27 Blok

196 metrikten hesaplanan davranışsal güç üniteleri. Her bloğun değeri 1.0 = lig ortalaması anlamına gelir:

| Blok | PSG | Bayern | Yorum |
|------|-----|--------|-------|
| BİTİRİCİLİK | **1.287** | 1.059 | PSG ceza sahası içi golcülük üstün |
| YARATICILIK | 1.061 | **1.295** | Bayern fırsat yaratmada güçlü |
| ŞUT ÜRETİMİ | 1.277 | **1.372** | Bayern şut hacmi fazla |
| HAVA HAKİMİYETİ | **1.341** | 1.183 | PSG hava toplarında avantajlı |
| DURAN TOP | **1.104** | 0.856 | PSG set piece'lerde üstün |
| SAVUNMA DİRENCİ | **1.422** | 1.234 | PSG savunma duvarı güçlü |
| SAVUNMA AKSİYONU | 1.062 | **1.156** | Bayern aktif savunmada iyi |
| GK REFLEKS | **1.015** | 0.992 | Kaleciler dengeli |
| GK ALAN HAKİMİYETİ | **1.239** | 0.773 | PSG kalecisi üstün |
| ZİHİNSEL DAYANIKLILIK | **1.124** | 1.022 | PSG mental olarak güçlü |
| FİŞİ ÇEKME | **1.525** | 1.256 | PSG comeback'te çok güçlü |
| PSİKOLOJİK KIRILGANLIK | 0.393 | 0.368 | Düşük kırılganlık (iyi) |
| DİSİPLİN | 0.567 | **1.364** | Bayern disiplin üstünlüğü |
| MOMENTUM AKIŞI | 0.438 | **0.449** | Dengeli |
| FORM KISA | **1.708** | 1.160 | PSG kısa vadeli formda çok iyi |
| FORM UZUN | **1.699** | 1.538 | İkisi de güçlü |
| MAÇ BAŞLANGICI | **0.997** | 0.710 | PSG erken baskıda üstün |
| MAÇ SONU | 0.911 | **1.700** | Bayern maç sonu gol atıcı |
| MENAJER STRATEJİSİ | **1.006** | 0.994 | Dengeli |
| TURNUVA BASKISI | 1.064 | 1.064 | Eşit |
| GOL İHTİYACI | 0.858 | 0.844 | Dengeli |
| TOPLA OYNAMA | 0.951 | **1.042** | Bayern hafif üstün |
| BAĞLANTI OYUNU | **1.001** | 0.991 | Dengeli |
| KADRO DERİNLİĞİ | **0.915** | 0.900 | Dengeli |
| H2H DOMİNASYON | 0.471 | 0.471 | Ortak |
| HAKEM DİNAMİKLERİ | 0.805 | 0.805 | Ortak |
| TAKTİKSEL UYUM | 0.948 | **1.052** | Bayern daha uyumlu |

---

## 2.3 İki Motor: Poisson vs Monte Carlo Simülasyon

Sistem iki bağımsız motor kullanır. Bu iki motor aynı verileri alır ama farklı matematiksel yaklaşımlarla sonuç üretir.

### Poisson (Dixon-Coles)

| Parametre | Değer |
|-----------|-------|
| PSG Lambda | **2.25** |
| Bayern Lambda | **2.15** |
| PSG Galibiyeti | %45.1 |
| Beraberlik | %10.4 |
| Bayern Galibiyeti | %44.5 |

**Poisson Top 5 Skor:**

| Skor | Olasılık |
|------|----------|
| 1-1 | %3.18 |
| 2-2 | %3.05 |
| 2-1 | %2.88 |
| 1-2 | %2.76 |
| 0-1 | %2.65 |

### Monte Carlo Simülasyon (1000 iterasyon)

| Parametre | Değer |
|-----------|-------|
| PSG Galibiyeti | **%62.6** |
| Beraberlik | %14.9 |
| Bayern Galibiyeti | %22.5 |
| Ortalama Gol | 7.26 |
| Üst 2.5 | %99.3 |
| KG (BTTS) | %96.5 |

**Simülasyon Top 5 Skor:**

| Skor | Olasılık |
|------|----------|
| 5-4 | %6.2 |
| 5-2 | %6.1 |
| 5-3 | %5.0 |
| 4-3 | %4.8 |
| 5-1 | %4.8 |

---

## 2.4 İKİ MOTOR ARASINDAKİ ÇELIŞKI — Dürüst Analiz

Bu bölüm kasıtlı olarak eleştirel yazılmıştır.

### Sorun 1: Poisson neden hep düşük skor tahmin ediyor?

Poisson dağılımı matematiksel olarak λ=2.25 verdiğinde, en olası bireysel skor HER ZAMAN 1-1 veya 2-1 civarında olur. Bu Poisson'un yapısal sınırlamasıdır:

- λ=2.25 demek "ortalama 2.25 gol bekliyorum" demektir
- Poisson formülü: P(k gol) = e^(-λ) × λ^k / k!
- λ=2.25 için: P(0)=%10.5, P(1)=%23.7, P(2)=%26.7, P(3)=%20.0, P(4)=%11.3
- En olası bireysel skor 2 goldür — ama bu her iki takım için ayrı hesaplandığında 1-1 ve 2-2 en yüksek çıkar
- **Bu Poisson'un bir hatası değil, doğasıdır.** Poisson "ortalama" davranışı modeller, "uç" olayları değil.

### Sorun 2: Simülasyon neden ortalama 7+ gol üretiyor?

Simülasyon motoru dakika dakika maçı simüle eder. Her dakikada:
1. Şut olasılığı hesaplanır (takımın şut/dakika oranından)
2. İsabet olasılığı, blok olasılığı, kaleci kurtarış olasılığı uygulanır
3. Gol varsa hangi oyuncunun attığı belirlenir

**Sorun:** Simülasyon motorunun gol üretim oranı lig ortalamasının çok üzerinde. ŞL ortalaması maç başı ~2.9 gol iken simülasyon 7.26 gol üretiyor. Bu **kalibre edilmemiş bir simülasyon motoruna** işaret ediyor.

Olası nedenler:
- `shotsPerMin` değerinin possession dakikasına bölünmesinde hata
- Behavioral block çarpanlarının (1.287, 1.372 gibi) kümülatif etkisi — 13 bloğun geometrik ortalaması bile 1.0'ın üzerinde olduğunda şut → gol zincirini şişiriyor
- Kaleci kurtarış oranının (M096: %67) her dakika bağımsız uygulanması — gerçekte kaleciler art arda şutlarda yorulur veya set olur

### Sorun 3: Poisson %45 ev sahibi derken simülasyon %63 diyor — hangisi doğru?

**Hiçbiri tek başına doğru değil.** Her ikisinin de bilinen zayıflıkları var:

| | Poisson | Simülasyon |
|---|---------|------------|
| **Güçlü yanı** | Matematiksel tutarlılık, gerçek dünya verileriyle kalibre edilebilir, düşük varyans | Oyuncu bazlı detay, dakika dakika dinamik, behavioral block entegrasyonu |
| **Zayıf yanı** | Sadece ortalama davranışı modeller, uç olayları yakalayamaz, tüm golleri bağımsız varsayar | Yüksek varyans, gol enflasyonu sorunu, kalibrasyon ihtiyacı |
| **Bu maç için** | PSG %45 — neredeyse yazı-tura. H2H'ye uyumlu (Bayern 7-3 üstün) | PSG %63 — ev sahibi avantajını ve kısa form üstünlüğünü aşırı ağırlıklandırıyor |

### Sorun 4: Bahis oranları ne diyor?

| | Oran | İma Edilen Olasılık |
|---|------|---------------------|
| PSG (1) | 2.30 | %43.5 |
| Beraberlik (X) | 4.00 | %25.0 |
| Bayern (2) | 2.70 | %37.0 |

Bahis oranlarında margin düşüldükten sonra (Shin dönüşümü uygulandı): PSG ~%41, Bayern ~%35, Beraberlik ~%24.

- **Poisson PSG %45:** Bookmaker'a yakın (fark: +4 puan)
- **Simülasyon PSG %63:** Bookmaker'dan çok uzak (fark: +22 puan)

---

## 2.5 Simülasyonun Tekrarlanabilirlik Testi

Aynı maç 5 farklı seed ile çalıştırıldığında:

| Seed | Sim H% | Sim D% | Sim A% | Avg Gol |
|------|--------|--------|--------|---------|
| abc | 62.0 | 14.9 | 23.1 | 7.17 |
| def | 62.6 | 14.9 | 22.5 | 7.31 |
| ghi | 61.0 | 16.1 | 22.9 | 7.26 |
| jkl | 62.8 | 14.8 | 22.4 | 7.18 |
| mno | 63.7 | 14.9 | 21.4 | 7.10 |

| Ölçüm | Değer |
|--------|-------|
| HomeWin StdDev | **0.90** puan |
| HomeWin Aralık | %61.0 – %63.7 |
| AvgGoals StdDev | **0.07** gol |
| AvgGoals Aralık | 7.10 – 7.31 |

**Poisson:** 5 çalıştırmada da aynı sonuç (StdDev = 0.000). Deterministiktir.

**Simülasyon:** 1000 iterasyonluk Monte Carlo'da ~±1 puanlık varyans normal kabul edilir. Bu, simülasyonun güvenilir olduğunu gösterir — ancak ortalama gol sayısının 7+ olması ayrı bir kalibrasyon sorunudur.

---

## 2.6 Penaltı ve Kırmızı Kart Hesaplamaları

### Penaltı Şansı
| Kaynak | Ağırlık |
|--------|---------|
| Takım M019 (maç bazlı penaltı oranı) | Eşit (1/N) |
| Hakem M111 (penaltı eğilimi) | Eşit (1/N) |
| Oyuncu penaltyWon (bireysel API) | Eşit (1/N) |
| **Sonuç** | **Tier: High, Raw: 1.90, Avg: 0.72** |

### Kırmızı Kart Şansı
| Kaynak | Ağırlık |
|--------|---------|
| Takım M040 (kırmızı kart/maç) | Eşit (1/N) |
| Hakem M110 (kart eğilimi) | Eşit (1/N) |
| Oyuncu kartRiski (yellowCards + fouls × foulToCardRatio) | Eşit (1/N) |
| **Sonuç** | **Tier: High, Raw: 30.21, Avg: 0.29** |

---

## 2.7 Nihai Çıktı

| Parametre | Değer |
|-----------|-------|
| **PSG Galibiyeti** | **%61.4** |
| **Beraberlik** | **%14.0** |
| **Bayern Galibiyeti** | **%24.6** |
| Poisson En Olası Skor | 1-1 (%3.18) |
| Simülasyon En Sık Skor | 5-4 (%6.2) |
| Lambda Ev | 2.25 |
| Lambda Dep | 2.15 |
| MC Ort. Ev Gol | 4.21 |
| MC Ort. Dep Gol | 2.98 |
| Üst 2.5 | %99.4 |
| KG (BTTS) | %96.0 |
| Güven Skoru | 100 |

**Korner ve Kart:**

| Parametre | Değer |
|-----------|-------|
| Beklenen Toplam Korner | 12.6 |
| Üst 8.5 Korner | %88.1 |
| Beklenen Sarı Kart | 2.53 |
| Beklenen Kırmızı Kart | 0.20 |

**İlk Yarı:**

| Parametre | Değer |
|-----------|-------|
| IY Beklenen Ev Gol | 3.38 |
| IY Beklenen Dep Gol | 3.22 |
| IY Üst 0.5 | %95 |

**HT-FT Top 3:**

| Kombine | Olasılık |
|---------|----------|
| 1/1 | %47.34 |
| X/1 | %12.32 |
| 2/1 | %10.54 |

---

## 2.8 YATIRIMCI SORU-CEVAP

### S1: "Simülasyon her seferinde farklı sonuç veriyorsa, doğru skoru bilip bilmediğini nasıl anlayacağım?"

**Cevap:** Simülasyon tek bir skor tahmini yapmaz. 1000 maç simüle edip sonuçların **dağılımını** verir. Önemli olan tek bir skorun doğru olması değil, olasılık dağılımının gerçekçi olmasıdır.

Gerçek test sonuçları:
- 5 farklı seed ile çalıştırıldığında HomeWin olasılığı %61.0 ile %63.7 arasında — **±1.0 puan sapma**
- Ortalama gol 7.10 ile 7.31 arasında — **±0.1 gol sapma**

Bu demek ki motor, farklı rastgele tohumlarla bile tutarlı bir olasılık profili üretiyor. Ancak burada dürüst olmak gerekir: **motorun ürettiği gol ortalaması (7.26) gerçekçi değil.** ŞL ortalaması ~2.9 gol/maç iken 7.26 gol üretmek, simülasyon motorunun kalibrasyon sorunu olduğuna işaret eder.

### S2: "Poisson hep 1-1, 2-1 diyor. Bu faydalı mı?"

**Cevap:** Poisson'un en olası bireysel skor tahmini HER ZAMAN düşük skordur çünkü matematiksel yapısı bunu zorunlu kılar. λ=2.25 ile 2 gol atma olasılığı %26.7 iken 5 gol atma olasılığı sadece %2.7'dir. İki takım için çarpıldığında 1-1 veya 2-1 her zaman en üstte çıkar.

**Bu Poisson'un güçlü yanıdır, zayıf yanı değil:**
- Gerçek dünyada da 1-1 ve 2-1 en sık görülen skorlardır
- Poisson'un asıl değeri bireysel skor tahmininde değil, **toplam gol olasılık dağılımında**dır: Üst 2.5, KG (BTTS), 1X2 olasılıkları
- Bookmaker'lar da Poisson bazlı modeller kullanır

**Ama dürüst eleştiri:** Poisson PSG-Bayern gibi iki güçlü hücum takımının karşılaştığı maçlarda toplam gol beklentisini düşük tutabilir. λ=2.25+2.15=4.40 toplam gol beklentisi, ŞL'nin son turlarındaki yüksek gollü maçları yakalamakta yetersiz kalabilir.

### S3: "Poisson %45 ev sahibi derken simülasyon %63 diyor. Hangisine güveneyim?"

**Cevap:** Bu en kritik sorudur ve dürüst cevap şudur: **İki motor arasında bu kadar büyük fark olmamalı.**

- Poisson (PSG %45.1): Bookmaker oranlarına yakın (PSG ~%41 implied). Tarihsel verilere dayanır.
- Simülasyon (PSG %62.6): Behavioral blokları doğrudan kullanır ama gol enflasyonu var.

**Mevcut durumda Poisson daha güvenilirdir** çünkü:
1. Deterministic — her çalıştırmada aynı sonuç
2. Bookmaker benchmark'ına yakın (4 puan fark vs 22 puan fark)
3. H2H verileriyle tutarlı (Bayern 7-3 üstün, Poisson neredeyse eşit gösteriyor)

**Simülasyonun düzeltilmesi gereken:** Gol enflasyonu sorunu çözülmeden simülasyon sonuçları dikkatli kullanılmalı.

### S4: "Bookmaker'ın oranlarını kullanıyor musunuz?"

**Cevap:** Evet, ama sınırlı. Bahis oranları şu şekilde kullanılır:
- M131-M133: Oranlardan implied probability hesaplanır (Shin dönüşümü ile margin temizlenir)
- M188-M189: Açılış→kapanış oran hareketi (ΔMarketMove) piyasa sinyali olarak kullanılır
- M134: Over/Under 2.5 implied probability

Oranlar doğrudan tahmin çıktısına kopyalanmaz. Ancak behavioral bloklar üzerinden dolaylı etkisi vardır.

### S5: "196 metrik neden gerekliymiş? Gol ortalaması ve savunma istatistiği yetmez mi?"

**Cevap:** Basit gol ortalaması ile ~%45-55 doğruluk oranı elde edilir. 196 metriğin amacı:
- **Edge bulmak:** Bookmaker'ın kaçırdığı küçük avantajları tespit etmek (hakem eğilimi, pressing yoğunluğu, mental dayanıklılık)
- **Durumsal bağlam:** Aynı takım farklı koşullarda farklı performans gösterir (kupa maçı baskısı, yorgunluk, küme düşme stresi)

Ancak dürüst olmak gerekir: **196 metriğin hepsinin tahmine katkısı eşit değildir.** Bazı metrikler (M001 gol ortalaması, M157 savunma gücü) çekirdek sinyaldir. Diğerleri (M138 stadyum kapasitesi, M176 formasyon çakışma) marjinal katkı sağlar.

### S6: "Güven Skoru 100 diyor. Bu ne demek?"

**Cevap:** Güven skoru, metrik kapsama oranını ölçer: 196/196 metrik hesaplandı = %100 güven. **Bu tahmin doğruluğu ile ilgili DEĞİLDİR.** Sadece "veri eksiği yok, tüm hesaplamalar tamamlandı" anlamına gelir.

### S7: "Simülasyon 5-4 diyor, Poisson 1-1 diyor. Gerçek maç 2-0 biterse ne olacak?"

**Cevap:** Her iki motor da 2-0 sonucuna belirli bir olasılık atamıştır:
- Poisson: 2-0 = ~%2.5 olasılık
- Simülasyon: 2-0 muhtemelen %1-2 civarında (düşük gollü sonuçlar simülasyonda nadir)

Tek bir maçın sonucu modelin doğruluğunu kanıtlamaz veya çürütmez. Model doğrulaması **100+ maçlık backtest** ile yapılır: modelin %60 dediği olaylarda gerçekten %60 civarı gerçekleşiyor mu?

### S8: "Neden ilk yarı beklenen gol 3.38 — bu gerçekçi mi?"

**Cevap:** Hayır, gerçekçi değil. İlk yarı beklenen gol tam maç lambda'sının yarısı olarak hesaplanıyor (λ × 45/90). Eğer tam maç lambda'sı şişkinse (simülasyondan kaynaklı), ilk yarı da şişkin olur. ŞL'de ilk yarı ortalaması ~1.3 gol iken 3.38 çok yüksektir.

---

## 2.9 Bilinen Sorunlar ve Geliştirme Yol Haritası

| Sorun | Ciddiyet | Açıklama |
|-------|----------|----------|
| **Simülasyon gol enflasyonu** | **Yüksek** | MC 7.26 gol/maç üretiyor, gerçek ŞL ~2.9. Şut→gol zinciri kalibre edilmeli. |
| **Poisson-Simülasyon farkı** | **Yüksek** | 1X2'de 18 puanlık fark. Harmanlama formülü simülasyona çok ağırlık veriyor. |
| **İlk yarı gol enflasyonu** | Orta | Tam maç enflasyonunun yansıması. |
| **Skor tahmini tutarsızlığı** | Orta | Poisson 1-1 ve simülasyon 5-4 — kullanıcı hangisine bakacağını bilemez. |
| **H2H etkisinin düşüklüğü** | Düşük | Bayern 10 maçta 7 galibiyet almış ama H2H bloğu sadece 0.471 — etkisi az. |
