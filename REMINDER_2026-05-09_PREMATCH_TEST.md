## YARIN (2026-05-09) KONTROL EDİLECEK — Pre-Match Backtest Sonuçları

**Bu dosya 2026-05-08'de kaydedildi.** Yarın bu maçların gerçek skorlarıyla karşılaştırarak modelin pre-match performansını ölçeceğiz. Bu, **DB temizlik + leak-free chain** sonrası ilk dürüst pre-match testi.

### Önemli bağlam

- Tüm leak fix'leri uygulanmıştı:
  - `as-of-filter.js` — standings rebuild + diğer 18 takım pruning
  - `league-fingerprint.js` — events pool'dan dinamik normMin/MaxRatio + leagueGoalRateStd
  - `metric-calculator.js` — lig istatistikleri fingerprint'ten (standings backup)
- Cache + learning DB temizlendi (sıfırdan başlatıldı)
- Bu maçlar **henüz oynanmamış** → "Gerçek FT" sütunları boş

### 16 Maç Pre-Match Tahminleri

| # | Maç | Lig | Tahmin FT | Sim | Tah HT | HT/FT | Tier | P/S |
|---|---|---|---|---|---|---|---|---|
| 1 | Liverpool FC vs Chelsea | Premier League | 2-1 (1) | 5-0 | 3-0 (1) | 1/1 | HIGH | 1/1 |
| 2 | Torino vs Sassuolo | Serie A | 1-0 (1) | 0-1 | 0-1 (2) | 2/2 | HIGH | 2/2 |
| 3 | Levante UD vs Osasuna | LaLiga | 1-0 (1) | 1-0 | 1-0 (1) | 1/1 | HIGH | 1/1 |
| 4 | RC Lens vs Nantes | Ligue 1 | 3-0 (1) | 0-0 | 0-0 (X) | X/X | HIGH | 1/1 |
| 5 | Borussia Dortmund vs Eintracht Frankfurt | Bundesliga | 3-0 (1) | 1-0 | 1-0 (1) | 1/1 | HIGH | 1/1 |
| 6 | Standard Liège vs Oud-Heverlee | Pro League CL | 1-0 (1) | 3-0 | 1-0 (1) | 1/1 | HIGH | 1/1 |
| 7 | Al-Hilal vs Al-Kholood | King's Cup | 2-0 (1) | 1-0 | 1-0 (1) | 1/1 | MED | 1/1 |
| 8 | HNK Rijeka vs HNK Vukovar 1991 | HNL | 2-0 (1) | 0-0 | 0-0 (X) | X/X | LOW | 1/1 |
| 9 | FK Vojvodina vs FK Čukarički | Mozzart Bet Superliga | 1-0 (1) | 5-0 | 2-0 (1) | 1/1 | HIGH | 1/1 |
| 10 | Cádiz vs Deportivo de La Coruña | LaLiga 2 | 0-1 (2) | 0-4 | 0-2 (2) | 2/2 | HIGH | 2/2 |
| 11 | 1. FC Kaiserslautern vs Arminia Bielefeld | 2. Bundesliga | 1-0 (1) | 0-0 | 0-0 (X) | X/X | HIGH | 1/X |
| 12 | SC Paderborn 07 vs Karlsruher SC | 2. Bundesliga | 2-0 (1) | 4-1 | 1-0 (1) | 1/1 | HIGH | 1/1 |
| 13 | Eintracht Braunschweig vs SG Dynamo Dresden | 2. Bundesliga | 1-2 (2) | 0-1 | 0-1 (2) | 2/2 | HIGH | 2/2 |
| 14 | Holstein Kiel vs 1. FC Magdeburg | 2. Bundesliga | 1-0 (1) | 2-0 | 1-0 (1) | 1/1 | HIGH | 1/1 |
| 15 | VfL Bochum 1848 vs Hannover 96 | 2. Bundesliga | 2-2 (X) | 0-2 | 0-1 (2) | 2/2 | HIGH | 2/2 |
| 16 | Catanzaro vs Bari | Serie B | 2-0 (1) | 3-0 | 1-0 (1) | 1/1 | HIGH | 1/1 |

### Tier Dağılımı
- **HIGH**: 14 maç (%87.5)
- **MED**: 1 maç
- **LOW**: 1 maç

### 1X2 Tahmin Dağılımı
- **1 (Home Win)**: 13 (%81)
- **X (Draw)**: 1 (%6) — VfL Bochum vs Hannover (2-2)
- **2 (Away Win)**: 2 (%13) — Cádiz vs Deportivo, Eintracht B. vs Dynamo

### Yarın Bakılacaklar

1. **1X2 accuracy** — leak-free chain ile ilk pre-match test, gerçek baseline
2. **Score accuracy** — tournament-filtered profile + dynamic clamps etkisi
3. **HIGH tier guvenilirlik** — %87.5 HIGH tier, accuracy %60+ olmalı (eski 50-maç audit benchmark)
4. **Sim vs FT tahmin tutarsızlığı** — sim 5-0 ama FT 2-1 (Liverpool) gibi farklılıklar incelenecek
5. **MED/LOW tier**: 1 MED + 1 LOW maç — düşük confidence göstergesi gerçekten doğru mu (yanlış tahmin) yoksa miscalibration mı

### Beklenti Notu

Eğer sonuçlar **çok yüksek** çıkarsa (örn. %75+ 1X2) → şüpheli, hâlâ leak olabilir.
Eğer **gerçekçi** seviyede çıkarsa (%50-60 1X2, %15-20 score) → leak-free chain doğrulandı.
Eğer **çok düşük** çıkarsa (%30-40) → pre-match veri eksikliği büyük etki, model ek geliştirme gerektirir.

### Kritik Test Beklentisi

DB temizlikten sonra bu **ilk gerçek pre-match testi**. Her şey leak-free events pool'dan dinamik:
- Lig avg/vol → fingerprint pool
- Home/away takım stats → standings rebuild (sadece kendi satır)
- Score profile → tournament-filtered last_events
- normMin/MaxRatio → events pool'daki takım gol oranları

Yarın gerçek sonuçlarla karşılaştırılınca **hangi tahminlerin tuttuğu** ve **neden tutmadığı** belirlenecek. Sonraki iyileştirmelerin yönü bu sonuçtan çıkacak.

---

**Hatırlatma:** Yarın (2026-05-09) bu dosyaya gerçek skorları ekle ve commit et:
```
git add REMINDER_2026-05-09_PREMATCH_TEST.md
git commit -m "Pre-match test sonuçları: 16 maç gerçek vs tahmin karşılaştırma"
```
