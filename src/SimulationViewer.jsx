import React, { useState, useEffect, useRef, useMemo } from 'react';

const EVENT_ICONS = {
  goal: '⚽',
  shot: '👟',
  shot_on_target: '🎯',
  yellow_card: '🟡',
  red_card: '🔴',
  corner: '🚩',
  substitution: '🔄',
  injury: '🏥',
  penalty: '🏳️',
  halftime: '⏸',
  fulltime: '⏸',
};

const EVENT_COLORS = {
  goal: '#ffd700',
  shot: '#4a9eff',
  shot_on_target: '#00e5ff',
  yellow_card: '#ffeb3b',
  red_card: '#f44336',
  corner: '#66bb6a',
  substitution: '#ce93d8',
  injury: '#ffa726',
  penalty: '#e0e0e0',
  halftime: '#9e9e9e',
  fulltime: '#9e9e9e',
};

function getBallPosition(events, currentMinute) {
  const recent = [...events]
    .filter(e => e.minute <= currentMinute)
    .slice(-1)[0];

  if (!recent) return { x: 50, y: 50 };

  const isHome = recent.team === 'home';

  switch (recent.type) {
    case 'goal':
      return isHome ? { x: 50, y: 8 } : { x: 50, y: 92 };
    case 'shot':
    case 'shot_on_target':
    case 'penalty':
      return isHome ? { x: 50, y: 18 } : { x: 50, y: 82 };
    case 'corner':
      if (isHome) return { x: Math.random() > 0.5 ? 3 : 97, y: 5 };
      return { x: Math.random() > 0.5 ? 3 : 97, y: 95 };
    default:
      return { x: 50, y: 50 };
  }
}

function StatBar({ value, max, color, align = 'left' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{
      width: 60,
      height: 6,
      background: 'rgba(255,255,255,0.1)',
      borderRadius: 3,
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
    }}>
      <div style={{
        width: `${pct}%`,
        height: '100%',
        background: color,
        borderRadius: 3,
        marginLeft: align === 'right' ? 'auto' : 0,
        transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

function MultiRunView({ multiRunResult, homeTeam, awayTeam }) {
  if (!multiRunResult) return null;

  const { distribution, runs } = multiRunResult;
  if (!distribution) return null;

  // distribution fields are already percentages (0–100)
  const homeWinPct = distribution.homeWin ?? 0;
  const drawPct = distribution.draw ?? 0;
  const awayWinPct = distribution.awayWin ?? 0;
  const over25Pct = distribution.over25 ?? 0;
  const bttsPct = distribution.btts ?? 0;
  const avgGoals = distribution.avgGoals?.toFixed(2) ?? '—';

  const topScores = Object.entries(distribution.scoreFrequency || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const resultBars = [
    { label: homeTeam + ' Galibi', pct: homeWinPct, color: '#4a9eff' },
    { label: 'Beraberlik', pct: drawPct, color: '#9e9e9e' },
    { label: awayTeam + ' Galibi', pct: awayWinPct, color: '#ff6b6b' },
  ];

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Result distribution */}
      <div>
        <div style={{ color: '#aaa', fontSize: 12, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          Sonuç Dağılımı ({runs} simülasyon)
        </div>
        {resultBars.map(bar => (
          <div key={bar.label} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#ccc', fontSize: 13 }}>{bar.label}</span>
              <span style={{ color: bar.color, fontWeight: 700, fontSize: 14 }}>{bar.pct}%</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 4, height: 10, overflow: 'hidden' }}>
              <div style={{
                width: `${bar.pct}%`,
                height: '100%',
                background: bar.color,
                borderRadius: 4,
                transition: 'width 0.6s ease',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Score frequency */}
      <div>
        <div style={{ color: '#aaa', fontSize: 12, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
          En Sık Sonuçlar
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {topScores.map(([score, count]) => (
            <div key={score} style={{
              display: 'flex',
              justifyContent: 'space-between',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: 6,
              padding: '5px 10px',
            }}>
              <span style={{ color: '#e0e0e0', fontWeight: 600 }}>{score}</span>
              <span style={{ color: '#aaa', fontSize: 12 }}>%{typeof count === 'number' ? count.toFixed(1) : count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Over/Under & BTTS */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 12 }}>
          <div style={{ color: '#aaa', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            Üst/Alt 2.5
          </div>
          <div style={{ color: '#4a9eff', fontSize: 16, fontWeight: 700 }}>Üst: {over25Pct}%</div>
          <div style={{ color: '#ff6b6b', fontSize: 16, fontWeight: 700 }}>Alt: {100 - over25Pct}%</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 12 }}>
          <div style={{ color: '#aaa', fontSize: 11, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
            KG Var/Yok
          </div>
          <div style={{ color: '#66bb6a', fontSize: 16, fontWeight: 700 }}>Var: {bttsPct}%</div>
          <div style={{ color: '#ff6b6b', fontSize: 16, fontWeight: 700 }}>Yok: {100 - bttsPct}%</div>
        </div>
      </div>

      {/* Avg goals */}
      <div style={{
        background: 'rgba(255,215,0,0.08)',
        border: '1px solid rgba(255,215,0,0.2)',
        borderRadius: 8,
        padding: '10px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: '#aaa', fontSize: 13 }}>Ortalama Gol</span>
        <span style={{ color: '#ffd700', fontSize: 22, fontWeight: 700 }}>{avgGoals}</span>
      </div>
    </div>
  );
}

export default function SimulationViewer({ simulation, homeTeam, awayTeam, isMultiRun, multiRunResult }) {
  const [currentMinute, setCurrentMinute] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [goalFlash, setGoalFlash] = useState(false);
  const intervalRef = useRef(null);
  const eventLogRef = useRef(null);
  const prevSimRef = useRef(null);

  // Reset when simulation changes
  useEffect(() => {
    if (simulation !== prevSimRef.current) {
      prevSimRef.current = simulation;
      setCurrentMinute(0);
      setIsPlaying(false);
      setGoalFlash(false);
    }
  }, [simulation]);

  // Playback loop
  useEffect(() => {
    clearInterval(intervalRef.current);
    if (isPlaying && simulation) {
      intervalRef.current = setInterval(() => {
        setCurrentMinute(m => {
          if (m >= 95) {
            setIsPlaying(false);
            return 95;
          }
          return m + 1;
        });
      }, 1000 / speed);
    }
    return () => clearInterval(intervalRef.current);
  }, [isPlaying, speed, simulation]);

  // Goal flash effect
  const visibleEvents = useMemo(() => {
    if (!simulation?.events) return [];
    return simulation.events.filter(e => e.minute <= currentMinute);
  }, [simulation, currentMinute]);

  const lastGoal = useMemo(() => {
    return [...visibleEvents].reverse().find(e => e.type === 'goal');
  }, [visibleEvents]);

  const prevGoalRef = useRef(null);
  useEffect(() => {
    if (lastGoal && lastGoal !== prevGoalRef.current) {
      prevGoalRef.current = lastGoal;
      setGoalFlash(true);
      setTimeout(() => setGoalFlash(false), 1200);
    }
  }, [lastGoal]);

  // Auto-scroll event log
  useEffect(() => {
    if (eventLogRef.current) {
      eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
    }
  }, [visibleEvents.length]);

  // Stats
  const stats = useMemo(() => {
    const base = { shots: 0, shotsOnTarget: 0, goals: 0, yellowCards: 0, redCards: 0, corners: 0 };
    const home = { ...base };
    const away = { ...base };
    for (const e of visibleEvents) {
      const s = e.team === 'home' ? home : away;
      if (e.type === 'shot') s.shots++;
      if (e.type === 'shot_on_target') { s.shots++; s.shotsOnTarget++; }
      if (e.type === 'goal') { s.goals++; s.shots++; s.shotsOnTarget++; }
      if (e.type === 'yellow_card') s.yellowCards++;
      if (e.type === 'red_card') s.redCards++;
      if (e.type === 'corner') s.corners++;
    }
    // Possession estimate
    const totalShots = home.shots + away.shots || 2;
    const homePoss = Math.round(((home.shots + 1) / (totalShots + 2)) * 100);
    return { home, away, homePoss, awayPoss: 100 - homePoss };
  }, [visibleEvents]);

  // Score
  const homeGoals = stats.home.goals;
  const awayGoals = stats.away.goals;

  // Ball position
  const ballPos = useMemo(() => {
    if (!simulation?.events) return { x: 50, y: 50 };
    return getBallPosition(simulation.events, currentMinute);
  }, [simulation, currentMinute]);

  const handleProgressClick = (e) => {
    if (!simulation) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setCurrentMinute(Math.round(ratio * 95));
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentMinute(0);
  };

  // ── STYLES ──────────────────────────────────────────────────────────────────

  const containerStyle = {
    background: 'var(--glass-bg, rgba(255,255,255,0.05))',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'inherit',
    color: '#e0e0e0',
  };

  const scoreHeaderStyle = {
    background: goalFlash
      ? 'linear-gradient(135deg, rgba(255,215,0,0.3), rgba(255,165,0,0.2))'
      : 'rgba(0,0,0,0.3)',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    padding: '14px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    transition: 'background 0.3s ease',
    animation: goalFlash ? 'goalPulse 0.6s ease 2' : 'none',
  };

  const teamNameStyle = {
    fontSize: 16,
    fontWeight: 700,
    color: '#e0e0e0',
    minWidth: 100,
    letterSpacing: 0.5,
  };

  const scoreBadgeStyle = {
    fontSize: 32,
    fontWeight: 900,
    color: goalFlash ? '#ffd700' : '#ffffff',
    margin: '0 6px',
    transition: 'color 0.3s',
    textShadow: goalFlash ? '0 0 20px #ffd700' : 'none',
    minWidth: 40,
    textAlign: 'center',
  };

  const playBtnStyle = {
    background: 'linear-gradient(135deg, #00e5ff, #4a9eff)',
    border: 'none',
    borderRadius: 8,
    color: '#000',
    fontWeight: 700,
    fontSize: 18,
    width: 40,
    height: 36,
    cursor: 'pointer',
    boxShadow: '0 0 12px rgba(0,229,255,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'box-shadow 0.2s',
  };

  const resetBtnStyle = {
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 8,
    color: '#ccc',
    fontWeight: 700,
    fontSize: 16,
    width: 36,
    height: 36,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const speedSelectStyle = {
    background: 'rgba(0,0,0,0.5)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 6,
    color: '#ccc',
    fontSize: 12,
    padding: '2px 6px',
    cursor: 'pointer',
    height: 28,
  };

  const panelsStyle = {
    display: 'flex',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  };

  const eventLogStyle = {
    width: 210,
    height: '100%',
    borderRight: '1px solid rgba(255,255,255,0.08)',
    overflowY: 'auto',
    padding: '8px 0',
    flexShrink: 0,
    scrollbarWidth: 'thin',
    scrollbarColor: 'rgba(255,255,255,0.2) transparent',
    boxSizing: 'border-box',
  };

  const centerPanelStyle = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px 12px',
    gap: 12,
    minWidth: 0,
  };

  const statsPanelStyle = {
    width: 200,
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    padding: '14px 12px',
    flexShrink: 0,
    overflowY: 'auto',
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────

  if (isMultiRun && multiRunResult) {
    return (
      <div style={containerStyle}>
        <div style={{ ...scoreHeaderStyle, justifyContent: 'center', gap: 20 }}>
          <span style={{ ...teamNameStyle, textAlign: 'right' }}>{homeTeam}</span>
          <span style={{ color: '#aaa', fontSize: 14, fontWeight: 600 }}>vs</span>
          <span style={{ ...teamNameStyle }}>{awayTeam}</span>
        </div>
        <MultiRunView multiRunResult={multiRunResult} homeTeam={homeTeam} awayTeam={awayTeam} />
      </div>
    );
  }

  if (!simulation) {
    return (
      <div style={{ ...containerStyle, alignItems: 'center', justifyContent: 'center', minHeight: 320, gap: 12 }}>
        <div style={{ fontSize: 48 }}>⚽</div>
        <div style={{ color: '#aaa', fontSize: 16 }}>Simülasyon başlatın</div>
        <div style={{ color: '#666', fontSize: 13 }}>Tahmin motorundan simülasyon çalıştırın</div>
      </div>
    );
  }

  const statRows = [
    { label: 'Şut', homeVal: stats.home.shots, awayVal: stats.away.shots },
    { label: 'İsabetli', homeVal: stats.home.shotsOnTarget, awayVal: stats.away.shotsOnTarget },
    { label: 'Gol', homeVal: stats.home.goals, awayVal: stats.away.goals },
    { label: 'Sarı Kart', homeVal: stats.home.yellowCards, awayVal: stats.away.yellowCards },
    { label: 'Kırmızı', homeVal: stats.home.redCards, awayVal: stats.away.redCards },
    { label: 'Korner', homeVal: stats.home.corners, awayVal: stats.away.corners },
  ];

  const goalEvents = visibleEvents.filter(e => e.type === 'goal');
  const cardEvents = visibleEvents.filter(e => e.type === 'yellow_card' || e.type === 'red_card');

  return (
    <div style={containerStyle}>
      {/* Score header */}
      <div style={scoreHeaderStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
          <span style={{ ...teamNameStyle, textAlign: 'right', flex: 1 }}>{homeTeam}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            <span style={scoreBadgeStyle}>{homeGoals}</span>
            <span style={{ color: '#666', fontSize: 24, fontWeight: 300 }}>-</span>
            <span style={scoreBadgeStyle}>{awayGoals}</span>
          </div>
          <span style={{ ...teamNameStyle, flex: 1 }}>{awayTeam}</span>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#aaa', fontSize: 13, minWidth: 30 }}>{currentMinute}'</span>
          <select
            value={speed}
            onChange={e => setSpeed(Number(e.target.value))}
            style={speedSelectStyle}
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={5}>5x</option>
          </select>
          <button
            style={playBtnStyle}
            onClick={() => setIsPlaying(p => !p)}
            title={isPlaying ? 'Duraklat' : 'Oynat'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button style={resetBtnStyle} onClick={handleReset} title="Sıfırla">↺</button>
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 6,
          background: 'rgba(255,255,255,0.08)',
          cursor: 'pointer',
          position: 'relative',
        }}
        onClick={handleProgressClick}
        title="Dakikaya atla"
      >
        <div style={{
          height: '100%',
          width: `${(currentMinute / 95) * 100}%`,
          background: 'linear-gradient(90deg, #4a9eff, #00e5ff)',
          transition: 'width 0.3s ease',
          borderRadius: '0 2px 2px 0',
        }} />
        <div style={{
          position: 'absolute',
          top: '50%',
          left: `${(currentMinute / 95) * 100}%`,
          transform: 'translate(-50%, -50%)',
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: '#00e5ff',
          boxShadow: '0 0 6px rgba(0,229,255,0.8)',
          transition: 'left 0.3s ease',
        }} />
      </div>

      {/* Panels */}
      <div style={{ ...panelsStyle, height: 420, minHeight: 0 }}>

        {/* Event log */}
        <div ref={eventLogRef} style={eventLogStyle}>
          <div style={{ padding: '4px 10px 8px', color: '#aaa', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 4 }}>
            Maç Olayları
          </div>
          {visibleEvents.length === 0 && (
            <div style={{ padding: '20px 10px', color: '#555', fontSize: 13, textAlign: 'center' }}>
              Henüz olay yok
            </div>
          )}
          {visibleEvents.map((ev, i) => {
            const isGoal = ev.type === 'goal';
            const isHome = ev.team === 'home';
            const color = EVENT_COLORS[ev.type] || '#aaa';
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 6,
                  padding: '5px 10px',
                  background: isGoal ? 'rgba(255,215,0,0.08)' : 'transparent',
                  borderLeft: isGoal ? '2px solid #ffd700' : '2px solid transparent',
                  transition: 'background 0.3s',
                }}
              >
                <span style={{
                  fontSize: 10,
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: 4,
                  padding: '1px 5px',
                  color: '#ccc',
                  flexShrink: 0,
                  minWidth: 28,
                  textAlign: 'center',
                  marginTop: 1,
                }}>
                  {ev.minute}'
                </span>
                <span style={{ fontSize: 14, flexShrink: 0 }}>{EVENT_ICONS[ev.type] || '•'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                    <span style={{
                      fontSize: 9,
                      background: isHome ? 'rgba(74,158,255,0.25)' : 'rgba(255,107,107,0.25)',
                      color: isHome ? '#4a9eff' : '#ff6b6b',
                      borderRadius: 3,
                      padding: '1px 4px',
                      fontWeight: 700,
                      letterSpacing: 0.5,
                    }}>
                      {isHome ? 'EV' : 'DEP'}
                    </span>
                    <span style={{ color, fontSize: 11, fontWeight: 600 }}>
                      {ev.type === 'goal' ? 'GOL' : ev.type?.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {ev.player && (
                    <div style={{ color: '#bbb', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.player}
                    </div>
                  )}
                  {ev.type === 'goal' && ev.assist && (
                    <div style={{ color: '#888', fontSize: 10 }}>
                      Asist: {ev.assist}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Center pitch */}
        <div style={centerPanelStyle}>
          <div style={{ width: '100%', maxWidth: 220, position: 'relative' }}>
            {/* Pitch */}
            <div style={{
              background: '#2d6a2d',
              width: '100%',
              aspectRatio: '68/105',
              position: 'relative',
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.15)',
              overflow: 'hidden',
            }}>
              {/* Grass stripes */}
              {[...Array(7)].map((_, i) => (
                <div key={i} style={{
                  position: 'absolute',
                  top: `${i * 14.28}%`,
                  left: 0, right: 0,
                  height: '14.28%',
                  background: i % 2 === 0 ? 'rgba(0,0,0,0.06)' : 'transparent',
                }} />
              ))}

              {/* Outer border line */}
              <div style={{
                position: 'absolute',
                top: 4, left: 4, right: 4, bottom: 4,
                border: '1px solid rgba(255,255,255,0.45)',
                borderRadius: 2,
              }} />

              {/* Center line */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '5%',
                right: '5%',
                height: 1,
                background: 'rgba(255,255,255,0.5)',
              }} />

              {/* Center circle */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%,-50%)',
                width: '24%',
                aspectRatio: '1',
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.5)',
              }} />

              {/* Center dot */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%,-50%)',
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.5)',
              }} />

              {/* Home penalty area (bottom) */}
              <div style={{
                position: 'absolute',
                bottom: 4,
                left: '22%',
                right: '22%',
                height: '18%',
                border: '1px solid rgba(255,255,255,0.5)',
              }} />
              {/* Home goal area (bottom) */}
              <div style={{
                position: 'absolute',
                bottom: 4,
                left: '36%',
                right: '36%',
                height: '8%',
                border: '1px solid rgba(255,255,255,0.4)',
              }} />
              {/* Home goal */}
              <div style={{
                position: 'absolute',
                bottom: 2,
                left: '40%',
                right: '40%',
                height: '3%',
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.5)',
              }} />

              {/* Away penalty area (top) */}
              <div style={{
                position: 'absolute',
                top: 4,
                left: '22%',
                right: '22%',
                height: '18%',
                border: '1px solid rgba(255,255,255,0.5)',
              }} />
              {/* Away goal area (top) */}
              <div style={{
                position: 'absolute',
                top: 4,
                left: '36%',
                right: '36%',
                height: '8%',
                border: '1px solid rgba(255,255,255,0.4)',
              }} />
              {/* Away goal */}
              <div style={{
                position: 'absolute',
                top: 2,
                left: '40%',
                right: '40%',
                height: '3%',
                background: 'rgba(255,255,255,0.15)',
                border: '1px solid rgba(255,255,255,0.5)',
              }} />

              {/* Team labels */}
              <div style={{
                position: 'absolute',
                top: '26%',
                left: '50%',
                transform: 'translate(-50%,-50%)',
                color: 'rgba(255,255,255,0.25)',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}>
                {awayTeam}
              </div>
              <div style={{
                position: 'absolute',
                top: '74%',
                left: '50%',
                transform: 'translate(-50%,-50%)',
                color: 'rgba(255,255,255,0.25)',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}>
                {homeTeam}
              </div>

              {/* Ball */}
              <div style={{
                position: 'absolute',
                top: `${ballPos.y}%`,
                left: `${ballPos.x}%`,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: goalFlash ? '#ffd700' : 'white',
                transform: 'translate(-50%,-50%)',
                transition: 'all 0.5s ease, background 0.3s',
                boxShadow: goalFlash
                  ? '0 0 16px 4px rgba(255,215,0,0.9)'
                  : '0 0 8px rgba(255,255,255,0.8)',
                zIndex: 10,
              }} />

              {/* Recent event indicators */}
              {visibleEvents.slice(-3).map((ev, i) => {
                const pos = getBallPosition([ev], ev.minute);
                const opacity = 0.2 + i * 0.15;
                return (
                  <div key={i} style={{
                    position: 'absolute',
                    top: `${pos.y}%`,
                    left: `${pos.x}%`,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: EVENT_COLORS[ev.type] || '#aaa',
                    transform: 'translate(-50%,-50%)',
                    opacity,
                    pointerEvents: 'none',
                  }} />
                );
              })}
            </div>

            {/* Minute label */}
            <div style={{ textAlign: 'center', marginTop: 8, color: '#aaa', fontSize: 12 }}>
              <span style={{ color: '#00e5ff', fontWeight: 700, fontSize: 16 }}>{currentMinute}'</span>
              <span style={{ color: '#555', marginLeft: 4 }}>/ 95'</span>
            </div>
          </div>
        </div>

        {/* Stats panel */}
        <div style={statsPanelStyle}>
          <div style={{ color: '#aaa', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, textAlign: 'center' }}>
            İstatistikler
          </div>

          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 4, marginBottom: 6 }}>
            <div style={{ color: '#4a9eff', fontSize: 10, fontWeight: 700, textAlign: 'center' }}>EV</div>
            <div style={{ width: 70 }} />
            <div style={{ color: '#ff6b6b', fontSize: 10, fontWeight: 700, textAlign: 'center' }}>DEP</div>
          </div>

          {statRows.map(({ label, homeVal, awayVal }) => {
            const max = Math.max(homeVal, awayVal, 1);
            return (
              <div key={label} style={{ marginBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 4 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 700 }}>{homeVal}</div>
                    <StatBar value={homeVal} max={max} color="#4a9eff" align="right" />
                  </div>
                  <div style={{ color: '#666', fontSize: 10, width: 70, textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {label}
                  </div>
                  <div>
                    <div style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 700 }}>{awayVal}</div>
                    <StatBar value={awayVal} max={max} color="#ff6b6b" />
                  </div>
                </div>
              </div>
            );
          })}

          {/* Possession */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 4 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 700 }}>{stats.homePoss}%</div>
              </div>
              <div style={{ color: '#666', fontSize: 10, width: 70, textAlign: 'center' }}>Top Kont.</div>
              <div>
                <div style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 700 }}>{stats.awayPoss}%</div>
              </div>
            </div>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 4 }}>
              <div style={{ width: `${stats.homePoss}%`, background: '#4a9eff', transition: 'width 0.4s' }} />
              <div style={{ flex: 1, background: '#ff6b6b' }} />
            </div>
          </div>

          {/* Goal scorers */}
          {goalEvents.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
              <div style={{ color: '#ffd700', fontSize: 11, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                ⚽ Goller
              </div>
              {goalEvents.map((ev, i) => (
                <div key={i} style={{ fontSize: 11, color: '#ccc', marginBottom: 3, display: 'flex', gap: 4 }}>
                  <span style={{ color: ev.team === 'home' ? '#4a9eff' : '#ff6b6b' }}>{ev.minute}'</span>
                  <span>{ev.player || '—'}</span>
                </div>
              ))}
            </div>
          )}

          {/* Cards */}
          {cardEvents.length > 0 && (
            <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
              <div style={{ color: '#ffeb3b', fontSize: 11, fontWeight: 700, marginBottom: 6 }}>
                🟡 Kartlar
              </div>
              {cardEvents.map((ev, i) => (
                <div key={i} style={{ fontSize: 11, color: '#ccc', marginBottom: 3, display: 'flex', gap: 4 }}>
                  <span>{ev.type === 'yellow_card' ? '🟡' : '🔴'}</span>
                  <span style={{ color: ev.team === 'home' ? '#4a9eff' : '#ff6b6b' }}>{ev.minute}'</span>
                  <span>{ev.player || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes goalPulse {
          0% { background: rgba(255,215,0,0.1); }
          50% { background: rgba(255,215,0,0.35); }
          100% { background: rgba(255,215,0,0.1); }
        }
      `}</style>
    </div>
  );
}
