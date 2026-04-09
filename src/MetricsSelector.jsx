import React, { useState, useMemo } from 'react';

const CATEGORY_COLORS = {
  attack: '#ff6b6b',
  defense: '#4ecdc4',
  form: '#45b7d1',
  player: '#96ceb4',
  goalkeeper: '#ffeaa7',
  referee: '#dda0dd',
  h2h: '#f7dc6f',
  contextual: '#a29bfe',
  momentum: '#fd79a8',
  derived: '#81ecec',
};

const CATEGORY_LABELS = {
  attack: 'Hücum',
  defense: 'Defans',
  form: 'Form',
  player: 'Oyuncu',
  goalkeeper: 'Kaleci',
  referee: 'Hakem',
  h2h: 'H2H',
  contextual: 'Bağlam',
  momentum: 'Momentum',
  derived: 'Bileşik',
};

const CATEGORY_ICONS = {
  attack: '⚔',
  defense: '🛡',
  form: '📈',
  player: '👤',
  goalkeeper: '🧤',
  referee: '🟨',
  h2h: '⚡',
  contextual: '🌐',
  momentum: '🔥',
  derived: '🔬',
};

const WEIGHT_COLORS = {
  critical: '#ff4757',
  high: '#ffa502',
  medium: '#eccc68',
  low: '#a4b0be',
};

const SIMULATION_ROLES = {
  attack: ['gol_oranı', 'şut_hızı'],
  defense: ['gol_yeme_oranı', 'defans_skoru'],
  form: ['form_çarpanı', 'momentum'],
  player: ['oyuncu_skoru', 'katkı'],
  goalkeeper: ['kurtarış_oranı', 'kaleci_skoru'],
  referee: ['kart_oranı', 'penaltı_olasılığı'],
  h2h: ['h2h_ağırlığı', 'tarihsel_çarpan'],
  contextual: ['bağlam_düzeltmesi', 'ev_avantajı'],
  momentum: ['momentum_skoru', 'ivme'],
  derived: ['bileşik_skor', 'ağırlıklı_oran'],
};

function formatValue(value, unit) {
  if (value === null || value === undefined) return null;
  if (unit === 'percent') return `${Number(value).toFixed(1)}%`;
  if (unit === 'count') return Number(value).toFixed(1);
  if (unit === 'ratio') return Number(value).toFixed(2);
  if (unit === 'score') return Number(value).toFixed(1);
  return Number(value).toFixed(2);
}

function ValueBar({ value, leagueAvg, color }) {
  if (value === null || value === undefined || !leagueAvg) {
    return (
      <div style={{ width: 150, height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 5 }} />
    );
  }
  const ratio = value / leagueAvg;
  const fillPct = Math.min(Math.max(ratio / 2, 0), 1) * 100;
  let fillColor = color;
  if (ratio < 0.7) fillColor = '#ff4757';
  else if (ratio > 1.3) fillColor = '#2ed573';

  return (
    <div style={{ width: 150, height: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
      <div
        style={{
          width: `${fillPct}%`,
          height: '100%',
          background: fillColor,
          borderRadius: 5,
          transition: 'width 0.3s ease',
        }}
      />
      {/* League avg marker at 50% (= leagueAvg/leagueAvg/2 * 100) */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        width: 2,
        height: '100%',
        background: 'rgba(255,255,255,0.3)',
        transform: 'translateX(-50%)',
      }} />
    </div>
  );
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      onClick={onChange}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: 48,
        height: 26,
        borderRadius: 13,
        border: 'none',
        cursor: 'pointer',
        background: checked ? '#00d4ff' : 'rgba(255,255,255,0.12)',
        transition: 'background 0.2s ease',
        flexShrink: 0,
        outline: 'none',
        padding: 0,
      }}
      title={checked ? 'Devre dışı bırak' : 'Etkinleştir'}
    >
      <span
        style={{
          position: 'absolute',
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          top: 3,
          left: checked ? 25 : 3,
          transition: 'left 0.2s ease',
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}
      />
    </button>
  );
}

function MetricCard({ metric, isSelected, onToggle, categoryColor }) {
  const formattedValue = formatValue(metric.value, metric.unit);
  const formattedLeagueAvg = formatValue(metric.leagueAvg, metric.unit);
  const weightColor = WEIGHT_COLORS[metric.weight] || WEIGHT_COLORS.low;
  const roles = SIMULATION_ROLES[metric.category] || [];

  return (
    <div
      style={{
        background: isSelected
          ? 'rgba(255,255,255,0.04)'
          : 'rgba(255,255,255,0.015)',
        border: `1px solid ${isSelected ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
        borderLeft: `3px solid ${isSelected ? categoryColor : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 10,
        padding: '12px 14px',
        marginBottom: 8,
        opacity: isSelected ? 1 : 0.55,
        transition: 'opacity 0.2s, border-color 0.2s, background 0.2s',
        cursor: 'default',
      }}
    >
      {/* Row 1: dot + ID + name + toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        {/* Weight dot */}
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: weightColor,
            flexShrink: 0,
            boxShadow: `0 0 6px ${weightColor}`,
          }}
          title={`Ağırlık: ${metric.weight}`}
        />
        {/* ID badge */}
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            color: '#8899aa',
            background: 'rgba(255,255,255,0.07)',
            padding: '1px 6px',
            borderRadius: 4,
            flexShrink: 0,
          }}
        >
          {metric.id}
        </span>
        {/* Metric name */}
        <span
          style={{
            flex: 1,
            color: isSelected ? '#e2e8f0' : '#8899aa',
            fontSize: 13,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={metric.name}
        >
          {metric.name}
        </span>
        {/* Toggle */}
        <ToggleSwitch checked={isSelected} onChange={() => onToggle(metric.id)} />
      </div>

      {/* Row 2: description */}
      {metric.description && (
        <div
          style={{
            fontSize: 11,
            color: '#6677aa',
            marginBottom: 8,
            paddingLeft: 20,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={metric.description}
        >
          {metric.description}
        </div>
      )}

      {/* Row 3: value bar + stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 20, flexWrap: 'wrap' }}>
        {/* Value bar */}
        <ValueBar value={metric.value} leagueAvg={metric.leagueAvg} color={categoryColor} />

        {/* Value: shared metrics show single value; per-team metrics show Ev/Dep */}
        <span style={{ fontSize: 12, fontWeight: 700, display: 'flex', gap: 8 }}>
          {metric.homeValue != null && metric.homeValue === metric.awayValue ? (
            <span style={{ color: isSelected ? '#e2e8f0' : '#8899aa' }}>
              {formatValue(metric.homeValue, metric.unit)}
            </span>
          ) : (
            <>
              {metric.homeValue != null ? (
                <span>
                  <span style={{ color: '#8899aa', fontWeight: 400 }}>Ev: </span>
                  <span style={{ color: isSelected ? '#e2e8f0' : '#8899aa' }}>{formatValue(metric.homeValue, metric.unit)}</span>
                </span>
              ) : null}
              {metric.awayValue != null ? (
                <span>
                  <span style={{ color: '#8899aa', fontWeight: 400 }}>Dep: </span>
                  <span style={{ color: isSelected ? '#a0c4ff' : '#8899aa' }}>{formatValue(metric.awayValue, metric.unit)}</span>
                </span>
              ) : null}
              {metric.homeValue == null && metric.awayValue == null && (
                <span style={{ color: '#f0a500', fontStyle: 'italic' }}>Veri yok</span>
              )}
            </>
          )}
        </span>

        {/* League avg */}
        {formattedLeagueAvg !== null && (
          <span style={{ fontSize: 11, color: '#8899aa' }}>
            Lig Ort.: <span style={{ color: '#aabbcc' }}>{formattedLeagueAvg}</span>
          </span>
        )}

        {/* Weight pill */}
        <span
          style={{
            fontSize: 10,
            padding: '1px 7px',
            borderRadius: 10,
            background: `${weightColor}22`,
            color: weightColor,
            border: `1px solid ${weightColor}44`,
            flexShrink: 0,
          }}
        >
          {metric.weight || 'low'}
        </span>

        {/* Disabled notice */}
        {!isSelected && (
          <span style={{ fontSize: 10, color: '#556688', fontStyle: 'italic', marginLeft: 'auto' }}>
            Lig Ort. kullanılıyor
          </span>
        )}
      </div>

      {/* Row 4: simulation role pills */}
      {roles.length > 0 && (
        <div style={{ display: 'flex', gap: 5, marginTop: 8, paddingLeft: 20, flexWrap: 'wrap' }}>
          {roles.map((role) => (
            <span
              key={role}
              style={{
                fontSize: 10,
                padding: '1px 7px',
                borderRadius: 10,
                background: 'rgba(124,58,237,0.18)',
                color: '#a78bfa',
                border: '1px solid rgba(124,58,237,0.3)',
              }}
            >
              {role}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MetricsSelector({ metricsData, selectedMetrics, onToggle, onBulkToggle }) {
  const [activeCategory, setActiveCategory] = useState('attack');
  const [search, setSearch] = useState('');

  const categories = [
    'attack', 'defense', 'form', 'player', 'goalkeeper',
    'referee', 'h2h', 'contextual', 'momentum', 'derived',
  ];

  // Attach id to each metric entry and group by category
  const grouped = useMemo(() => {
    const groups = {};
    categories.forEach((c) => { groups[c] = []; });
    if (!metricsData) return groups;
    Object.entries(metricsData).forEach(([id, metric]) => {
      const cat = metric.category;
      if (cat && groups[cat]) {
        groups[cat].push({ ...metric, id });
      }
    });
    return groups;
  }, [metricsData]);

  // Filtered metrics for current view
  const visibleMetrics = useMemo(() => {
    if (search.trim()) {
      const q = search.toLowerCase();
      return Object.entries(metricsData || {})
        .filter(([id, m]) =>
          m.name?.toLowerCase().includes(q) || id.toLowerCase().includes(q)
        )
        .map(([id, m]) => ({ ...m, id }));
    }
    return grouped[activeCategory] || [];
  }, [search, activeCategory, grouped, metricsData]);

  // Total counts
  const totalCount = Object.keys(metricsData || {}).length;
  const totalEnabled = selectedMetrics ? selectedMetrics.size : 0;

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts = {};
    categories.forEach((c) => {
      const metrics = grouped[c] || [];
      const enabled = metrics.filter((m) => selectedMetrics && selectedMetrics.has(m.id)).length;
      counts[c] = { total: metrics.length, enabled };
    });
    return counts;
  }, [grouped, selectedMetrics]);

  // Active category metrics info
  const activeCategoryMetrics = grouped[activeCategory] || [];
  const activeCategoryIds = activeCategoryMetrics.map((m) => m.id);
  const activeCategoryEnabled = activeCategoryMetrics.filter(
    (m) => selectedMetrics && selectedMetrics.has(m.id)
  ).length;

  const allIds = Object.keys(metricsData || {});

  const styles = {
    container: {
      background: 'var(--glass-bg, rgba(15,20,40,0.95))',
      border: '1px solid var(--glass-border, rgba(160,196,255,0.12))',
      borderRadius: 12,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      color: '#e2e8f0',
    },
    header: {
      padding: '14px 16px 10px',
      borderBottom: '1px solid rgba(160,196,255,0.08)',
      flexShrink: 0,
    },
    headerTop: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
      gap: 12,
    },
    title: {
      fontSize: 15,
      fontWeight: 700,
      color: '#e2e8f0',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    },
    badge: {
      fontSize: 11,
      padding: '2px 8px',
      borderRadius: 10,
      background: 'rgba(0,212,255,0.15)',
      color: '#00d4ff',
      border: '1px solid rgba(0,212,255,0.25)',
      fontWeight: 700,
    },
    globalBtns: {
      display: 'flex',
      gap: 8,
      alignItems: 'center',
    },
    btnPrimary: {
      fontSize: 11,
      padding: '5px 11px',
      borderRadius: 7,
      border: '1px solid rgba(0,212,255,0.35)',
      background: 'rgba(0,212,255,0.1)',
      color: '#00d4ff',
      cursor: 'pointer',
      fontWeight: 600,
      transition: 'background 0.15s',
    },
    btnSecondary: {
      fontSize: 11,
      padding: '5px 11px',
      borderRadius: 7,
      border: '1px solid rgba(255,100,100,0.3)',
      background: 'rgba(255,100,100,0.08)',
      color: '#ff8080',
      cursor: 'pointer',
      fontWeight: 600,
      transition: 'background 0.15s',
    },
    searchBox: {
      width: '100%',
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(160,196,255,0.15)',
      borderRadius: 8,
      padding: '8px 12px',
      color: '#e2e8f0',
      fontSize: 13,
      outline: 'none',
      boxSizing: 'border-box',
    },
    tabsContainer: {
      display: 'flex',
      overflowX: 'auto',
      gap: 4,
      padding: '10px 16px 0',
      flexShrink: 0,
      scrollbarWidth: 'none',
    },
    categoryHeader: {
      padding: '10px 16px',
      borderBottom: '1px solid rgba(160,196,255,0.08)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexShrink: 0,
    },
    metricsList: {
      flex: 1,
      overflowY: 'auto',
      padding: '12px 16px',
      scrollbarWidth: 'thin',
      scrollbarColor: 'rgba(160,196,255,0.15) transparent',
    },
    emptyState: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: 200,
      color: '#556688',
      gap: 8,
    },
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTop}>
          <div style={styles.title}>
            <span>Metrik Seçici</span>
            <span style={styles.badge}>{totalEnabled}/{totalCount}</span>
          </div>
          <div style={styles.globalBtns}>
            <button
              style={styles.btnPrimary}
              onClick={() => onBulkToggle && onBulkToggle(allIds, true)}
            >
              ✓ Tümünü Seç
            </button>
            <button
              style={styles.btnSecondary}
              onClick={() => onBulkToggle && onBulkToggle(allIds, false)}
            >
              ✕ Tümünü Kaldır
            </button>
          </div>
        </div>

        {/* Search */}
        <input
          style={styles.searchBox}
          type="text"
          placeholder="Metrik adı veya ID ile ara... (örn: M001, gol)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Category Tabs */}
      {!search.trim() && (
        <div style={styles.tabsContainer}>
          {categories.map((cat) => {
            const color = CATEGORY_COLORS[cat];
            const isActive = activeCategory === cat;
            const { total, enabled } = categoryCounts[cat] || { total: 0, enabled: 0 };

            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  flexShrink: 0,
                  padding: '7px 13px',
                  borderRadius: '8px 8px 0 0',
                  border: `1px solid ${isActive ? color + '55' : 'rgba(255,255,255,0.07)'}`,
                  borderBottom: isActive ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.07)',
                  background: isActive ? `${color}18` : 'rgba(255,255,255,0.02)',
                  color: isActive ? color : '#8899aa',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 400,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  transition: 'all 0.15s',
                  marginBottom: -1,
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ fontSize: 14 }}>{CATEGORY_ICONS[cat]}</span>
                <span>{CATEGORY_LABELS[cat]}</span>
                <span
                  style={{
                    fontSize: 10,
                    padding: '1px 5px',
                    borderRadius: 8,
                    background: isActive ? `${color}30` : 'rgba(255,255,255,0.06)',
                    color: isActive ? color : '#667788',
                    fontWeight: 700,
                  }}
                >
                  {enabled}/{total}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Category header (only when not searching) */}
      {!search.trim() && (
        <div style={styles.categoryHeader}>
          {/* Color indicator */}
          <div
            style={{
              width: 4,
              height: 28,
              borderRadius: 2,
              background: CATEGORY_COLORS[activeCategory],
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: CATEGORY_COLORS[activeCategory] }}>
                {CATEGORY_ICONS[activeCategory]} {CATEGORY_LABELS[activeCategory]}
              </span>
              <span style={{ fontSize: 11, color: '#8899aa' }}>
                {activeCategoryEnabled}/{activeCategoryMetrics.length} metrik aktif
              </span>
            </div>
            {/* Progress bar */}
            <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: activeCategoryMetrics.length > 0
                    ? `${(activeCategoryEnabled / activeCategoryMetrics.length) * 100}%`
                    : '0%',
                  background: CATEGORY_COLORS[activeCategory],
                  borderRadius: 2,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <button
              style={{ ...styles.btnPrimary, fontSize: 11 }}
              onClick={() => onBulkToggle && onBulkToggle(activeCategoryIds, true)}
            >
              Tümünü Seç
            </button>
            <button
              style={{ ...styles.btnSecondary, fontSize: 11 }}
              onClick={() => onBulkToggle && onBulkToggle(activeCategoryIds, false)}
            >
              Tümünü Kaldır
            </button>
          </div>
        </div>
      )}

      {/* Search results header */}
      {search.trim() && (
        <div style={{ ...styles.categoryHeader }}>
          <span style={{ fontSize: 13, color: '#8899aa' }}>
            🔍 "{search}" için{' '}
            <span style={{ color: '#00d4ff', fontWeight: 700 }}>{visibleMetrics.length}</span>{' '}
            sonuç bulundu
          </span>
          <button
            style={{ ...styles.btnSecondary, fontSize: 11, marginLeft: 'auto' }}
            onClick={() => setSearch('')}
          >
            ✕ Temizle
          </button>
        </div>
      )}

      {/* Metrics list */}
      <div style={styles.metricsList}>
        {visibleMetrics.length === 0 ? (
          <div style={styles.emptyState}>
            <span style={{ fontSize: 32 }}>📭</span>
            <span style={{ fontSize: 14 }}>
              {search.trim() ? 'Arama sonucu bulunamadı' : 'Bu kategoride metrik yok'}
            </span>
          </div>
        ) : (
          visibleMetrics.map((metric) => (
            <MetricCard
              key={metric.id}
              metric={metric}
              isSelected={selectedMetrics ? selectedMetrics.has(metric.id) : false}
              onToggle={onToggle}
              categoryColor={CATEGORY_COLORS[metric.category] || '#8899aa'}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '8px 16px',
          borderTop: '1px solid rgba(160,196,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 11, color: '#556688' }}>
          Toplam {totalCount} metrik · {totalEnabled} aktif · {totalCount - totalEnabled} devre dışı
        </span>
        <div style={{ display: 'flex', gap: 12 }}>
          {Object.entries(WEIGHT_COLORS).map(([w, c]) => (
            <span key={w} style={{ fontSize: 10, color: c, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, display: 'inline-block' }} />
              {w}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
