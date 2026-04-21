import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Trophy, Users, Zap, Calendar,
  AlertTriangle, ChevronDown, ChevronUp, Globe,
  TrendingUp, Target, Shield, Activity, History, Bug
} from 'lucide-react';
import DebugPage from './DebugPage';
import SimulationPage from './SimulationPage';

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
  // Match detail modal (form & H2H click-to-expand)
  const [matchDetail, setMatchDetail] = useState(null); // { event, incidents, stats, loading }
  // Form & H2H pagination
  const [h2hAll, setH2hAll] = useState([]);
  const [homeFormAll, setHomeFormAll] = useState([]);
  const [awayFormAll, setAwayFormAll] = useState([]);
  const [h2hShown, setH2hShown] = useState(5);
  const [homeFormShown, setHomeFormShown] = useState(5);
  const [awayFormShown, setAwayFormShown] = useState(5);
  const [homeFormPage, setHomeFormPage] = useState(1);
  const [awayFormPage, setAwayFormPage] = useState(1);
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

  // Reset form/H2H pagination state when prediction changes
  useEffect(() => {
    if (!prediction) return;
    setH2hAll(prediction.h2hMatches || []);
    setHomeFormAll(prediction.recentForm?.home || []);
    setAwayFormAll(prediction.recentForm?.away || []);
    setH2hShown(5);
    setHomeFormShown(5);
    setAwayFormShown(5);
    setHomeFormPage(1);
    setAwayFormPage(1);
  }, [prediction]);

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
        // Sadece orijinal İLK 11'i kaydet (isReserve olmayan, substitute olmayan)
        // Yedek ve reserve oyuncuların swaplandığında 'player-modified' görsel bileşeni çalışsın
        const homeIds = new Set(
          (data.lineups.home?.players ?? [])
            .filter(p => !p.substitute && !p.isReserve)
            .map(p => p?.player?.id).filter(Boolean)
        );
        const awayIds = new Set(
          (data.lineups.away?.players ?? [])
            .filter(p => !p.substitute && !p.isReserve)
            .map(p => p?.player?.id).filter(Boolean)
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

  // Load more events for form/H2H sections
  const loadMoreEvents = async (side) => {
    const isHome = side === 'home';
    const isH2h = side === 'h2h';
    const teamId = isH2h ? null : (isHome ? prediction?.match?.homeTeamId : prediction?.match?.awayTeamId);
    const currentPage = isHome ? homeFormPage : awayFormPage;
    const nextPage = currentPage + 1;

    if (isH2h) {
      // H2H: just show more from already-loaded data (no extra API call needed)
      setH2hShown(s => s + 5);
      return;
    }

    if (!teamId) return;
    try {
      const res = await fetch(`/api/team-events/${teamId}/${nextPage}`);
      if (!res.ok) return;
      const { events } = await res.json();
      if (isHome) {
        setHomeFormAll(prev => [...prev, ...events]);
        setHomeFormPage(nextPage);
        setHomeFormShown(s => s + 5);
      } else {
        setAwayFormAll(prev => [...prev, ...events]);
        setAwayFormPage(nextPage);
        setAwayFormShown(s => s + 5);
      }
    } catch (e) {
      console.error('loadMoreEvents failed', e);
    }
  };

  const openMatchDetail = async (eventId, eventSnapshot) => {
    if (!eventId) return;
    setMatchDetail({ event: eventSnapshot, incidents: [], stats: [], loading: true });
    try {
      const res = await fetch(`/api/match-events/${eventId}`);
      const data = res.ok ? await res.json() : { incidents: [], stats: [] };
      setMatchDetail({ event: eventSnapshot, incidents: data.incidents || [], stats: data.stats || [], loading: false });
    } catch {
      setMatchDetail({ event: eventSnapshot, incidents: [], stats: [], loading: false });
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
                  { key: 'simulation', label: 'Simülasyon', icon: <Zap size={14} /> },
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
                        
                        {/* Dynamic Trust Index */}
                        <div style={{ 
                          marginTop: 12, 
                          display: 'flex', 
                          gap: 8, 
                          paddingTop: 8, 
                          borderTop: '1px solid rgba(255,255,255,0.06)' 
                        }}>
                          <div title="Veri yoğunluğu ve metrik tamlık oranı" style={{ 
                            background: 'rgba(0,255,136,0.1)', 
                            border: '1px solid rgba(0,255,136,0.2)', 
                            borderRadius: 6, 
                            padding: '3px 8px', 
                            fontSize: '0.65rem', 
                            color: '#00ff88', 
                            fontWeight: 800 
                          }}>
                            %{prediction.result?.confidence || 0} Güven
                          </div>
                          <div title="Model harmanlama önceliği" style={{ 
                            background: 'rgba(0,242,255,0.1)', 
                            border: '1px solid rgba(0,242,255,0.2)', 
                            borderRadius: 6, 
                            padding: '3px 8px', 
                            fontSize: '0.65rem', 
                            color: '#00f2ff', 
                            fontWeight: 800 
                          }}>
                            {prediction.result?.source || 'Hibrit'}
                          </div>
                        </div>
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
                        {h2hAll.length > 0 ? h2hAll.slice(0, h2hShown).map((m, i) => {
                          const homeTeamName = prediction.match?.homeTeam;
                          const isCurrentHome = m.homeTeam?.name === homeTeamName || m.homeTeam === homeTeamName;
                          const hs = m.homeScore?.current ?? null;
                          const as = m.awayScore?.current ?? null;
                          let res = 'D';
                          if (hs != null && as != null) {
                            if (hs > as) res = isCurrentHome ? 'W' : 'L';
                            else if (hs < as) res = isCurrentHome ? 'L' : 'W';
                          }
                          const dateStr = m.startTimestamp ? m.startTimestamp.split('T')[0] : '';
                          return (
                            <div key={i} className="history-row clickable-row" onClick={() => openMatchDetail(m.id, m)}>
                              <div className={`f-badge ${res}`} style={{marginRight: '6px', flexShrink: 0}}>{res}</div>
                              <div className="history-date">{dateStr}</div>
                              <div className="history-teams">
                                <span className={`history-team home${isCurrentHome ? ' bold' : ''}`}>{m.homeTeam?.name || m.homeTeam}</span>
                                <span className="history-score">{hs ?? '-'} : {as ?? '-'}</span>
                                <span className={`history-team away${!isCurrentHome ? ' bold' : ''}`}>{m.awayTeam?.name || m.awayTeam}</span>
                              </div>
                            </div>
                          );
                        }) : (
                          <div className="history-row" style={{justifyContent: 'center', color: 'var(--text-secondary)'}}>
                            Aralarında geçmiş maç verisi bulunamadı.
                          </div>
                        )}
                        {h2hAll.length > h2hShown && (
                          <button className="show-more-btn" onClick={() => setH2hShown(s => s + 5)}>
                            Daha fazla göster ({Math.min(5, h2hAll.length - h2hShown)} maç daha)
                          </button>
                        )}
                      </div>
                    </div>

                    {/* RECENT FORM BLOCK */}
                    <div className="form-split">
                      
                      {/* HOME FORM */}
                      <div className="form-column">
                        <h4>{prediction.match?.homeTeam} - Son Maçlar</h4>
                        <div className="form-badge-row">
                          {homeFormAll.slice(0, homeFormShown).map((m, i) => {
                            let res = 'D';
                            const isHome = m.homeTeam?.name === prediction.match?.homeTeam || m.homeTeam === prediction.match?.homeTeam;
                            if (m.homeScore?.current > m.awayScore?.current) res = isHome ? 'W' : 'L';
                            else if (m.homeScore?.current < m.awayScore?.current) res = isHome ? 'L' : 'W';
                            return <div key={i} className={`f-badge ${res}`} title={`${m.homeTeam?.name||m.homeTeam} ${m.homeScore?.current}-${m.awayScore?.current} ${m.awayTeam?.name||m.awayTeam}`}>{res}</div>
                          })}
                        </div>
                        <div className="match-history-list">
                          {homeFormAll.slice(0, homeFormShown).map((m, i) => (
                            <div key={i} className="history-row clickable-row" onClick={() => openMatchDetail(m.id, m)}>
                              <div className="history-date">{m.startTimestamp ? m.startTimestamp.split('T')[0] : ''}</div>
                              <div className="history-teams">
                                <span className={`history-team home ${(m.homeTeam?.name === prediction.match?.homeTeam || m.homeTeam === prediction.match?.homeTeam) ? 'bold' : ''}`}>{m.homeTeam?.name || m.homeTeam}</span>
                                <span className="history-score">{m.homeScore?.current ?? '-'} : {m.awayScore?.current ?? '-'}</span>
                                <span className={`history-team away ${(m.awayTeam?.name === prediction.match?.homeTeam || m.awayTeam === prediction.match?.homeTeam) ? 'bold' : ''}`}>{m.awayTeam?.name || m.awayTeam}</span>
                              </div>
                            </div>
                          ))}
                          <button className="show-more-btn" onClick={() => {
                            if (homeFormShown < homeFormAll.length) {
                              setHomeFormShown(s => s + 5);
                            } else {
                              loadMoreEvents('home');
                            }
                          }}>
                            Daha fazla göster
                          </button>
                        </div>
                      </div>

                      {/* AWAY FORM */}
                      <div className="form-column">
                        <h4>{prediction.match?.awayTeam} - Son Maçlar</h4>
                        <div className="form-badge-row">
                          {awayFormAll.slice(0, awayFormShown).map((m, i) => {
                            let res = 'D';
                            const isHome = m.homeTeam?.name === prediction.match?.awayTeam || m.homeTeam === prediction.match?.awayTeam;
                            if (m.homeScore?.current > m.awayScore?.current) res = isHome ? 'W' : 'L';
                            else if (m.homeScore?.current < m.awayScore?.current) res = isHome ? 'L' : 'W';
                            return <div key={i} className={`f-badge ${res}`} title={`${m.homeTeam?.name||m.homeTeam} ${m.homeScore?.current}-${m.awayScore?.current} ${m.awayTeam?.name||m.awayTeam}`}>{res}</div>
                          })}
                        </div>
                        <div className="match-history-list">
                          {awayFormAll.slice(0, awayFormShown).map((m, i) => (
                            <div key={i} className="history-row clickable-row" onClick={() => openMatchDetail(m.id, m)}>
                              <div className="history-date">{m.startTimestamp ? m.startTimestamp.split('T')[0] : ''}</div>
                              <div className="history-teams">
                                <span className={`history-team home ${(m.homeTeam?.name === prediction.match?.awayTeam || m.homeTeam === prediction.match?.awayTeam) ? 'bold' : ''}`}>{m.homeTeam?.name || m.homeTeam}</span>
                                <span className="history-score">{m.homeScore?.current ?? '-'} : {m.awayScore?.current ?? '-'}</span>
                                <span className={`history-team away ${(m.awayTeam?.name === prediction.match?.awayTeam || m.awayTeam === prediction.match?.awayTeam) ? 'bold' : ''}`}>{m.awayTeam?.name || m.awayTeam}</span>
                              </div>
                            </div>
                          ))}
                          <button className="show-more-btn" onClick={() => {
                            if (awayFormShown < awayFormAll.length) {
                              setAwayFormShown(s => s + 5);
                            } else {
                              loadMoreEvents('away');
                            }
                          }}>
                            Daha fazla göster
                          </button>
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
                          players={
                            modifiedLineup[workshopSide] !== null
                              ? modifiedLineup[workshopSide]
                              : prediction.lineups[workshopSide]?.players ?? []
                          }
                          icon={<Users size={14} />}
                          side={workshopSide}
                          swapMode={swapMode}
                          onSwapMode={setSwapMode}
                          originalIds={originalLineupIds[workshopSide]}
                            onSwap={(playerA, playerB, side) => {
                              const base =
                                modifiedLineup[side] !== null
                                  ? modifiedLineup[side]
                                  : prediction.lineups[side]?.players ?? [];
                              const currentPlayers = [...base];
                              
                              const idxA = currentPlayers.findIndex(p => p?.player?.id === playerA?.player?.id);
                              const idxB = currentPlayers.findIndex(p => p?.player?.id === playerB?.player?.id);
                              
                              if (idxA !== -1 && idxB !== -1) {
                                const pA = { ...currentPlayers[idxA] };
                                const pB = { ...currentPlayers[idxB] };
                                
                                // Swap their role statuses (starter vs sub vs reserve)
                                const tempSub = pA.substitute;
                                const tempRes = pA.isReserve;
                                
                                pA.substitute = pB.substitute;
                                pA.isReserve = pB.isReserve;
                                
                                pB.substitute = tempSub;
                                pB.isReserve = tempRes;
                                
                                currentPlayers[idxA] = pA;
                                currentPlayers[idxB] = pB;
                                
                                setModifiedLineup(prev => ({ ...prev, [side]: currentPlayers }));
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

                {/* ──── SIMULATION ──── */}
                {activeTab === 'simulation' && (
                  <SimulationPage prediction={prediction} selectedMatch={selectedMatch} />
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
      {matchDetail && (
        <MatchDetailModal detail={matchDetail} onClose={() => setMatchDetail(null)} />
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
  // Sort players: Starters first (CAP at 11), then Subs (including excess starters, max 9), then Reserves
  const allStarters = safePlayers.filter(p => !p.substitute && !p.isReserve);
  const starters = allStarters.slice(0, 11);
  const excessStarters = allStarters.slice(11);

  const rawSubs = [
    ...excessStarters,
    ...safePlayers.filter(p => p.substitute && !p.isReserve)
  ];
  const subs = rawSubs.slice(0, 9);
  // Any subs beyond 9 overflow visually into reserves section
  const overflowSubs = rawSubs.slice(9);

  const reserves = [
    ...overflowSubs,
    ...safePlayers.filter(p => p.isReserve)
  ];

  // Determine which rendered group a player belongs to
  const getPlayerGroup = (p) => {
    const pid = p.player?.id;
    if (starters.some(s => s.player?.id === pid)) return 'starter';
    if (subs.some(s => s.player?.id === pid)) return 'sub';
    return 'reserve';
  };

  const handlePlayerClick = (p) => {
    const group = getPlayerGroup(p);
    if (!swapMode) {
      // First player selected — record their group
      onSwapMode({ playerOut: p, fromGroup: group });
    } else {
      if (swapMode.playerOut?.player?.id === p.player?.id) {
        // Deselect
        onSwapMode(null);
      } else if (group === swapMode.fromGroup) {
        // Same-group swap blocked — silently ignore (groups must differ)
        return;
      } else {
        // Valid cross-group swap
        onSwap(swapMode.playerOut, p, side);
      }
    }
  };

  const renderPlayer = (p, type) => {
    const isSelected = swapMode?.playerOut?.player?.id === p.player?.id;
    const isModified = originalIds ? !originalIds.has(p.player?.id) : false;
    // Dim players that are in the same group as the currently selected player (cannot swap within group)
    const isSameGroupBlocked = swapMode?.fromGroup != null
      && !isSelected
      && getPlayerGroup(p) === swapMode.fromGroup;

    return (
      <div
        key={p.player?.id}
        className={`player-card ${type}${isSelected ? ' selected-out' : ''}${isModified ? ' player-modified' : ''}${isSameGroupBlocked ? ' swap-blocked' : ''}`}
        onClick={() => handlePlayerClick(p)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handlePlayerClick(p); }}
      >
        <span className="p-pos">{p.player?.position || '?'}</span>
        <span className="p-name">{p.player?.shortName || p.player?.name}</span>
        {isSelected ? (
          <span className="swap-icon selected">&#x2715;</span>
        ) : (
          <span className="swap-icon">&#8644;</span>
        )}
      </div>
    );
  };

  return (
    <div className="workshop-col">
      <div className="col-header">{icon} {title}</div>
      <div className="squad-section">
        <div className="squad-label">İlk 11 ({starters.length}/11)</div>
        <div className="player-list-mini">
          {starters.map(p => renderPlayer(p, 'starter'))}
        </div>

        <div className="squad-label" style={{ marginTop: '16px' }}>Yedek Kulübesi ({subs.length}/9)</div>
        <div className="player-list-mini">
          {subs.map(p => renderPlayer(p, 'sub'))}
        </div>

        <div className="squad-label" style={{ marginTop: '16px', color: 'var(--text-tertiary)' }}>Kadro Dışı ({reserves.length})</div>
        <div className="player-list-mini">
          {reserves.map(p => renderPlayer(p, 'sub reserve'))}
        </div>
      </div>
    </div>
  );
}

/* ─── Match Detail Modal ─────────────────────────────────────── */
function MatchDetailModal({ detail, onClose }) {
  const { event, incidents, stats, loading } = detail;
  const homeTeam = event?.homeTeam?.name || event?.homeTeam || '?';
  const awayTeam = event?.awayTeam?.name || event?.awayTeam || '?';
  const hs = event?.homeScore?.current ?? '-';
  const as = event?.awayScore?.current ?? '-';
  const dateStr = event?.startTimestamp ? event.startTimestamp.split('T')[0] : '';
  const comp = event?.tournament?.uniqueTournament?.name || event?.tournament?.name || '';

  // Group incidents by type for clean rendering
  const goals = [];
  const cards = [];
  const subs = [];
  const penalties = [];
  const varDecisions = [];

  for (const inc of incidents) {
    const type = inc.incidentType;
    const cls  = inc.incidentClass;
    if (type === 'goal') {
      if (cls === 'penalty') penalties.push(inc);
      else goals.push(inc);
    } else if (type === 'card') {
      cards.push(inc);
    } else if (type === 'substitution') {
      subs.push(inc);
    } else if (type === 'varDecision') {
      varDecisions.push(inc);
    }
  }

  // Sort all events by minute
  const timeline = [...incidents].filter(i =>
    ['goal','card','substitution','varDecision'].includes(i.incidentType)
  ).sort((a, b) => (a.time ?? 0) - (b.time ?? 0));

  function incidentIcon(inc) {
    const type = inc.incidentType;
    const cls  = inc.incidentClass;
    if (type === 'goal') {
      if (cls === 'ownGoal') return '⚽ OG';
      if (cls === 'penalty') return '⚽ P';
      return '⚽';
    }
    if (type === 'card') {
      if (cls === 'yellowCard')     return <span style={{color:'#f7dc6f'}}>🟨</span>;
      if (cls === 'redCard')        return <span style={{color:'#e74c3c'}}>🟥</span>;
      if (cls === 'yellowRedCard')  return <span style={{color:'#e67e22'}}>🟨🟥</span>;
    }
    if (type === 'substitution') return '🔄';
    if (type === 'varDecision') return '📺';
    return '•';
  }

  function playerName(inc) {
    if (inc.player?.name) return inc.player.name;
    if (inc.playerName) return inc.playerName;
    return '—';
  }

  function assistName(inc) {
    if (inc.assist1?.name) return inc.assist1.name;
    if (inc.assistName) return inc.assistName;
    return null;
  }

  // Stats table — all rows from flat stats array (server already flattened)
  const statRows = stats.slice(0, 24);

  return (
    <div className="match-detail-overlay" onClick={onClose}>
      <div className="match-detail-modal" onClick={e => e.stopPropagation()}>
        <button className="match-detail-close" onClick={onClose}>✕</button>

        {/* Header */}
        <div className="match-detail-header">
          {comp && <div className="match-detail-comp">{comp}</div>}
          <div className="match-detail-score-row">
            <span className="match-detail-team">{homeTeam}</span>
            <span className="match-detail-score">{hs} — {as}</span>
            <span className="match-detail-team">{awayTeam}</span>
          </div>
          {dateStr && <div className="match-detail-date">{dateStr}</div>}
        </div>

        {loading ? (
          <div className="match-detail-loading">Yükleniyor...</div>
        ) : (
          <div className="match-detail-body">
            {/* Timeline */}
            {timeline.length > 0 && (
              <div className="match-detail-section">
                <div className="match-detail-section-title">Olaylar</div>
                <div className="match-detail-timeline">
                  {timeline.map((inc, i) => {
                    const isHome = inc.isHome;
                    const name = playerName(inc);
                    const assist = assistName(inc);
                    const icon = incidentIcon(inc);
                    const minute = inc.time != null ? `${inc.time}'` : '';
                    const addedTime = inc.addedTime ? `+${inc.addedTime}` : '';
                    return (
                      <div key={i} className={`timeline-row ${isHome ? 'home-side' : 'away-side'}`}>
                        {isHome ? (
                          <>
                            <span className="tl-name">{name}{assist ? <span className="tl-assist"> ({assist})</span> : null}</span>
                            <span className="tl-icon">{icon}</span>
                            <span className="tl-minute">{minute}{addedTime}</span>
                            <span className="tl-spacer" />
                          </>
                        ) : (
                          <>
                            <span className="tl-spacer" />
                            <span className="tl-minute">{minute}{addedTime}</span>
                            <span className="tl-icon">{icon}</span>
                            <span className="tl-name">{name}{assist ? <span className="tl-assist"> ({assist})</span> : null}</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stats */}
            {statRows.length > 0 && (
              <div className="match-detail-section">
                <div className="match-detail-section-title">İstatistikler</div>
                <div className="match-detail-stats">
                  {statRows.map((s, i) => {
                    const label = s.name || s.key || s.statisticsType || '';
                    const hv = s.homeValue ?? s.home ?? '-';
                    const av = s.awayValue ?? s.away ?? '-';
                    const hNum = parseFloat(hv);
                    const aNum = parseFloat(av);
                    const total = hNum + aNum;
                    const hPct = total > 0 ? (hNum / total) * 100 : 50;
                    return (
                      <div key={i} className="stat-row-detail">
                        <span className="stat-val-home">{hv}</span>
                        <div className="stat-bar-wrap">
                          <div className="stat-bar-home" style={{width: `${hPct}%`}} />
                          <span className="stat-label-center">{label}</span>
                          <div className="stat-bar-away" style={{width: `${100-hPct}%`}} />
                        </div>
                        <span className="stat-val-away">{av}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {timeline.length === 0 && statRows.length === 0 && (
              <div className="match-detail-empty">Bu maç için detay verisi bulunamadı.</div>
            )}
          </div>
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
