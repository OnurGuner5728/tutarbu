// Tour step definitions for TUTARBU guided tour

export const TOUR_STEPS = [
  // ── WELCOME ──────────────────────────────────────────────────────────────────
  {
    id: 'welcome',
    isModal: true,
    icon: '⚡',
    title: 'TUTARBU Rehberine Hoş Geldiniz',
    body: 'Bu rehber sizi uygulamanın tüm bölümlerine sırayla götürecek:\n\n• Verinin nereden geldiğini\n• Her alanın ne anlama geldiğini\n• Tahminlerin nasıl hesaplandığını\n• Simülasyonun nasıl çalıştığını\n\nRehber ilk girişte atlanamaz — her adımı tamamlamanız gerekir. Sonraki girişlerde istediğiniz zaman kapatabilirsiniz.',
    nextLabel: 'Rehberi Başlat →',
  },

  // ── SİDEBAR ──────────────────────────────────────────────────────────────────
  {
    id: 'date-picker',
    target: 'date-picker',
    position: 'right',
    title: 'Tarih Seçici',
    body: 'Analiz etmek istediğiniz günü buradan seçin. Seçilen tarihe ait tüm programlanmış maçlar aşağıda listelenir.\n\nVeri kaynağı: SofaScore API — canlı ve geçmiş maç verileri gerçek zamanlı çekilir.',
  },
  {
    id: 'sidebar-btns',
    target: 'sidebar-btns',
    position: 'right',
    title: 'Panel Kontrolleri',
    body: '🌐 Küre ikonu: maç listesini yeniler.\n\n📊 Bar grafiği ikonu: Backtest moduna geçirir — geçmiş tahminlerinizi tarih aralığı, lig ve güven katmanına göre analiz edebilirsiniz.',
  },
  {
    id: 'match-list',
    target: 'match-list',
    position: 'right',
    title: 'Maç Listesi',
    body: 'Günün maçları lig bazında gruplanarak listelenir.\n\n• Her kart maç saatini ve takımları gösterir\n• LIVE etiketi = 60 saniyede bir otomatik güncelleme aktif\n• Skor görünüyorsa maç devam ediyor demektir',
  },
  {
    id: 'select-match',
    target: 'match-list',
    position: 'right',
    title: 'Maç Seçin — Tahmin Başlatın',
    body: 'Şimdi aşağıdaki listeden herhangi bir maça tıklayın.\n\nSistem API\'den şu veriyi çekecek:\n• Oyuncu kadrosu ve pozisyon\n• Son 10 maç form analizi\n• H2H geçmişi\n• Bookmaker oranları (açılış / kapanış)\n• Hava durumu + saha verisi\n\nTahmin tamamlanınca "İleri" butonu otomatik aktif olur.',
    waitFor: ({ prediction, loading }) => prediction !== null && !loading,
    waitLabel: 'Bir maça tıklayın ve tahmin yüklenmesini bekleyin...',
  },

  // ── ANALİZ ÖZET SEKMESİ ───────────────────────────────────────────────────
  {
    id: 'score-hero',
    target: 'score-hero',
    position: 'bottom',
    tab: 'summary',
    title: 'Tahmin Skoru',
    body: 'Motorun hesapladığı en olası skor ve üst 5 ihtimal burada gösterilir.\n\nHesaplama: 168 metrikten elde edilen λ (lambda) değeri ile Ağırlıklı Poisson Dağılımı uygulanır:\nλ = hücum_güç × form × H2H × behavioural_düzeltme\n\nEn olası 5 skor Monte Carlo örneklemesiyle belirlenir.',
  },
  {
    id: 'confidence-badges',
    target: 'confidence-badges',
    position: 'bottom',
    title: 'Güven Katmanı ve Model Tipi',
    body: 'HIGH / MEDIUM / LOW: Metrik konsensüsü ve veri kalitesine göre otomatik atanır.\n\n• HIGH (≥%70): Tüm kaynaklar güçlü sinyal\n• MEDIUM (%45-70): Karma sinyaller\n• LOW (<45): Belirsiz veya yetersiz veri\n\nRenkli etiket (Hibrit / Poisson / Form-heavy): hangi modelin öncelik aldığını gösterir.',
  },
  {
    id: 'edge-insights',
    target: 'edge-insights',
    position: 'bottom',
    title: 'Dinamik Model Stacking',
    body: 'Motor 3 model arasında ağırlıklı seçim yapar:\n\n• Saf Poisson: oyuncu istatistikleri ön planda\n• H2H Ağırlıklı: geçmiş karşılaşmalar belirleyici\n• Form Dominant: son 5 maç formu kritik\n\n⭐ Premium Sinyal = yüksek isabetli pattern\n⛔ NO BET = toksik lig (tutarsız / manipüle veri).',
  },
  {
    id: 'power-comparison',
    target: 'power-comparison',
    position: 'bottom',
    expandSection: 'power',
    title: 'Güç Karşılaştırması',
    body: 'Her kategori, ilgili metrik grubunun normalize ortalamasıdır:\n\n• Hücum: M001-M025 (xG, şut, yaratıcılık)\n• Defans: M026-M050 (kurtarış, pressing)\n• Form: M051-M075 (son 10 maç)\n• Oyuncu: M076-M108 (bireysel rating)\n• Kaleci: M109-M118 (refleks, alan hakimiyeti)\n• Momentum: son 3 maç trend\n• TOPLAM: tüm kategorilerin ağırlıklı harmonu',
  },
  {
    id: 'market-intel',
    target: 'market-intel',
    position: 'bottom',
    expandSection: 'mi',
    title: 'Market Intelligence — Bookmaker Verileri',
    body: 'Bookmaker açılış ve kapanış oranları Shin Fair-Odds formülüyle gerçek olasılıklara dönüştürülür.\n\n• Δ Drift: kapanış − açılış oranı\n• Negatif drift ↓ = oran düşüyor = para giriyor\n• Pozitif drift ↑ = oran yükseliyor = para çıkıyor\n• 🟢 Para giriyor / 🔴 Para çıkıyor',
  },
  {
    id: 'odds-expand',
    target: 'odds-expand',
    position: 'bottom',
    expandOdds: true,
    title: 'Tüm Bahis Oranları',
    body: 'Bookmaker\'ın sunduğu tüm marketler (1X2, Alt/Üst, BTTS, ilk gol, korner vb.) burada listelenir.\n\nHer seçenek için:\n• Açılış → kapanış oranı değişimi\n• Drift yönü ve büyüklüğü\n• Para akışı tahmini (🟢/🔴)\n\nBu panel şu an otomatik açılıyor — normalde "tıkla ve genişlet" ile kullanılır.',
  },
  {
    id: 'context-intel',
    target: 'context-intel',
    position: 'bottom',
    expandSection: 'context',
    title: '🧠 Bağlamsal Zeka',
    body: 'Maçın dışsal koşullarını sayısal olarak modelleyen analiz:\n\n• 📍 Tablo Bölgesi: CL/EL/Küme düşme zonu baskısı\n• ⬇️ Küme Düşme Baskısı: pozisyon tehlikesi → hamle değişimi\n• 📅 Fikstür Yoğunluğu: son 3-7 gündeki maç sayısı\n• ♟️ Taktik Hakimiyet: orta saha + formasyon çakışması\n• 💰 Transfer Değeri: kadro değer oranı\n• 🗓️ Sezon İlerlemesi: maçın sezon içindeki kritikliği\n\nTüm bu değerler M131-M168 metrik grubunu besler.',
  },

  // ── GOL MARKETLERİ SEKMESİ ────────────────────────────────────────────────
  {
    id: 'goals-tab',
    target: 'goals-content',
    position: 'bottom',
    tab: 'goals',
    title: 'Gol Marketleri — Alt/Üst',
    body: 'Alt/Üst olasılıkları Poisson CDF ile hesaplanır:\n\nP(Toplam ≤ k) = Σᵢ₌₀ᵏ e^(-λ) × λⁱ / i!\n\nλ = ev_lambda + deplasman_lambda toplamı. Her takım için hücum ve rakip defansa göre ayrı lambda hesaplanır.',
  },
  {
    id: 'btts-corners',
    target: 'btts-card',
    position: 'bottom',
    title: 'KG Var, İlk Yarı ve Korner / Kart',
    body: 'KG Var (BTTS):\nP(BTTS) = (1 − P(ev=0)) × (1 − P(dep=0))\n\nİlk Yarı: aynı Poisson hesabı fakat λ değerleri ×0.45 ile yarı yarıya düşürülür.\n\nKorner: son 10 maçın ağırlıklı ortalama korner sayısı + form düzeltmesi.\n\nKart: Hakem profili (M131-M134) + takım disiplin skoru (M083-M085) kombinasyonu.',
  },

  // ── FORM & H2H SEKMESİ ───────────────────────────────────────────────────
  {
    id: 'h2h-section',
    target: 'h2h-section',
    position: 'bottom',
    tab: 'form',
    title: 'Head to Head (H2H) — Karşılıklı Geçmiş',
    body: 'İki takımın son karşılıklı maçları listelenir.\n\nW/D/L rozetleri ev sahibi perspektifinden renklenir. Her satıra tıklayarak maçın olaylarını ve istatistiklerini detaylı görebilirsiniz.\n\nH2H verisi şu metrikleri besler:\n• M121-M128: dominasyon skoru\n• M129-M130: son H2H form\n• Şaşırma Endeksi hesabı (sürpriz galibiyet/beraberlik olasılığı)',
  },
  {
    id: 'form-section',
    target: 'form-section',
    position: 'bottom',
    title: 'Form Analizi — Son Maçlar (Ev & Deplasman)',
    body: 'Her takımın son maçları W/D/L rozet olarak gösterilir. Satıra tıklayarak maç detaylarına ulaşabilirsiniz.\n\n"Daha fazla göster" butonu ile ek maçlar yüklenir (API\'den yeni sayfa çekilir).\n\nForm verisi şu metrikleri besler:\n• M051-M060: genel form skoru\n• M061-M070: ev/deplasman ayrıştırılmış form\n• M071-M075: momentum ve trend\n• Ağırlık: son 5 maç × 1.5, önceki × 1.0',
  },

  // ── WORKSHOP SEKMESİ ──────────────────────────────────────────────────────
  {
    id: 'workshop-overview',
    target: 'workshop-content',
    position: 'bottom',
    tab: 'workshop',
    title: 'Workshop — Dinamik Kadro Laboratuvarı',
    body: 'Workshop, "ya bu oyuncu olmasaydı?" sorusunun cevabını hesaplar.\n\nİki takımın İlk 11\'i görüntülenir. Bir oyuncuya tıklayıp kadrodan başka biriyle swap yapabilirsiniz. Değiştirilen oyuncular turuncu ile işaretlenir.\n\nŞu an ev sahibi kadrosu görünüyor. Sıradaki adımda deplasman takımına geçeceğiz.',
  },
  {
    id: 'workshop-away',
    target: 'workshop-away-btn',
    position: 'right',
    workshopSide: 'away',
    title: 'Deplasman Kadrosunu Görün',
    body: 'Deplasman takımı sekmesine geçildi. Her iki takımın kadrosu da bağımsız olarak düzenlenebilir.\n\nSwap yapılacak takım seçildiğinde, o takımın İlk 11\'i sahada gösterilir. İleri\'ye basarak swap adımına geçin.',
  },
  {
    id: 'workshop-swap',
    target: 'workshop-lineup',
    position: 'right',
    title: 'Oyuncu Swap — Şimdi Deneyin',
    body: 'Sahada herhangi bir oyuncuya tıklayın. Oyuncu seçilir ve sarı/turuncu ile vurgulanır. Ardından yedek veya başka bir başlangıç oyuncusunu seçerek swap tamamlanır.\n\nSwap yaptıktan sonra "İleri" aktif olur.',
    waitFor: ({ modifiedLineup }) =>
      (modifiedLineup?.home !== null && modifiedLineup?.home !== undefined) ||
      (modifiedLineup?.away !== null && modifiedLineup?.away !== undefined),
    waitLabel: 'Sahadan bir oyuncuya tıklayıp swap yapın...',
  },
  {
    id: 'workshop-recalc',
    target: 'workshop-recalc-btn',
    position: 'top',
    title: 'Kadroyla Yeniden Hesapla',
    body: '"Kadroyla Yeniden Hesapla" butonuna tıklayın.\n\nSistem yeni kadroyla 168 metriki yeniden hesaplayacak:\n• Oyuncu bireysel puanları güncellenecek\n• Güç karşılaştırması yeniden çizilecek\n• Tüm sekmeler (Analiz, Gol, Simülasyon) yeni kadroya göre çalışacak\n\nHesaplama tamamlanınca "İleri" aktif olur.',
    waitFor: ({ tourWorkshopDone }) => tourWorkshopDone === true,
    waitLabel: '"Kadroyla Yeniden Hesapla" butonuna basın ve bekleyin...',
  },

  // ── METRİK DEFTERİ SEKMESİ ────────────────────────────────────────────────
  {
    id: 'metrics-overview',
    target: 'metrics-content',
    position: 'bottom',
    tab: 'metrics',
    title: 'Metrik Defteri — 168 Metrik Tam Listesi',
    body: 'M001\'den M168\'e kadar her metriğin ham değeri burada listelenir.\n\nKategoriler:\n• M001-M025: Hücum (xG, şut kalitesi, yaratıcılık)\n• M026-M050: Savunma (pressing, kurtarış, disiplin)\n• M051-M075: Form ve Momentum\n• M076-M108: Bireysel Oyuncu\n• M109-M130: Kaleci ve H2H\n• M131-M168: Bağlamsal, Hakem, Psikolojik, Davranışsal',
  },

  // ── SİMÜLASYON SEKMESİ ───────────────────────────────────────────────────
  {
    id: 'simulation-overview',
    target: 'sim-content',
    position: 'top',
    tab: 'simulation',
    title: '90 Dakika Simülasyonu — Genel Bakış',
    body: 'Simülatör, 168 metrikten türetilen Poisson lambda ile dakika bazında olaylar üretir.\n\nHer dakikada gol, şut, korner, kart olasılıkları hesaplanır. Dinamik zaman pencereleri maçın farklı bölgelerine (0-30/30-60/60-90dk) ağırlık uygular.\n\nSol panel: hangi metriklerin simülasyonu etkileyeceğini seçin.\nSağ panel: simülasyon sonuçları ve BIM.',
  },
  {
    id: 'metrics-selector',
    target: 'metrics-selector',
    position: 'right',
    title: 'Metrik Seçici',
    body: 'Simülasyonu etkileyen metrikleri açıp kapatın.\n\nTümü açık = modelin tam gücü kullanılır.\nKategori bazlı kapatma = "bu metrikler olmasaydı?" senaryosu.\n\nBir bloktan tüm metrikler kapatılırsa o blok nötr değer (1.0) kullanır. Açık metrik sayısı sağ üstte gösterilir.',
  },
  {
    id: 'single-run-explain',
    target: 'run-mode',
    position: 'bottom',
    title: 'Tek Koşu Modu',
    body: 'Şu an "Tek Koşu" modu seçili. Bu mod:\n\n• 90 dakikalık tam maç simülasyonu yapar\n• Her dakika gol, şut, kart, korner olayları üretilir\n• Anlık skor, xG ve olay zaman çizelgesi gösterilir\n• Sağdaki Behavioral Intelligence Matrix simüle anıya göre güncellenir\n\nSimülasyonu Başlat butonuna tıklayın.',
  },
  {
    id: 'single-run-start',
    target: 'start-sim-btn',
    position: 'bottom',
    title: 'Tek Koşu — Simülasyonu Başlatın',
    body: '"Simülasyonu Başlat ▶" butonuna tıklayın.\n\nSunucu şu adımları çalıştıracak:\n1. Seçili metrikleri filtrele\n2. Her takım için lambda hesapla\n3. 90 dakika boyunca olayları üret\n4. Skor, xG ve olay listesini döndür\n\nSonuçlar hazır olduğunda devam edebilirsiniz.',
    waitFor: ({ tourSingleSimDone }) => tourSingleSimDone === true,
    waitLabel: '"Simülasyonu Başlat" butonuna basın ve sonuçları bekleyin...',
  },
  {
    id: 'sim-results-single',
    target: 'sim-results',
    position: 'left',
    title: 'Tek Koşu Sonuçları',
    body: 'Simüle edilmiş 90 dakikanın çıktısı:\n\n• Final skoru ve xG değerleri\n• Olay zaman çizelgesi: her golün, şutun, kartın dakikası\n• Saha görünümü: topun son olay konumu\n• Sol üstte: kullanılan lambda değerleri\n\nHer "Başlat" tıklaması farklı bir 90 dakika üretir — bu Poisson\'ın stokastik doğasından kaynaklanır.',
  },
  {
    id: 'bim-in-sim',
    target: 'bim-section',
    position: 'left',
    title: 'Behavioral Intelligence Matrix (BIM)',
    body: '26 davranışsal analiz birimi, simülasyon anına göre güncellenir:\n\n• Hücum: Bitiricililik, Yaratıcılık, Şut Üretimi\n• Savunma: Direnç, Aksiyon, Disiplin\n• Psikanaliz: Zihinsel Dayanıklılık, Gol İhtiyacı\n• Bağlam: Menajer, Hakem, Maç Başlangıcı/Sonu\n• Kaleci: Refleks, Alan Hakimiyeti\n\nAVANTAJ = fark > 0.05 / BASKI = fark < -0.05 / DENGEDE = ±0.05',
  },
  {
    id: 'multi-run-explain',
    target: 'multi-run-btn',
    position: 'bottom',
    title: 'Çoklu Koşu Moduna Geçin',
    body: '"Çoklu Koşu" butonuna tıklayın.\n\nÇoklu Koşu, Monte Carlo yöntemiyle aynı maçı yüzlerce kez simüle eder:\n\n• 100 iterasyon: hızlı istatistik\n• 500 iterasyon: dengeli\n• 1000 iterasyon: güvenilir dağılım\n• 5000 iterasyon: en hassas sonuç\n\nHer iterasyon bağımsız çalışır → istatistiksel kazanma yüzdeleri, ortalama goller, BTTS oranı, en sık çıkan skor.',
  },
  {
    id: 'run-count',
    target: 'run-count-group',
    position: 'bottom',
    title: 'İterasyon Sayısını Seçin',
    body: 'Kaç simülasyon çalışacağını burada belirleyin.\n\n• 100: ~1 saniye\n• 1000: ~5-10 saniye (önerilen)\n• 5000: ~30-60 saniye (yüksek hassasiyet)\n\n1000 iterasyon seçin ve ardından "Simülasyonu Başlat"a tıklayın.',
  },
  {
    id: 'multi-run-start',
    target: 'start-sim-btn',
    position: 'bottom',
    title: 'Çoklu Koşu — Başlatın',
    body: '"Simülasyonu Başlat ▶" butonuna tıklayın.\n\nSunucu seçilen iterasyon sayısı kadar bağımsız simülasyon çalıştıracak. Her birinde farklı bir maç öykülenir — sonuçların ortalaması ve dağılımı istatistiksel güven sağlar.\n\nSonuçlar hazır olduğunda devam edebilirsiniz.',
    waitFor: ({ tourMultiSimDone }) => tourMultiSimDone === true,
    waitLabel: '"Simülasyonu Başlat" butonuna basın ve tamamlanmasını bekleyin...',
  },
  {
    id: 'multi-run-results',
    target: 'sim-results',
    position: 'left',
    title: 'Çoklu Koşu İstatistikleri',
    body: 'Monte Carlo sonuçları:\n\n• 1 / X / 2 kazanma yüzdeleri\n• Ortalama gol sayıları (ev / deplasman)\n• BTTS gerçekleşme oranı\n• En sık çıkan skor ve olasılıkları\n• Örnek tek koşu sonucu (sampleRun)\n\nBu istatistikler, Poisson modelinin tahminlerini bağımsız simülasyonlarla doğrular veya sapmaları ortaya çıkarır.',
  },

  // ── TAMAMLANDI ────────────────────────────────────────────────────────────
  {
    id: 'complete',
    isModal: true,
    icon: '🏆',
    title: 'Rehber Tamamlandı!',
    body: 'Uygulamanın tüm bölümlerini gezdинiz:\n\n✅ Maç seçimi ve API veri akışı\n✅ Tahmin skoru, güven katmanları, model stacking\n✅ Market Intelligence ve tüm bahis oranları\n✅ Bağlamsal Zeka — tablo, fikstür, taktik analizi\n✅ Gol marketleri (Poisson CDF)\n✅ Form & H2H analizi (W/D/L + tıkla-detay)\n✅ Workshop — kadro swap + yeniden hesaplama\n✅ 168 metrik defteri\n✅ Tek Koşu simülatörü + BIM\n✅ Çoklu Koşu Monte Carlo\n\nYeni bir maç seçerek analize başlayabilirsiniz!',
    nextLabel: 'Uygulamaya Başla ⚡',
  },
];
