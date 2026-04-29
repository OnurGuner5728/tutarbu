/**
 * player-rating.js (Frontend ESM Version)
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

  if (evalPos === 'F') {
    if (goals > 0) { statScore += Math.min(30, (goals / matches) * 35); statWeight++; }
    if (xG > 0) { statScore += Math.min(15, (xG / matches) * 20); statWeight++; }
    if (shots > 0) { statScore += Math.min(10, (goals / shots) * 35); statWeight++; }
    if (assists > 0) { statScore += Math.min(10, (assists / matches) * 15); statWeight++; }
    if (dribPct > 0) { statScore += Math.min(5, dribPct / 15); statWeight++; }
    if (aerialPct > 0) { statScore += Math.min(5, aerialPct / 15); statWeight++; }
  }
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
  else if (evalPos === 'D') {
    if (tackles > 0) { statScore += Math.min(15, (tackles / matches) * 6); statWeight++; }
    if (intercept > 0) { statScore += Math.min(15, (intercept / matches) * 8); statWeight++; }
    if (clearance > 0) { statScore += Math.min(10, (clearance / matches) * 3); statWeight++; }
    if (aerialPct > 0) { statScore += Math.min(10, aerialPct / 8); statWeight++; }
    if (cleanSh > 0) { statScore += Math.min(10, (cleanSh / matches) * 20); statWeight++; }
    if (passAcc > 0) { statScore += Math.min(8, (passAcc - 75) / 2); statWeight++; }
    if (gpa > 0) { statScore += Math.min(7, gpa * 25); statWeight++; }
  }
  else if (evalPos === 'G') {
    if (savesPct > 0) { statScore += Math.min(25, (savesPct - 60) / 1.2); statWeight++; }
    if (saves > 0) { statScore += Math.min(15, (saves / matches) * 5); statWeight++; }
    if (cleanSh > 0) { statScore += Math.min(20, (cleanSh / matches) * 45); statWeight++; }
    if (aerialPct > 0) { statScore += Math.min(5, aerialPct / 15); statWeight++; }
  }
  else {
    if (gpa > 0) { statScore += Math.min(20, gpa * 25); statWeight++; }
    if (passAcc > 0) { statScore += Math.min(10, (passAcc - 70) / 2); statWeight++; }
  }

  if (minsPerM > 75) statScore += 3;
  else if (minsPerM > 45) statScore += 1;

  return { statScore, statWeight };
}

function getPositionDistance(posA, posB) {
  if (!posA || !posB) return 0;
  const map = { 'G': 0, 'D': 1, 'M': 2, 'F': 3 };
  const idxA = map[posA[0]?.toUpperCase()];
  const idxB = map[posB[0]?.toUpperCase()];
  if (idxA === undefined || idxB === undefined) return 0;
  return Math.abs(idxA - idxB);
}

function getResidualPenalty(distance) {
  if (distance === 0) return 0;
  if (distance === 1) return -3;
  if (distance === 2) return -8;
  return -15;
}

export function calculateDynamicRating(playerData, overridePosition) {
  if (!playerData) return 55;
  
  const stats = playerData.statistics || playerData.seasonStats?.statistics || {};
  const mv = playerData.proposedMarketValue || 0;
  const nativePos = (playerData.position || '').toUpperCase()[0] || '';
  const matches = stats.appearances || 0;
  
  const evalPos = overridePosition 
    ? overridePosition.toUpperCase()[0] || nativePos 
    : nativePos;
  
  // 1. PERFORMANS PUANI
  const apiRating = (stats.rating && stats.rating > 0) ? stats.rating : null;
  const { statScore, statWeight } = computePositionStatScore(evalPos, stats, matches);

  // HARMANLAMA
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

  // 2. KALİTE KATSAYISI
  let mvBonus = 0;
  if (mv > 0) {
    mvBonus = Math.min(15, Math.log10(mv / 1000000 + 1) * 7.5);
  }

  // 3. TUTARLILIK BONUSU
  let consistencyBonus = 0;
  if (matches > 25)      consistencyBonus = 3;
  else if (matches > 15) consistencyBonus = 2;
  else if (matches > 5)  consistencyBonus = 1;
  else if (matches === 0) consistencyBonus = -2;

  // 4. MEVKİ DEĞİŞİKLİĞİ REZİDÜEL CEZASI
  const posDistance = overridePosition ? getPositionDistance(nativePos, evalPos) : 0;
  const residualPenalty = getResidualPenalty(posDistance);

  // NİHAİ SKOR
  const finalScore = baseScore + mvBonus + consistencyBonus + residualPenalty;
  return Math.min(99, Math.max(40, Math.round(finalScore)));
}
