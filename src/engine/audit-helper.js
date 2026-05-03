/**
 * Audit Helper
 * Analyzes calculated metrics for completeness and fallback usage.
 */

'use strict';

const { METRIC_METADATA } = require('./metric-metadata');

/**
 * Detects the specific reason why a match is in a fallback state.
 * @param {object} data - Raw match data
 * @returns {string} Fallback reason code or null
 */
function detectFallbackReason(data) {
  if (data.lineups?.isFallback) return 'lineup_fallback';
  if (!data.weatherMetrics) return 'weather_missing';
  return null;
}

/**
 * Specifically for simulation engine to record dynamic baseline usage
 */
function recordBaselineTrace(summary, message) {
  if (summary && summary.baselineTraces) {
    summary.baselineTraces.push(message);
  }
}

/**
 * Specifically for simulation engine to record missing units or critical data gaps
 */
function recordSimWarning(summary, warning) {
  if (summary && summary.simWarnings) {
    summary.simWarnings.push(warning);
  }
}

/**
 * Analyzes metrics and data to generate an audit report.
 * @param {object} data - Raw match data
 * @param {object} metrics - Calculated metrics object
 * @returns {object} Audit summary report
 */
function getMetricAuditSummary(data, metrics) {
  const summary = {
    totalMetrics: 0,
    computedMetrics: 0,
    nullCount: 0,
    criticalMissingCount: 0,
    globalFallbacks: [],
    baselineTraces: [],
    simWarnings: [],
    nullMetrics: [],
    criticalMissingMetrics: [],
    missingCategories: {
      lineup: 0,
      incident: 0,
      shotmap: 0,
      stats: 0,
      other: 0
    },
    isHighRisk: false,
    fallbackThresholdsTriggered: 0
  };

  // 1. Detect Global Fallbacks
  const primaryReason = detectFallbackReason(data);
  if (primaryReason) {
    summary.globalFallbacks.push(primaryReason);
  }

  // Initial detection of missing core API responses
  if (!data.lineups || data.lineups.isFallback) summary.missingCategories.lineup++;
  if (!data.homeRecentMatchDetails?.some(m => m.incidents)) summary.missingCategories.incident++;
  if (!data.homeRecentMatchDetails?.some(m => m.shotmap)) summary.missingCategories.shotmap++;
  if (!data.homeRecentMatchDetails?.some(m => m.stats)) summary.missingCategories.stats++;

  // 2. Flatten all sided and shared metrics for analysis
  const flat = {};
  const processGroup = (group) => {
    if (!group || typeof group !== 'object') return;
    for (const [id, val] of Object.entries(group)) {
      if (/^M\d{3}[a-z]?$/i.test(id)) {
        flat[id] = val;
      }
    }
  };

  // Traverse metrics structure
  if (metrics.home) Object.values(metrics.home).forEach(processGroup);
  if (metrics.away) Object.values(metrics.away).forEach(processGroup);
  if (metrics.shared) Object.values(metrics.shared).forEach(processGroup);

  // 3. Analyze Completeness
  for (const [id, value] of Object.entries(flat)) {
    summary.totalMetrics++;
    const meta = METRIC_METADATA[id];
    
    if (value === null) {
      summary.nullCount++;
      summary.nullMetrics.push(id);
      if (meta?.weight === 'critical') {
        summary.criticalMissingCount++;
        summary.criticalMissingMetrics.push(id);
      }
      
      // Categorize missing metric logically
      if (['M015', 'M016', 'M033'].includes(id)) summary.missingCategories.shotmap++;
      else if (['M003', 'M005', 'M039', 'M040'].includes(id)) summary.missingCategories.incident++;
      else if (['M066', 'M067'].includes(id)) summary.missingCategories.lineup++;
      else if (['M013', 'M014', 'M025', 'M034', 'M035', 'M150', 'M152'].includes(id)) summary.missingCategories.stats++;
      else summary.missingCategories.other++;
    } else {
      summary.computedMetrics++;
    }
  }

  // Deduplicate
  summary.nullMetrics = [...new Set(summary.nullMetrics)].sort();
  summary.criticalMissingMetrics = [...new Set(summary.criticalMissingMetrics)].sort();

  // 4. Calculate Risk Factor
  if (summary.globalFallbacks.length > 0) summary.fallbackThresholdsTriggered++;
  if (summary.criticalMissingCount > 5) summary.fallbackThresholdsTriggered++;
  if (summary.nullCount > 20) summary.fallbackThresholdsTriggered++;
  if (summary.missingCategories.shotmap > 0 && summary.missingCategories.stats > 0) summary.fallbackThresholdsTriggered++;

  if (summary.fallbackThresholdsTriggered >= 2) {
    summary.isHighRisk = true;
    summary.simWarnings.push("HIGH RISK: Multiple fallback thresholds triggered due to poor API coverage.");
  }

  return summary;
}

/**
 * Her metrik için hangi fallback seviyesinden geldiğini kaydeder.
 * @param {object} audit - Audit summary objesi
 * @param {string} metricId - Metrik ID'si (ör: 'M001')
 * @param {string} source - 'primary' | 'standings' | 'peerAvg' | 'neutral'
 * @param {number} confidence - 0-1 arası güvenilirlik
 */
function recordMetricSource(audit, metricId, source, confidence) {
  if (!audit) return;
  if (!audit.metricSources) audit.metricSources = {};
  audit.metricSources[metricId] = { source, confidence };
}

/**
 * Veri kalitesi özeti üretir — kaç metrik primary, kaç tanesi fallback.
 * @param {object} audit - Audit summary objesi
 * @returns {{ primary: number, standings: number, peerAvg: number, neutral: number, reliability: number }}
 */
function getDataQualitySummary(audit) {
  const sources = audit?.metricSources || {};
  const counts = { primary: 0, standings: 0, peerAvg: 0, neutral: 0 };
  for (const m of Object.values(sources)) {
    const src = m.source || 'neutral';
    if (counts[src] !== undefined) counts[src]++;
    else counts.neutral++;
  }
  const total = Object.keys(sources).length;
  return {
    ...counts,
    reliability: total > 0 ? counts.primary / total : 0,
  };
}

module.exports = {
  getMetricAuditSummary,
  recordBaselineTrace,
  recordSimWarning,
  detectFallbackReason,
  recordMetricSource,
  getDataQualitySummary
};
