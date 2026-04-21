/**
 * quality-factors.js
 * Piyasa Değeri tabanlı Kalite Faktörleri (PVKD) — mevki bazlı hesaplama.
 *
 * Her takımın kadrosu GK/DEF/MID/ATK gruplarına ayrılır.
 * Her mevki grubu için homeShare = homeMV / (homeMV + awayMV) hesaplanır.
 * qualityFactor = (share × 2) ^ alpha  →  nötr nokta 1.0, [0, 2] aralığında
 * alpha = vol / (avg + vol): volatil ligde kalite farkı daha belirleyici
 *
 * Bileşik gruplar:
 *   ATK_MID = geo(ATK, MID)  — yaratıcılık + bitiricilik
 *   DEF_GK  = geo(DEF, GK)   — defans + kale
 *   ALL     = geo(GK, DEF, MID, ATK) = tüm kadro dengesi
 *
 * Birim → Kalite Grubu eşlemesi (BLOCK_QF_MAP):
 *   null → kalite düzeltmesi uygulanmaz (hakem, H2H, bağlamsal birimler)
 */

'use strict';

/**
 * Her SIM_BLOCK birimi için ilgili kalite grubu.
 * null: saha dışı faktör → kalite düzeltmesi uygulanmaz.
 */
const BLOCK_QF_MAP = {
  // Hücum
  BITIRICILIK:            'ATK',
  YARATICILIK:            'ATK_MID',
  SUT_URETIMI:            'ATK_MID',
  HAVA_HAKIMIYETI:        'ATK_MID',
  DURAN_TOP:              'ATK',
  // Savunma
  SAVUNMA_DIRENCI:        'DEF_GK',
  SAVUNMA_AKSIYONU:       'DEF',
  GK_REFLEKS:             'GK',
  GK_ALAN_HAKIMIYETI:     'DEF_GK',
  // Orta Saha & Bağlantı
  TOPLA_OYNAMA:           'MID',
  BAGLANTI_OYUNU:         'MID',
  // Psikolojik / Genel Kadro
  'ZİHİNSEL_DAYANIKLILIK': 'ALL',
  'FİŞİ_ÇEKME':            'ALL',
  PSIKOLOJIK_KIRILGANLIK: 'ALL',
  DISIPLIN:               'ALL',
  'MOMENTUM_AKIŞI':        'ALL',
  FORM_KISA:              'ALL',
  FORM_UZUN:              'ALL',
  KADRO_DERINLIGI:        'ALL',
  TAKTIKSEL_UYUM:         'ALL',
  MENAJER_STRATEJISI:     'ALL',
  // Bağlamsal / Saha-dışı — kalite düzeltmesi yok
  H2H_DOMINASYON:         null,
  HAKEM_DINAMIKLERI:      null,
  MAC_BASLANGICI:         null,
  MAC_SONU:               null,
  TURNUVA_BASKISI:        null,
  GOL_IHTIYACI:           null,
};

/**
 * Oyuncu listesinden mevki bazlı piyasa değeri dağılımını hesaplar.
 * Pozisyon eşlemesi SofaScore API'ye göre: G=Kaleci, D=Defans, M=Orta, F=Forvet
 * @param {object} squadData - { players: [...] } — homePlayers veya awayPlayers
 * @returns {{ GK: number, DEF: number, MID: number, ATK: number, total: number }}
 */
function computePositionMVBreakdown(squadData) {
  const players = squadData?.players || [];
  const breakdown = { GK: 0, DEF: 0, MID: 0, ATK: 0, total: 0 };

  for (const entry of players) {
    const mv = entry.player?.proposedMarketValue ?? 0;
    if (!mv) continue;
    // SofaScore pozisyon kodu: ilk harf belirleyici
    const pos = (entry.player?.position || '').toUpperCase()[0] || '';
    breakdown.total += mv;

    if (pos === 'G') {
      breakdown.GK += mv;
    } else if (pos === 'D') {
      breakdown.DEF += mv;
    } else if (pos === 'M') {
      breakdown.MID += mv;
    } else if (pos === 'F') {
      breakdown.ATK += mv;
    }
    // Bilinmeyen pozisyon: total'e eklendi ancak mevki grubuna dahil edilmedi
  }

  return breakdown;
}

/**
 * Lig verilerinden alpha parametresini hesaplar.
 * alpha = vol / (avg + vol): volatil ligde kalite farkı daha belirleyici.
 * @param {number|null} leagueGoalVolatility
 * @param {number|null} leagueAvgGoals
 * @returns {number|null}
 */
function computeAlpha(leagueGoalVolatility, leagueAvgGoals) {
  if (
    leagueGoalVolatility == null || leagueAvgGoals == null ||
    leagueAvgGoals + leagueGoalVolatility <= 0
  ) {
    return null;
  }
  return leagueGoalVolatility / (leagueAvgGoals + leagueGoalVolatility);
}

/**
 * İki takımın mevki bazlı piyasa değerlerinden kalite faktörlerini hesaplar.
 * Formül: qf = (ownShare × 2) ^ alpha  — nötr nokta 1.0
 * @param {object} homeMVBreakdown - computePositionMVBreakdown çıktısı
 * @param {object} awayMVBreakdown - computePositionMVBreakdown çıktısı
 * @param {number|null} alpha - computeAlpha çıktısı; null ise 1.0 döner
 * @returns {{ home: object, away: object }} — her grup için QF değerleri
 */
function computeQualityFactors(homeMVBreakdown, awayMVBreakdown, alpha) {
  // alpha null, ya da iki takımdan biri toplam sıfır ise → PVKD devre dışı (1.0)
  // Sıfır MV = API'de veri eksikliği; bu durum pozisyon bazlı hesabı anlamsız kılar.
  // Sadece her iki takımda da gerçek veri varsa PVKD uygulanır.
  if (alpha == null || homeMVBreakdown.total <= 0 || awayMVBreakdown.total <= 0) {
    const neutral = { GK: 1.0, DEF: 1.0, MID: 1.0, ATK: 1.0, ATK_MID: 1.0, DEF_GK: 1.0, ALL: 1.0 };
    return { home: { ...neutral }, away: { ...neutral } };
  }

  const geo2 = (a, b) => Math.sqrt(Math.max(a, 0.01) * Math.max(b, 0.01));

  // Mevki çifti için home/away QF hesapla
  const computePair = (hv, av) => {
    const total = hv + av;
    // Bir veya her iki tarafta sıfır değer varsa toplam QF'ye (all) düş
    if (total <= 0) {
      const allTotal = homeMVBreakdown.total + awayMVBreakdown.total;
      if (allTotal <= 0) return { home: 1.0, away: 1.0 };
      return {
        home: Math.pow((homeMVBreakdown.total / allTotal) * 2, alpha),
        away: Math.pow((awayMVBreakdown.total / allTotal) * 2, alpha),
      };
    }
    return {
      home: Math.pow((hv / total) * 2, alpha),
      away: Math.pow((av / total) * 2, alpha),
    };
  };

  const gk  = computePair(homeMVBreakdown.GK,    awayMVBreakdown.GK);
  const def = computePair(homeMVBreakdown.DEF,   awayMVBreakdown.DEF);
  const mid = computePair(homeMVBreakdown.MID,   awayMVBreakdown.MID);
  const atk = computePair(homeMVBreakdown.ATK,   awayMVBreakdown.ATK);
  const all = computePair(homeMVBreakdown.total, awayMVBreakdown.total);

  return {
    home: {
      GK:      gk.home,
      DEF:     def.home,
      MID:     mid.home,
      ATK:     atk.home,
      ATK_MID: geo2(atk.home, mid.home),
      DEF_GK:  geo2(def.home, gk.home),
      ALL:     all.home,
    },
    away: {
      GK:      gk.away,
      DEF:     def.away,
      MID:     mid.away,
      ATK:     atk.away,
      ATK_MID: geo2(atk.away, mid.away),
      DEF_GK:  geo2(def.away, gk.away),
      ALL:     all.away,
    },
  };
}

module.exports = {
  BLOCK_QF_MAP,
  computePositionMVBreakdown,
  computeAlpha,
  computeQualityFactors,
};
