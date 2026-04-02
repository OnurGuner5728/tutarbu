import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Trophy, Users, Zap, Calendar,
  AlertTriangle, ChevronDown, ChevronUp, Globe,
  TrendingUp, Target, Shield, Activity, History, Bug
} from 'lucide-react';
import DebugPage from './DebugPage';

export default function App() {
  const [matches, setMatches] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [matchLoading, setMatchLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState('summary');
  const [workshopSide, setWorkshopSide] = useState('home');
  const [error, setError] = useState(null);
  const [workshopLoading, setWorkshopLoading] = useState(false);
  const [modifiedLineup, setModifiedLineup] = useState({ home: null, away: null });
  const [originalLineupIds, setOriginalLineupIds] = useState({ home: new Set(), away: new Set() });
  const [swapMode, setSwapMode] = useState(null);
  const [debugEventId, setDebugEventId] = useState(null);
  const tabPaneRef = useRef(null);
  const autoRefreshRef = useRef(null);

  useEffect(() => {
    fetchMatches(selectedDate);
  }, [selectedDate]);

  // Auto-refresh for live matches — polls every 60s
  useEffect(() => {
    if (selectedMatch?.isLive && prediction) {
      autoRefreshRef.current = setInterval(() => {
        fetchPrediction(selectedMatch.id);
      }, 60000);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [selectedMatch?.id, selectedMatch?.isLive]);

  const fetchMatches = async (dateStr = selectedDate) => {
    setError(null);
    setMatchLoading(true);
    try {
      const response = await fetch(`/api/matches?date=${dateStr}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      setMatches(data);
    } catch (err) {
      console.error('Failed to fetch matches', err);
      setError('Maç listesi yüklenemedi. Sunucu çalışıyor mu?');
    } finally {
      setMatchLoading(false);
    }
  };

  const fetchPrediction = async (id, lineup = null) => {
    setError(null);
    const isWorkshop =
      lineup !== null &&
      lineup !== undefined &&
      (lineup.home !== null || lineup.away !== null);

    if (isWorkshop) {
      setWorkshopLoading(true);
    } else {
      setLoading(true);
      setPrediction(null);
    }

    try {
      const endpoint = isWorkshop ? `/api/workshop/${id}` : `/api/predict/${id}`;
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modifiedLineup: lineup }),
      };

      const response = await fetch(endpoint, options);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error('Sunucudan geçersiz JSON yanıtı alındı.');
      }

      setPrediction(data);

      if (!isWorkshop && data.lineups) {
        const homeIds = new Set(
          (data.lineups.home?.players ?? []).map(p => p?.player?.id).filter(Boolean)
        );
        const awayIds = new Set(
          (data.lineups.away?.players ?? []).map(p => p?.player?.id).filter(Boolean)
        );
        setOriginalLineupIds({ home: homeIds, away: awayIds });
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Tahmin alınamadı. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
      setWorkshopLoading(false);
    }
  };

  const handleMatchSelect = (match) => {
    if (loading) return;
    setSelectedMatch(match);
    setModifiedLineup({ home: null, away: null });
    setSwapMode(null);
    setActiveTab('summary');
    fetchPrediction(match.id);
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tabPaneRef.current) tabPaneRef.current.scrollTop = 0;
  };

  // Group matches by league
  const groupedMatches = React.useMemo(() => {
    const groups = {};
    for (const m of matches) {
      const league = m.tournament || 'Other';
      if (!groups[league]) groups[league] = [];
      groups[league].push(m);
    }
    return groups;
  }, [matches]);

  return (
    <div className="dashboard-container">
      <aside className="match-sidebar glass-card" style={{ borderRadius: 0, padding: 0, border: 'none', borderRight: '1px solid var(--glass-border)' }}>
        <div className="sidebar-header">
          <input
            type="date"
            className="date-picker-input"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            disabled={matchLoading || loading}
          />
          <button
            className="refresh-btn"
            onClick={() => fetchMatches(selectedDate)}
            disabled={matchLoading || loading}
            aria-label="Refresh match list"
          >
            <Globe size={14} />
          </button>
        </div>
        {matchLoading ? (
          <div className="mini-loader">Fetching matches...</div>
        ) : (
          <div className="match-scroll-list">
            {matches.length === 0 && (
              <div className="empty-match-list">No matches scheduled for this date.</div>
            )}
            {Object.entries(groupedMatches).map(([league, leagueMatches]) => (
              <div key={league} className="league-group">
                <div className="league-group-header">{league}</div>
                {leagueMatches.map(m => (
                  <div
                    key={m.id}
                    className={`match-item ${selectedMatch?.id === m.id ? 'active' : ''} ${loading ? 'disabled' : ''}`}
                    onClick={() => handleMatchSelect(m)}
                    role="button"
                    tabIndex={loading ? -1 : 0}
                    aria-pressed={selectedMatch?.id === m.id}
                    aria-label={`${m.homeTeam} vs ${m.awayTeam}, ${m.tournament}${m.isLive ? ', LIVE' : ''}`}
                    onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !loading) handleMatchSelect(m); }}
                  >
                    <div className="m-meta">
                      <span className="m-time">{m.time}</span>
                      {m.isLive && <span className="live-pill">LIVE</span>}
                    </div>
                    <div className="m-teams">
                      <div className="m-teams-row">
                        <span className="team-name">{m.homeTeam}</span>
                        {m.homeScore != null && <span className="m-score">{m.homeScore}</span>}
                      </div>
                      <div className="m-teams-row">
                        <span className="team-name">{m.awayTeam}</span>
                        {m.awayScore != null && <span className="m-score">{m.awayScore}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </aside>

      <main className="main-content-flow">
        <header className="glass-header">
          <div className="logo">
            <Zap className="accent-purple" size={26} />
            <span>TUTAR<span className="accent-cyan">BU</span></span>
          </div>
          {selectedMatch && (
            <div className="active-match-title">
              {selectedMatch.homeTeam} vs {selectedMatch.awayTeam}
              {selectedMatch.isLive && <span style={{ color: '#ff4444', marginLeft: 8, fontSize: '0.7rem' }}>● LIVE</span>}
            </div>
          )}
        </header>

        {error && (
          <div className="error-banner">
            <AlertTriangle size={16} /> {error}
            {selectedMatch && (
              <button className="retry-btn" onClick={() => fetchPrediction(selectedMatch.id)}>
                Tekrar Dene
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="loading-screen-embed">
            <div className="scanner"></div>
            <p>Gathering 168 Metrics for Analysis...</p>
          </div>
        ) : prediction ? (
          <div className="prediction-grid">
            <div className="analysis-column">
              <nav className="tabs" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {[
                  { key: 'summary', label: 'Analysis', icon: <TrendingUp size={14} /> },
                  { key: 'goals', label: 'Goals Market', icon: <Target size={14} /> },
                  { key: 'form', label: 'Form & H2H', icon: <History size={14} /> },
                  { key: 'workshop', label: 'Workshop', icon: <Users size={14} /> },
                  { key: 'metrics', label: 'Metric Ledger', icon: <Activity size={14} /> },
                ].map(t => (
                  <button
                    key={t.key}
                    className={activeTab === t.key ? 'active' : ''}
                    onClick={() => handleTabChange(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
                <button
                  title="API Debug"
                  style={{
                    marginLeft: 'auto',
                    background: 'rgba(160,196,255,0.08)',
                    border: '1px solid rgba(160,196,255,0.2)',
                    borderRadius: '6px',
                    color: '#a0c4ff',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.72rem',
                    letterSpacing: '0.5px',
                  }}
                  onClick={() => setDebugEventId(selectedMatch?.id ?? null)}
                >
                  <Bug size={12} /> Debug
                </button>
              </nav>

              <div className="tab-pane" ref={tabPaneRef}>
                {/* ──── API DEBUG PAGE ──── */}
                {debugEventId && (
                  <DebugPage
                    eventId={debugEventId}
                    onBack={() => setDebugEventId(null)}
                  />
                )}
                {/* ──── ANALYSIS SUMMARY ──── */}
                {!debugEventId && (<>
                {activeTab === 'summary' && (
                  <>
                    <div className="score-hero">
                      <div className="score-circle">
                        <span className="score-val">{prediction.score?.predicted ?? '-'}</span>
                        <span className="score-label">Predicted</span>
                      </div>
                      <div className="score-details">
                        <div className="l-box">
                          Probable Score: {prediction.result?.mostLikelyResult ?? '-'}
                        </div>
                        <div className="l-box">
                          KG Var (BTTS): %{prediction.goals?.btts ?? '-'}
                        </div>
                        {prediction.score?.top5 && (
                          <div className="top5-scores">
                            {prediction.score.top5.map((s, i) => (
                              <div key={i} className="top5-score-chip">
                                {s.score} <span className="chip-prob">%{s.probability}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Power Comparison Mini */}
                    <div className="glass-card" style={{ marginBottom: 16 }}>
                      <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', marginBottom: 14 }}>
                        <Shield size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                        Power Comparison
                      </h4>
                      <div className="comparison-grid" style={{ margin: 0 }}>
                        <div className="comparison-header">
                          <span>Metric</span>
                          <span>{prediction.match?.homeTeam?.split(' ')[0] || '-'}</span>
                          <span>{prediction.match?.awayTeam?.split(' ')[0] || '-'}</span>
                        </div>
                        {[
                          ['Hücum', prediction.comparison?.home?.attackPower, prediction.comparison?.away?.attackPower],
                          ['Defans', prediction.comparison?.home?.defensePower, prediction.comparison?.away?.defensePower],
                          ['Form', prediction.comparison?.home?.form, prediction.comparison?.away?.form],
                          ['Oyuncu', prediction.comparison?.home?.playerQuality, prediction.comparison?.away?.playerQuality],
                          ['Kaleci', prediction.comparison?.home?.goalkeeperPower, prediction.comparison?.away?.goalkeeperPower],
                          ['Momentum', prediction.comparison?.home?.momentum, prediction.comparison?.away?.momentum],
                          ['TOPLAM', prediction.comparison?.home?.overallPower, prediction.comparison?.away?.overallPower],
                        ].map(([label, homeVal, awayVal]) => (
                          <div className="comparison-row" key={label}>
                            <span className="comp-label">{label}</span>
                            <span className={`comp-val ${homeVal != null && awayVal != null && homeVal > awayVal ? 'winner' : ''}`}>
                              {homeVal != null ? Number(homeVal).toFixed(1) : '-'}
                            </span>
                            <span className={`comp-val ${homeVal != null && awayVal != null && awayVal > homeVal ? 'winner' : ''}`}>
                              {awayVal != null ? Number(awayVal).toFixed(1) : '-'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="glass-card insights-mini">
                      <h4>Engine Insights</h4>
                      <ul>
                        {(prediction.highlights ?? []).map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                        {(prediction.highlights ?? []).length === 0 && (
                          <li style={{ color: 'var(--text-tertiary)' }}>Bu maç için özel içgörü bulunamadı.</li>
                        )}
                      </ul>
                    </div>
                  </>
                )}

                {/* ──── GOALS MARKET ──── */}
                {activeTab === 'goals' && (
                  <div className="goals-market">
                    {/* Over/Under */}
                    <div className="market-card">
                      <h5>Üst / Alt Gol</h5>
                      {[
                        ['Üst 1.5', prediction.goals?.over15, prediction.goals?.under15, 'Alt 1.5'],
                        ['Üst 2.5', prediction.goals?.over25, prediction.goals?.under25, 'Alt 2.5'],
                        ['Üst 3.5', prediction.goals?.over35, prediction.goals?.under35, 'Alt 3.5'],
                      ].map(([overLabel, overVal, underVal, underLabel]) => (
                        <div key={overLabel}>
                          <div className="market-row">
                            <span className="market-label">{overLabel}</span>
                            <span className={`market-value ${overVal > 60 ? 'high' : overVal > 40 ? 'mid' : 'low'}`}>
                              %{overVal ?? '-'}
                            </span>
                          </div>
                          <div className="market-bar">
                            <div className="market-bar-fill green" style={{ width: `${overVal ?? 0}%` }} />
                          </div>
                          <div className="market-row" style={{ paddingTop: 4 }}>
                            <span className="market-label">{underLabel}</span>
                            <span className={`market-value ${underVal > 60 ? 'high' : underVal > 40 ? 'mid' : 'low'}`}>
                              %{underVal ?? '-'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* BTTS */}
                    <div className="market-card">
                      <h5>KG Var / Yok (BTTS)</h5>
                      <div className="market-row">
                        <span className="market-label">KG Var</span>
                        <span className={`market-value ${(prediction.goals?.btts ?? 0) > 55 ? 'high' : 'mid'}`}>
                          %{prediction.goals?.btts ?? '-'}
                        </span>
                      </div>
                      <div className="market-bar">
                        <div className="market-bar-fill purple" style={{ width: `${prediction.goals?.btts ?? 0}%` }} />
                      </div>
                      <div className="market-row" style={{ paddingTop: 8 }}>
                        <span className="market-label">KG Yok</span>
                        <span className={`market-value ${(prediction.goals?.bttsNo ?? 0) > 55 ? 'high' : 'mid'}`}>
                          %{prediction.goals?.bttsNo ?? '-'}
                        </span>
                      </div>
                      <div className="market-bar">
                        <div className="market-bar-fill orange" style={{ width: `${prediction.goals?.bttsNo ?? 0}%` }} />
                      </div>
                    </div>

                    {/* First Half */}
                    <div className="market-card">
                      <h5>İlk Yarı</h5>
                      <div className="market-row">
                        <span className="market-label">İY Sonucu</span>
                        <span className="market-value" style={{ color: 'var(--accent-cyan)' }}>
                          {prediction.firstHalf?.htResult ?? '-'}
                        </span>
                      </div>
                      <div className="market-row">
                        <span className="market-label">İY Üst 0.5</span>
                        <span className="market-value">%{prediction.firstHalf?.over05HT ?? '-'}</span>
                      </div>
                      <div className="market-bar">
                        <div className="market-bar-fill cyan" style={{ width: `${prediction.firstHalf?.over05HT ?? 0}%` }} />
                      </div>
                      <div className="market-row" style={{ paddingTop: 8 }}>
                        <span className="market-label">İY Üst 1.5</span>
                        <span className="market-value">%{prediction.firstHalf?.over15HT ?? '-'}</span>
                      </div>
                      <div className="market-bar">
                        <div className="market-bar-fill cyan" style={{ width: `${prediction.firstHalf?.over15HT ?? 0}%` }} />
                      </div>
                    </div>

                    {/* First Goal + Corners + Cards */}
                    <div className="market-card">
                      <h5>İlk Gol</h5>
                      <div className="first-goal-panel">
                        <div className="first-goal-side">
                          <div className="fg-team">{prediction.match?.homeTeam ?? 'Ev'}</div>
                          <div className="fg-value home">%{prediction.firstGoal?.homeScoresFirst ?? '-'}</div>
                        </div>
                        <div className="fg-vs">vs</div>
                        <div className="first-goal-side">
                          <div className="fg-team">{prediction.match?.awayTeam ?? 'Dep'}</div>
                          <div className="fg-value away">%{prediction.firstGoal?.awayScoresFirst ?? '-'}</div>
                        </div>
                      </div>
                    </div>

                    <div className="market-card">
                      <h5>Korner Tahmini</h5>
                      <div className="market-row">
                        <span className="market-label">Ev Sahibi</span>
                        <span className="market-value">{prediction.corners?.expectedHome ?? '-'}</span>
                      </div>
                      <div className="market-row">
                        <span className="market-label">Deplasman</span>
                        <span className="market-value">{prediction.corners?.expectedAway ?? '-'}</span>
                      </div>
                      <div className="market-row" style={{ borderTop: '1px solid var(--glass-border)', marginTop: 4 }}>
                        <span className="market-label" style={{ fontWeight: 700 }}>Toplam</span>
                        <span className="market-value" style={{ color: 'var(--accent-cyan)' }}>
                          {prediction.corners?.expectedTotal ?? '-'}
                        </span>
                      </div>
                      <div className="market-row">
                        <span className="market-label">Üst 8.5</span>
                        <span className="market-value">%{prediction.corners?.over85 ?? '-'}</span>
                      </div>
                      <div className="market-row">
                        <span className="market-label">Üst 9.5</span>
                        <span className="market-value">%{prediction.corners?.over95 ?? '-'}</span>
                      </div>
                      <div className="market-row">
                        <span className="market-label">Üst 10.5</span>
                        <span className="market-value">%{prediction.corners?.over105 ?? '-'}</span>
                      </div>
                    </div>

                    <div className="market-card">
                      <h5>Kart Tahmini</h5>
                      <div className="market-row">
                        <span className="market-label">Sarı Kart ~</span>
                        <span className="market-value" style={{ color: '#ffcc00' }}>
                          {prediction.cards?.expectedYellowCards ?? '-'}
                        </span>
                      </div>
                      <div className="market-row">
                        <span className="market-label">Kırmızı Kart ~</span>
                        <span className="market-value" style={{ color: '#ff4444' }}>
                          {prediction.cards?.expectedRedCards ?? '-'}
                        </span>
                      </div>
                      <div className="market-row">
                        <span className="market-label">Üst 3.5 Kart</span>
                        <span className="market-value">%{prediction.cards?.over35Cards ?? '-'}</span>
                      </div>
                      <div className="market-row">
                        <span className="market-label">Üst 4.5 Kart</span>
                        <span className="market-value">%{prediction.cards?.over45Cards ?? '-'}</span>
                      </div>
                      <div className="market-row">
                        <span className="market-label">Hakem Sertliği</span>
                        <span className="market-value">{prediction.cards?.refereeSeverity != null ? Number(prediction.cards.refereeSeverity).toFixed(2) : '-'}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* ──── FORM & H2H ──── */}
                {activeTab === 'form' && (
                  <div className="form-h2h-container">
                    
                    {/* H2H BLOCK */}
                    <div className="h2h-summary-card">
                      <h4>Head to Head (H2H)</h4>
                      {prediction.h2hSummary ? (
                        <div className="h2h-stats">
                          <div className="h2h-stat-item">
                            <span className="h2h-stat-val" style={{color: 'var(--accent-cyan)'}}>{prediction.h2hSummary.team1Wins}</span>
                            <span className="h2h-stat-label">{prediction.match?.homeTeam}</span>
                          </div>
                          <div className="h2h-stat-item">
                            <span className="h2h-stat-val" style={{color: '#aaa'}}>{prediction.h2hSummary.draws}</span>
                            <span className="h2h-stat-label">Beraberlik</span>
                          </div>
                          <div className="h2h-stat-item">
                            <span className="h2h-stat-val" style={{color: 'var(--accent-purple)'}}>{prediction.h2hSummary.team2Wins}</span>
                            <span className="h2h-stat-label">{prediction.match?.awayTeam}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="h2h-stats"><span style={{color: 'var(--text-secondary)'}}>SofaScore H2H summary is missing.</span></div>
                      )}
                      
                      <div className="match-history-list">
                        {prediction.h2hMatches?.length > 0 ? prediction.h2hMatches.map((m, i) => (
                          <div key={i} className="history-row">
                            <div className="history-date">{m.startTimestamp ? m.startTimestamp.split('T')[0] : ''}</div>
                            <div className="history-teams">
                              <span className="history-team home">{m.homeTeam?.name || m.homeTeam}</span>
                              <span className="history-score">{m.homeScore?.current ?? '-'} : {m.awayScore?.current ?? '-'}</span>
                              <span className="history-team away">{m.awayTeam?.name || m.awayTeam}</span>
                            </div>
                          </div>
                        )) : (
                          <div className="history-row" style={{justifyContent: 'center', color: 'var(--text-secondary)'}}>
                            Son dönemde aralarında resmi maç bulunmuyor.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* RECENT FORM BLOCK */}
                    <div className="form-split">
                      
                      {/* HOME FORM */}
                      <div className="form-column">
                        <h4>{prediction.match?.homeTeam} - Son 6 Maç</h4>
                        <div className="form-badge-row">
                          {prediction.recentForm?.home?.map((m, i) => {
                            let res = 'D';
                            const isHome = m.homeTeam?.name === prediction.match?.homeTeam || m.homeTeam === prediction.match?.homeTeam;
                            if (m.homeScore?.current > m.awayScore?.current) res = isHome ? 'W' : 'L';
                            else if (m.homeScore?.current < m.awayScore?.current) res = isHome ? 'L' : 'W';
                            return <div key={i} className={`f-badge ${res}`} title={`${m.homeTeam?.name||m.homeTeam} ${m.homeScore?.current}-${m.awayScore?.current} ${m.awayTeam?.name||m.awayTeam}`}>{res}</div>
                          })}
                        </div>
                        <div className="match-history-list">
                          {prediction.recentForm?.home?.map((m, i) => (
                            <div key={i} className="history-row">
                              <div className="history-date">{m.startTimestamp ? m.startTimestamp.split('T')[0] : ''}</div>
                              <div className="history-teams">
                                <span className={`history-team home ${(m.homeTeam?.name === prediction.match?.homeTeam || m.homeTeam === prediction.match?.homeTeam) ? 'bold' : ''}`}>{m.homeTeam?.name || m.homeTeam}</span>
                                <span className="history-score">{m.homeScore?.current ?? '-'} : {m.awayScore?.current ?? '-'}</span>
                                <span className={`history-team away ${(m.awayTeam?.name === prediction.match?.homeTeam || m.awayTeam === prediction.match?.homeTeam) ? 'bold' : ''}`}>{m.awayTeam?.name || m.awayTeam}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* AWAY FORM */}
                      <div className="form-column">
                        <h4>{prediction.match?.awayTeam} - Son 6 Maç</h4>
                        <div className="form-badge-row">
                          {prediction.recentForm?.away?.map((m, i) => {
                            let res = 'D';
                            const isHome = m.homeTeam?.name === prediction.match?.awayTeam || m.homeTeam === prediction.match?.awayTeam;
                            if (m.homeScore?.current > m.awayScore?.current) res = isHome ? 'W' : 'L';
                            else if (m.homeScore?.current < m.awayScore?.current) res = isHome ? 'L' : 'W';
                            return <div key={i} className={`f-badge ${res}`} title={`${m.homeTeam?.name||m.homeTeam} ${m.homeScore?.current}-${m.awayScore?.current} ${m.awayTeam?.name||m.awayTeam}`}>{res}</div>
                          })}
                        </div>
                        <div className="match-history-list">
                          {prediction.recentForm?.away?.map((m, i) => (
                            <div key={i} className="history-row">
                              <div className="history-date">{m.startTimestamp ? m.startTimestamp.split('T')[0] : ''}</div>
                              <div className="history-teams">
                                <span className={`history-team home ${(m.homeTeam?.name === prediction.match?.awayTeam || m.homeTeam === prediction.match?.awayTeam) ? 'bold' : ''}`}>{m.homeTeam?.name || m.homeTeam}</span>
                                <span className="history-score">{m.homeScore?.current ?? '-'} : {m.awayScore?.current ?? '-'}</span>
                                <span className={`history-team away ${(m.awayTeam?.name === prediction.match?.awayTeam || m.awayTeam === prediction.match?.awayTeam) ? 'bold' : ''}`}>{m.awayTeam?.name || m.awayTeam}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {/* ──── WORKSHOP ──── */}
                {activeTab === 'workshop' && (
                  <div className="workshop-view glass-card workshop-overlay">
                    {workshopLoading && (
                      <div className="workshop-recalc-overlay">
                        <div className="scanner-mini" />
                        <span>Yeniden hesaplanıyor...</span>
                      </div>
                    )}
                    <div className="workshop-header">
                      <h4>Dynamic Lineup Impact Workshop</h4>
                      <div className="side-toggle">
                        <button
                          className={workshopSide === 'home' ? 'active' : ''}
                          onClick={() => { setWorkshopSide('home'); setSwapMode(null); }}
                        >
                          {prediction.match?.homeTeam ?? 'Ev Sahibi'}
                        </button>
                        <button
                          className={workshopSide === 'away' ? 'active' : ''}
                          onClick={() => { setWorkshopSide('away'); setSwapMode(null); }}
                        >
                          {prediction.match?.awayTeam ?? 'Deplasman'}
                        </button>
                      </div>
                    </div>
                    <div className="lineup-grid">
                      {prediction?.lineups?.[workshopSide] ? (
                        <LineupColumn
                          title={
                            workshopSide === 'home'
                              ? prediction.match?.homeTeam
                              : prediction.match?.awayTeam
                          }
                          players={prediction.lineups[workshopSide]?.players ?? []}
                          icon={<Users size={14} />}
                          side={workshopSide}
                          swapMode={swapMode}
                          onSwapMode={setSwapMode}
                          originalIds={originalLineupIds[workshopSide]}
                          onSwap={(playerOut, playerIn, side) => {
                            const base =
                              modifiedLineup[side] !== null
                                ? modifiedLineup[side]
                                : prediction.lineups[side]?.players ?? [];
                            const currentPlayers = [...base];
                            const outIdx = currentPlayers.findIndex(
                              p => p?.player?.id === playerOut?.player?.id
                            );
                            const inIdx = currentPlayers.findIndex(
                              p => p?.player?.id === playerIn?.player?.id
                            );
                            if (outIdx !== -1 && inIdx !== -1) {
                              const newPlayers = [...currentPlayers];
                              [newPlayers[outIdx], newPlayers[inIdx]] = [
                                newPlayers[inIdx],
                                newPlayers[outIdx],
                              ];
                              setModifiedLineup(prev => ({ ...prev, [side]: newPlayers }));
                            }
                            setSwapMode(null);
                          }}
                        />
                      ) : (
                        <p className="empty-lineup">
                          Lineup data currently unavailable for this match.
                        </p>
                      )}
                    </div>
                    <div className="workshop-actions">
                      <button
                        className="workshop-btn secondary"
                        disabled={loading || workshopLoading}
                        onClick={() => {
                          setModifiedLineup({ home: null, away: null });
                          setSwapMode(null);
                          if (selectedMatch) fetchPrediction(selectedMatch.id);
                        }}
                      >
                        Orijinale Dön
                      </button>
                      <button
                        className="workshop-btn primary"
                        disabled={loading || workshopLoading}
                        onClick={() => {
                          if (selectedMatch) fetchPrediction(selectedMatch.id, modifiedLineup);
                        }}
                      >
                        <Zap size={14} /> Kadroyla Yeniden Hesapla
                      </button>
                    </div>
                  </div>
                )}

                {/* ──── METRIC LEDGER ──── */}
                {activeTab === 'metrics' && (
                  <div className="metrics-ledger glass-card">
                    <h4>Full 168-Metric Breakdown</h4>
                    <div className="ledger-scroll">
                      <div className="comparison-grid">
                        <div className="comparison-header">
                          <span>Metrik</span>
                          <span>
                            {prediction.match?.homeTeam
                              ? prediction.match.homeTeam.split(' ')[0]
                              : '-'}
                          </span>
                          <span>
                            {prediction.match?.awayTeam
                              ? prediction.match.awayTeam.split(' ')[0]
                              : '-'}
                          </span>
                        </div>
                        {[
                          ['Hücum Gücü', prediction.comparison?.home?.attackPower, prediction.comparison?.away?.attackPower],
                          ['Defans Gücü', prediction.comparison?.home?.defensePower, prediction.comparison?.away?.defensePower],
                          ['Form', prediction.comparison?.home?.form, prediction.comparison?.away?.form],
                          ['Oyuncu Kalitesi', prediction.comparison?.home?.playerQuality, prediction.comparison?.away?.playerQuality],
                          ['Kaleci', prediction.comparison?.home?.goalkeeperPower, prediction.comparison?.away?.goalkeeperPower],
                          ['Momentum', prediction.comparison?.home?.momentum, prediction.comparison?.away?.momentum],
                          ['Genel Güç', prediction.comparison?.home?.overallPower, prediction.comparison?.away?.overallPower],
                        ].map(([label, homeVal, awayVal]) => (
                          <div className="comparison-row" key={label}>
                            <span className="comp-label">{label}</span>
                            <span className={`comp-val ${homeVal != null && awayVal != null && homeVal > awayVal ? 'winner' : ''}`}>
                              {homeVal ?? '-'}
                            </span>
                            <span className={`comp-val ${homeVal != null && awayVal != null && awayVal > homeVal ? 'winner' : ''}`}>
                              {awayVal ?? '-'}
                            </span>
                          </div>
                        ))}
                      </div>

                      {prediction.analysis?.goalPeriods?.home != null && (
                        <MetricGroup
                          title="Ev Sahibi Gol Dönemleri"
                          subData={prediction.analysis.goalPeriods.home}
                        />
                      )}
                      {prediction.analysis?.goalPeriods?.away != null && (
                        <MetricGroup
                          title="Deplasman Gol Dönemleri"
                          subData={prediction.analysis.goalPeriods.away}
                        />
                      )}

                      <div className="ledger-extras">
                        <div className="ledger-row">
                          <span>İlk Yarı Sonucu</span>
                          <span>{prediction.firstHalf?.htResult ?? '-'}</span>
                        </div>
                        <div className="ledger-row">
                          <span>İY Üst 0.5</span>
                          <span>%{prediction.firstHalf?.over05HT ?? '-'}</span>
                        </div>
                        <div className="ledger-row">
                          <span>İY Üst 1.5</span>
                          <span>%{prediction.firstHalf?.over15HT ?? '-'}</span>
                        </div>
                        <div className="ledger-row">
                          <span>Korner (Ev)</span>
                          <span>{prediction.corners?.expectedHome ?? '-'}</span>
                        </div>
                        <div className="ledger-row">
                          <span>Korner (Dep)</span>
                          <span>{prediction.corners?.expectedAway ?? '-'}</span>
                        </div>
                        <div className="ledger-row">
                          <span>Sarı Kart ~</span>
                          <span>{prediction.cards?.expectedYellowCards ?? '-'}</span>
                        </div>
                        <div className="ledger-row">
                          <span>Kırmızı Kart ~</span>
                          <span>{prediction.cards?.expectedRedCards ?? '-'}</span>
                        </div>
                        <div className="ledger-row">
                          <span>Penaltı Şansı</span>
                          <span>{prediction.analysis?.probabilities?.penaltyChance ?? '-'}</span>
                        </div>
                        <div className="ledger-row">
                          <span>Kırmızı Kart Şansı</span>
                          <span>{prediction.analysis?.probabilities?.redCardChance ?? '-'}</span>
                        </div>
                        <div className="ledger-row">
                          <span>Lambda Ev</span>
                          <span>{prediction.score?.lambdaHome ?? '-'}</span>
                        </div>
                        <div className="ledger-row">
                          <span>Lambda Dep</span>
                          <span>{prediction.score?.lambdaAway ?? '-'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                </>)}
              </div>
            </div>

            {/* ──── RIGHT SIDEBAR ──── */}
            <aside className="probability-column">
              <div className="glass-card stats-sidebar">
                <h3>Poisson Model</h3>
                <div className="prob-bars">
                  <ProbBar label="Home Win" val={prediction.result?.homeWin ?? 0} color="var(--home-color)" />
                  <ProbBar label="Draw" val={prediction.result?.draw ?? 0} color="var(--draw-color)" />
                  <ProbBar label="Away Win" val={prediction.result?.awayWin ?? 0} color="var(--away-color)" />
                </div>
                <div style={{ marginTop: 18, padding: '12px 0', borderTop: '1px solid var(--glass-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Confidence</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>
                      %{prediction.result?.confidence != null ? Number(prediction.result.confidence).toFixed(1) : '-'}
                    </span>
                  </div>
                </div>
                {prediction.analysis?.probabilities?.surpriseIndex != null && (
                  <div className="surprise-box">
                    <span>
                      Surprise Index: {prediction.analysis.probabilities.surpriseIndex}%
                    </span>
                    <div className="m-bar">
                      <div
                        className="m-fill bg-purple"
                        style={{ width: `${prediction.analysis.probabilities.surpriseIndex}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="glass-card danger-zones">
                <h4>Match Danger Zones</h4>
                <div className="zone-labels">
                  {(prediction.analysis?.hotZones ?? []).map(z => (
                    <span key={z} className="zone-tag">{z}'</span>
                  ))}
                  {(prediction.analysis?.hotZones ?? []).length === 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>No data</span>
                  )}
                </div>
              </div>

              {/* Match Info Card */}
              <div className="glass-card" style={{ fontSize: '0.78rem' }}>
                <h4 style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '1px', marginBottom: 12 }}>
                  Match Details
                </h4>
                <div className="ledger-extras" style={{ margin: 0, border: 'none' }}>
                  {prediction.match?.tournament && (
                    <div className="ledger-row" style={{ borderTop: 'none' }}>
                      <span>League</span><span>{prediction.match.tournament}</span>
                    </div>
                  )}
                  {prediction.match?.round && (
                    <div className="ledger-row">
                      <span>Round</span><span>{prediction.match.round}</span>
                    </div>
                  )}
                  {prediction.match?.stadium && (
                    <div className="ledger-row">
                      <span>Stadium</span><span>{prediction.match.stadium}</span>
                    </div>
                  )}
                  {prediction.match?.referee && (
                    <div className="ledger-row">
                      <span>Referee</span><span>{prediction.match.referee}</span>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        ) : (
          <div className="empty-state">
            <Trophy size={48} opacity={0.15} />
            <h3>Select a match from the sidebar to begin analysis</h3>
          </div>
        )}
      </main>
    </div>
  );
}

/* ═══════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════ */

function ProbBar({ label, val, color }) {
  const safeVal = typeof val === 'number' ? val : 0;
  return (
    <div className="p-bar-group">
      <div className="p-label">
        <span>{label}</span>
        <span>{safeVal.toFixed(1)}%</span>
      </div>
      <div className="p-bar-outer">
        <div
          className="p-fill"
          style={{
            width: `${safeVal}%`,
            backgroundColor: color,
            boxShadow: `0 0 10px ${color}`,
          }}
        />
      </div>
    </div>
  );
}

function LineupColumn({ title, players, icon, side, swapMode, onSwapMode, onSwap, originalIds }) {
  const safePlayers = Array.isArray(players) ? players : [];
  const starters = safePlayers.filter(p => p?.player && !p.substitute).slice(0, 11);
  const subs = safePlayers.filter(p => p?.player && p.substitute && !p.isReserve).slice(0, 15);
  const reserves = safePlayers.filter(p => p?.player && p.substitute && p.isReserve);

  return (
    <div className="workshop-col">
      <div className="col-header">{icon} {title}</div>
      <div className="squad-section">
        <div className="squad-label">İlk 11</div>
        <div className="player-list-mini">
          {starters.map(p => {
            const isModified = originalIds ? !originalIds.has(p.player.id) : false;
            return (
              <div
                key={p.player.id}
                className={`player-card starter${swapMode?.playerOut?.player?.id === p.player.id ? ' selected-out' : ''}${isModified ? ' player-modified' : ''}`}
                onClick={() => {
                  if (swapMode?.playerOut?.player?.id === p.player.id) {
                    onSwapMode(null);
                  } else if (!swapMode) {
                    onSwapMode({ playerOut: p });
                  }
                }}
                title={swapMode?.playerOut?.player?.id === p.player.id ? 'Cancel swap' : 'Click to swap'}
                tabIndex={0}
                role="button"
                onKeyDown={e => e.key === 'Enter' || e.key === ' ' ? e.currentTarget.click() : null}
              >
                <span className="p-pos">{p.player.position || '?'}</span>
                <span className="p-name">{p.player.shortName || p.player.name}</span>
                {swapMode?.playerOut?.player?.id !== p.player.id
                  ? <span className="swap-icon">&#8644;</span>
                  : <span className="swap-icon selected">&#x2715;</span>
                }
              </div>
            );
          })}
        </div>

        {swapMode && (
          <>
            <div className="squad-label" style={{ marginTop: '12px', color: 'var(--accent-cyan)' }}>
              {swapMode.playerOut?.player
                ? `> ${swapMode.playerOut.player.shortName || swapMode.playerOut.player.name} yerine sec:`
                : '> Oyuncu sec:'}
            </div>
            <div className="player-list-mini">
              {[...subs, ...reserves].map(p => (
                <div
                  key={p.player.id}
                  className={`player-card sub swap-target ${p.isReserve ? 'reserve' : ''}`}
                  onClick={() => onSwap(swapMode.playerOut, p, side)}
                  role="button"
                  tabIndex={0}
                  aria-label={`Bring in ${p.player.shortName || p.player.name}`}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSwap(swapMode.playerOut, p, side); }}
                >
                  <span className="p-pos">{p.player.position || '?'}</span>
                  <span className="p-name">{p.player.shortName || p.player.name}</span>
                  <span className="swap-icon">+</span>
                </div>
              ))}
            </div>
          </>
        )}

        {!swapMode && subs.length > 0 && (
          <>
            <div className="squad-label" style={{ marginTop: '12px' }}>Yedekler</div>
            <div className="player-list-mini">
              {subs.map(p => (
                <div key={p.player.id} className="player-card sub">
                  <span className="p-pos">{p.player.position || '?'}</span>
                  <span className="p-name">{p.player.shortName || p.player.name}</span>
                </div>
              ))}
            </div>
          </>
        )}
        
        {!swapMode && reserves.length > 0 && (
          <>
            <div className="squad-label" style={{ marginTop: '12px', color: 'var(--text-tertiary)' }}>Kadro Dışı</div>
            <div className="player-list-mini">
              {reserves.map(p => (
                <div key={p.player.id} className="player-card sub reserve">
                  <span className="p-pos">{p.player.position || '?'}</span>
                  <span className="p-name">{p.player.shortName || p.player.name}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetricGroup({ title, subData }) {
  const [isOpen, setIsOpen] = useState(true);
  if (subData == null || typeof subData !== 'object') return null;
  const entries = Object.entries(subData);

  return (
    <div className="metric-group">
      <button
        className="group-header"
        onClick={() => setIsOpen(o => !o)}
        aria-expanded={isOpen}
        aria-label={`${title} — ${isOpen ? 'collapse' : 'expand'}`}
      >
        <span>{title}</span>
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {isOpen && (
        <div className="group-body">
          {entries.map(([k, v]) => {
            const numVal = typeof v === 'number' ? v : parseFloat(v);
            const isNum = !isNaN(numVal);
            const display = isNum ? numVal.toFixed(1) : String(v ?? '-');
            const barWidth = isNum ? Math.min(100, Math.max(0, numVal)) : 0;

            return (
              <div className="metric-row" key={k}>
                <span className="m-id-tag">Period {k}</span>
                <span className="m-val">{display}%</span>
                <div className="m-meter">
                  <div className="m-fill" style={{ width: `${barWidth}%`, background: 'var(--gradient-cyan)' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
