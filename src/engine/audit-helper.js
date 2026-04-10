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
    criticalMissingMetrics: []
  };

  // 1. Detect Global Fallbacks
  const primaryReason = detectFallbackReason(data);
  if (primaryReason) {
    summary.globalFallbacks.push(primaryReason);
  }

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
    } else {
      summary.computedMetrics++;
    }
  }

  // Deduplicate
  summary.nullMetrics = [...new Set(summary.nullMetrics)].sort();
  summary.criticalMissingMetrics = [...new Set(summary.criticalMissingMetrics)].sort();

  return summary;
}

module.exports = { 
  getMetricAuditSummary,
  recordBaselineTrace,
  recordSimWarning,
  detectFallbackReason 
};
