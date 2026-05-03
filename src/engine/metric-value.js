/**
 * metric-value.js
 * MetricValue wrapper — her metrik için güvenilirlik bilgisi taşır.
 *
 * MetricValue: { value, confidence, sampleSize, source }
 *   value:      hesaplanan sayı (null olabilir — veri yok demek)
 *   confidence: 0-1 arası güvenilirlik (sigmoid saturasyon)
 *   sampleSize: kaç maçtan/veriden hesaplandı
 *   source:     'incidents' | 'seasonStats' | 'standings' | 'derived' | 'peerAvg' | 'neutral'
 */

'use strict';

/**
 * MetricValue oluşturur.
 * @param {number|null} value - Hesaplanan değer
 * @param {object} opts
 * @param {number} opts.sampleSize - Kaç maç/veri noktası
 * @param {string} opts.source - Veri kaynağı
 * @param {number} [opts.requiredSample] - Tam güven için gereken örneklem (default: lig maç sayısının yarısı)
 * @returns {{ value: number|null, confidence: number, sampleSize: number, source: string }}
 */
function mv(value, { sampleSize = 0, source = 'derived', requiredSample = 15 } = {}) {
  if (value == null || !isFinite(value)) {
    return { value: null, confidence: 0, sampleSize, source };
  }
  // Sigmoid saturasyon: confidence = sampleSize / (sampleSize + requiredSample)
  // sampleSize=0 → 0, sampleSize=requiredSample → 0.5, sampleSize=3*req → 0.75
  const confidence = sampleSize > 0
    ? sampleSize / (sampleSize + requiredSample)
    : 0;
  return { value, confidence, sampleSize, source };
}

/**
 * MetricValue veya düz sayıdan değeri çıkarır.
 * Geriye dönük uyumluluk: düz sayı gelirse olduğu gibi döner.
 * @param {number|object|null} metric
 * @returns {number|null}
 */
function unwrap(metric) {
  if (metric == null) return null;
  if (typeof metric === 'number') return isFinite(metric) ? metric : null;
  if (typeof metric === 'object' && 'value' in metric) {
    const v = metric.value;
    return (v != null && isFinite(v)) ? v : null;
  }
  return null;
}

/**
 * MetricValue'dan confidence bilgisini çıkarır.
 * Düz sayı gelirse 1.0 (geriye uyumluluk — eski metrikler tam güvenilir varsayılır).
 * @param {number|object|null} metric
 * @returns {number} 0-1 arası
 */
function getConfidence(metric) {
  if (metric == null) return 0;
  if (typeof metric === 'number') return 1.0;
  if (typeof metric === 'object' && 'confidence' in metric) {
    return metric.confidence ?? 0;
  }
  return 1.0;
}

/**
 * MetricValue'dan source bilgisini çıkarır.
 * @param {number|object|null} metric
 * @returns {string}
 */
function getSource(metric) {
  if (metric == null) return 'none';
  if (typeof metric === 'number') return 'legacy';
  if (typeof metric === 'object' && 'source' in metric) {
    return metric.source ?? 'unknown';
  }
  return 'legacy';
}

/**
 * Dinamik requiredSample hesaplar.
 * Lig maç sayısı biliniyorsa yarısı, bilinmiyorsa 15 (güvenli default).
 * @param {object|null} leagueData - { leagueTeamCount, avgMatchesPlayed }
 * @returns {number}
 */
function computeRequiredSample(leagueData) {
  if (!leagueData) return 15;
  const teamCount = leagueData.leagueTeamCount;
  if (teamCount && teamCount > 2) {
    // Toplam lig maçları = (teamCount-1)*2, yarısı = requiredSample
    return Math.max(5, Math.round((teamCount - 1)));
  }
  return 15;
}

module.exports = { mv, unwrap, getConfidence, getSource, computeRequiredSample };
