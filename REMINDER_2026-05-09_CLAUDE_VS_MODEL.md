## YARIN (2026-05-09) KONTROL — Claude vs Model Karşılaştırma

**Bu dosya 2026-05-08'de kaydedildi.** Yarın gerçek sonuçlarla iki tahmin setini de kıyaslayacağız:
1. Modelin tahminleri (16 maç)
2. Claude'un futbol bilgisine dayalı tahminleri (16 maç, aynı maçlar)

### Modelin Yapısal Sorunları (Tespit)

| Dağılım | Model | Gerçek Futbol Baz Oran |
|---|---|---|
| Home win (1) | **13/16 = %81** | ~%45 |
| Draw (X) | **1/16 = %6** | ~%28 |
| Away win (2) | 2/16 = %13 | ~%27 |

**%81 home bias gerçekçi değil.** Model her maçı home win olarak tahmin etmeye yatkın.

**Sim vs FT tutarsızlığı (örnekler):**
- Liverpool × Chelsea: Sim **5-0**, FT 2-1 (2.5x fark)
- Vojvodina × Čukarički: Sim **5-0**, FT 1-0
- Borussia × Frankfurt: Sim 1-0, FT **3-0**
- Bochum × Hannover: Sim 0-2, FT **2-2**

İki motor birbiriyle çelişiyor — hibrit blend doğru ağırlık koyamıyor.

**Skor sıkışıklığı:** 16 maçtan 7'si **1-0** veya **2-0**. Skor çeşitliliği yok.

### Tahmin Karşılaştırması

| # | Maç | Lig | **Model FT** | **Claude FT** | Claude Reasoning |
|---|---|---|---|---|---|
| 1 | Liverpool × Chelsea | Premier League | 2-1 (1) | **1-1 (X)** | Sezon sonu, iki top takım, dengeli oyun |
| 2 | Torino × Sassuolo | Serie A | 1-0 (1) | **1-1 (X)** | İki orta sıra, sezon sonu motivasyon düşük |
| 3 | Levante × Osasuna | LaLiga | 1-0 (1) | **1-1 (X)** | Yakın seviyeli takımlar |
| 4 | RC Lens × Nantes | Ligue 1 | 3-0 (1) | **2-1 (1)** | Lens favori ama 3-0 abartı, Nantes skor atabilir |
| 5 | Dortmund × Frankfurt | Bundesliga | 3-0 (1) | **2-2 (X)** | İki hücumcu takım, yüksek skorlu derbi |
| 6 | Standard Liège × Oud-Heverlee | Pro League | 1-0 (1) | **2-1 (1)** | Standard ev avantajı güçlü |
| 7 | Al-Hilal × Al-Kholood | King's Cup | 2-0 (1) | **3-0 (1)** | Net asimetri (Saudi giants vs alt seviye) |
| 8 | Rijeka × Vukovar 1991 | HNL | 2-0 (1) | **3-0 (1)** | Rijeka çok güçlü, asimetrik maç |
| 9 | Vojvodina × Čukarički | Serbian | 1-0 (1) | **2-1 (1)** | Vojvodina favori, açık skor |
| 10 | Cádiz × Deportivo | LaLiga 2 | 0-1 (2) | **1-1 (X)** | Promosyon mücadelesi, dengeli |
| 11 | Kaiserslautern × Arminia | 2. Bundesliga | 1-0 (1) | **1-1 (X)** | Yakın seviye |
| 12 | Paderborn × Karlsruher | 2. Bundesliga | 2-0 (1) | **2-1 (1)** | Paderborn ev favori, Karlsruher skor |
| 13 | Eintracht B. × Dynamo D. | 2. Bundesliga | 1-2 (2) | **1-2 (2)** | Dynamo formda (Model ile aynı) |
| 14 | Holstein Kiel × Magdeburg | 2. Bundesliga | 1-0 (1) | **2-1 (1)** | Kiel ev avantajı, Magdeburg skor |
| 15 | VfL Bochum × Hannover 96 | 2. Bundesliga | 2-2 (X) | **1-1 (X)** | Derbi, dengeli, düşük skorlu |
| 16 | Catanzaro × Bari | Serie B | 2-0 (1) | **1-1 (X)** | Sezon sonu Serie B, motivasyon düşük |

### Dağılım Karşılaştırması

|  | Model | **Claude** | Gerçek Baz |
|---|---|---|---|
| 1 (Home) | 13 (%81) | 7 (%44) | ~%45 |
| X (Draw) | 1 (%6) | 8 (%50) | ~%28 |
| 2 (Away) | 2 (%13) | 1 (%6) | ~%27 |

Claude'un dağılımı home/away konusunda gerçek baz orana yakın, **draw'da fazla** (sezon sonu düşük motivasyon nedeniyle bilinçli yüksek).

### Yarın Bakılacaklar

1. **1X2 accuracy** — hangi tahmin seti tutturdu? Model %30-40 (home bias) tahmin ediliyor, Claude %50+ olabilir
2. **Exact Score** — model %15-20, Claude %15-20 beklenir
3. **Tutar tutmaz değişen** — eğer çok ev sahibi gerçekten kazanırsa Model haklı, eğer beraberlikler patlasa Claude haklı

### Sonuca Göre Yapılacak

- **Model > Claude** → home-favori ligler için kalibre edilmiş, draw tahmini sadece spesifik veri sinyallerinde açılmalı
- **Claude > Model** → modelin home-bias'ı **yapısal hata**, aşağıdakilerden birinde sorun:
  - `behavMod` home-tarafı abartıyor
  - `xGOverPerf` home asimetri yaratıyor
  - `dynamicHomeAdvantage` overshoot
  - Lambda asimetri açıcı `k_match` home'u çok yukarı çekiyor

### Hatırlatma

Yarın (2026-05-09) gerçek skorlar geldikten sonra:
1. Bu dosyaya gerçek skor sütunu ekle
2. Hangi tahmin setinin daha doğru olduğunu hesapla
3. Sonuca göre sıradaki düzeltme yönü belirlenir

```
git add REMINDER_2026-05-09_CLAUDE_VS_MODEL.md
git commit -m "Claude vs Model: gerçek sonuçlarla karşılaştırma"
```
