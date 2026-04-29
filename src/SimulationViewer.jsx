import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import BehavioralGrid from './components/BehavioralGrid';

// ── Event display config ─────────────────────────────────────────────────────
const EVENT_ICONS = {
  goal:           '⚽',
  shot_on_target: '🎯',
  shot_off_target: '↗',
  shot_blocked:   '🧱',
  yellow_card:    '🟡',
  red_card:       '🔴',
  corner:         '🚩',
  substitution:   '🔄',
  penalty:        '⬜',
  penalty_missed: '❌',
  halftime:       '⏸',
  fulltime:       '🏁',
};

const EVENT_LABELS = {
  goal:           'GOOOL!',
  shot_on_target: 'İSABETLİ ŞUT',
  shot_off_target: 'İSABETSİZ ŞUT',
  shot_blocked:   'BLOKLANAN ŞUT',
  yellow_card:    'SARI KART',
  red_card:       'KIRMIZI KART',
  corner:         'KORNER',
  substitution:   'OYUNCU DEĞİŞİKLİĞİ',
  penalty:        'PENALTİ',
  penalty_missed: 'KAÇAN PENALTİ',
  halftime:       'DEVRE ARASI',
  fulltime:       'MAÇ SONU',
};

const EVENT_COLORS = {
  goal:           'var(--accent-orange, #ff8c00)',
  shot_on_target: 'var(--accent-cyan, #00f2ff)',
  shot_off_target: 'rgba(255,255,255,0.55)',
  shot_blocked:   'var(--text-secondary, #6b6b80)',
  yellow_card:    '#ffeb3b',
  red_card:       '#f44336',
  corner:         'var(--accent-green, #00ff88)',
  substitution:   'var(--accent-purple, #bc13fe)',
  penalty:        '#ffffff',
  penalty_missed: '#f44336',
  halftime:       '#9e9e9e',
  fulltime:       '#9e9e9e',
};

// ── Ball position for horizontal field ──────────────────────────────────────
function getBallPos(events, minute) {
  const recent = [...events].filter(e => e.minute <= minute).slice(-1)[0];
  if (!recent) return { x: 50, y: 50 };
  const isHome = recent.team === 'home';
  switch (recent.type) {
    case 'goal':
      return isHome ? { x: 93, y: 50 } : { x: 7, y: 50 };
    case 'shot_on_target':
    case 'shot_off_target':
    case 'shot_blocked':
    case 'penalty':
    case 'penalty_missed':
      return isHome ? { x: 83, y: 45 + Math.random() * 10 } : { x: 17, y: 45 + Math.random() * 10 };
    case 'corner':
      return isHome
        ? { x: 97, y: Math.random() > 0.5 ? 8 : 92 }
        : { x: 3, y: Math.random() > 0.5 ? 8 : 92 };
    default:
      return { x: 50, y: 50 };
  }
}

// ── Football pitch ───────────────────────────────────────────────────────────
function HorizontalField({ ballPos, goalFlash, visibleEvents, homeTeam, awayTeam }) {
  return (
    <div style={{
      width: '100%',
      position: 'relative',
      background: 'linear-gradient(180deg, #1a4d1a 0%, #1e5e1e 50%, #1a4d1a 100%)',
      aspectRatio: '16/7',
      borderRadius: 14,
      border: '2px solid rgba(255,255,255,0.1)',
      overflow: 'hidden',
      boxShadow: 'inset 0 0 100px rgba(0,0,0,0.3)',
    }}>
      {/* Grass stripes */}
      {[...Array(12)].map((_, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${(i * 100) / 12}%`, top: 0, bottom: 0,
          width: `${100 / 12}%`,
          background: i % 2 === 0 ? 'rgba(0,0,0,0.07)' : 'transparent',
        }} />
      ))}

      {/* Outer border */}
      <div style={{ position: 'absolute', top: 10, left: 10, right: 10, bottom: 10, border: '2px solid rgba(255,255,255,0.28)', borderRadius: 3 }} />
      {/* Center line */}
      <div style={{ position: 'absolute', left: '50%', top: 10, bottom: 10, width: 2, background: 'rgba(255,255,255,0.28)' }} />
      {/* Center circle */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '18%', aspectRatio: '1', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.28)' }} />
      {/* Center dot */}
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.4)' }} />

      {/* Home penalty box (right) */}
      <div style={{ position: 'absolute', right: 10, top: '22%', bottom: '22%', width: '16%', border: '2px solid rgba(255,255,255,0.28)' }} />
      <div style={{ position: 'absolute', right: 10, top: '35%', bottom: '35%', width: '5%', border: '2px solid rgba(255,255,255,0.28)' }} />
      <div style={{ position: 'absolute', right: 4, top: '41%', bottom: '41%', width: '1.5%', background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.35)', borderRight: 'none' }} />

      {/* Away penalty box (left) */}
      <div style={{ position: 'absolute', left: 10, top: '22%', bottom: '22%', width: '16%', border: '2px solid rgba(255,255,255,0.28)' }} />
      <div style={{ position: 'absolute', left: 10, top: '35%', bottom: '35%', width: '5%', border: '2px solid rgba(255,255,255,0.28)' }} />
      <div style={{ position: 'absolute', left: 4, top: '41%', bottom: '41%', width: '1.5%', background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(255,255,255,0.35)', borderLeft: 'none' }} />

      {/* Corner arcs */}
      <div style={{ position: 'absolute', left: 10, top: 10, width: 16, height: 16, borderLeft: '2px solid rgba(255,255,255,0.28)', borderTop: '2px solid rgba(255,255,255,0.28)', borderRadius: '100% 0 0 0' }} />
      <div style={{ position: 'absolute', right: 10, top: 10, width: 16, height: 16, borderRight: '2px solid rgba(255,255,255,0.28)', borderTop: '2px solid rgba(255,255,255,0.28)', borderRadius: '0 100% 0 0' }} />
      <div style={{ position: 'absolute', right: 10, bottom: 10, width: 16, height: 16, borderRight: '2px solid rgba(255,255,255,0.28)', borderBottom: '2px solid rgba(255,255,255,0.28)', borderRadius: '0 0 100% 0' }} />
      <div style={{ position: 'absolute', left: 10, bottom: 10, width: 16, height: 16, borderLeft: '2px solid rgba(255,255,255,0.28)', borderBottom: '2px solid rgba(255,255,255,0.28)', borderRadius: '0 0 0 100%' }} />

      {/* Ball trail */}
      {visibleEvents.slice(-5).map((ev, i) => {
        const pos = getBallPos([ev], ev.minute);
        const color = EVENT_COLORS[ev.type] || '#fff';
        return (
          <div key={i} style={{
            position: 'absolute', left: `${pos.x}%`, top: `${pos.y}%`,
            width: 6 + i * 2, height: 6 + i * 2, borderRadius: '50%',
            background: color, transform: 'translate(-50%,-50%)',
            opacity: 0.04 + i * 0.05, filter: 'blur(3px)', pointerEvents: 'none',
          }} />
        );
      })}

      {/* Ball */}
      <div style={{
        position: 'absolute', left: `${ballPos.x}%`, top: `${ballPos.y}%`,
        width: 15, height: 15, borderRadius: '50%',
        background: goalFlash ? 'var(--accent-orange)' : '#fff',
        transform: 'translate(-50%,-50%)',
        transition: 'all 0.5s cubic-bezier(.3,0,.2,1), background 0.3s',
        boxShadow: goalFlash
          ? '0 0 28px 8px rgba(255,140,0,0.8), 0 0 8px 2px #fff'
          : '0 3px 10px rgba(0,0,0,0.4), 0 0 7px rgba(255,255,255,0.5)',
        zIndex: 10,
      }} />

      {/* Team attack direction labels */}
      <div style={{ position: 'absolute', bottom: 12, left: '53%', color: 'var(--accent-cyan)', fontSize: 9, fontWeight: 900, background: 'rgba(0,242,255,0.08)', padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.55 }}>HÜCUM →</div>
      <div style={{ position: 'absolute', bottom: 12, right: '53%', color: 'var(--accent-purple)', fontSize: 9, fontWeight: 900, background: 'rgba(188,19,254,0.08)', padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.55 }}>← HÜCUM</div>
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
function StatsStrip({ stats, homeTeam, awayTeam }) {
  const rows = [
    { label: 'Şut',         hv: stats.home.shots,         av: stats.away.shots },
    { label: 'İsabetli',    hv: stats.home.shotsOnTarget,  av: stats.away.shotsOnTarget },
    { label: 'Gol',         hv: stats.home.goals,          av: stats.away.goals },
    { label: 'Korner',      hv: stats.home.corners,        av: stats.away.corners },
    { label: 'Sarı Kart',   hv: stats.home.yellowCards,    av: stats.away.yellowCards },
    { label: 'Kırmızı',     hv: stats.home.redCards,       av: stats.away.redCards },
  ];

  return (
    <div style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.22)', borderTop: '1px solid var(--glass-border)' }}>
      {/* Possession bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ textAlign: 'right', minWidth: 36 }}>
          <div style={{ color: 'var(--accent-cyan)', fontSize: 14, fontWeight: 900 }}>%{stats.homePoss}</div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 8, fontWeight: 800 }}>TOP</div>
        </div>
        <div style={{ flex: 1, display: 'flex', height: 8, borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ width: `${stats.homePoss}%`, background: 'var(--gradient-cyan)', transition: 'width 0.6s ease' }} />
          <div style={{ flex: 1, background: 'var(--accent-purple)', opacity: 0.9 }} />
        </div>
        <div style={{ textAlign: 'left', minWidth: 36 }}>
          <div style={{ color: 'var(--accent-purple)', fontSize: 14, fontWeight: 900 }}>%{stats.awayPoss}</div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: 8, fontWeight: 800 }}>TOP</div>
        </div>
      </div>

      {/* Stat rows */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {rows.map(({ label, hv, av }) => {
          const max = Math.max(hv, av, 1);
          return (
            <div key={label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <span style={{ color: 'var(--accent-cyan)', fontSize: 13, fontWeight: 900 }}>{hv}</span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
                <span style={{ color: 'var(--accent-purple)', fontSize: 13, fontWeight: 900 }}>{av}</span>
              </div>
              <div style={{ display: 'flex', gap: 3 }}>
                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${(hv / max) * 100}%`, height: '100%', background: 'var(--accent-cyan)', float: 'right', borderRadius: 2 }} />
                </div>
                <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${(av / max) * 100}%`, height: '100%', background: 'var(--accent-purple)', borderRadius: 2 }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Event log ─────────────────────────────────────────────────────────────────
function EventLog({ visibleEvents, eventLogRef }) {
  return (
    <div ref={eventLogRef} style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'transparent', scrollbarWidth: 'none' }}>
      <div style={{ padding: '10px 14px', color: 'var(--accent-orange)', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,140,0,0.03)', position: 'sticky', top: 0, zIndex: 1 }}>
        CANLI ANLATIM
      </div>

      {visibleEvents.length === 0 && (
        <div style={{ padding: '40px 14px', color: 'var(--text-tertiary)', fontSize: 12, textAlign: 'center', fontStyle: 'italic' }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>⚽</div>
          Başlama vuruşu bekleniyor...
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {visibleEvents.map((ev, i) => {
          const isGoal = ev.type === 'goal';
          const isHome = ev.team === 'home';
          const isCard = ev.type === 'yellow_card' || ev.type === 'red_card';
          const isSub = ev.type === 'substitution';
          const color = EVENT_COLORS[ev.type] || 'var(--text-secondary)';
          const label = EVENT_LABELS[ev.type] || ev.type?.replace(/_/g, ' ').toUpperCase();

          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '8px 10px',
              background: isGoal ? 'rgba(255,140,0,0.08)' : (i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent'),
              borderLeft: `3px solid ${isGoal ? 'var(--accent-orange)' : (ev.team === 'home' ? 'var(--accent-cyan)' : ev.team === 'away' ? 'var(--accent-purple)' : 'rgba(255,255,255,0.1)')}`,
              borderBottom: '1px solid rgba(255,255,255,0.02)',
              animation: 'fadeIn 0.3s ease-out',
            }}>
              <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 5, padding: '3px 6px', color: '#fff', flexShrink: 0, fontWeight: 900, fontFamily: 'var(--font-mono)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {ev.minute}'
              </span>
              <span style={{ fontSize: 16, marginTop: -1, filter: isGoal ? 'drop-shadow(0 0 6px var(--accent-orange))' : 'none', flexShrink: 0 }}>
                {EVENT_ICONS[ev.type] || '•'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 1, flexWrap: 'wrap' }}>
                  <span style={{ color, fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    {label}
                    {ev.subtype === 'penalty' && ' (P)'}
                    {ev.subtype === 'second_yellow' && ' (2×🟡)'}
                  </span>
                  {ev.team && (
                    <span style={{ fontSize: 8, color: 'var(--text-tertiary)', fontWeight: 800 }}>
                      {isHome ? 'EV' : 'DEP'}
                    </span>
                  )}
                </div>
                {ev.player && !isSub && (
                  <div style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.player}</div>
                )}
                {isSub && (
                  <div style={{ fontSize: 10 }}>
                    <span style={{ color: 'var(--accent-green)', fontWeight: 700 }}>▲ {ev.playerIn}</span>
                    {ev.playerOut && <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>▼ {ev.playerOut}</span>}
                  </div>
                )}
                {ev.type === 'halftime' && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>
                    {ev.homeGoals} – {ev.awayGoals}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Multi-run results ─────────────────────────────────────────────────────────
function MultiRunView({ multiRunResult, homeTeam, awayTeam }) {
  if (!multiRunResult?.distribution) return null;
  const { distribution, runs } = multiRunResult;
  const topScores = Object.entries(distribution.scoreFrequency || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {/* Win probabilities */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 20, border: '1px solid var(--glass-border)' }}>
          <div style={{ color: 'var(--accent-cyan)', fontSize: 10, fontWeight: 900, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 2 }}>KAZANMA OLASILIKLARI ({runs} KOŞU)</div>
          {[
            { label: homeTeam, pct: distribution.homeWin ?? 0, color: 'var(--accent-cyan)' },
            { label: 'Beraberlik', pct: distribution.draw ?? 0, color: 'var(--text-secondary)' },
            { label: awayTeam, pct: distribution.awayWin ?? 0, color: 'var(--accent-purple)' },
          ].map(bar => (
            <div key={bar.label} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, fontWeight: 700 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{bar.label}</span>
                <span style={{ color: bar.color }}>{bar.pct}%</span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 5, height: 7, overflow: 'hidden' }}>
                <div style={{ width: `${bar.pct}%`, height: '100%', background: bar.color }} />
              </div>
            </div>
          ))}
        </div>

        {/* Market probabilities */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 20, border: '1px solid var(--glass-border)' }}>
          <div style={{ color: 'var(--accent-cyan)', fontSize: 10, fontWeight: 900, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 2 }}>PAZAR OLASILIKLARI</div>
          <div style={{ color: 'var(--accent-orange)', fontSize: 30, fontWeight: 950, marginBottom: 16 }}>⌀ {(distribution.avgGoals ?? 0).toFixed(2)} <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>gol</span></div>
          {[
            { label: '2.5 Üst', pct: distribution.over25 ?? 0 },
            { label: '1.5 Üst', pct: distribution.over15 ?? 0 },
            { label: 'KG Var', pct: distribution.btts ?? 0 },
          ].map(row => (
            <div key={row.label} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{row.label}</span>
                <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{row.pct}%</span>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                <div style={{ width: `${row.pct}%`, height: '100%', background: 'var(--accent-green)', borderRadius: 2 }} />
              </div>
            </div>
          ))}
        </div>

        {/* Top scores */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 20, border: '1px solid var(--glass-border)' }}>
          <div style={{ color: 'var(--accent-cyan)', fontSize: 10, fontWeight: 900, marginBottom: 16, textTransform: 'uppercase', letterSpacing: 2 }}>EN ÇOK GÖRÜLEN SKORLAR</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {topScores.map(([score, count]) => (
              <div key={score} style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: 7, padding: '8px 10px', fontSize: 12 }}>
                <span style={{ color: 'var(--text-primary)', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{score}</span>
                <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>%{typeof count === 'number' ? count.toFixed(1) : count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Audit panel ─────────────────────────────────────────────────────────────
function AuditPanel({ metadata, homeTeam, awayTeam, metricsData }) {
  const [search, setSearch] = React.useState('');
  const metricTraces = metadata?.leagueAvgTraces;
  const baselineTraces = metadata?.leagueBaseline?.traces || [];
  
  if (!metricTraces || Object.keys(metricTraces).length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>🔍</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Bu maç için denetim verisi henüz hazır değil.</div>
        <div style={{ fontSize: 11, marginTop: 8, opacity: 0.7 }}>
          Simülasyonun dayandığı lig ortalamaları henüz hesaplanmamış olabilir veya API verisi eksik gelmiş olabilir.
        </div>
      </div>
    );
  }

  const filteredPairs = Object.entries(metricTraces || {}).filter(([id, data]) => {
    const q = search.toLowerCase();
    return (
      id.toLowerCase().includes(q) ||
      (data.name || '').toLowerCase().includes(q) ||
      (data.description || '').toLowerCase().includes(q)
    );
  }).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div style={{ padding: 24, color: 'var(--text-primary)', animation: 'fadeIn 0.3s', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* ── Section 0: League Physics (Lig Trafiği ve Fizik) ────────────────── */}
      <div style={{ marginBottom: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 4, height: 18, background: 'var(--accent-green)', borderRadius: 2 }} />
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: 1 }}>DİNAMİK LİG FİZİK PROFİLİ</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div style={{ background: 'rgba(0,255,136,0.04)', border: '1px solid rgba(0,255,136,0.15)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: 'var(--accent-green)', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>Lig Puan Yoğunluğu (Density)</div>
            <div style={{ fontSize: 22, fontWeight: 950, color: '#fff', fontFamily: 'var(--font-mono)' }}>{metadata?.leaguePointDensity != null ? metadata.leaguePointDensity.toFixed(3) : '—'}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>Puan farklarının hassasiyeti ve "Hedef/Önem" metriği çarpanı.</div>
          </div>
          <div style={{ background: 'rgba(0,242,255,0.04)', border: '1px solid rgba(0,242,255,0.15)', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: 'var(--accent-cyan)', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>Gol Volatilitesi (Volatility)</div>
            <div style={{ fontSize: 22, fontWeight: 950, color: '#fff', fontFamily: 'var(--font-mono)' }}>{metadata?.leagueGoalVolatility != null ? metadata.leagueGoalVolatility.toFixed(3) : '—'}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>Skor değişkenliği ve "Form/Momentum" metriği çarpanı.</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 4, height: 18, background: 'var(--accent-orange)', borderRadius: 2 }} />
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, letterSpacing: 1 }}>SİMÜLASYON TEMEL DİNAMİKLERİ (BASELINES)</h3>
        </div>
        <div style={{ 
          background: 'rgba(255,140,0,0.03)', 
          border: '1px solid rgba(255,140,0,0.1)', 
          borderRadius: 12, 
          padding: '16px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 12
        }}>
          {baselineTraces.map((t, idx) => {
            const isNeutral = t.includes('NEUTRAL_SYMMETRY');
            return (
              <div key={idx} style={{ 
                fontSize: 11, 
                fontFamily: 'var(--font-mono)', 
                color: isNeutral ? 'var(--text-tertiary)' : '#fff',
                padding: '6px 10px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: 6,
                border: isNeutral ? '1px dashed rgba(255,255,255,0.1)' : '1px solid rgba(255,140,0,0.2)'
              }}>
                <span style={{ color: isNeutral ? 'var(--text-tertiary)' : 'var(--accent-orange)', marginRight: 6 }}>➜</span>
                {t}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 2: Individual Metrics (Metrik Denetimi) ────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 4, height: 18, background: 'var(--accent-cyan)', borderRadius: 2 }} />
          <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>METRİK HESAPLAMA KANITLARI (168+ METRİK)</h3>
        </div>
        <div style={{ position: 'relative' }}>
          <input 
            type="text" 
            placeholder="Metrik ara..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid var(--glass-border)',
              borderRadius: 20,
              padding: '6px 16px',
              paddingLeft: 32,
              color: '#fff',
              fontSize: 12,
              outline: 'none',
              width: 200,
            }}
          />
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: 12 }}>🔍</span>
        </div>
      </div>
      
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
        gap: 16, 
        overflowY: 'auto',
        paddingRight: 8,
        flex: 1
      }}>
        {filteredPairs.map(([id, data]) => {
          const rawTrace = data.trace || '';
          const valPart = rawTrace.split(' (')[0] || '1.0';
          const sourcePart = rawTrace.split(' (')[1]?.replace(')', '') || 'DİNAMİK PROXY';

          return (
            <div key={id} style={{ 
              background: 'rgba(255,255,255,0.03)', 
              border: '1px solid var(--glass-border)', 
              borderRadius: 12, 
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              transition: 'all 0.2s',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Header: Name & ID */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-cyan)', marginBottom: 2 }}>{data.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600 }}>ID: {id}</div>
                </div>
                <div style={{ 
                  fontSize: 18, 
                  fontWeight: 950, 
                  color: '#fff', 
                  fontFamily: 'var(--font-mono)',
                  background: 'rgba(255,255,255,0.05)',
                  padding: '4px 10px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.05)'
                }}>
                  {valPart}
                </div>
              </div>
              
              {/* Description */}
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, fontStyle: 'italic' }}>
                {data.description}
              </div>

              {/* Simulation Role / Impact */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 9, fontWeight: 900, color: 'var(--accent-purple)', background: 'rgba(188, 19, 254, 0.1)', padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  ETKİ: {data.role}
                </span>
              </div>

              {/* Source Details */}
              <div style={{ 
                marginTop: 'auto',
                padding: '8px 10px',
                background: 'rgba(0, 255, 136, 0.05)',
                borderRadius: 8,
                border: '1px solid rgba(0, 255, 136, 0.1)',
                fontSize: 10,
                color: '#fff',
                fontWeight: 600
              }}>
                <div style={{ color: 'var(--accent-green)', fontWeight: 900, fontSize: 8, textTransform: 'uppercase', marginBottom: 2 }}>DENETİM KANITI (REAL-TIME)</div>
                <div style={{ opacity: 0.9 }}>{sourcePart}</div>
              </div>
            </div>
          );
        })}

        {filteredPairs.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
            Arama kriterine uygun metrik bulunamadı.
          </div>
        )}
      </div>
      
      <div style={{ marginTop: 20, padding: 14, background: 'rgba(255, 140, 0, 0.05)', border: '1px solid rgba(255, 140, 0, 0.15)', borderRadius: 12, fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6, flexShrink: 0 }}>
        <strong style={{ color: 'var(--accent-orange)' }}>Dinamik Mimari Notu:</strong> Bu paneldeki hiçbir değer statik (hardcoded) değildir. Her bir veri noktası, hiyerarşik olarak önce lig ortalamalarından, ardından takım sezon istatistiklerinden türetilmiştir. Veri bulunamadığında matematiksel nötr baz (Neutral Symmetry) kullanılır; böylece simülasyon hiçbir zaman spekülatif veya "tahmini" bir sabit sayıya dayanmaz.
      </div>
    </div>
  );
}

// ── Main SimulationViewer ─────────────────────────────────────────────────────
export default function SimulationViewer({ 
  simulation, homeTeam, awayTeam, isMultiRun, multiRunResult, onMinuteChange, metadata,
  showAudit, metricsData 
}) {
  const [currentMinute, setCurrentMinute] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [goalFlash, setGoalFlash] = useState(false);

  // MinuteLog array from the backend simulation
  const minuteLog = simulation?.minuteLog || [];

  const intervalRef = useRef(null);
  const eventLogRef = useRef(null);

  // ── Reset state when simulation changes ──────────────
  useEffect(() => {
    setCurrentMinute(0);
    setIsPlaying(false);
    setGoalFlash(false);
    if (onMinuteChange) onMinuteChange(0);
  }, [simulation, onMinuteChange]);

  // ── Playback timer ───────────────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!isPlaying || minuteLog.length === 0) return;

    intervalRef.current = setInterval(() => {
      setCurrentMinute(prev => {
        const nextMin = prev + 1;
        if (nextMin > 95 || nextMin > minuteLog.length) {
          setIsPlaying(false);
          return prev;
        }

        if (onMinuteChange) onMinuteChange(nextMin);

        // Check for goal flash
        const tick = minuteLog.find(log => log.minute === nextMin);
        if (tick && tick.events.some(e => e.type === 'goal')) {
          setGoalFlash(true);
          setTimeout(() => setGoalFlash(false), 1200);
        }

        return nextMin;
      });
    }, 1000 / Math.max(1, speed));

    return () => clearInterval(intervalRef.current);
  }, [isPlaying, speed, onMinuteChange, minuteLog]);

  // Compute live data up to current minute
  const liveData = useMemo(() => {
    const allEvents = [];
    let bState = null;
    let poss = { home: 50, away: 50 };
    const liveGoals = { home: 0, away: 0 };
    const liveStats = {
      home: { shots: 0, shotsOnTarget: 0, corners: 0, yellowCards: 0, redCards: 0, goals: 0 },
      away: { shots: 0, shotsOnTarget: 0, corners: 0, yellowCards: 0, redCards: 0, goals: 0 },
    };

    for (const log of minuteLog) {
      if (log.minute > currentMinute) break;
      
      allEvents.push(...log.events);
      bState = log.behavioralState;
      poss = log.possession;

      for (const ev of log.events) {
        const s = ev.team === 'home' ? liveStats.home : liveStats.away;
        if (!s) continue;
        if (ev.type === 'shot_off_target' || ev.type === 'shot_blocked') s.shots++;
        else if (ev.type === 'shot_on_target') { s.shots++; s.shotsOnTarget++; }
        else if (ev.type === 'goal') { 
          s.shots++; s.shotsOnTarget++; s.goals++; 
          if (ev.team === 'home') liveGoals.home++;
          else liveGoals.away++;
        }
        else if (ev.type === 'corner') s.corners++;
        else if (ev.type === 'yellow_card') s.yellowCards++;
        else if (ev.type === 'red_card') s.redCards++;
      }
    }

    return { allEvents, bState, poss, liveGoals, liveStats };
  }, [minuteLog, currentMinute]);

  const { allEvents, bState: currentBehavioralState, poss: currentPoss, liveGoals, liveStats } = liveData;

  // ── Auto-scroll event log ────────────────────────────────────────────────────
  useEffect(() => {
    if (eventLogRef.current) eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
  }, [allEvents.length]);

  // ── Ball position ────────────────────────────────────────────────────────────
  const ballPos = useMemo(() => getBallPos(allEvents, currentMinute), [allEvents, currentMinute]);

  // ── Stats for StatsStrip ─────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    home: { ...liveStats.home, goals: liveGoals.home },
    away: { ...liveStats.away, goals: liveGoals.away },
    homePoss: currentPoss.home,
    awayPoss: currentPoss.away,
  }), [liveStats, liveGoals, currentPoss]);

  // ── Handle seek (jump to target minute) ───────────────────
  const handleProgressClick = useCallback((e) => {
    if (!minuteLog || minuteLog.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetMinute = Math.round(ratio * 95);

    setCurrentMinute(targetMinute);
    if (onMinuteChange) onMinuteChange(targetMinute);
  }, [minuteLog, onMinuteChange]);

  const handleReset = () => {
    setCurrentMinute(0);
    setIsPlaying(false);
    setGoalFlash(false);
    if (onMinuteChange) onMinuteChange(0);
  };

  // ── Multi-run view ────────────────────────────────────────────────────────────
  if (isMultiRun && multiRunResult) {
    return (
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)', borderRadius: 16, overflow: 'hidden', fontFamily: 'inherit', color: 'var(--text-primary)' }}>
        <div style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{homeTeam}</span>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '3px 10px', borderRadius: 16, fontSize: 11, fontWeight: 800, color: '#00e5ff' }}>VS</div>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{awayTeam}</span>
        </div>
        <div style={{ overflowY: 'auto' }}>
          <MultiRunView multiRunResult={multiRunResult} homeTeam={homeTeam} awayTeam={awayTeam} />
        </div>
      </div>
    );
  }

  if (showAudit) {
    return (
      <div className="simViewerRoot" style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'inherit', color: 'var(--text-primary)', height: '100%', minHeight: 400 }}>
        <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.2)' }}>
          <AuditPanel metadata={metadata} homeTeam={homeTeam} awayTeam={awayTeam} metricsData={metricsData} />
        </div>
      </div>
    );
  }

  if (!simulation || minuteLog.length === 0) {
    return (
      <div style={{ background: 'var(--glass-bg, rgba(255,255,255,0.05))', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 12, fontFamily: 'inherit', color: 'var(--text-secondary)' }}>
        <div style={{ fontSize: 46 }}>⚽</div>
        <div style={{ fontSize: 15 }}>Simülasyon başlatın</div>
      </div>
    );
  }

  const isDone = currentMinute >= 95;

  return (
    <div className="simViewerRoot" style={{ background: 'var(--card-bg)', border: '1px solid var(--glass-border)', borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'inherit', color: 'var(--text-primary)', height: '100%', minHeight: 0 }}>

      {/* ── Scoreboard ──────────────────────────────────────────────────────── */}
      <div style={{
        background: goalFlash ? 'rgba(255,140,0,0.15)' : 'rgba(0,0,0,0.3)',
        borderBottom: '1px solid var(--glass-border)',
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        transition: 'background 0.4s ease',
        animation: goalFlash ? 'goalPulse 0.4s ease infinite' : 'none',
        flexShrink: 0,
      }}>
        {/* Teams & Score */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flex: 1, justifyContent: 'center' }}>
          <div style={{ display: 'flex', flex: 1, justifyContent: 'flex-end', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-cyan)' }}>{homeTeam}</span>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🏠</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.03)', padding: '3px 16px', borderRadius: 10, border: '1px solid var(--glass-border)' }}>
            <span style={{ fontSize: 40, fontWeight: 950, color: goalFlash ? 'var(--accent-orange)' : '#fff', minWidth: 40, textAlign: 'center', transition: 'color 0.3s', fontFamily: 'var(--font-mono)' }}>{liveGoals.home}</span>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 28, fontWeight: 300 }}>:</span>
            <span style={{ fontSize: 40, fontWeight: 950, color: goalFlash ? 'var(--accent-orange)' : '#fff', minWidth: 40, textAlign: 'center', transition: 'color 0.3s', fontFamily: 'var(--font-mono)' }}>{liveGoals.away}</span>
          </div>

          <div style={{ display: 'flex', flex: 1, justifyContent: 'flex-start', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>✈️</div>
            <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent-purple)' }}>{awayTeam}</span>
          </div>
        </div>

        {/* Playback controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 24, paddingLeft: 24, borderLeft: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
            <span style={{ color: isDone ? 'var(--accent-orange)' : 'var(--accent-cyan)', fontSize: 17, fontWeight: 900, fontFamily: 'var(--font-mono)' }}>
              {isDone ? 'MAÇ SONU' : `${currentMinute}'`}
            </span>
            <span style={{ color: 'var(--text-tertiary)', fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>DAKİKA</span>
          </div>

          <select value={speed} onChange={e => setSpeed(Number(e.target.value))}
            style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 11, fontWeight: 700, padding: '4px 6px', cursor: 'pointer' }}>
            <option value={0.5}>0.5x</option>
            <option value={1}>1.0x</option>
            <option value={2}>2.0x</option>
            <option value={5}>5.0x</option>
          </select>

          <button onClick={() => { if (!isDone) setIsPlaying(p => !p); }} style={{
            background: isPlaying ? 'rgba(255,140,0,0.15)' : 'var(--gradient-cyan)',
            border: 'none', borderRadius: 9, color: isPlaying ? 'var(--accent-orange)' : '#000',
            fontWeight: 800, fontSize: 15, width: 40, height: 38, cursor: isDone ? 'default' : 'pointer',
            opacity: isDone ? 0.5 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {isPlaying ? '⏸' : '▶'}
          </button>

          <button onClick={handleReset} style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)',
            borderRadius: 9, color: 'var(--text-secondary)', fontSize: 18, width: 38, height: 38,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }} title="Yeniden Başlat">↺</button>
        </div>
      </div>

      {/* ── Progress bar ─────────────────────────────────────────────────────── */}
      <div style={{ height: 5, background: 'rgba(255,255,255,0.03)', cursor: 'pointer', position: 'relative', flexShrink: 0 }} onClick={handleProgressClick}>
        <div style={{ height: '100%', width: `${(currentMinute / 95) * 100}%`, background: 'var(--gradient-cyan)', transition: 'width 0.2s linear', boxShadow: '0 0 8px rgba(0,242,255,0.3)' }} />
        <div style={{
          position: 'absolute', top: '50%', left: `${(currentMinute / 95) * 100}%`,
          transform: 'translate(-50%,-50%)',
          width: 12, height: 12, borderRadius: '50%', background: '#fff',
          boxShadow: '0 0 8px rgba(255,255,255,0.8)', transition: 'left 0.2s linear', zIndex: 5,
        }} />
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="simViewerMain" style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {showAudit ? (
          <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.2)' }}>
            <AuditPanel metadata={metadata} homeTeam={homeTeam} awayTeam={awayTeam} metricsData={metricsData} />
          </div>
        ) : (
          <>
            {/* Left: Field + Stats */}
            <div className="simViewerLeft" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid var(--glass-border)', minHeight: 0 }}>
              <div className="simViewerFieldWrap" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at center, rgba(0,242,255,0.02) 0%, transparent 80%)', flexShrink: 0 }}>
                <div style={{ width: '100%' }}>
                  <HorizontalField ballPos={ballPos} goalFlash={goalFlash} visibleEvents={allEvents} homeTeam={homeTeam} awayTeam={awayTeam} />
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                <StatsStrip stats={stats} homeTeam={homeTeam} awayTeam={awayTeam} />
              </div>
            </div>

            {/* Right: Commentary + Behavioral Matrix (smaller) */}
            <div className="simViewerSide" style={{ display: 'flex', width: 320, flexShrink: 0, overflow: 'hidden', background: 'rgba(0,0,0,0.1)', minHeight: 0 }}>
              {/* Commentary */}
              <div className="simViewerLogCol" style={{ width: 160, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--glass-border)', minHeight: 0, overflow: 'hidden' }}>
                <EventLog visibleEvents={allEvents} eventLogRef={eventLogRef} />
              </div>

              {/* Behavioral Matrix */}
              <div data-tour="bim-section" className="simViewerMatrixCol" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
                <div style={{ padding: '10px 12px', color: 'var(--accent-cyan)', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, borderBottom: '1px solid var(--glass-border)', background: 'rgba(0,242,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <span>DAVRANIŞ MATRİSİ</span>
                  <span style={{ color: 'var(--text-tertiary)', fontWeight: 800 }}>{currentMinute}'</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px', scrollbarWidth: 'none' }}>
                  {currentBehavioralState ? (
                    <BehavioralGrid behavioralAnalysis={currentBehavioralState} homeTeam={homeTeam} awayTeam={awayTeam} compact />
                  ) : (
                    <div style={{ padding: 30, color: 'var(--text-tertiary)', fontSize: 11, textAlign: 'center', fontStyle: 'italic' }}>
                      Simülasyon başlatın...
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes goalPulse {
          0%   { background: rgba(255,140,0,0.05); }
          50%  { background: rgba(255,140,0,0.18); }
          100% { background: rgba(255,140,0,0.05); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .simViewerMain  { min-height: 0; }
        .simViewerLeft  { min-height: 0; }
        .simViewerFieldWrap {
          height: clamp(280px, 46vh, 540px);
          box-sizing: border-box;
        }
        .simViewerSide, .simViewerLogCol, .simViewerMatrixCol { min-height: 0; }
      `}</style>
    </div>
  );
}
