/**
 * Lineup Impact — %100 Veri-Türetilmiş Bölge Ağırlık Sistemi
 *
 * BLOCK_ZONE_MAP her behavioral unit bloğu için hangi oyuncu bölgelerinin
 * ETKİ EDEBİLECEĞİNİ tanımlar (yapısal liste). Ağırlıklar YOKTUR —
 * tüm ağırlıklar runtime'da bireysel oyuncu istatistiklerinden hesaplanır.
 *
 *   null    → Dışsal faktör, kadro değişikliğinden bağımsız
 *   'ALL'   → Tüm takım ortalaması — genel LQR kullanılır
 *   { zones } → Katılımcı bölge listesi (ağırlıksız)
 *
 * Tam Dinamik Akış (Statik Değer YOK):
 *   1. BLOCK_STAT_MAP: Her blok için hangi oyuncu statları etkilidir
 *      Ağırlıklar nedensellik zincirinden türetilmiş (SIM_BLOCKS → M-metrikleri → player stats)
 *   2. computeDynamicBlockWeights: Kadrodan bölge ağırlıklarını %100 empirik hesaplar
 *      Veri yokken: uniform prior (maximum entropy — G:D:M:F = eşit)
 *      Veri varken: %100 empirik (oyuncuların gerçek istatistik profili)
 *   3. Bölge kalite oranları (zoneRatio) = modifiedAvg / originalAvg
 *   4. Modifier = Σ(dynamicWeight × zoneRatio), sqrt dampingli
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// BLOCK → ZONE YAPI TANIMI
// Her behavioral unit bloğu için hangi bölgeler katılımcıdır.
//
// null       = Dışsal faktör, kadro değişikliğinden bağımsız
// 'ALL'      = Tüm takım ortalaması (psikolojik/genel bloklar)
// { zones }  = Katılımcı bölge listesi — AĞIRLIKLAR YOK
//   Ağırlıklar computeDynamicBlockWeights tarafından runtime'da hesaplanır.
//   Veri yoksa uniform dağılım kullanılır.
// ═══════════════════════════════════════════════════════════════════════════

const BLOCK_ZONE_MAP = {
  // ── I. HÜCUM ──────────────────────────────────────────────────────────
  BITIRICILIK:        { zones: ['G', 'D', 'M', 'F'] },
  YARATICILIK:        { zones: ['G', 'D', 'M', 'F'] },
  SUT_URETIMI:        { zones: ['G', 'D', 'M', 'F'] },
  HAVA_HAKIMIYETI:    { zones: ['G', 'D', 'M', 'F'] },
  DURAN_TOP:          { zones: ['G', 'D', 'M', 'F'] },

  // ── II. SAVUNMA ───────────────────────────────────────────────────────
  SAVUNMA_DIRENCI:    { zones: ['G', 'D', 'M', 'F'] },
  SAVUNMA_AKSIYONU:   { zones: ['G', 'D', 'M', 'F'] },
  GK_REFLEKS:         { zones: ['G'] },  // Tek bölge — her zaman G:1.00
  GK_ALAN_HAKIMIYETI: { zones: ['G', 'D', 'M', 'F'] },

  // ── III. PSİKOLOJİ (Takım Geneli) ────────────────────────────────────
  'ZİHİNSEL_DAYANIKLILIK': 'ALL',
  PSIKOLOJIK_KIRILGANLIK: 'ALL',
  DISIPLIN:                'ALL',
  'MOMENTUM_AKIŞI':        'ALL',
  KADRO_DERINLIGI:         'ALL',
  'FİŞİ_ÇEKME':       { zones: ['G', 'D', 'M', 'F'] },

  // ── IV. BAĞLAM & STRATEJİ (Dışsal) ──────────────────────────────────
  FORM_KISA:           null,
  FORM_UZUN:           null,
  MAC_BASLANGICI:      null,
  MAC_SONU:            null,
  MENAJER_STRATEJISI:  null,
  TURNUVA_BASKISI:     null,
  GOL_IHTIYACI:        null,
  H2H_DOMINASYON:      null,
  HAKEM_DINAMIKLERI:   null,

  // ── V. OPERASYONEL ───────────────────────────────────────────────────
  TOPLA_OYNAMA:        { zones: ['G', 'D', 'M', 'F'] },
  BAGLANTI_OYUNU:      { zones: ['G', 'D', 'M', 'F'] },
  TAKTIKSEL_UYUM:      { zones: ['G', 'D', 'M', 'F'] },
};


// ═══════════════════════════════════════════════════════════════════════════
// BLOK → BİREYSEL İSTATİSTİK EŞLEMESİ (Nedensellik Zinciri Türetilmiş)
//
// Her stat ağırlığı, SIM_BLOCKS formülündeki M-metriklerden geriye izlenerek
// bireysel oyuncu istatistiklerine olan katkı oranından türetilmiştir.
//
// Zincir: SIM_BLOCKS[block] → M-metrikleri → metric source (team-attack/defense/player-perf) → player stats
//
// sampleThreshold ve maxEmpirical artık hardcoded DEĞİL —
// computeDynamicBlockWeights içinde runtime'da hesaplanıyor:
//   sampleThreshold = medianStatValue × CONFIDENCE_FACTOR (3σ)
//   maxEmpirical = 0.35 + (statCount / 20)
// ═══════════════════════════════════════════════════════════════════════════

const BLOCK_STAT_MAP = {
  // ── I. HÜCUM ────────────────────────────────────────────────────────────

  // BITIRICILIK: M011(×3) + M012(×2) + M016(×2) + M018(×2) + M020(×1)
  // Zincir: M011=goals/shots, M012=goals/shotsOnTarget, M016=goals/xG, M018=bigChancesScored/bigChances
  // → goals 5 metriğin 5'inde pay: weight=5, xG M016'da pay: weight=2, shotsOnTarget M012 payda: weight=2
  BITIRICILIK: {
    stats: [
      { key: 'goals', weight: 5 },            // M011+M012+M016+M018+M020: 5 metrikte pay
      { key: 'expectedGoals', weight: 2 },     // M016: xG üstü performans payı
      { key: 'shotsOnTarget', weight: 2 },     // M012: isabetli şut dönüşüm paydası
      { key: 'totalShots', weight: 1 },        // M011: şut-gol dönüşüm paydası
      { key: 'bigChancesCreated', weight: 1 }, // M018: büyük şans dönüşüm dolaylı
      { key: 'goalsFromInsideTheBox', weight: 2 }, // Ceza sahası bitiricilik
      { key: 'goalsFromOutsideTheBox', weight: 1 }, // Uzak mesafe bitiricilik
      { key: 'goalConversionPercentage', weight: 2 }, // Gol dönüşüm oranı
      { key: 'hitWoodwork', weight: 1 },       // Direk isabet → şanssızlık/fırsat göstergesi
    ],
    attrStats: [
      { key: 'attacking', weight: 1 },         // Hücum niteliği (ek sinyal)
    ],
  },

  // YARATICILIK: M015(×3) + M017(×2) + M021(×3) + M070(×3) + M072(×2)
  // Zincir: M015=xG/maç, M017=bigChances/maç, M070=(keyPasses+assists)/appearances, M072=xG konsantrasyon
  // → keyPasses M017+M070'te çift katkı: weight=5, assists M070'te: weight=3
  YARATICILIK: {
    stats: [
      { key: 'keyPasses', weight: 5 },         // M017(×2) + M070(×3): çift katkı
      { key: 'assists', weight: 3 },            // M070(×3): doğrudan yaratıcılık
      { key: 'expectedGoals', weight: 3 },      // M015(×3) + M072(×2): xG bileşeni
      { key: 'bigChancesCreated', weight: 2 },  // M017(×2): fırsat yaratma
      { key: 'expectedAssists', weight: 2 },    // xA: beklenen asist → gerçek yaratıcılık
      { key: 'passToAssist', weight: 2 },       // Asist öncesi son pas
      { key: 'totalAttemptAssist', weight: 1 }, // Asist girişimi
      { key: 'successfulDribbles', weight: 2 }, // Top taşıma → yaratıcılık proxy
    ],
  },

  // SUT_URETIMI: M013(×3) + M014(×3) + M001(×2) + M002(×2)
  // Zincir: M013=totalShots/maç, M014=shotsOnTarget/maç, M001=goals/maç, M002=konum_goals/maç
  // → goals M001+M002'de çift: weight=4, totalShots M013: weight=3, shotsOnTarget M014: weight=3
  SUT_URETIMI: {
    stats: [
      { key: 'goals', weight: 4 },             // M001(×2) + M002(×2): gol ortalaması çift
      { key: 'totalShots', weight: 3 },         // M013(×3): şut hacmi doğrudan
      { key: 'shotsOnTarget', weight: 3 },      // M014(×3): isabetli şut doğrudan
      { key: 'shotsFromInsideTheBox', weight: 2 }, // Ceza sahası şutu → kaliteli pozisyon
      { key: 'shotsFromOutsideTheBox', weight: 1 }, // Uzak mesafe şutu
      { key: 'shotsOffTarget', weight: 1 },     // İsabetsiz şut → verim analizi
    ],
  },

  // HAVA_HAKIMIYETI: M036(×2) + M076(×2) + M085(×1)
  // Zincir: M036=teamAerialWon/total, M076=playerAerialWon/total (bireysel), M085=güçlü yönler
  // → aerialDuelsWon M036+M076'da çift: weight=4, clearances zayıf proxy: weight=1
  HAVA_HAKIMIYETI: {
    stats: [
      { key: 'aerialDuelsWon', weight: 4 },    // M036(×2) + M076(×2): çift kaynak
      { key: 'clearances', weight: 1 },         // Hava topu sonrası uzaklaştırma (zayıf)
      { key: 'headedGoals', weight: 2 },        // Kafa golü → hava hakimiyeti sonucu
    ],
  },

  // DURAN_TOP: M023(×1) + M019(×1)
  // Zincir: M023=cornerGoals/corners, M019=penaltiesWon/matches
  // → Düşük ağırlıklı blok (toplam SIM weight=2). Bireysel karşılık zayıf.
  DURAN_TOP: {
    stats: [
      { key: 'aerialDuelsWon', weight: 1 },    // M023: korner başarısı hava gücüne bağlı
      { key: 'goals', weight: 1 },              // M019+M023: duran toptan sonuç alma
      { key: 'penaltyWon', weight: 3 },         // Penaltı kazanma → duran top fırsat
      { key: 'penaltyGoals', weight: 2 },       // Penaltı golü → duran top sonucu
      { key: 'freeKickGoal', weight: 2 },       // Serbest vuruş golü
      { key: 'shotFromSetPiece', weight: 1 },   // Set piece'ten şut
    ],
  },

  // ── II. SAVUNMA ─────────────────────────────────────────────────────────

  // SAVUNMA_DIRENCI: M026(×3,sign:-1) + M028(×3) + M033(×2,sign:-1) + M157(×2)
  // Zincir: M028=cleanSheets/matches(×3!), M157=compositeDef → tackles/interceptions/clearances
  // → cleanSheets M028 doğrudan(×3): weight=3, savunma statları M157: weight=2 each
  SAVUNMA_DIRENCI: {
    stats: [
      { key: 'cleanSheets', weight: 3 },       // M028(×3): clean sheet doğrudan
      { key: 'tackles', weight: 2 },            // M157 kompozit bileşeni
      { key: 'interceptions', weight: 2 },      // M157 kompozit bileşeni
      { key: 'clearances', weight: 2 },         // M157 kompozit bileşeni
    ],
    attrStats: [
      { key: 'defending', weight: 2 },          // M157 nitelik bileşeni (×2 SIM ağırlık)
    ],
  },

  // SAVUNMA_AKSIYONU: M034(×2) + M035(×2) + M037(×2) + M044(×1,sign:-1)
  // Zincir: M034=blockedShots/oppShots, M035=duelsWon/duels, M037=interceptions/maç
  // → tackles M035 düello: weight=2, interceptions M037 doğrudan: weight=2, clearances M034 blok: weight=2
  SAVUNMA_AKSIYONU: {
    stats: [
      { key: 'tackles', weight: 2 },           // M035(×2): düello kazanma proxy
      { key: 'interceptions', weight: 2 },      // M037(×2): doğrudan
      { key: 'clearances', weight: 2 },         // M034(×2): blok/uzaklaştırma proxy
      { key: 'groundDuelsWon', weight: 2 },    // Yer düellosu kazanma
      { key: 'totalDuelsWon', weight: 1 },     // Toplam düello kazanma
      { key: 'tacklesWon', weight: 2 },        // Başarılı müdahale
      { key: 'blockedShots', weight: 2 },      // Şut engelleme
      { key: 'outfielderBlocks', weight: 1 },  // Saha oyuncusu blok
      { key: 'dribbledPast', weight: -1 },     // Geçilme (negatif sinyal)
    ],
  },

  // GK_REFLEKS: Zaten G:1.0 tek bölge — dinamik ağırlık fark yaratmaz

  // GK_ALAN_HAKIMIYETI: M100(×2) + M101(×1) + M107(×2)
  // Zincir: M100=penSaved/penFaced, M101=highClaims/maç, M107=GK dağıtım isabeti
  // → saves M100 proxy: weight=2, clearances+aerial M101 çıkış: weight=1 each
  GK_ALAN_HAKIMIYETI: {
    stats: [
      { key: 'saves', weight: 2 },             // M100(×2): kaleci kurtarışı proxy
      { key: 'clearances', weight: 1 },         // M101: kaleci/defans çıkışı
      { key: 'aerialDuelsWon', weight: 1 },     // M101: hava hakimiyeti çıkışı
    ],
    attrStats: [
      { key: 'defending', weight: 1 },          // Savunma organizasyonu
    ],
  },

  // ── III. PSİKOLOJİ ──────────────────────────────────────────────────────

  // FİŞİ_ÇEKME: M065(×4) + M043(×2) + M063(×2)
  // Zincir: M065=comeback eğilimi (takım), M043=maç kapatma (takım), M063=geç gol → goals
  // → goals M063 geç gol(×2): weight=4 (psikolojik sinyalin en güçlü bireysel karşılığı)
  'FİŞİ_ÇEKME': {
    stats: [
      { key: 'goals', weight: 4 },             // M063(×2): geç gol eğilimi + M065 comeback
      { key: 'expectedGoals', weight: 1 },      // Fırsat kalitesi (zayıf proxy)
    ],
    attrStats: [
      { key: 'attacking', weight: 1 },          // Hücum niteliği (zayıf proxy)
    ],
  },

  // ── V. OPERASYONEL ──────────────────────────────────────────────────────

  // TOPLA_OYNAMA: M025(×3) + M150(×3) + M177(×2)
  // Zincir: M025=accPassesFinalThird/total, M150=possession → totalPasses+accuratePasses
  // → accuratePasses M025(×3)+M150(×3)=6, totalPasses M150: weight=3
  TOPLA_OYNAMA: {
    stats: [
      { key: 'accuratePasses', weight: 6 },     // M025(×3) + M150(×3): çift kaynak
      { key: 'totalPasses', weight: 3 },         // M150(×3): pas hacmi → top kontrolü
      { key: 'accurateFinalThirdPasses', weight: 3 }, // Son bölge pası
      { key: 'accurateLongBalls', weight: 2 },   // Uzun pas başarısı
      { key: 'accurateOppositionHalfPasses', weight: 2 }, // Rakip yarı sahada pas
      { key: 'touches', weight: 1 },             // Topa dokunma → oyuna dahil olma
      { key: 'possessionLost', weight: -2 },     // Top kaybı (negatif sinyal)
    ],
    attrStats: [
      { key: 'technical', weight: 2 },           // Teknik nitelik → pas kalitesi
    ],
  },

  // BAGLANTI_OYUNU: M152(×2) + M154(×2) + M178(×1)
  // Zincir: M152=progressive passes/carries, M154=chance creation composite
  // → keyPasses M152+M154 çift: weight=4, assists M154: weight=2, bigChancesCreated M154: weight=2
  BAGLANTI_OYUNU: {
    stats: [
      { key: 'keyPasses', weight: 4 },          // M152(×2) + M154(×2): çift katkı
      { key: 'assists', weight: 2 },             // M154: fırsat yaratma sonucu
      { key: 'bigChancesCreated', weight: 2 },   // M154: doğrudan
      { key: 'successfulDribbles', weight: 2 },  // İleri taşıma → bağlantı
      { key: 'accurateCrosses', weight: 2 },     // Ortanın isabeti → bağlantı kalitesi
      { key: 'totalCross', weight: 1 },          // Orta hacmi
      { key: 'dispossessed', weight: -1 },       // Top kaybedilme (negatif)
    ],
  },

  // TAKTIKSEL_UYUM: M179(×2) + M177(×1)
  // Zincir: M179=goals/xG (taktiksel verimlilik), M177=PPDA pressing
  // → accuratePassesPercentage şekil bütünlüğü: weight=2, interceptions M177 pressing: weight=1
  TAKTIKSEL_UYUM: {
    stats: [
      { key: 'accuratePassesPercentage', weight: 2 }, // Şekil bütünlüğü proxy
      { key: 'interceptions', weight: 1 },              // M177: pressing uyumu
      { key: 'possessionWonAttThird', weight: 3 },     // Hücum bölgesinde top kazanma → pressing
      { key: 'ballRecovery', weight: 2 },              // Top geri kazanma → pressing sonucu
      { key: 'wasFouled', weight: 1 },                 // Faul kazanma → baskı altında tutma
      { key: 'fouls', weight: -1 },                    // Faul yapma (negatif)
      { key: 'offsides', weight: -1 },                 // Ofsayt (negatif → zamanlama hatası)
    ],
    attrStats: [
      { key: 'technical', weight: 1 },                  // Teknik altyapı
    ],
  },
};


/**
 * Lineup oyuncularından bölge bazlı rating ortalamaları hesaplar.
 *
 * @param {Array} players - Lineup oyuncuları (player, assignedPosition, substitute, isReserve)
 * @param {Function} calcRating - calculateDynamicRating fonksiyonu
 * @returns {{ G: number|null, D: number|null, M: number|null, F: number|null }}
 */
function _computeZoneAverages(players, calcRating) {
  if (!players?.length) return { G: null, D: null, M: null, F: null };

  // Sadece ilk 11 (starter) oyuncuları al
  const starters = players
    .filter(p => !p.substitute && !p.isReserve)
    .slice(0, 11);

  // Her bölge için rating topla
  const zoneData = { G: [], D: [], M: [], F: [] };

  for (const p of starters) {
    if (!p?.player) continue;

    // Oyuncunun aktif bölgesi: Workshop'ta atanan pozisyon > doğal mevki
    const assigned = (p.assignedPosition || '').toUpperCase()[0] || '';
    const native = (p.player?.position || '').toUpperCase()[0] || '';
    const effectiveZone = assigned || native || 'M'; // fallback: orta saha

    // Dinamik rating: atanan mevkiye göre istatistik değerlendirmesi
    // Mevki farklıysa organik ceza + rezidüel ceza otomatik uygulanır
    const overridePos = (assigned && assigned !== native) ? assigned : null;
    const rating = calcRating(p.player, overridePos);

    if (zoneData[effectiveZone]) {
      zoneData[effectiveZone].push(rating);
    }
  }

  // Her bölge için ortalama hesapla (oyuncu yoksa null)
  const result = {};
  for (const zone of ['G', 'D', 'M', 'F']) {
    const ratings = zoneData[zone];
    result[zone] = ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : null;
  }

  return result;
}


/**
 * Orijinal ve modifiye lineup'tan bölge bazlı kalite oranlarını hesaplar.
 *
 * Her bölge için: zoneRatio = modifiedZoneAvg / originalZoneAvg
 *   ratio = 1.0 → değişiklik yok
 *   ratio < 1.0 → bölge zayıfladı (daha düşük kalite oyuncu)
 *   ratio > 1.0 → bölge güçlendi (daha yüksek kalite oyuncu)
 *
 * Edge case'ler:
 *   - Orijinalde bölge boşsa (hiç oyuncu yok) → ratio = 1.0 (karşılaştırma anlamsız)
 *   - Modifiye'de bölge boşaldıysa → ratio = normMinRatio veya 0.50 (ciddi düşüş)
 *   - Orijinal ve modifiye aynıysa → ratio = 1.0
 *
 * @param {Array} origPlayers - Orijinal lineup oyuncuları
 * @param {Array} modPlayers - Modifiye lineup oyuncuları
 * @param {Function} calcRating - calculateDynamicRating fonksiyonu
 * @param {number} [floorRatio=0.50] - Bölge tamamen boşaldığında minimum oran
 * @returns {{ G: number, D: number, M: number, F: number }}
 */
function computeZoneQualityRatios(origPlayers, modPlayers, calcRating, floorRatio = 0.50) {
  const origAvgs = _computeZoneAverages(origPlayers, calcRating);
  const modAvgs  = _computeZoneAverages(modPlayers, calcRating);

  const ratios = {};

  for (const zone of ['G', 'D', 'M', 'F']) {
    const orig = origAvgs[zone];
    const mod  = modAvgs[zone];

    if (orig == null || orig <= 0) {
      // Orijinalde bu bölge yoktu — karşılaştırma anlamsız
      ratios[zone] = 1.0;
    } else if (mod == null || mod <= 0) {
      // Bölge tamamen boşaltıldı — ciddi düşüş
      ratios[zone] = floorRatio;
    } else {
      ratios[zone] = mod / orig;
    }
  }

  return ratios;
}


/**
 * Orijinal kadrodan dinamik bölge ağırlıklarını hesaplar.
 *
 * BLOCK_STAT_MAP'teki 12 blok için, orijinal lineup oyuncularının bireysel
 * istatistiklerinden + nitelik puanlarından (attributes) hangi bölgenin
 * (G/D/M/F) o bloğa ne kadar katkı yaptığını empirik olarak hesaplar
 * ve statik prior ile Bayesian blend yapar.
 *
 * Veri Kaynakları (her oyuncu için):
 *   - stats: seasonStats.statistics → goals, tackles, passes, vs.
 *   - attrStats: attributes.averageAttributeOverviews → attacking, defending, technical
 *
 * Bayesian Parametreleri (runtime-adaptive):
 *   sampleThreshold: Bloğun statlarının median per-match değerinden türetilir
 *     → goals (median ~0.3/maç) → threshold ~10
 *     → totalPasses (median ~30/maç) → threshold ~330
 *   maxEmpirical: Bloğun stat kaynak sayısından türetilir
 *     → 2 stat → 0.40, 5 stat → 0.55, 6+ stat → 0.60
 *
 * Sonuç: { BITIRICILIK: { zones: ['F','M','D'], weights: {F:0.65, M:0.30, D:0.05} }, ... }
 *
 * @param {Array} origPlayers - Orijinal lineup oyuncuları
 * @returns {object} - Her desteklenen blok için { zones, weights } objesi
 */
function computeDynamicBlockWeights(origPlayers) {
  if (!origPlayers?.length) return {};

  const starters = origPlayers
    .filter(p => !p.substitute && !p.isReserve)
    .slice(0, 11);

  if (!starters.length) return {};

  // ═══════════════════════════════════════════════
  // Tüm oyuncuların per-match stat ortalaması (sampleThreshold hesabı için)
  // ═══════════════════════════════════════════════
  const starterStats = starters.map(p => {
    const s = p?.player?.statistics || p?.player?.seasonStats?.statistics || {};
    const m = s.appearances || s.matchesStarted || 1;
    return { stats: s, matches: m };
  });

  const result = {};

  for (const [blockId, config] of Object.entries(BLOCK_STAT_MAP)) {
    const staticMapping = BLOCK_ZONE_MAP[blockId];
    if (!staticMapping || typeof staticMapping === 'string') continue;

    // ═══════════════════════════════════════════════
    // A. ADAPTIVE SAMPLE THRESHOLD
    // Her bloğun kullandığı statların median per-match değerini hesapla
    // Yüksek hacimli statlar (pas: ~30/maç) yüksek threshold gerektirir
    // Düşük hacimli statlar (gol: ~0.3/maç) düşük threshold yeterli
    // CONFIDENCE_FACTOR = 3 → ~3σ güvenilirlik
    // ═══════════════════════════════════════════════
    const CONFIDENCE_FACTOR = 3;
    const perMatchValues = [];
    for (const { stats, matches } of starterStats) {
      for (const { key } of config.stats) {
        const val = stats[key] || 0;
        perMatchValues.push(val / Math.max(matches, 1));
      }
    }
    // Median hesapla
    perMatchValues.sort((a, b) => a - b);
    const medianPerMatch = perMatchValues.length > 0
      ? perMatchValues[Math.floor(perMatchValues.length / 2)]
      : 0;
    // sampleThreshold: median × starter sayısı × CONFIDENCE_FACTOR
    // En az 5, en çok 500 (uç değer koruması)
    const adaptiveThreshold = Math.max(5, Math.min(500,
      medianPerMatch * starters.length * CONFIDENCE_FACTOR
    ));


    // Her bölge için ilgili istatistiklerin ağırlıklı toplamını hesapla
    const zoneScores = { G: 0, D: 0, M: 0, F: 0 };
    let grandTotal = 0;

    for (const p of starters) {
      if (!p?.player) continue;

      const stats = p.player?.statistics || p.player?.seasonStats?.statistics || {};
      const matches = stats.appearances || stats.matchesStarted || 1;

      // Oyuncunun aktif bölgesi
      const assigned = (p.assignedPosition || '').toUpperCase()[0] || '';
      const native = (p.player?.position || '').toUpperCase()[0] || '';
      const zone = assigned || native || 'M';

      // ── A. Bireysel istatistikler (per-match normalize) ──
      let playerScore = 0;
      for (const { key, weight } of config.stats) {
        const val = stats[key] || 0;
        playerScore += (val / Math.max(matches, 1)) * weight;
      }

      // ── B. Nitelik puanları (attribute overviews) ──
      if (config.attrStats) {
        const attrs = p.player?.attributes?.averageAttributeOverviews?.[0] || {};
        for (const { key, weight } of config.attrStats) {
          const val = attrs[key] || 0;
          playerScore += (val / 100) * weight;
        }
      }

      if (zoneScores[zone] !== undefined) {
        zoneScores[zone] += playerScore;
      }
      grandTotal += playerScore;
    }

    // ═══════════════════════════════════════════════
    // C. BÖLGE AĞIRLIKLARI (%100 VERİ-TÜRETİLMİŞ)
    // Statik prior YOK — uniform (maximum entropy) prior kullanılır.
    // Veri arttıkça sampleWeight → 1.0 (tamamen empirik).
    // Veri yoksa → eşit dağılım (G:D:M:F = 0.25 each).
    // ═══════════════════════════════════════════════

    // Uniform prior: Tüm bölgeler eşit (maximum entropy — bilgi yok varsayımı)
    const uniformWeight = 0.25; // 4 bölge → 1/4

    if (grandTotal <= 0) {
      // Veri yok → uniform dağılım döndür (statik fallback değil!)
      const uniformZones = ['G', 'D', 'M', 'F'].filter(z => {
        // GK_REFLEKS gibi tek bölge blokları için sadece katılımcı bölgeleri dahil et
        return staticMapping.zones?.includes(z);
      });
      const uw = uniformZones.length > 0 ? 1 / uniformZones.length : 0.25;
      const uniformWeights = {};
      for (const z of ['G', 'D', 'M', 'F']) {
        uniformWeights[z] = uniformZones.includes(z) ? uw : 0;
      }
      result[blockId] = { zones: uniformZones, weights: uniformWeights };
      continue;
    }

    // Empirik bölge oranları (gerçek veriden)
    const empirical = {};
    for (const zone of ['G', 'D', 'M', 'F']) {
      empirical[zone] = zoneScores[zone] / grandTotal;
    }

    // Bayesian blend: UNIFORM prior → empirik veri
    // sampleWeight: 0 → uniform, 1.0 → %100 empirik
    // Cap YOK — yeterli veri varsa tamamen empirik olur
    const sampleWeight = Math.min(grandTotal / adaptiveThreshold, 1.0);

    const blended = {};
    let blendedTotal = 0;
    for (const zone of ['G', 'D', 'M', 'F']) {
      blended[zone] = uniformWeight * (1 - sampleWeight) + empirical[zone] * sampleWeight;
      blendedTotal += blended[zone];
    }

    // Normalize: toplamı 1.0'a getir
    if (blendedTotal > 0) {
      for (const zone of ['G', 'D', 'M', 'F']) {
        blended[zone] /= blendedTotal;
      }
    }

    // Aktif bölgeler: ağırlığı %1'den fazla olan bölgeler
    const activeZones = Object.entries(blended)
      .filter(([_, w]) => w > 0.01)
      .map(([z]) => z);

    result[blockId] = { zones: activeZones, weights: blended };
  }

  return result;
}


/**
 * Belirli bir behavioral unit bloğu için ağırlıklı bölge modifiyesini hesaplar.
 *
 * @param {string} blockId - SIM_BLOCK adı (ör. 'GK_REFLEKS', 'BITIRICILIK')
 * @param {{ G: number, D: number, M: number, F: number }} zoneRatios - Bölge kalite oranları
 * @param {number} [overallLQR=1.0] - Genel LQR (psikolojik bloklar için)
 * @param {object} [dynamicWeights=null] - computeDynamicBlockWeights çıktısı
 * @returns {number} Modifier çarpanı (sqrt dampingli)
 */
function computeBlockZoneModifier(blockId, zoneRatios, overallLQR = 1.0, dynamicWeights = null) {
  const staticMapping = BLOCK_ZONE_MAP[blockId];

  // null → Dışsal faktör, kadrodan etkilenmez
  if (staticMapping == null) return 1.0;

  // 'ALL' → Tüm takım ortalaması, genel LQR kullan
  if (staticMapping === 'ALL') return Math.sqrt(overallLQR);

  // Dinamik ağırlıklar varsa onları kullan. computeDynamicBlockWeights artık
  // TÜM bloklar için sonuç döndürdüğü için staticMapping fallback'i tetiklenmemeli.
  // Eğer tetiklenirse (edge case), uniform dağılım oluştur.
  let mapping = dynamicWeights?.[blockId];
  if (!mapping) {
    // staticMapping artık weights içermiyor — uniform fallback oluştur
    const zones = staticMapping.zones || ['G', 'D', 'M', 'F'];
    const uw = zones.length > 0 ? 1 / zones.length : 0.25;
    const weights = {};
    for (const z of zones) weights[z] = uw;
    mapping = { zones, weights };
  }

  // Bölgesel ZQM: ağırlıklı bölge ortalaması
  let weightedRatio = 0;
  let totalWeight = 0;

  for (const zone of mapping.zones) {
    const w = mapping.weights[zone] || 0;
    const r = zoneRatios[zone] ?? 1.0;
    weightedRatio += r * w;
    totalWeight += w;
  }

  if (totalWeight <= 0) return 1.0;

  const rawModifier = weightedRatio / totalWeight;

  // sqrt damping: aşırı salınım önlenir
  // ratio=0.70 → sqrt=0.837 (%16 düşüş, ham %30 değil)
  // ratio=1.30 → sqrt=1.140 (%14 artış, ham %30 değil)
  // ratio=0.50 → sqrt=0.707 (%29 düşüş — kalecisiz felaket senaryosu)
  return Math.sqrt(rawModifier);
}


/**
 * Tüm behavioral unit'lere bölgesel kadro modifiyelerini uygular.
 *
 * PVKD ve unit hesaplamasından SONRA, getPower/simülasyon'dan ÖNCE çağrılır.
 * Sadece modifiedLineup varken etkili olur (tüm ratios 1.0 ise hiçbir şey değişmez).
 *
 * @param {object} units - Behavioral unit değerleri { BITIRICILIK: 1.08, GK_REFLEKS: 0.95, ... }
 * @param {{ G: number, D: number, M: number, F: number }} zoneRatios - Bölge kalite oranları
 * @param {number} [overallLQR=1.0] - Genel LQR (psikolojik bloklar için)
 * @param {object} [dynamicWeights=null] - computeDynamicBlockWeights çıktısı
 * @returns {void} — units objesi in-place modifiye edilir
 */
function applyZoneModifiers(units, zoneRatios, overallLQR = 1.0, dynamicWeights = null) {
  if (!units || !zoneRatios) return;

  // Tüm ratios 1.0 ise (kadro değişmedi) erken çık — performans
  const allIdentity = Object.values(zoneRatios).every(r => r === 1.0);
  if (allIdentity && overallLQR === 1.0) return;

  for (const blockId in BLOCK_ZONE_MAP) {
    if (units[blockId] == null) continue;

    const modifier = computeBlockZoneModifier(blockId, zoneRatios, overallLQR, dynamicWeights);
    if (modifier !== 1.0) {
      units[blockId] *= modifier;
    }
  }
}


module.exports = {
  BLOCK_ZONE_MAP,
  BLOCK_STAT_MAP,
  computeZoneQualityRatios,
  computeDynamicBlockWeights,
  computeBlockZoneModifier,
  applyZoneModifiers,
};
