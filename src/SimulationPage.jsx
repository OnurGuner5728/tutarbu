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
  'M109','M110','M111','M112','M113','M114','M115','M116','M117','M118','M118b',
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

function SimulationPage({ prediction, selectedMatch, modifiedLineup, onSimulationComplete }) {
  const [selectedMetrics, setSelectedMetrics] = useState(() => new Set(ALL_METRIC_IDS));
  const [simulation, setSimulation] = useState(null);
  const [engineData, setEngineData] = useState(null);
  const [multiRunResult, setMultiRunResult] = useState(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [runMode, setRunMode] = useState('single');
  const [runCount, setRunCount] = useState(1000);
  const [metricsData, setMetricsData] = useState({});
  const [error, setError] = useState(null);
  const [showAudit, setShowAudit] = useState(false);

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
        modifiedLineup: (modifiedLineup?.home || modifiedLineup?.away) ? modifiedLineup : undefined,
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
        setEngineData(null);
        onSimulationComplete?.('multi');
      } else {
        setSimulation(result);
        setMultiRunResult(null);
        // Pass engine data for client-side real-time simulation
        if (result.units) {
          setEngineData({
            homeUnits: result.units.home,
            awayUnits: result.units.away,
            lineups: result.lineups || null,
            weatherMult: result.weatherMult || {},
            probBases: result.probBases || null,
            leagueBaseline: result.leagueBaseline || {},
            dynamicTimeWindows: result.dynamicTimeWindows || null,
          });
        }
        onSimulationComplete?.('single');
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
          {/* Dynamic Engine Indicator & Audit Toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{
              background: 'rgba(0, 255, 136, 0.1)',
              border: '1px solid rgba(0, 255, 136, 0.3)',
              borderRadius: 20,
              padding: '4px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 0 10px rgba(0, 255, 136, 0.15)',
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#00ff88',
                boxShadow: '0 0 8px #00ff88',
                animation: 'pulseGlow 2s infinite'
              }} />
              <span style={{ fontSize: 9, fontWeight: 900, color: '#00ff88', textTransform: 'uppercase', letterSpacing: 0.5 }}>Dinamik Ortalama Motoru Aktif</span>
            </div>
            
            <button 
              onClick={() => setShowAudit(!showAudit)}
              style={{
                background: showAudit ? 'rgba(0, 242, 255, 0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${showAudit ? 'rgba(0, 242, 255, 0.4)' : 'var(--glass-border, rgba(255, 255, 255, 0.06))'}`,
                borderRadius: 20,
                padding: '4px 10px',
                color: showAudit ? 'var(--accent-cyan, #00f2ff)' : 'var(--text-secondary, #6b6b80)',
                fontSize: 9,
                fontWeight: 900,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                transition: 'all 0.2s',
              }}
            >
              {showAudit ? '✕ Kapat' : '📊 Veri Kaynakları'}
            </button>
          </div>

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
          <div data-tour="run-mode" style={styles.toggleGroup}>
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
              data-tour="multi-run-btn"
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
            <div data-tour="run-count-group" style={styles.runCountGroup}>
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
            data-tour="start-sim-btn"
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
        <div data-tour="metrics-selector" style={styles.leftPanel}>
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
        <div data-tour="sim-results" style={styles.rightPanel}>
          <SimulationViewer
            simulation={simulation}
            engineData={engineData}
            homeTeam={selectedMatch?.homeTeam}
            awayTeam={selectedMatch?.awayTeam}
            isMultiRun={runMode === 'multi' && !!multiRunResult}
            multiRunResult={multiRunResult}
            metadata={simulation?.metadata || prediction?.metadata}
            showAudit={showAudit}
            metricsData={metricsData}
          />
        </div>
      </div>

      {/* Info footer */}
      <div style={styles.footer}>
        <span style={styles.footerInfo}>
          &#8505; Secilmeyen metrikler o bloktan cikarilir; blok tum metriksiz kalirsa notr (1.0) deger kullanilir
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
    gap: 16,
    backgroundColor: 'var(--bg-dark, #06060b)',
    color: 'var(--text-primary, #eaeaf2)',
    fontFamily: 'var(--font-sans, "Outfit", sans-serif)',
    padding: 24,
    boxSizing: 'border-box',
    overflow: 'hidden',
    backgroundImage: `
      radial-gradient(ellipse 50% 50% at 10% 20%, rgba(0, 242, 255, 0.03), transparent),
      radial-gradient(ellipse 50% 50% at 90% 80%, rgba(188, 19, 254, 0.03), transparent)
    `,
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: 20,
    color: 'var(--text-secondary, #6b6b80)',
  },
  placeholderIcon: {
    fontSize: 64,
    opacity: 0.3,
    filter: 'drop-shadow(0 0 20px rgba(0, 242, 255, 0.2))',
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: 500,
    opacity: 0.6,
    letterSpacing: '0.04em',
  },

  /* Header */
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 20,
    background: 'var(--card-bg, rgba(16, 16, 24, 0.75))',
    backdropFilter: 'blur(20px)',
    border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.06))',
    borderRadius: 'var(--radius-lg, 16px)',
    padding: '20px 24px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: 800,
    color: 'var(--text-primary, #eaeaf2)',
    letterSpacing: '-0.02em',
  },
  matchTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: 'var(--accent-cyan, #00f2ff)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  matchSeparator: {
    color: 'var(--text-tertiary, #3e3e52)',
    fontWeight: 300,
  },
  tournament: {
    fontSize: 10,
    color: 'var(--text-secondary, #6b6b80)',
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    fontWeight: 700,
  },
  headerControls: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },

  /* Toggle group */
  toggleGroup: {
    display: 'flex',
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 'var(--radius-md, 12px)',
    padding: 4,
    border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.06))',
  },
  toggleBtn: {
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 600,
    background: 'transparent',
    color: 'var(--text-secondary, #6b6b80)',
    border: 'none',
    cursor: 'pointer',
    borderRadius: 'var(--radius-sm, 8px)',
    transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
  },
  toggleBtnActive: {
    background: 'rgba(0, 242, 255, 0.1)',
    color: 'var(--accent-cyan, #00f2ff)',
    boxShadow: '0 0 15px rgba(0, 242, 255, 0.15)',
  },

  /* Run count */
  runCountGroup: {
    display: 'flex',
    gap: 6,
    paddingLeft: 8,
    borderLeft: '1px solid var(--glass-border, rgba(255, 255, 255, 0.06))',
  },
  runCountBtn: {
    padding: '6px 12px',
    fontSize: 11,
    fontWeight: 700,
    background: 'rgba(255,255,255,0.02)',
    color: 'var(--text-secondary, #6b6b80)',
    border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.06))',
    borderRadius: 'var(--radius-sm, 8px)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
  },
  runCountBtnActive: {
    background: 'rgba(188, 19, 254, 0.1)',
    color: 'var(--accent-purple, #bc13fe)',
    borderColor: 'rgba(188, 19, 254, 0.3)',
    boxShadow: '0 0 15px rgba(188, 19, 254, 0.1)',
  },

  /* Start button */
  startBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 28px',
    fontSize: 14,
    fontWeight: 800,
    background: 'var(--gradient-cyan, linear-gradient(135deg, #00f2ff, #0088ff))',
    color: '#06060b',
    border: 'none',
    borderRadius: 'var(--radius-md, 12px)',
    cursor: 'pointer',
    animation: 'pulse-glow 3s infinite',
    transition: 'all 0.3s cubic-bezier(.4,0,.2,1)',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
  },
  startBtnDisabled: {
    background: 'var(--text-tertiary, #3e3e52)',
    color: 'var(--text-secondary, #6b6b80)',
    cursor: 'not-allowed',
    animation: 'none',
    boxShadow: 'none',
    opacity: 0.5,
  },
  spinner: {
    display: 'inline-block',
    width: 14,
    height: 14,
    border: '2px solid rgba(0,0,0,0.2)',
    borderTopColor: '#000',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },

  /* Metrics badge */
  metricsBadge: {
    fontSize: 12,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.06))',
    borderRadius: 'var(--radius-md, 12px)',
    padding: '10px 16px',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  metricsFull: {
    color: 'var(--accent-cyan, #00f2ff)',
    fontWeight: 800,
  },
  metricsPartial: {
    color: 'var(--accent-orange, #ff8c00)',
    fontWeight: 800,
  },
  metricsTotal: {
    color: 'var(--text-secondary, #6b6b80)',
    fontWeight: 500,
  },

  /* Error banner */
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    background: 'rgba(255, 61, 142, 0.08)',
    border: '1px solid rgba(255, 61, 142, 0.2)',
    borderRadius: 'var(--radius-md, 12px)',
    padding: '14px 20px',
    fontSize: 14,
    color: 'var(--accent-pink, #ff3d8e)',
    flexShrink: 0,
    animation: 'fadeIn 0.3s ease-out',
  },
  errorIcon: {
    fontSize: 18,
  },
  errorClose: {
    marginLeft: 'auto',
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    cursor: 'pointer',
    fontSize: 18,
    opacity: 0.6,
    transition: 'opacity 0.2s',
  },

  /* Main content */
  mainContent: {
    display: 'flex',
    gap: 16,
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
  },
  leftPanel: {
    width: '32%',
    flexShrink: 0,
    overflow: 'hidden',
    display: 'flex',
    minWidth: 360,
    minHeight: 0,
  },
  rightPanel: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
  },

  /* Loading state */
  loadingPanel: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: '100%',
    gap: 16,
    background: 'var(--card-bg, rgba(16, 16, 24, 0.75))',
    border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.06))',
    borderRadius: 'var(--radius-lg, 16px)',
  },
  loadingSpinner: {
    width: 32,
    height: 32,
    border: '3px solid rgba(0, 242, 255, 0.1)',
    borderTopColor: 'var(--accent-cyan, #00f2ff)',
    borderRadius: '50%',
    animation: 'spin 1s cubic-bezier(.4,0,.2,1) infinite',
    boxShadow: '0 0 15px rgba(0, 242, 255, 0.2)',
  },
  loadingText: {
    fontSize: 14,
    color: 'var(--text-secondary, #6b6b80)',
    fontWeight: 500,
    letterSpacing: '0.02em',
  },

  /* Footer */
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid var(--glass-border, rgba(255, 255, 255, 0.06))',
    borderRadius: 'var(--radius-md, 12px)',
    padding: '10px 20px',
    fontSize: 12,
    flexShrink: 0,
  },
  footerInfo: {
    color: 'var(--text-secondary, #6b6b80)',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  footerResult: {
    color: 'var(--accent-cyan, #00f2ff)',
    fontWeight: 700,
    background: 'rgba(0, 242, 255, 0.05)',
    padding: '4px 12px',
    borderRadius: 20,
    border: '1px solid rgba(0, 242, 255, 0.1)',
  },
};

export default SimulationPage;
