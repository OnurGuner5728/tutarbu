import React, { useState, useEffect, useMemo } from 'react';
import MetricsSelector from './MetricsSelector';
import SimulationViewer from './SimulationViewer';

const ALL_METRIC_IDS = new Set([
  'M001','M002','M003','M004','M005','M006','M007','M008','M009','M010',
  'M011','M012','M013','M014','M015','M016','M017','M018','M019','M020',
  'M021','M022','M023','M024','M025',
  'M026','M027','M028','M029','M030','M031','M032','M033','M034','M035',
  'M036','M037','M038','M039','M040','M041','M042','M043','M044','M045',
  'M046','M047','M048','M049','M050','M051','M052','M053','M054','M055',
  'M056','M057','M058','M059','M060','M061','M062','M063','M064','M065',
  'M066','M067','M068','M069','M070','M071','M072','M073','M074','M075',
  'M076','M077','M078','M079','M080','M081','M082','M083','M084','M085',
  'M086','M087','M088','M089','M090','M091','M092','M093','M094','M095',
  'M096','M097','M098','M099','M100','M101','M102','M103','M104','M105',
  'M106','M107','M108',
  'M109','M110','M111','M112','M113','M114','M115','M116','M117','M118',
  'M119','M120','M121','M122','M123','M124','M125','M126','M127','M128',
  'M129','M130',
  'M131','M132','M133','M134','M134b','M134c','M135','M136','M137','M138',
  'M139','M140','M141','M142','M143','M144','M145',
  'M146','M147','M148','M149','M150','M151','M152','M153','M154','M155',
  'M156','M157','M158','M159','M160','M161','M162','M163','M164','M165',
  'M166','M167','M168','M169',
]);

const RUN_COUNT_OPTIONS = [100, 500, 1000, 5000];

function getLastRunSummary(simulation, homeTeam, awayTeam) {
  if (!simulation) return null;
  const homeGoals = simulation.homeGoals ?? simulation.score?.home ?? null;
  const awayGoals = simulation.awayGoals ?? simulation.score?.away ?? null;
  if (homeGoals === null || awayGoals === null) return null;
  let outcome;
  if (homeGoals > awayGoals) outcome = 'Ev sahibi galibiyeti';
  else if (awayGoals > homeGoals) outcome = 'Deplasman galibiyeti';
  else outcome = 'Beraberlik';
  return `Son koşu: ${homeGoals}-${awayGoals} (${outcome})`;
}

function SimulationPage({ prediction, selectedMatch }) {
  const [selectedMetrics, setSelectedMetrics] = useState(() => new Set(ALL_METRIC_IDS));
  const [simulation, setSimulation] = useState(null);
  const [multiRunResult, setMultiRunResult] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [runMode, setRunMode] = useState('single');
  const [runCount, setRunCount] = useState(1000);
  const [metricsData, setMetricsData] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!prediction || !selectedMatch) return;
    fetch(`/api/metrics/${selectedMatch.id}`)
      .then(r => r.json())
      .then(data => {
        const h = data.home || {};
        const a = data.away || {};
        const ids = new Set([...Object.keys(h), ...Object.keys(a)]);
        const merged = {};
        for (const id of ids) {
          const base = h[id] || a[id];
          merged[id] = {
            ...base,
            value: h[id]?.value ?? a[id]?.value ?? null,
            homeValue: h[id]?.value ?? null,
            awayValue: a[id]?.value ?? null,
          };
        }
        setMetricsData(merged);
      })
      .catch(() => setError('Metrik verisi alınamadı'));
  }, [prediction, selectedMatch]);

  const handleToggle = (id) => {
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkToggle = (ids, enabled) => {
    setSelectedMetrics(prev => {
      const next = new Set(prev);
      ids.forEach(id => { if (enabled) next.add(id); else next.delete(id); });
      return next;
    });
  };

  const runSimulation = async () => {
    if (!selectedMatch) return;
    setIsSimulating(true);
    setError(null);
    try {
      const body = {
        selectedMetrics: Array.from(selectedMetrics),
        runs: runMode === 'multi' ? runCount : 1,
      };
      const res = await fetch(`/api/simulate/${selectedMatch.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      if (runMode === 'multi') {
        setMultiRunResult(result);
        setSimulation(result.sampleRun);
      } else {
        setSimulation(result);
        setMultiRunResult(null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setIsSimulating(false);
    }
  };

  const enabledCount = selectedMetrics.size;
  const totalCount = ALL_METRIC_IDS.size;
  const lastRunSummary = useMemo(
    () => getLastRunSummary(simulation, selectedMatch?.homeTeam, selectedMatch?.awayTeam),
    [simulation, selectedMatch]
  );

  if (!prediction || !selectedMatch) {
    return (
      <div style={styles.placeholder}>
        <div style={styles.placeholderIcon}>&#9917;</div>
        <div style={styles.placeholderText}>Simülasyon için bir mac secin.</div>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.title}>90 Dakika Simulasyonu</div>
          <div style={styles.matchTitle}>
            {selectedMatch.homeTeam}
            <span style={styles.matchSeparator}> — </span>
            {selectedMatch.awayTeam}
          </div>
          {selectedMatch.tournament && (
            <div style={styles.tournament}>{selectedMatch.tournament}</div>
          )}
        </div>

        <div style={styles.headerControls}>
          {/* Run mode toggle */}
          <div style={styles.toggleGroup}>
            <button
              style={{
                ...styles.toggleBtn,
                ...(runMode === 'single' ? styles.toggleBtnActive : {}),
              }}
              onClick={() => setRunMode('single')}
            >
              Tek Kosu
            </button>
            <button
              style={{
                ...styles.toggleBtn,
                ...(runMode === 'multi' ? styles.toggleBtnActive : {}),
              }}
              onClick={() => setRunMode('multi')}
            >
              Coklu Kosu
            </button>
          </div>

          {/* Run count selector (only in multi mode) */}
          {runMode === 'multi' && (
            <div style={styles.runCountGroup}>
              {RUN_COUNT_OPTIONS.map(n => (
                <button
                  key={n}
                  style={{
                    ...styles.runCountBtn,
                    ...(runCount === n ? styles.runCountBtnActive : {}),
                  }}
                  onClick={() => setRunCount(n)}
                >
                  {n.toLocaleString('tr-TR')}
                </button>
              ))}
            </div>
          )}

          {/* Start button */}
          <button
            style={{
              ...styles.startBtn,
              ...(isSimulating ? styles.startBtnDisabled : {}),
            }}
            onClick={runSimulation}
            disabled={isSimulating}
          >
            {isSimulating ? (
              <>
                <span style={styles.spinner}></span>
                Simulasyon calisiyor...
              </>
            ) : (
              <>&#9654; Simulasyonu Baslat</>
            )}
          </button>

          {/* Metrics count badge */}
          <div style={styles.metricsBadge}>
            <span style={enabledCount === totalCount ? styles.metricsFull : styles.metricsPartial}>
              {enabledCount}
            </span>
            <span style={styles.metricsTotal}> / {totalCount} metrik etkin</span>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div style={styles.errorBanner}>
          <span style={styles.errorIcon}>&#9888;</span>
          {error}
          <button style={styles.errorClose} onClick={() => setError(null)}>&#10005;</button>
        </div>
      )}

      {/* Main content */}
      <div style={styles.mainContent}>
        {/* Left: Metrics selector */}
        <div style={styles.leftPanel}>
          {Object.keys(metricsData).length > 0 ? (
            <MetricsSelector
              metricsData={metricsData}
              selectedMetrics={selectedMetrics}
              onToggle={handleToggle}
              onBulkToggle={handleBulkToggle}
            />
          ) : (
            <div style={styles.loadingPanel}>
              <div style={styles.loadingSpinner}></div>
              <div style={styles.loadingText}>Metrik verileri yukleniyor...</div>
            </div>
          )}
        </div>

        {/* Right: Simulation viewer */}
        <div style={styles.rightPanel}>
          <SimulationViewer
            simulation={simulation}
            homeTeam={selectedMatch?.homeTeam}
            awayTeam={selectedMatch?.awayTeam}
            isMultiRun={runMode === 'multi' && !!multiRunResult}
            multiRunResult={multiRunResult}
          />
        </div>
      </div>

      {/* Info footer */}
      <div style={styles.footer}>
        <span style={styles.footerInfo}>
          &#8505; Secilmeyen metrikler icin lig ortalamasi kullanilir
        </span>
        {lastRunSummary && (
          <span style={styles.footerResult}>{lastRunSummary}</span>
        )}
      </div>

      <style>{spinnerKeyframes}</style>
    </div>
  );
}

const spinnerKeyframes = `
@keyframes spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes pulse-glow {
  0%, 100% { box-shadow: 0 0 8px 2px rgba(0, 212, 255, 0.5); }
  50%       { box-shadow: 0 0 18px 6px rgba(0, 212, 255, 0.85); }
}
`;

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    gap: 12,
    backgroundColor: 'var(--bg-primary, #0d1117)',
    color: 'var(--text-primary, #e6edf3)',
    fontFamily: 'var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)',
    padding: 16,
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 16,
    backgroundColor: 'var(--bg-primary, #0d1117)',
    color: 'var(--text-muted, #8b949e)',
  },
  placeholderIcon: {
    fontSize: 48,
    opacity: 0.4,
  },
  placeholderText: {
    fontSize: 16,
    opacity: 0.6,
    letterSpacing: '0.02em',
  },

  /* Header */
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    backgroundColor: 'var(--bg-secondary, #161b22)',
    border: '1px solid var(--border-color, #30363d)',
    borderRadius: 8,
    padding: '14px 18px',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--text-primary, #e6edf3)',
    letterSpacing: '0.01em',
  },
  matchTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--accent-cyan, #00d4ff)',
  },
  matchSeparator: {
    color: 'var(--text-muted, #8b949e)',
    margin: '0 4px',
  },
  tournament: {
    fontSize: 11,
    color: 'var(--text-muted, #8b949e)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  headerControls: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },

  /* Toggle group */
  toggleGroup: {
    display: 'flex',
    border: '1px solid var(--border-color, #30363d)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  toggleBtn: {
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 500,
    background: 'transparent',
    color: 'var(--text-muted, #8b949e)',
    border: 'none',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
  },
  toggleBtnActive: {
    background: 'var(--accent-cyan, #00d4ff)',
    color: '#0d1117',
    fontWeight: 700,
  },

  /* Run count */
  runCountGroup: {
    display: 'flex',
    gap: 4,
  },
  runCountBtn: {
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 500,
    background: 'var(--bg-tertiary, #1c2128)',
    color: 'var(--text-muted, #8b949e)',
    border: '1px solid var(--border-color, #30363d)',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
  },
  runCountBtnActive: {
    background: 'rgba(0, 212, 255, 0.15)',
    color: 'var(--accent-cyan, #00d4ff)',
    borderColor: 'var(--accent-cyan, #00d4ff)',
    fontWeight: 700,
  },

  /* Start button */
  startBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 20px',
    fontSize: 13,
    fontWeight: 700,
    background: 'var(--accent-cyan, #00d4ff)',
    color: '#0d1117',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    animation: 'pulse-glow 2.5s ease-in-out infinite',
    transition: 'opacity 0.2s, transform 0.1s',
    letterSpacing: '0.03em',
  },
  startBtnDisabled: {
    opacity: 0.65,
    cursor: 'not-allowed',
    animation: 'none',
    background: 'var(--text-muted, #8b949e)',
  },
  spinner: {
    display: 'inline-block',
    width: 13,
    height: 13,
    border: '2px solid rgba(13,17,23,0.4)',
    borderTopColor: '#0d1117',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
    flexShrink: 0,
  },

  /* Metrics badge */
  metricsBadge: {
    fontSize: 12,
    backgroundColor: 'var(--bg-tertiary, #1c2128)',
    border: '1px solid var(--border-color, #30363d)',
    borderRadius: 4,
    padding: '4px 10px',
    whiteSpace: 'nowrap',
  },
  metricsFull: {
    color: 'var(--accent-cyan, #00d4ff)',
    fontWeight: 700,
  },
  metricsPartial: {
    color: '#f0a050',
    fontWeight: 700,
  },
  metricsTotal: {
    color: 'var(--text-muted, #8b949e)',
  },

  /* Error banner */
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(248, 81, 73, 0.12)',
    border: '1px solid rgba(248, 81, 73, 0.4)',
    borderRadius: 6,
    padding: '10px 14px',
    fontSize: 13,
    color: '#f85149',
    flexShrink: 0,
  },
  errorIcon: {
    fontSize: 16,
    flexShrink: 0,
  },
  errorClose: {
    marginLeft: 'auto',
    background: 'transparent',
    border: 'none',
    color: '#f85149',
    cursor: 'pointer',
    fontSize: 14,
    padding: '0 4px',
    lineHeight: 1,
    opacity: 0.7,
    flexShrink: 0,
  },

  /* Main content */
  mainContent: {
    display: 'flex',
    gap: 12,
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
  },
  leftPanel: {
    width: '38%',
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  rightPanel: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },

  /* Loading state for metrics */
  loadingPanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 14,
    backgroundColor: 'var(--bg-secondary, #161b22)',
    border: '1px solid var(--border-color, #30363d)',
    borderRadius: 8,
    color: 'var(--text-muted, #8b949e)',
  },
  loadingSpinner: {
    width: 28,
    height: 28,
    border: '3px solid rgba(0, 212, 255, 0.2)',
    borderTopColor: 'var(--accent-cyan, #00d4ff)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: {
    fontSize: 13,
    opacity: 0.7,
  },

  /* Footer */
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
    backgroundColor: 'var(--bg-secondary, #161b22)',
    border: '1px solid var(--border-color, #30363d)',
    borderRadius: 6,
    padding: '8px 14px',
    fontSize: 11,
    flexShrink: 0,
  },
  footerInfo: {
    color: 'var(--text-muted, #8b949e)',
    opacity: 0.8,
  },
  footerResult: {
    color: 'var(--accent-cyan, #00d4ff)',
    fontWeight: 600,
    letterSpacing: '0.02em',
  },
};

export default SimulationPage;
