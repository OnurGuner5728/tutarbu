# 📑 METRİK ALİAS VE ÇAPRAZ EŞLEME DOKÜMANTASYONU

Bu doküman, Tutarbu denetim raporunda (F01-F04) belirtilen "duplike metrik" uyarılarının teknik nedenlerini ve bu metriklerin birbirleriyle olan ilişkilerini açıklar. 

Sistemde bazı metrikler, farklı modüllerin (H2H, Kaleci, Hakem vb.) bağımsız çalışabilmesi ve veri yapılarının tutarlılığı için "alias" (takma ad) olarak tanımlanmıştır.

---

## 1. H2H Analiz Aliasları (M183–M189)
Bu metrikler `h2h-analysis.js` modülünde bulunur ve temel H2H metriklerinin (M119–M130) gelişmiş türevleridir.

| Gelişmiş Metrik | Temel Metrik | Açıklama |
|-----------------|--------------|----------|
| **M183**        | **M123**     | H2H Toplam Gol Ortalaması (Alias) |
| **M184**        | **M124**     | H2H Karşılıklı Gol Var (BTTS) Oranı |
| **M185**        | **M125**     | H2H 2.5 Üst Oranı |
| **M186**        | **M126**     | H2H İlk Yarı Gol Ortalaması |
| **M187**        | **M127**     | H2H Ev Sahibi Galibiyet % |
| **M188**        | **M128**     | H2H Beraberlik % |
| **M189**        | **M129**     | H2H Deplasman Galibiyet % |

**Neden?** Gelişmiş analiz modülleri (Advanced Derived) 180+ serisindeki metrikleri anahtar olarak beklerken, temel H2H modülü ham verileri 120+ serisinde tutar. Bu eşleşme sistemin geriye dönük uyumluluğunu sağlar.

---

## 2. Kaleci ve Oyuncu Performans Aliasları
Kaleci performansının genel oyuncu gücü (M159) içinde değerlendirilmesi için kullanılan eşleşmelerdir.

| Metrik | Karşılık | Açıklama |
|--------|----------|----------|
| **M180** | **M099** | Kaleci Penaltı Kurtarma Başarısı (Goalkeeper modülünden Player modülüne alias) |
| **M178** | **M067** | Oyuncu Fiziksel/Nitelik Skoru (Yedekler için de normalize edilmiş versiyon) |

---

## 3. Hakem ve Bağlamsal Etki (M181–M182)
Hakemin maç üzerindeki disiplin etkisini bağlamsal metriklerle birleştirmek için kullanılır.

| Metrik | Kaynak | Açıklama |
|--------|--------|----------|
| **M181** | **M112** | Hakem Faul Ortalaması (Yalnızca SofaScore verisi varsa geçerlidir) |
| **M182** | **M118** | Hakem Kart/Faul Oranı (Disiplin sertliği) |

**Not:** M112 ve M118 SofaScore API'sinde çoğu zaman `null` döndüğü için M181 ve M182 de doğal olarak `null` kalır. Bu bir hata değil, veri kaynağı kısıtıdır.

---

## 💡 Geliştirici Notu
Yeni bir gelişmiş metrik (M150+) eklerken, eğer temel bir metriği kullanacaksanız doğrudan temel kodu kullanmak yerine bu aliasları tercih edin. Bu sayede bir modülde yapılan mantık değişikliği tüm sistemi tutarlı bir şekilde etkiler.
