import React, { useState, useMemo } from 'react';

const CATEGORY_COLORS = {
  attack: 'var(--accent-orange, #ff8c00)',
  defense: 'var(--accent-cyan, #00f2ff)',
  form: 'var(--accent-green, #00ff88)',
  player: 'var(--accent-purple, #bc13fe)',
  goalkeeper: 'var(--accent-cyan, #00f2ff)',
  referee: '#ffeb3b',
  h2h: 'var(--accent-pink, #ff3d8e)',
  contextual: 'var(--text-secondary, #6b6b80)',
  momentum: 'var(--accent-orange, #ff8c00)',
  derived: 'var(--accent-cyan, #00f2ff)',
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
  critical: 'var(--accent-pink, #ff3d8e)',
  high: 'var(--accent-orange, #ff8c00)',
  medium: 'var(--accent-cyan, #00f2ff)',
  low: 'var(--text-secondary, #6b6b80)',
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
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      style={{
        width: 36,
        height: 18,
        borderRadius: 10,
        background: checked ? 'var(--gradient-cyan)' : 'rgba(255,255,255,0.08)',
        border: 'none',
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(.4,0,.2,1)',
        padding: 0,
        boxShadow: checked ? '0 0 10px rgba(0, 242, 255, 0.3)' : 'inset 0 2px 4px rgba(0,0,0,0.2)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: '#fff',
          position: 'absolute',
          top: 2,
          left: checked ? 20 : 2,
          transition: 'all 0.3s cubic-bezier(.4,0,.2,1)',
          boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
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
          ? 'rgba(255,255,255,0.03)'
          : 'rgba(255,255,255,0.01)',
        border: `1px solid ${isSelected ? 'var(--glass-border-active)' : 'var(--glass-border)'}`,
        borderLeft: `4px solid ${isSelected ? categoryColor : 'rgba(255,255,255,0.05)'}`,
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 10,
        opacity: isSelected ? 1 : 0.6,
        transition: 'all 0.3s cubic-bezier(.4,0,.2,1)',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
      }}
      onClick={() => onToggle(metric.id)}
    >
      {/* Background Glow when selected */}
      {isSelected && (
        <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 60, background: `linear-gradient(90deg, ${categoryColor}08, transparent)`, pointerEvents: 'none' }} />
      )}

      {/* Row 1: dot + ID + name + toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: weightColor,
            flexShrink: 0,
            boxShadow: `0 0 10px ${weightColor}`,
          }}
          title={`Ağırlık: ${metric.weight}`}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-secondary)',
            background: 'rgba(255,255,255,0.04)',
            padding: '2px 6px',
            borderRadius: 4,
            flexShrink: 0,
            fontWeight: 700,
            border: '1px solid rgba(255,255,255,0.03)',
          }}
        >
          {metric.id}
        </span>
        <span
          style={{
            flex: 1,
            color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontSize: 13,
            fontWeight: 700,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            letterSpacing: '-0.01em',
          }}
          title={metric.name}
        >
          {metric.name}
        </span>
        <ToggleSwitch checked={isSelected} onChange={(e) => { e.stopPropagation(); onToggle(metric.id); }} />
      </div>

      {/* Row 2: description */}
      {metric.description && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            marginBottom: 10,
            paddingLeft: 20,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            lineHeight: '1.4',
            fontStyle: 'italic',
          }}
          title={metric.description}
        >
          {metric.description}
        </div>
      )}

      {/* Row 3: value bar + stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 20, flexWrap: 'wrap' }}>
        <ValueBar value={metric.value} leagueAvg={metric.leagueAvg} color={categoryColor} />

        <div style={{ fontSize: 12, fontWeight: 900, display: 'flex', gap: 10, fontFamily: 'var(--font-mono)' }}>
          {metric.homeValue != null && metric.homeValue === metric.awayValue ? (
            <span style={{ color: isSelected ? 'var(--accent-cyan)' : 'var(--text-tertiary)' }}>
              {formatValue(metric.homeValue, metric.unit)}
            </span>
          ) : (
            <>
              {metric.homeValue != null ? (
                <span>
                  <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: 9 }}>EV: </span>
                  <span style={{ color: isSelected ? 'var(--accent-cyan)' : 'var(--text-tertiary)' }}>{formatValue(metric.homeValue, metric.unit)}</span>
                </span>
              ) : null}
              {metric.awayValue != null ? (
                <span>
                  <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, fontSize: 9 }}>DEP: </span>
                  <span style={{ color: isSelected ? 'var(--accent-purple)' : 'var(--text-tertiary)' }}>{formatValue(metric.awayValue, metric.unit)}</span>
                </span>
              ) : null}
            </>
          )}
        </div>

        {formattedLeagueAvg !== null && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 700 }}>
            LİG-O: <span style={{ color: 'var(--text-secondary)' }}>{formattedLeagueAvg}</span>
          </span>
        )}
      </div>

      {/* Row 4: simulation role pills */}
      {roles.length > 0 && isSelected && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingLeft: 20, flexWrap: 'wrap' }}>
          {roles.map((role) => (
            <span
              key={role}
              style={{
                fontSize: 9,
                padding: '2px 8px',
                borderRadius: 20,
                background: 'rgba(0, 242, 255, 0.05)',
                color: 'var(--accent-cyan)',
                border: '1px solid rgba(0, 242, 255, 0.1)',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
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
      background: 'var(--card-bg)',
      border: '1px solid var(--glass-border)',
      borderRadius: 'var(--radius-lg)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'var(--font-sans)',
      color: 'var(--text-primary)',
      backdropFilter: 'blur(20px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    },
    header: {
      padding: '20px 24px',
      borderBottom: '1px solid var(--glass-border)',
      background: 'rgba(0,0,0,0.2)',
      flexShrink: 0,
    },
    headerTop: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
      gap: 12,
    },
    title: {
      fontSize: 16,
      fontWeight: 800,
      color: 'var(--text-primary)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      textTransform: 'uppercase',
      letterSpacing: '0.02em',
    },
    badge: {
      fontSize: 11,
      padding: '4px 12px',
      borderRadius: 20,
      background: 'rgba(0,242,255,0.05)',
      color: 'var(--accent-cyan)',
      border: '1px solid rgba(0,242,255,0.15)',
      fontWeight: 800,
    },
    globalBtns: {
      display: 'flex',
      gap: 10,
      alignItems: 'center',
    },
    btnPrimary: {
      fontSize: 11,
      padding: '6px 14px',
      borderRadius: 8,
      border: '1px solid var(--glass-border)',
      background: 'var(--gradient-cyan)',
      color: '#000',
      cursor: 'pointer',
      fontWeight: 800,
      transition: 'all 0.2s cubic-bezier(.4,0,.2,1)',
      boxShadow: '0 4px 12px rgba(0,242,255,0.15)',
    },
    btnSecondary: {
      fontSize: 11,
      padding: '6px 14px',
      borderRadius: 8,
      border: '1px solid var(--glass-border)',
      background: 'rgba(255,255,255,0.03)',
      color: 'var(--text-secondary)',
      cursor: 'pointer',
      fontWeight: 700,
      transition: 'all 0.2s',
    },
    searchBox: {
      width: '100%',
      background: 'rgba(0,0,0,0.3)',
      border: '1px solid var(--glass-border)',
      borderRadius: 10,
      padding: '10px 16px',
      color: 'var(--text-primary)',
      fontSize: 14,
      outline: 'none',
      boxSizing: 'border-box',
      transition: 'border-color 0.2s',
    },
    tabsContainer: {
      display: 'flex',
      overflowX: 'auto',
      gap: 2,
      padding: '12px 16px 10px',
      flexShrink: 0,
      scrollbarWidth: 'thin',
      scrollbarColor: 'rgba(0, 242, 255, 0.35) rgba(255,255,255,0.05)',
    },
    categoryHeader: {
      padding: '16px 20px',
      borderBottom: '1px solid var(--glass-border)',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexShrink: 0,
      background: 'rgba(255,255,255,0.01)',
    },
    metricsList: {
      flex: 1,
      overflowY: 'auto',
      padding: '16px',
      scrollbarWidth: 'none',
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
        <div className="metricsTabsScroll" style={styles.tabsContainer}>
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

      <style>{`
        .metricsTabsScroll::-webkit-scrollbar { height: 10px; }
        .metricsTabsScroll::-webkit-scrollbar-track {
          background: rgba(255,255,255,0.04);
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.06);
        }
        .metricsTabsScroll::-webkit-scrollbar-thumb {
          background: linear-gradient(135deg, rgba(0,242,255,0.55), rgba(0,136,255,0.35));
          border-radius: 999px;
          border: 1px solid rgba(0,242,255,0.25);
        }
        .metricsTabsScroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(135deg, rgba(0,242,255,0.75), rgba(0,136,255,0.45));
        }
      `}</style>
    </div>
  );
}
