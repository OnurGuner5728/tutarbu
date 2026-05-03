/**
 * player-rating-utils.js
 * Calculates a dynamic rating for a player based on ALL available statistics,
 * position-aware weighting, market value quality coefficient, and consistency.
 *
 * 3 Boyutlu Organik Model:
 *   1. Performans Puanı: Mevki bazlı istatistik analizi
 *   2. Kalite Katsayısı: Piyasa değeri üzerinden lig zorluk proxy'si
 *   3. Tutarlılık Bonusu: Düzenli oynama ödülü / yedek cezası
 *
 * overridePosition destekli:
 *   Oyuncu farklı bir mevkiye atandığında, istatistik ağırlıkları o mevkiye
 *   göre yeniden hesaplanır + küçük bir rezidüel ceza uygulanır.
 */

'use strict';

/**
 * Mevki bazlı istatistik skoru hesaplar.
 * @param {string} evalPos - Değerlendirilecek mevki ('F', 'M', 'D', 'G')
 * @param {object} stats - Oyuncu sezon istatistikleri
 * @param {number} matches - Maç sayısı
 * @returns {{ statScore: number, statWeight: number }}
 */
function computePositionStatScore(evalPos, stats, matches) {
  let statScore = 0;
  let statWeight = 0;
  
  if (matches <= 0) return { statScore, statWeight };

  const goals     = stats.goals || 0;
  const assists   = stats.assists || 0;
  const xG        = stats.expectedGoals || 0;
  const shots     = stats.totalShots || stats.shotsOnTarget || 0;
  const keyPasses = stats.keyPasses || stats.bigChancesCreated || 0;
  const dribPct   = stats.successfulDribblesPercentage || 0;
  const passAcc   = stats.accuratePassesPercentage || 0;
  const aerialPct = stats.aerialDuelsWonPercentage || 0;
  const tackles   = stats.tackles || 0;
  const intercept = stats.interceptions || 0;
  const clearance = stats.clearances || 0;
  const cleanSh   = stats.cleanSheets || 0;
  const saves     = stats.saves || 0;
  const savesPct  = stats.savePercentage || 0;
  const minutes   = stats.minutesPlayed || 0;
  const gpa       = (goals + assists) / matches;
  const minsPerM  = minutes > 0 ? minutes / matches : 0;

  // --- FORVET (F) ---
  if (evalPos === 'F') {
    if (goals > 0) { statScore += Math.min(30, (goals / matches) * 35); statWeight++; }
    if (xG > 0) { statScore += Math.min(15, (xG / matches) * 20); statWeight++; }
    if (shots > 0) { statScore += Math.min(10, (goals / shots) * 35); statWeight++; }
    if (assists > 0) { statScore += Math.min(10, (assists / matches) * 15); statWeight++; }
    if (dribPct > 0) { statScore += Math.min(5, dribPct / 15); statWeight++; }
    if (aerialPct > 0) { statScore += Math.min(5, aerialPct / 15); statWeight++; }
  }
  // --- ORTA SAHA (M) ---
  else if (evalPos === 'M') {
    if (keyPasses > 0 || assists > 0) { 
      statScore += Math.min(20, ((keyPasses + assists) / matches) * 12); statWeight++; 
    }
    if (gpa > 0) { statScore += Math.min(15, gpa * 20); statWeight++; }
    if (passAcc > 0) { statScore += Math.min(10, (passAcc - 70) / 2); statWeight++; }
    if (dribPct > 0) { statScore += Math.min(10, dribPct / 8); statWeight++; }
    if (tackles > 0 || intercept > 0) { 
      statScore += Math.min(10, ((tackles + intercept) / matches) * 4); statWeight++; 
    }
    if (xG > 0) { statScore += Math.min(5, (xG / matches) * 15); statWeight++; }
  }
  // --- DEFANS (D) ---
  else if (evalPos === 'D') {
    if (tackles > 0) { statScore += Math.min(15, (tackles / matches) * 6); statWeight++; }
    if (intercept > 0) { statScore += Math.min(15, (intercept / matches) * 8); statWeight++; }
    if (clearance > 0) { statScore += Math.min(10, (clearance / matches) * 3); statWeight++; }
    if (aerialPct > 0) { statScore += Math.min(10, aerialPct / 8); statWeight++; }
    if (cleanSh > 0) { statScore += Math.min(10, (cleanSh / matches) * 20); statWeight++; }
    if (passAcc > 0) { statScore += Math.min(8, (passAcc - 75) / 2); statWeight++; }
    if (gpa > 0) { statScore += Math.min(7, gpa * 25); statWeight++; }
  }
  // --- KALECİ (G) ---
  else if (evalPos === 'G') {
    if (savesPct > 0) { statScore += Math.min(25, (savesPct - 60) / 1.2); statWeight++; }
    if (saves > 0) { statScore += Math.min(15, (saves / matches) * 5); statWeight++; }
    if (cleanSh > 0) { statScore += Math.min(20, (cleanSh / matches) * 45); statWeight++; }
    if (aerialPct > 0) { statScore += Math.min(5, aerialPct / 15); statWeight++; }
  }
  // --- BİLİNMEYEN MEVKİ ---
  else {
    if (gpa > 0) { statScore += Math.min(20, gpa * 25); statWeight++; }
    if (passAcc > 0) { statScore += Math.min(10, (passAcc - 70) / 2); statWeight++; }
  }

  // Dakika tutarlılığı bonusu (tüm pozisyonlar)
  if (minsPerM > 75) statScore += 3;
  else if (minsPerM > 45) statScore += 1;

  return { statScore, statWeight };
}

/**
 * İki mevki arasındaki mesafeyi hesaplar.
 * G=0, D=1, M=2, F=3 sıralaması ile.
 * @returns {number} 0-3 arası mesafe
 */
function getPositionDistance(posA, posB) {
  if (!posA || !posB) return 0;
  const map = { 'G': 0, 'D': 1, 'M': 2, 'F': 3 };
  const idxA = map[posA[0]?.toUpperCase()];
  const idxB = map[posB[0]?.toUpperCase()];
  if (idxA === undefined || idxB === undefined) return 0;
  return Math.abs(idxA - idxB);
}

/**
 * Mevki değişikliğinde uygulanan rezidüel ceza.
 * Organik cezanın üstüne, ölçülemeyen taktik faktörler için eklenir:
 *   - Pozisyonel zeka, alan refleksleri
 *   - Taktik uyum, takım arkadaşlarıyla sinerji
 *   - Antrenman geçmişi
 *
 * KALECİ ASİMETRİSİ: Kaleci pozisyonu diğer mevkilerden temelden farklıdır.
 * Bir orta saha oyuncusu kaleye konulduğunda sadece "uzak mevki" cezası değil,
 * kaleciliğin gerektirdiği özel refleksler, pozisyon alma, elle oyun gibi
 * tamamen farklı bir beceri seti eksikliği için ağır ceza uygulanır.
 *
 * @param {number} distance - Mevki mesafesi (0-3)
 * @param {string} nativePos - Oyuncunun doğal mevkisi
 * @param {string} evalPos - Atanan mevki
 * @returns {number} Negatif ceza puanı
 */
function getResidualPenalty(distance, nativePos, evalPos) {
  if (distance === 0) return 0;

  // Kaleciye konulan saha oyuncusu: felaket senaryosu
  // Gerçek dünyada bir MF/FW kaleye geçtiğinde takım fiilen 10 kişi oynar
  if (evalPos === 'G' && nativePos !== 'G') return -25;

  // Sahaya çıkan kaleci: GK→D/M/F — çok kötü ama yukarıdaki kadar değil
  if (nativePos === 'G' && evalPos !== 'G') return -20;

  if (distance === 1) return -3;   // D↔M veya M↔F: yakın mevki, ufak ceza
  if (distance === 2) return -8;   // D↔F: iki kademe, önemli ceza
  return -15;                       // Diğer uzak kombinasyonlar
}

/**
 * Dinamik oyuncu ratingi hesaplar.
 * 
 * @param {object} playerData - Oyuncu verisi (position, statistics, proposedMarketValue)
 * @param {string|null} overridePosition - Atanan mevki (Workshop'ta değiştirildiyse).
 *   null ise doğal mevki kullanılır.
 *   Verilmişse:
 *     1. İstatistik ağırlıkları bu mevkiye göre hesaplanır (organik değerlendirme)
 *     2. Doğal mevkiden farkı kadar rezidüel ceza uygulanır
 * @returns {number} 40-99 arası rating
 */
function calculateDynamicRating(playerData, overridePosition) {
  if (!playerData) return 55;
  
  const stats = playerData.statistics || playerData.seasonStats?.statistics || {};
  const mv = playerData.proposedMarketValue || 0;
  const nativePos = (playerData.position || '').toUpperCase()[0] || '';
  const matches = stats.appearances || 0;
  
  // Değerlendirme pozisyonu: override varsa onu kullan, yoksa doğal mevki
  const evalPos = overridePosition 
    ? overridePosition.toUpperCase()[0] || nativePos 
    : nativePos;
  
  // ═══════════════════════════════════════════════════════════════
  // 1. PERFORMANS PUANI (Mevki Bazlı İstatistik Analizi)
  // ═══════════════════════════════════════════════════════════════
  
  const apiRating = (stats.rating && stats.rating > 0) ? stats.rating : null;
  const { statScore, statWeight } = computePositionStatScore(evalPos, stats, matches);

  // ═══════════════════════════════════════════════════════════════
  // PUANLARI HARMANLAMA (API Rating + İstatistik Skoru)
  // ═══════════════════════════════════════════════════════════════
  
  let baseScore;
  
  if (apiRating && statWeight > 0) {
    const ratingBase = apiRating * 10;
    const normalizedStatScore = (statScore / Math.max(statWeight, 1)) * (statWeight > 3 ? 1.0 : 0.7);
    baseScore = ratingBase * 0.6 + (60 + normalizedStatScore) * 0.4;
  } 
  else if (apiRating) {
    baseScore = apiRating * 10;
  }
  else if (statWeight > 0) {
    const normalizedStatScore = (statScore / Math.max(statWeight, 1)) * (statWeight > 3 ? 1.0 : 0.7);
    baseScore = 60 + normalizedStatScore;
  }
  else {
    baseScore = 58;
  }

  // ═══════════════════════════════════════════════════════════════
  // 2. KALİTE KATSAYISI (Piyasa Değeri → Lig Zorluk Proxy)
  // ═══════════════════════════════════════════════════════════════
  let mvBonus = 0;
  if (mv > 0) {
    mvBonus = Math.min(15, Math.log10(mv / 1000000 + 1) * 7.5);
  }

  // ═══════════════════════════════════════════════════════════════
  // 3. TUTARLILIK BONUSU (Düzenli Oyun / Yedek Cezası)
  // ═══════════════════════════════════════════════════════════════
  let consistencyBonus = 0;
  if (matches > 25)      consistencyBonus = 3;
  else if (matches > 15) consistencyBonus = 2;
  else if (matches > 5)  consistencyBonus = 1;
  else if (matches === 0) consistencyBonus = -2;

  // ═══════════════════════════════════════════════════════════════
  // 4. MEVKİ DEĞİŞİKLİĞİ REZİDÜEL CEZASI
  // ═══════════════════════════════════════════════════════════════
  // İstatistikler zaten atanan mevkiye göre hesaplandığı için "organik ceza"
  // otomatik olarak uygulanmış olur. Rezidüel ceza ise ölçülemeyen taktik
  // faktörleri (pozisyonel zeka, alan refleksleri) temsil eder.
  const posDistance = overridePosition ? getPositionDistance(nativePos, evalPos) : 0;
  const residualPenalty = getResidualPenalty(posDistance, nativePos, evalPos);

  // ═══════════════════════════════════════════════════════════════
  // NİHAİ SKOR
  // ═══════════════════════════════════════════════════════════════
  const finalScore = baseScore + mvBonus + consistencyBonus + residualPenalty;
  return Math.min(99, Math.max(40, Math.round(finalScore)));
}

module.exports = { calculateDynamicRating };

