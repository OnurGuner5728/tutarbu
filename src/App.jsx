import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Trophy, Users, Zap, Calendar,
  AlertTriangle, ChevronDown, ChevronUp, Globe,
  TrendingUp, Target, Shield, Activity, History, Bug, BarChart2, BookOpen
} from 'lucide-react';
import DebugPage from './DebugPage';
import SimulationPage from './SimulationPage';
import BacktestPage from './BacktestPage';
import { calculateDynamicRating } from './utils/player-rating';
import TourGuide, { useTour } from './TourGuide';
import { TOUR_STEPS } from './tourSteps';

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
  const [showBacktest, setShowBacktest] = useState(false);
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
  const [oddsExpanded, setOddsExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState({ power: true, insights: true, extra: true, htft: true, mi: true, context: true });
  const tabPaneRef = useRef(null);
  const autoRefreshRef = useRef(null);
  const { tourActive, tourStep, setTourStep, isFirstVisit, startTour, completeTour, closeTour } = useTour();
  const [tourSingleSimDone, setTourSingleSimDone] = useState(false);
  const [tourMultiSimDone, setTourMultiSimDone] = useState(false);
  const [tourWorkshopDone, setTourWorkshopDone] = useState(false);
  const workshopWasLoadingRef = useRef(false);

  useEffect(() => {
    if (workshopLoading) {
      workshopWasLoadingRef.current = true;
    } else if (workshopWasLoadingRef.current) {
      workshopWasLoadingRef.current = false;
      setTourWorkshopDone(true);
    }
  }, [workshopLoading]);

  const fetchPrediction = useCallback(async (id, lineup = null) => {
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
  }, []);

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
  }, [selectedMatch?.id, selectedMatch?.isLive, prediction !== null, fetchPrediction]);

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

  const handleTourStepChange = useCallback((step) => {
    setTourStep(step);
    const s = TOUR_STEPS[step];
    if (s?.tab) {
      setActiveTab(s.tab);
      if (tabPaneRef.current) tabPaneRef.current.scrollTop = 0;
    }
    if (s?.expandSection) {
      setCollapsed(p => ({ ...p, [s.expandSection]: false }));
    }
    if (s?.expandOdds) {
      setOddsExpanded(true);
    }
    if (s?.workshopSide) {
      setWorkshopSide(s.workshopSide);
      setSwapMode(null);
    }
  }, [setTourStep]);

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

  if (showBacktest) return <BacktestPage onBack={() => setShowBacktest(false)} />;

  return (
    <div className="dashboard-container">
      <aside className="match-sidebar glass-card" style={{ borderRadius: 0, padding: 0, border: 'none', borderRight: '1px solid var(--glass-border)' }}>
        <div className="sidebar-header">
          <input
            data-tour="date-picker"
            type="date"
            className="date-picker-input"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            disabled={matchLoading || loading}
          />
          <div data-tour="sidebar-btns" style={{ display: 'flex', gap: 2 }}>
            <button
              className="refresh-btn"
              onClick={() => fetchMatches(selectedDate)}
              disabled={matchLoading || loading}
              aria-label="Refresh match list"
            >
              <Globe size={14} />
            </button>
            <button
              className="refresh-btn"
              onClick={() => setShowBacktest(true)}
              title="Backtest"
            >
              <BarChart2 size={14} />
            </button>
          </div>
        </div>
        {matchLoading ? (
          <div className="mini-loader">Fetching matches...</div>
        ) : (
          <div data-tour="match-list" className="match-scroll-list">
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
          <button
            onClick={startTour}
            title="Rehberi Başlat"
            style={{
              marginLeft: 'auto',
              background: 'rgba(0,242,255,0.07)',
              border: '1px solid rgba(0,242,255,0.2)',
              borderRadius: 8,
              color: 'rgba(0,242,255,0.7)',
              padding: '5px 12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: '0.72rem',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 700,
              letterSpacing: 0.5,
            }}
          >
            <BookOpen size={12} /> Rehber
          </button>
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
                      <div data-tour="score-hero" className="score-hero">
                        <div className="score-circle">
                          <span className="score-val">{prediction.score?.predicted ?? '-'}</span>
                          <span className="score-label">Predicted</span>
                        </div>
                        <div className="score-details">
                          <div className="l-box">
                            Beklenen Sonuç: {prediction.result?.mostLikelyResult ?? '-'}
                          </div>
                          <div className="l-box">
                            KG Var (BTTS): %{prediction.goals?.btts != null ? Number(prediction.goals.btts).toFixed(1) : '-'}
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
                          <div data-tour="confidence-badges" style={{
                            marginTop: 12,
                            display: 'flex',
                            gap: 8,
                            paddingTop: 8,
                            borderTop: '1px solid rgba(255,255,255,0.06)',
                            flexWrap: 'wrap'
                          }}>
                              {(() => {
                                const conf = prediction.result?.confidence || 0;
                                const tier = conf >= 70 ? 'HIGH' : conf >= 45 ? 'MEDIUM' : 'LOW';
                                const tierLabel = tier === 'HIGH' ? 'High Tier' : tier === 'MEDIUM' ? 'Medium Tier' : 'Low Tier';
                                const tierColor = tier === 'HIGH' ? '#00ff88' : tier === 'MEDIUM' ? '#f1c40f' : '#ff5252';
                                const tierBg = tier === 'HIGH' ? 'rgba(0,255,136,0.1)' : tier === 'MEDIUM' ? 'rgba(241,196,15,0.1)' : 'rgba(255,82,82,0.1)';
                                const tierBorder = tier === 'HIGH' ? 'rgba(0,255,136,0.3)' : tier === 'MEDIUM' ? 'rgba(241,196,15,0.3)' : 'rgba(255,82,82,0.3)';
                                return (
                                  <div title={`Güven Skoru: %${conf}`} style={{
                                    background: tierBg,
                                    border: `1px solid ${tierBorder}`,
                                    borderRadius: 6,
                                    padding: '3px 8px',
                                    fontSize: '0.65rem',
                                    color: tierColor,
                                    fontWeight: 800,
                                    cursor: 'default'
                                  }}>
                                    {tier === 'HIGH' ? '✅' : tier === 'MEDIUM' ? '⚠️' : '🔻'} {tierLabel}
                                  </div>
                                );
                              })()}
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
                            {prediction.meta?.edgeInsights?.premiumBTTS && (
                              <div title="Yüksek Geçmiş Başarı" style={{
                                background: 'rgba(255,140,0,0.1)',
                                border: '1px solid rgba(255,140,0,0.3)',
                                borderRadius: 6,
                                padding: '3px 8px',
                                fontSize: '0.65rem',
                                color: '#ff8c00',
                                fontWeight: 800
                              }}>
                                ⭐ Premium Sinyal
                              </div>
                            )}
                            {prediction.meta?.recommendation === 'NO BET (Toxic League)' && (
                              <div title="Zararlı Lig" style={{
                                background: 'rgba(255,82,82,0.1)',
                                border: '1px solid rgba(255,82,82,0.3)',
                                borderRadius: 6,
                                padding: '3px 8px',
                                fontSize: '0.65rem',
                                color: '#ff5252',
                                fontWeight: 800
                              }}>
                                ⛔ NO BET
                              </div>
                            )}
                          </div>

                          {/* Edge Insights Messages */}
                          {prediction.meta?.edgeInsights?.messages?.length > 0 && (
                            <div data-tour="edge-insights" style={{
                              marginTop: 10,
                              padding: '8px 10px',
                              background: 'linear-gradient(90deg, rgba(188, 19, 254, 0.05) 0%, rgba(0, 242, 255, 0.05) 100%)',
                              border: '1px solid rgba(188, 19, 254, 0.15)',
                              borderRadius: 8,
                              fontSize: '0.65rem'
                            }}>
                              <div style={{ color: 'var(--accent-purple)', fontWeight: 900, marginBottom: 4, letterSpacing: 0.5 }}>
                                🧠 DİNAMİK MODEL STACKING
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {prediction.meta.edgeInsights.messages.map((msg, idx) => (
                                  <div key={idx} style={{ color: 'var(--text-secondary)', fontStyle: 'italic', display: 'flex', gap: 6 }}>
                                    <span style={{ color: msg.includes('Warning') || msg.includes('Toxic') ? '#ff5252' : '#00ff88' }}>
                                      {msg.includes('Warning') || msg.includes('Toxic') ? '⚠️' : '✅'}
                                    </span>
                                    <span>{msg}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Power Comparison Mini */}
                      <div data-tour="power-comparison" className="glass-card" style={{ marginBottom: 16 }}>
                        <h4 onClick={() => setCollapsed(p => ({...p, power: !p.power}))} style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', marginBottom: collapsed.power ? 0 : 14, cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span><Shield size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Power Comparison</span>
                          <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', transform: collapsed.power ? 'rotate(0)' : 'rotate(90deg)' }}>▸</span>
                        </h4>
                        {!collapsed.power && (<div className="comparison-grid" style={{ margin: 0 }}>
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
                        </div>)}
                      </div>

                      <div className="glass-card insights-mini">
                        <h4 onClick={() => setCollapsed(p => ({...p, insights: !p.insights}))} style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed.insights ? 0 : 12 }}>
                          <span>Engine Insights</span>
                          <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', transform: collapsed.insights ? 'rotate(0)' : 'rotate(90deg)' }}>▸</span>
                        </h4>
                        {!collapsed.insights && (<ul>
                          {(prediction.highlights ?? []).map((h, i) => (
                            <li key={i}>{h}</li>
                          ))}
                          {(prediction.highlights ?? []).length === 0 && (
                            <li style={{ color: 'var(--text-tertiary)' }}>Bu maç için özel içgörü bulunamadı.</li>
                          )}
                        </ul>)}
                      </div>

                      {/* ── Ekstra İstihbarat ── */}
                      <div className="glass-card insights-mini">
                        <h4 onClick={() => setCollapsed(p => ({...p, extra: !p.extra}))} style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed.extra ? 0 : 12 }}>
                          <span>Ekstra İstihbarat</span>
                          <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', transform: collapsed.extra ? 'rotate(0)' : 'rotate(90deg)' }}>▸</span>
                        </h4>
                        {!collapsed.extra && (<div style={{ fontSize: '0.75rem' }}>
                          {prediction.analysis?.probabilities?.surpriseIndex != null && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>🎲 Sürpriz Endeksi</span>
                              <span style={{ fontWeight: 700, color: prediction.analysis.probabilities.surpriseIndex > 1.5 ? '#ff5252' : prediction.analysis.probabilities.surpriseIndex > 0.8 ? '#f1c40f' : '#00ff88' }}>
                                {prediction.analysis.probabilities.surpriseIndex}
                                {prediction.analysis.probabilities.surpriseIndex > 1.5 ? ' ⚠️ Yüksek' : prediction.analysis.probabilities.surpriseIndex < 0.5 ? ' ✓ Beklenen' : ' ~ Orta'}
                              </span>
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Penaltı Şansı</span>
                            <span>{typeof prediction.analysis?.probabilities?.penaltyChance === 'object' ? `${prediction.analysis.probabilities.penaltyChance.tier} (${prediction.analysis.probabilities.penaltyChance.raw}/${prediction.analysis.probabilities.penaltyChance.avg} ort.)` : prediction.analysis?.probabilities?.penaltyChance ?? '-'}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Kırmızı Kart Şansı</span>
                            <span>{typeof prediction.analysis?.probabilities?.redCardChance === 'object' ? `${prediction.analysis.probabilities.redCardChance.tier} (${prediction.analysis.probabilities.redCardChance.raw}/${prediction.analysis.probabilities.redCardChance.avg} ort.)` : prediction.analysis?.probabilities?.redCardChance ?? '-'}</span>
                          </div>
                          {prediction.firstHalfSimulation?.scoreFrequency && (
                            <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: 4 }}>İY Skor Dağılımı (Simülasyon)</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {Object.entries(prediction.firstHalfSimulation.scoreFrequency).sort(([,a],[,b]) => b - a).slice(0, 6).map(([score, pct]) => (
                                  <div key={score} style={{ padding: '2px 6px', borderRadius: 4, fontSize: '0.65rem', background: pct > 20 ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.04)', border: pct > 20 ? '1px solid rgba(0,255,136,0.2)' : '1px solid rgba(255,255,255,0.06)', color: pct > 20 ? '#00ff88' : 'var(--text-primary)' }}>
                                    {score} <span style={{ color: 'var(--text-secondary)' }}>%{pct}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>)}
                      </div>

                      {/* ── HT/FT 9-Sınıflı Market ── */}
                      {prediction.htft && (
                        <div className="glass-card insights-mini">
                          <h4 onClick={() => setCollapsed(p => ({...p, htft: !p.htft}))} style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed.htft ? 0 : 12 }}>
                            <span>HT/FT Market</span>
                            <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', transform: collapsed.htft ? 'rotate(0)' : 'rotate(90deg)' }}>▸</span>
                          </h4>
                          {!collapsed.htft && (<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, fontSize: '0.7rem' }}>
                            {Object.entries(prediction.htft.probs || {}).sort(([,a],[,b]) => b - a).map(([combo, prob]) => {
                              const isTop = prediction.htft.top1 === combo;
                              return (
                                <div key={combo} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 6px', borderRadius: 4, background: isTop ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.03)', border: isTop ? '1px solid rgba(0,255,136,0.3)' : '1px solid rgba(255,255,255,0.05)' }}>
                                  <span style={{ fontWeight: isTop ? 700 : 400, color: isTop ? '#00ff88' : 'var(--text-primary)' }}>{combo}</span>
                                  <span style={{ color: 'var(--text-secondary)' }}>%{prob}</span>
                                </div>
                              );
                            })}
                          </div>)}
                        </div>
                      )}

                      {/* ── Market Intelligence ── */}
                      {prediction.analysis?.marketIntelligence?.hasOdds && (
                        <div data-tour="market-intel" className="glass-card insights-mini">
                          <h4 onClick={() => setCollapsed(p => ({...p, mi: !p.mi}))} style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed.mi ? 0 : 12 }}>
                            <span>📊 Market Intelligence</span>
                            <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', transform: collapsed.mi ? 'rotate(0)' : 'rotate(90deg)' }}>▸</span>
                          </h4>
                          {!collapsed.mi && (() => {
                            const mi = prediction.analysis.marketIntelligence;
                            const fmtDrift = (v) => {
                              if (v == null) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>;
                              // Negatif drift = oran düştü = daha favori oldu
                              const color = v < -0.05 ? '#00ff88' : v > 0.05 ? '#ff5252' : 'var(--text-secondary)';
                              const arrow = v < -0.05 ? '↓' : v > 0.05 ? '↑' : '→';
                              return <span style={{ color, fontWeight: 600 }}>{arrow}{v > 0 ? '+' : ''}{v}</span>;
                            };
                            const fmtChange = (v) => {
                              if (v == null) return null;
                              const n = typeof v === 'number' ? v : parseInt(v);
                              if (isNaN(n)) return <span style={{ color: 'var(--text-tertiary)' }}>{String(v)}</span>;
                              const color = n > 0 ? '#ff5252' : n < 0 ? '#00ff88' : 'var(--text-secondary)';
                              const arrow = n > 0 ? '📈' : n < 0 ? '📉' : '➡️';
                              return <span style={{ color }}>{arrow}</span>;
                            };
                            const gc = 'gridTemplateColumns';
                            const cols = '1.2fr 1fr 1fr 1fr';
                            const cellCenter = { textAlign: 'center' };
                            return (
                              <div style={{ fontSize: '0.7rem' }}>
                                {/* Header */}
                                <div style={{ display: 'grid', [gc]: cols, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                  <span></span><span style={cellCenter}>1</span><span style={cellCenter}>X</span><span style={cellCenter}>2</span>
                                </div>

                                {/* Açılış Oranları (raw decimal) */}
                                {mi.rawOpenOddsHome != null && (
                                  <div style={{ display: 'grid', [gc]: cols, padding: '3px 0' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Açılış</span>
                                    <span style={{ ...cellCenter, color: '#999' }}>{mi.rawOpenOddsHome}</span>
                                    <span style={{ ...cellCenter, color: '#999' }}>{mi.rawOpenOddsDraw ?? '-'}</span>
                                    <span style={{ ...cellCenter, color: '#999' }}>{mi.rawOpenOddsAway ?? '-'}</span>
                                  </div>
                                )}

                                {/* Kapanış Oranları (raw decimal) */}
                                {mi.rawOddsHome != null && (
                                  <div style={{ display: 'grid', [gc]: cols, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Kapanış</span>
                                    <span style={{ ...cellCenter, fontWeight: 700, color: 'var(--accent-cyan)' }}>{mi.rawOddsHome}</span>
                                    <span style={{ ...cellCenter, fontWeight: 700 }}>{mi.rawOddsDraw ?? '-'}</span>
                                    <span style={{ ...cellCenter, fontWeight: 700, color: 'var(--accent-purple)' }}>{mi.rawOddsAway ?? '-'}</span>
                                  </div>
                                )}

                                {/* Oran Drift (kapanış - açılış) */}
                                {mi.oddsDrift && (
                                  <div style={{ display: 'grid', [gc]: cols, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Δ Drift</span>
                                    <span style={cellCenter}>{fmtDrift(mi.oddsDrift.home)}</span>
                                    <span style={cellCenter}>{fmtDrift(mi.oddsDrift.draw)}</span>
                                    <span style={cellCenter}>{fmtDrift(mi.oddsDrift.away)}</span>
                                  </div>
                                )}

                                {/* Change sinyalleri */}
                                {mi.oddsChange && (
                                  <div style={{ display: 'grid', [gc]: cols, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Sinyal</span>
                                    <span style={cellCenter}>{fmtChange(mi.oddsChange.home) ?? '-'}</span>
                                    <span style={cellCenter}>{fmtChange(mi.oddsChange.draw) ?? '-'}</span>
                                    <span style={cellCenter}>{fmtChange(mi.oddsChange.away) ?? '-'}</span>
                                  </div>
                                )}

                                {/* Shin Fair Probabilities */}
                                <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                  <div style={{ fontSize: '0.55rem', color: 'var(--text-tertiary)', marginBottom: 2 }}>Shin Fair Olasılıklar</div>
                                  {mi.hasOpeningOdds && (
                                    <div style={{ display: 'grid', [gc]: cols, padding: '2px 0' }}>
                                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.6rem' }}>Açılış</span>
                                      <span style={{ ...cellCenter, fontSize: '0.6rem' }}>%{mi.openingFairHome ?? '-'}</span>
                                      <span style={{ ...cellCenter, fontSize: '0.6rem' }}>%{mi.openingFairDraw ?? '-'}</span>
                                      <span style={{ ...cellCenter, fontSize: '0.6rem' }}>%{mi.openingFairAway ?? '-'}</span>
                                    </div>
                                  )}
                                  <div style={{ display: 'grid', [gc]: cols, padding: '2px 0' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.6rem' }}>Kapanış</span>
                                    <span style={{ ...cellCenter, fontSize: '0.6rem' }}>%{mi.closingFairHome ?? '-'}</span>
                                    <span style={{ ...cellCenter, fontSize: '0.6rem' }}>%{mi.closingFairDraw ?? '-'}</span>
                                    <span style={{ ...cellCenter, fontSize: '0.6rem' }}>%{mi.closingFairAway ?? '-'}</span>
                                  </div>
                                </div>

                                {/* ΔMarketMove (logit shift) */}
                                {mi.marketMoveHome != null && (
                                  <div style={{ display: 'grid', [gc]: cols, padding: '3px 0', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                    <span style={{ color: 'var(--text-secondary)' }}>Δ Logit</span>
                                    <span style={cellCenter}>{fmtDrift(mi.marketMoveHome)}</span>
                                    <span style={cellCenter}>-</span>
                                    <span style={cellCenter}>{fmtDrift(mi.marketMoveAway)}</span>
                                  </div>
                                )}

                                {/* Para Akışı (Steam) */}
                                {mi.oddsMovement && (() => {
                                  const oc = mi.oddsMovement.outcomes || {};
                                  const flows = [
                                    { key: '1', label: 'Ev Sahibi', data: oc['1'] },
                                    { key: 'X', label: 'Beraberlik', data: oc['X'] },
                                    { key: '2', label: 'Deplasman', data: oc['2'] },
                                  ].filter(f => f.data);
                                  const sorted = [...flows].sort((a, b) => (a.data.totalChangePercent ?? 0) - (b.data.totalChangePercent ?? 0));
                                  const dominant = sorted[0];
                                  let steamText = '';
                                  if (dominant?.data?.totalChangePercent != null && Math.abs(dominant.data.totalChangePercent) > 5) {
                                    steamText = `Para ağırlıklı olarak ${dominant.label} tarafına akıyor (${dominant.data.totalChangePercent > 0 ? '+' : ''}${dominant.data.totalChangePercent}%). `;
                                    const hf = oc['1']?.totalChangePercent ?? 0, af = oc['2']?.totalChangePercent ?? 0;
                                    if (hf > 3 && af < -3) steamText += 'Bahisçiler deplasman galibiyetini destekliyor.';
                                    else if (af > 3 && hf < -3) steamText += 'Bahisçiler ev sahibi galibiyetini destekliyor.';
                                  }
                                  return (
                                  <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ fontSize: '0.65rem', color: 'var(--accent-purple)', fontWeight: 700, marginBottom: 4 }}>💰 Para Akışı ({mi.oddsMovement.totalChanges} hareket)</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                                      {['1', 'X', '2'].map(name => {
                                        const s = oc[name];
                                        if (!s) return <span key={name} style={cellCenter}>-</span>;
                                        const dirColor = s.direction === 'shortening' ? '#00ff88' : s.direction === 'drifting' ? '#ff5252' : '#99aabb';
                                        const dirIcon = s.direction === 'shortening' ? '🟢' : s.direction === 'drifting' ? '🔴' : '⚪';
                                        const dirLabel = s.direction === 'shortening' ? 'Para giriyor' : s.direction === 'drifting' ? 'Para çıkıyor' : 'Dengeli';
                                        return (
                                          <div key={name} style={{ textAlign: 'center', padding: '5px 3px', borderRadius: 5, background: 'rgba(255,255,255,0.02)', border: `1px solid ${dirColor}22` }}>
                                            <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#dde' }}>{name}</div>
                                            <div style={{ fontSize: '0.8rem', margin: '2px 0' }}>{dirIcon}</div>
                                            <div style={{ fontSize: '0.55rem', color: dirColor, fontWeight: 600 }}>{dirLabel}</div>
                                            <div style={{ fontSize: '0.55rem', color: '#bcc8d0', marginTop: 2 }}>{s.openOdds} → <strong style={{ color: '#fff' }}>{s.closeOdds}</strong></div>
                                            {s.totalChangePercent != null && (
                                              <div style={{ fontSize: '0.55rem', color: s.totalChangePercent < 0 ? '#00ff88' : s.totalChangePercent > 0 ? '#ff5252' : '#aab', fontWeight: 600 }}>
                                                {s.totalChangePercent > 0 ? '+' : ''}{s.totalChangePercent}%
                                              </div>
                                            )}
                                            <div style={{ fontSize: '0.5rem', color: '#8899aa', marginTop: 1 }}>{s.downs}↓ · {s.ups}↑</div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {steamText && (
                                      <div style={{ marginTop: 4, padding: '4px 6px', borderRadius: 4, background: 'rgba(120,100,255,0.06)', fontSize: '0.58rem', color: '#ccccee', lineHeight: 1.3 }}>
                                        📊 {steamText}
                                      </div>
                                    )}
                                  </div>
                                  );
                                })()}

                                {/* Kullanıcı Oylamaları */}
                                {prediction.analysis?.votes && (
                                  <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginBottom: 4 }}>🗳️ Halk Oylaması</div>
                                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                      {[
                                        { label: '1', val: prediction.analysis.votes.home, color: 'var(--accent-cyan)' },
                                        { label: 'X', val: prediction.analysis.votes.draw, color: '#888' },
                                        { label: '2', val: prediction.analysis.votes.away, color: 'var(--accent-purple)' },
                                      ].map(v => (
                                        <div key={v.label} style={{ textAlign: 'center', flex: 1 }}>
                                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: v.color }}>%{v.val}</div>
                                          <div style={{ fontSize: '0.55rem', color: 'var(--text-secondary)' }}>{v.label}</div>
                                          <div style={{ height: 3, marginTop: 2, borderRadius: 2, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${v.val}%`, background: v.color, borderRadius: 2 }} />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                              {/* ── Tüm Bahis Oranları (MI kartı içinde) ── */}
                              {mi.allMarkets && (
                                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                  <div
                                    data-tour="odds-expand"
                                    onClick={() => setOddsExpanded(!oddsExpanded)}
                                    style={{
                                      cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                      padding: '6px 10px', borderRadius: 6,
                                      background: oddsExpanded ? 'transparent' : 'linear-gradient(135deg, rgba(0,255,136,0.06), rgba(120,100,255,0.06))',
                                      transition: 'background 0.3s',
                                    }}
                                  >
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontSize: '1rem' }}>🎰</span>
                                      <span style={{ fontWeight: 700, fontSize: '0.8rem', color: '#eef' }}>Tüm Bahis Oranları</span>
                                      {!oddsExpanded && <span style={{ fontSize: '0.55rem', color: '#8899aa', fontStyle: 'italic' }}>tıkla ve genişlet</span>}
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontSize: '0.65rem', color: '#99aabb' }}>{mi.allMarkets.length} market</span>
                                      <span style={{ 
                                        fontSize: '0.8rem', transition: 'transform 0.3s', transform: oddsExpanded ? 'rotate(180deg)' : 'rotate(0)',
                                        color: oddsExpanded ? '#00ff88' : '#aab',
                                      }}>▾</span>
                                    </span>
                                  </div>
                          {oddsExpanded && (() => {
                            const allMarkets = mi.allMarkets;
                            const movement = mi.oddsMovement;

                            return (
                              <div style={{ marginTop: 10 }}>
                                {allMarkets.map((market, idx) => {
                                  // Per-market analiz
                                  const drifters = market.choices.filter(c => c.drift != null && Math.abs(c.drift) > 0.01);
                                  const strongest = drifters.length > 0 ? drifters.reduce((a, b) => Math.abs(b.drift) > Math.abs(a.drift) ? b : a, drifters[0]) : null;
                                  let marketAnalysis = '';
                                  if (strongest && Math.abs(strongest.drift) >= 0.05) {
                                    const dir = strongest.drift < 0 ? 'düşüyor → para giriyor' : 'yükseliyor → para çıkıyor';
                                    marketAnalysis = `"${strongest.name}" oranı ${dir} (${strongest.drift > 0 ? '+' : ''}${strongest.drift}). `;
                                    // İkinci en güçlü (karşı yön varsa)
                                    const opposite = drifters.filter(c => c !== strongest && c.drift != null && Math.sign(c.drift) !== Math.sign(strongest.drift));
                                    if (opposite.length > 0) {
                                      const opp = opposite.reduce((a, b) => Math.abs(b.drift) > Math.abs(a.drift) ? b : a, opposite[0]);
                                      if (Math.abs(opp.drift) >= 0.05) {
                                        marketAnalysis += `"${opp.name}" ise ters yönde (${opp.drift > 0 ? '+' : ''}${opp.drift}).`;
                                      }
                                    }
                                  } else if (drifters.length === 0 || drifters.every(c => Math.abs(c.drift) < 0.05)) {
                                    marketAnalysis = 'Bu markette belirgin bir para hareketi yok, piyasa dengeli.';
                                  }
                                  return (
                                  <div key={idx} style={{ marginBottom: 12, paddingBottom: 8, borderBottom: idx < allMarkets.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                                    {/* Market Başlık */}
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                                      <span>{market.name}</span>
                                      {market.group && <span style={{ fontWeight: 400, color: '#99aabb', fontSize: '0.65rem' }}>({market.group})</span>}
                                    </div>
                                    {/* Choices Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(market.choices.length, 4)}, 1fr)`, gap: 4 }}>
                                      {market.choices.map((ch, ci) => {
                                        const hasDrift = ch.drift != null && Math.abs(ch.drift) > 0.01;
                                        const bgTint = ch.drift < -0.05 ? 'rgba(0,255,136,0.07)' : ch.drift > 0.05 ? 'rgba(255,82,82,0.07)' : 'rgba(255,255,255,0.03)';
                                        const driftColor = ch.drift < -0.05 ? '#00ff88' : ch.drift > 0.05 ? '#ff5252' : '#aaa';
                                        const driftArrow = ch.drift < -0.05 ? '↓' : ch.drift > 0.05 ? '↑' : '';
                                        const changeIcon = ch.change != null ? (ch.change > 0 ? '📈' : ch.change < 0 ? '📉' : '➡️') : '';
                                        const flowDot = ch.drift < -0.05 ? '🟢' : ch.drift > 0.05 ? '🔴' : null;
                                        const flowLabel = ch.drift < -0.05 ? 'para giriyor' : ch.drift > 0.05 ? 'para çıkıyor' : null;
                                        return (
                                          <div 
                                            key={ci}
                                            style={{ 
                                              background: bgTint, borderRadius: 5, padding: '6px 5px',
                                              border: `1px solid ${ch.drift < -0.05 ? 'rgba(0,255,136,0.15)' : ch.drift > 0.05 ? 'rgba(255,82,82,0.15)' : 'rgba(255,255,255,0.07)'}`,
                                              textAlign: 'center',
                                            }}
                                            title={ch.opening ? `Açılış: ${ch.opening} → Kapanış: ${ch.closing}\nFark: ${ch.drift > 0 ? '+' : ''}${ch.drift}` : undefined}
                                          >
                                            <div style={{ fontSize: '0.65rem', color: '#bcc8d0', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                              {ch.name}
                                            </div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff', lineHeight: 1.1 }}>
                                              {ch.closing?.toFixed(2)}
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 3, marginTop: 3 }}>
                                              {ch.opening && (
                                                <span style={{ fontSize: '0.6rem', color: '#8899aa' }}>{ch.opening}</span>
                                              )}
                                              {hasDrift && (
                                                <span style={{ fontSize: '0.6rem', color: driftColor, fontWeight: 700 }}>{driftArrow}{ch.drift > 0 ? '+' : ''}{ch.drift}</span>
                                              )}
                                              {changeIcon && <span style={{ fontSize: '0.65rem' }}>{changeIcon}</span>}
                                            </div>
                                            {flowDot && (
                                              <div style={{ fontSize: '0.55rem', color: driftColor, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                                                <span style={{ fontSize: '0.5rem' }}>{flowDot}</span>
                                                <span>{flowLabel}</span>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {/* Per-market analiz */}
                                    {marketAnalysis && (
                                      <div style={{ marginTop: 4, fontSize: '0.62rem', color: '#aabbcc', fontStyle: 'italic', lineHeight: 1.3, paddingLeft: 2 }}>
                                        📊 {marketAnalysis}
                                      </div>
                                    )}
                                  </div>
                                  );
                                })}

                                {/* ── Para Akışı Genel Analiz ── */}
                                {movement && (() => {
                                  const oc = movement.outcomes || {};
                                  // Ağırlıklı yönlendirme analizi
                                  const home = oc['1'], draw = oc['X'], away = oc['2'];
                                  // En büyük negatif changePercent = en çok para giren taraf
                                  const flows = [
                                    { key: '1', label: 'Ev Sahibi', data: home },
                                    { key: 'X', label: 'Beraberlik', data: draw },
                                    { key: '2', label: 'Deplasman', data: away },
                                  ].filter(f => f.data);
                                  // Dominant flow: en düşük totalChangePercent = en çok para giren
                                  const sorted = [...flows].sort((a, b) => (a.data.totalChangePercent ?? 0) - (b.data.totalChangePercent ?? 0));
                                  const dominant = sorted[0];
                                  const dominantDir = dominant?.data?.direction;
                                  let analysisText = '';
                                  if (dominant && dominant.data.totalChangePercent != null) {
                                    const pct = Math.abs(dominant.data.totalChangePercent);
                                    if (pct > 5) {
                                      analysisText = `Para ağırlıklı olarak ${dominant.label} tarafına akıyor (${dominant.data.totalChangePercent > 0 ? '+' : ''}${dominant.data.totalChangePercent}%). `;
                                    }
                                    // Ev-deplasman dengesi
                                    const homeFlow = home?.totalChangePercent ?? 0;
                                    const awayFlow = away?.totalChangePercent ?? 0;
                                    if (homeFlow > 3 && awayFlow < -3) {
                                      analysisText += 'Bahisçiler deplasman galibiyetini destekliyor.';
                                    } else if (awayFlow > 3 && homeFlow < -3) {
                                      analysisText += 'Bahisçiler ev sahibi galibiyetini destekliyor.';
                                    } else if (Math.abs(homeFlow) < 3 && Math.abs(awayFlow) < 3) {
                                      analysisText += 'Piyasa dengeli, belirgin bir yönlendirme yok.';
                                    }
                                  }

                                  return (
                                    <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-purple)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span>💰 Para Akışı Analizi</span>
                                        <span style={{ fontWeight: 400, color: '#99aabb', fontSize: '0.6rem' }}>{movement.totalChanges} oran hareketi</span>
                                      </div>
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                                        {['1', 'X', '2'].map(outcome => {
                                          const s = oc[outcome];
                                          if (!s) return (
                                            <div key={outcome} style={{ textAlign: 'center', padding: '6px', borderRadius: 6, background: 'rgba(255,255,255,0.02)' }}>
                                              <div style={{ fontSize: '0.7rem', color: '#aab', fontWeight: 700 }}>{outcome}</div>
                                              <div style={{ fontSize: '0.6rem', color: '#778' }}>veri yok</div>
                                            </div>
                                          );
                                          const dirColor = s.direction === 'shortening' ? '#00ff88' : s.direction === 'drifting' ? '#ff5252' : '#99aabb';
                                          const dirIcon = s.direction === 'shortening' ? '🟢' : s.direction === 'drifting' ? '🔴' : '⚪';
                                          const dirLabel = s.direction === 'shortening' ? 'Para giriyor' : s.direction === 'drifting' ? 'Para çıkıyor' : 'Dengeli';
                                          return (
                                            <div key={outcome} style={{ textAlign: 'center', padding: '8px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: `1px solid ${dirColor}33` }}>
                                              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#dde', marginBottom: 3 }}>{outcome}</div>
                                              <div style={{ fontSize: '1rem', marginBottom: 3 }}>{dirIcon}</div>
                                              <div style={{ fontSize: '0.6rem', color: dirColor, fontWeight: 700, marginBottom: 4 }}>{dirLabel}</div>
                                              {/* Açılış → Kapanış */}
                                              <div style={{ fontSize: '0.6rem', color: '#bcc8d0', marginBottom: 2 }}>
                                                {s.openOdds} → <span style={{ fontWeight: 700, color: '#fff' }}>{s.closeOdds}</span>
                                              </div>
                                              {/* Yüzde değişim */}
                                              {s.totalChangePercent != null && (
                                                <div style={{ fontSize: '0.6rem', color: s.totalChangePercent < 0 ? '#00ff88' : s.totalChangePercent > 0 ? '#ff5252' : '#aab', fontWeight: 600 }}>
                                                  {s.totalChangePercent > 0 ? '+' : ''}{s.totalChangePercent}%
                                                </div>
                                              )}
                                              {/* Hareket sayıları */}
                                              <div style={{ fontSize: '0.55rem', color: '#8899aa', marginTop: 3 }}>
                                                {s.downs}↓ · {s.ups}↑
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                      {/* Genel Analiz */}
                                      {analysisText && (
                                        <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 5, background: 'rgba(120,100,255,0.06)', border: '1px solid rgba(120,100,255,0.15)', fontSize: '0.6rem', color: '#ccccee', lineHeight: 1.4 }}>
                                          📊 <strong>Piyasa Analizi:</strong> {analysisText}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })()}
                                </div>
                              )}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* ── Bağlamsal Zeka (Genişletilmiş) ── */}
                      {prediction.analysis?.contextIntelligence && (
                        <div data-tour="context-intel" className="glass-card insights-mini">
                          <h4 onClick={() => setCollapsed(p => ({...p, context: !p.context}))} style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: collapsed.context ? 0 : 12 }}>
                            <span>🧠 Bağlamsal Zeka</span>
                            <span style={{ fontSize: '0.7rem', transition: 'transform 0.2s', transform: collapsed.context ? 'rotate(0)' : 'rotate(90deg)' }}>▸</span>
                          </h4>
                          {!collapsed.context && (() => {
                            const ci = prediction.analysis.contextIntelligence;
                            const fmtSig = (v, inv) => { if (v == null) return '-'; const p = Math.round(v*100); const c = inv ? (p>55?'#ff5252':p>45?'#f1c40f':'#00ff88') : (p>55?'#00ff88':p>45?'#f1c40f':'#ff5252'); return <span style={{color:c,fontWeight:600}}>{p}%</span>; };
                            const fmtR = (v) => { if (v == null) return '-'; const c = v>0.1?'#00ff88':v<-0.1?'#ff5252':'var(--text-secondary)'; return <span style={{color:c,fontWeight:600}}>{v>0?'+':''}{v}</span>; };
                            const fmtVal = (v, unit='') => { if (v == null) return '-'; return <span style={{fontWeight:600}}>{v}{unit}</span>; };
                            const zoneColor = (z) => {
                              if (!z) return 'var(--text-tertiary)';
                              if (z === 'CL') return '#ffd700';
                              if (z === 'EL') return '#ff8c00';
                              if (z === 'ECL') return '#32cd32';
                              if (z === 'Promotion' || z === 'Playoff') return '#00bfff';
                              if (z.includes('Rel')) return '#ff5252';
                              if (z === 'Relegation') return '#ff0000';
                              return 'var(--text-secondary)';
                            };
                            const fmtCongest = (d) => {
                              if (d == null) return '-';
                              const c = d <= 3 ? '#ff5252' : d <= 5 ? '#f1c40f' : '#00ff88';
                              const label = d <= 3 ? 'Çok Yoğun' : d <= 5 ? 'Normal' : 'Rahat';
                              return <span style={{color:c,fontWeight:600}}>{d}g <span style={{fontSize:'0.55rem',fontWeight:400}}>({label})</span></span>;
                            };

                            const items = [];
                            // Bölge
                            if (ci.homeZone || ci.awayZone) items.push({l:'📍 Bölge', h:<span style={{color:zoneColor(ci.homeZone),fontWeight:700}}>{ci.homeZone ?? '-'}</span>, a:<span style={{color:zoneColor(ci.awayZone),fontWeight:700}}>{ci.awayZone ?? '-'}</span>});
                            // Küme düşme
                            if (ci.relegationPressureHome != null || ci.relegationPressureAway != null) items.push({l:'⬇️ Küme Düşme', h:fmtSig(ci.relegationPressureHome,true), a:fmtSig(ci.relegationPressureAway,true)});
                            // Şampiyonluk/Avrupa
                            if (ci.titlePressureHome != null || ci.titlePressureAway != null) items.push({l:'🏆 Şampiyonluk', h:fmtSig(ci.titlePressureHome,false), a:fmtSig(ci.titlePressureAway,false)});
                            // Direnç
                            if (ci.resistanceHome != null || ci.resistanceAway != null) items.push({l:'🛡️ Direnç', h:fmtR(ci.resistanceHome), a:fmtR(ci.resistanceAway)});
                            // Tablo sıkışıklığı
                            if (ci.tableCompressionHome != null) items.push({l:'📊 Tablo Sıkışıklığı', h:fmtSig(ci.tableCompressionHome,false), a:fmtSig(ci.tableCompressionAway,false)});
                            // Fikstür yoğunluğu
                            if (ci.fixtureCongestHome != null || ci.fixtureCongestAway != null) items.push({l:'📅 Fikstür Yoğunluğu', h:fmtCongest(ci.fixtureCongestHome), a:fmtCongest(ci.fixtureCongestAway)});
                            // Pressing
                            if (ci.pressingHome != null || ci.pressingAway != null) items.push({l:'🔥 Pressing', h:fmtVal(ci.pressingHome), a:fmtVal(ci.pressingAway)});
                            // Bölgesel Hakimiyet
                            if (ci.territoryHome != null || ci.territoryAway != null) items.push({l:'🗺️ Bölge Hakimiyeti', h:fmtVal(ci.territoryHome), a:fmtVal(ci.territoryAway)});
                            // Taktik Hakimiyet (paylaşılan — 50+ = ev üstünlüğü)
                            if (ci.tacticalDominance != null) {
                              const td = ci.tacticalDominance;
                              const tdColor = td > 55 ? '#00ff88' : td < 45 ? '#ff5252' : 'var(--text-secondary)';
                              const tdLabel = td > 55 ? 'Ev üstün' : td < 45 ? 'Dep üstün' : 'Dengeli';
                              items.push({l:'♟️ Taktik Hakimiyet', h:<span style={{fontWeight:600,color:tdColor}}>{td}</span>, a:<span style={{fontSize:'0.55rem',color:tdColor}}>{tdLabel}</span>});
                            }
                            // Formasyon Çakışma (50=eşit, >50=ev mid üstünlüğü)
                            if (ci.formationClash != null) {
                              const fc = ci.formationClash;
                              const fcColor = fc > 55 ? '#00ff88' : fc < 45 ? '#ff5252' : 'var(--text-secondary)';
                              const fcLabel = fc > 55 ? 'Ev mid+' : fc < 45 ? 'Dep mid+' : 'Eşit';
                              items.push({l:'⚔️ Formasyon Çakışma', h:<span style={{fontWeight:600,color:fcColor}}>{fc}</span>, a:<span style={{fontSize:'0.55rem',color:fcColor}}>{fcLabel}</span>});
                            }
                            // Menajer galibiyet oranı
                            if (ci.managerWinRate != null) items.push({l:'👔 Menajer Galibiyet', h:fmtVal(ci.managerWinRate, '%'), a:<span style={{fontSize:'0.55rem',color:'var(--text-tertiary)'}}>ev menajer</span>});
                            // Sıralama avantajı + puan farkı
                            if (ci.rankAdvantage != null) {
                              const ra = ci.rankAdvantage;
                              const raColor = ra > 55 ? '#00ff88' : ra < 45 ? '#ff5252' : 'var(--text-secondary)';
                              items.push({l:'📈 Sıralama Avantajı', h:<span style={{fontWeight:600,color:raColor}}>{ra}</span>, a:ci.pointDiff != null ? <span style={{fontSize:'0.55rem',color:'var(--text-secondary)'}}>{ci.pointDiff > 0 ? '+' : ''}{ci.pointDiff}p</span> : ''});
                            }
                            // Transfer değeri etkisi
                            if (ci.transferValue != null) items.push({l:'💰 Transfer Değeri', h:fmtVal(ci.transferValue), a:<span style={{fontSize:'0.55rem',color:'var(--text-tertiary)'}}>ratio</span>});
                            // Güç Dengesi (>1 = ev üstün)
                            if (ci.powerBalance != null) {
                              const pb = ci.powerBalance;
                              const pbColor = pb > 1.1 ? '#00ff88' : pb < 0.9 ? '#ff5252' : 'var(--text-secondary)';
                              const pbLabel = pb > 1.1 ? 'Ev üstün' : pb < 0.9 ? 'Dep üstün' : 'Dengeli';
                              items.push({l:'⚡ Güç Dengesi', h:<span style={{fontWeight:600,color:pbColor}}>{pb.toFixed(2)}</span>, a:<span style={{fontSize:'0.55rem',color:pbColor}}>{pbLabel}</span>});
                            }
                            // Sezon ilerlemesi
                            if (ci.seasonProgress != null) items.push({l:'🗓️ Sezon', h:<span style={{fontWeight:600}}>%{Math.round(ci.seasonProgress*100)}</span>, a:<span style={{fontSize:'0.55rem',color:'var(--text-tertiary)'}}>ilerleme</span>});
                            // Lig gücü
                            if (ci.leagueStrength != null) items.push({l:'🌍 Lig Gücü', h:fmtVal(ci.leagueStrength), a:<span style={{fontSize:'0.55rem',color:'var(--text-tertiary)'}}>ELO</span>});

                            if (!items.length) return <span style={{color:'var(--text-tertiary)',fontSize:'0.65rem'}}>Bağlamsal veri yok</span>;
                            return (
                              <div style={{ fontSize: '0.7rem' }}>
                                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', padding:'3px 0', borderBottom:'1px solid rgba(255,255,255,0.08)', fontWeight:600, color:'var(--text-secondary)' }}>
                                  <span></span>
                                  <span style={{textAlign:'center'}}>{prediction.match?.homeTeam?.split(' ')[0] || 'Ev'}</span>
                                  <span style={{textAlign:'center'}}>{prediction.match?.awayTeam?.split(' ')[0] || 'Dep'}</span>
                                </div>
                                {items.map((it,i) => (
                                  <div key={i} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', padding:'4px 0', borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                                    <span style={{color:'var(--text-secondary)'}}>{it.l}</span>
                                    <span style={{textAlign:'center'}}>{it.h}</span>
                                    <span style={{textAlign:'center'}}>{it.a}</span>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </>
                  )}

                  {/* ──── GOALS MARKET ──── */}
                  {activeTab === 'goals' && (
                    <div data-tour="goals-content" className="goals-market">
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
                      <div data-tour="btts-card" className="market-card">
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
                        {/* İlk Yarı Simülasyon Dağılımı */}
                        {prediction.firstHalfSimulation && (
                          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)', fontSize: '0.7rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--text-secondary)' }}>
                              <span>Sim 1: %{prediction.firstHalfSimulation.homeWin}</span>
                              <span>Sim X: %{prediction.firstHalfSimulation.draw}</span>
                              <span>Sim 2: %{prediction.firstHalfSimulation.awayWin}</span>
                            </div>
                            {prediction.firstHalfSimulation.topScore && (
                              <div style={{ color: '#00ff88', fontSize: '0.65rem' }}>
                                En olası İY skor: {prediction.firstHalfSimulation.topScore}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* HT/FT Market */}
                      {prediction.htft && (
                        <div className="market-card">
                          <h5>HT/FT Market</h5>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4, fontSize: '0.7rem' }}>
                            {Object.entries(prediction.htft.probs || {})
                              .sort(([,a],[,b]) => b - a)
                              .map(([combo, prob]) => {
                                const isTop = prediction.htft.top1 === combo;
                                return (
                                  <div key={combo} style={{
                                    display: 'flex', justifyContent: 'space-between',
                                    padding: '3px 6px', borderRadius: 4,
                                    background: isTop ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.03)',
                                    border: isTop ? '1px solid rgba(0,255,136,0.3)' : '1px solid rgba(255,255,255,0.05)',
                                  }}>
                                    <span style={{ fontWeight: isTop ? 700 : 400, color: isTop ? '#00ff88' : 'var(--text-primary)' }}>{combo}</span>
                                    <span style={{ color: 'var(--text-secondary)' }}>%{prob}</span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

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

                      {/* Sürpriz & İlk Yarı Detay */}
                      <div className="market-card">
                        <h5>Ekstra İstihbarat</h5>
                        {prediction.analysis?.probabilities?.surpriseIndex != null && (
                          <div className="market-row">
                            <span className="market-label">🎲 Sürpriz Endeksi</span>
                            <span className="market-value" style={{
                              fontWeight: 700,
                              color: prediction.analysis.probabilities.surpriseIndex > 1.5 ? '#ff5252'
                                   : prediction.analysis.probabilities.surpriseIndex > 0.8 ? '#f1c40f'
                                   : '#00ff88'
                            }}>
                              {prediction.analysis.probabilities.surpriseIndex}
                              {prediction.analysis.probabilities.surpriseIndex > 1.5 ? ' ⚠️ Yüksek Sürpriz' : prediction.analysis.probabilities.surpriseIndex < 0.5 ? ' ✓ Beklenen' : ' ~ Orta'}
                            </span>
                          </div>
                        )}
                        <div className="market-row">
                          <span className="market-label">Penaltı Şansı</span>
                          <span className="market-value" style={{ color: (() => { const t = prediction.analysis?.probabilities?.penaltyChance; const tier = typeof t === 'object' ? t?.tier : t; return tier === 'High' ? '#ff5252' : tier === 'Medium' ? '#f1c40f' : '#00ff88'; })() }}>
                            {(() => { const t = prediction.analysis?.probabilities?.penaltyChance; if (typeof t === 'object') return `${t.tier} (${t.raw})`; return t ?? '-'; })()}
                          </span>
                        </div>
                        <div className="market-row">
                          <span className="market-label">Kırmızı Kart Şansı</span>
                          <span className="market-value" style={{ color: (() => { const t = prediction.analysis?.probabilities?.redCardChance; const tier = typeof t === 'object' ? t?.tier : t; return tier === 'High' ? '#ff5252' : tier === 'Medium' ? '#f1c40f' : '#00ff88'; })() }}>
                            {(() => { const t = prediction.analysis?.probabilities?.redCardChance; if (typeof t === 'object') return `${t.tier} (${t.raw})`; return t ?? '-'; })()}
                          </span>
                        </div>
                        {/* İlk Yarı Skor Frekansı (MC Simülasyon) */}
                        {prediction.firstHalfSimulation?.scoreFrequency && (
                          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginBottom: 6 }}>İY Skor Dağılımı (Simülasyon)</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {Object.entries(prediction.firstHalfSimulation.scoreFrequency)
                                .sort(([,a],[,b]) => b - a)
                                .slice(0, 6)
                                .map(([score, pct]) => (
                                  <div key={score} style={{
                                    padding: '2px 6px', borderRadius: 4, fontSize: '0.65rem',
                                    background: pct > 20 ? 'rgba(0,255,136,0.12)' : 'rgba(255,255,255,0.04)',
                                    border: pct > 20 ? '1px solid rgba(0,255,136,0.2)' : '1px solid rgba(255,255,255,0.06)',
                                    color: pct > 20 ? '#00ff88' : 'var(--text-primary)',
                                  }}>
                                    {score} <span style={{ color: 'var(--text-secondary)' }}>%{pct}</span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ──── FORM & H2H ──── */}
                  {activeTab === 'form' && (
                    <div className="form-h2h-container">

                      {/* H2H BLOCK */}
                      <div data-tour="h2h-section" className="h2h-summary-card">
                        <h4>Head to Head (H2H)</h4>
                        {prediction.h2hSummary ? (
                          <div className="h2h-stats">
                            <div className="h2h-stat-item">
                              <span className="h2h-stat-val" style={{ color: 'var(--accent-cyan)' }}>{prediction.h2hSummary.team1Wins}</span>
                              <span className="h2h-stat-label">{prediction.match?.homeTeam}</span>
                            </div>
                            <div className="h2h-stat-item">
                              <span className="h2h-stat-val" style={{ color: '#aaa' }}>{prediction.h2hSummary.draws}</span>
                              <span className="h2h-stat-label">Beraberlik</span>
                            </div>
                            <div className="h2h-stat-item">
                              <span className="h2h-stat-val" style={{ color: 'var(--accent-purple)' }}>{prediction.h2hSummary.team2Wins}</span>
                              <span className="h2h-stat-label">{prediction.match?.awayTeam}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="h2h-stats"><span style={{ color: 'var(--text-secondary)' }}>SofaScore H2H summary is missing.</span></div>
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
                                <div className={`f-badge ${res}`} style={{ marginRight: '6px', flexShrink: 0 }}>{res}</div>
                                <div className="history-date">{dateStr}</div>
                                <div className="history-teams">
                                  <span className={`history-team home${isCurrentHome ? ' bold' : ''}`}>{m.homeTeam?.name || m.homeTeam}</span>
                                  <span className="history-score">{hs ?? '-'} : {as ?? '-'}</span>
                                  <span className={`history-team away${!isCurrentHome ? ' bold' : ''}`}>{m.awayTeam?.name || m.awayTeam}</span>
                                </div>
                              </div>
                            );
                          }) : (
                            <div className="history-row" style={{ justifyContent: 'center', color: 'var(--text-secondary)' }}>
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
                      <div data-tour="form-section" className="form-split">

                        {/* HOME FORM */}
                        <div className="form-column">
                          <h4>{prediction.match?.homeTeam} - Son Maçlar</h4>
                          <div className="form-badge-row">
                            {homeFormAll.slice(0, homeFormShown).map((m, i) => {
                              let res = 'D';
                              const isHome = m.homeTeam?.name === prediction.match?.homeTeam || m.homeTeam === prediction.match?.homeTeam;
                              if (m.homeScore?.current > m.awayScore?.current) res = isHome ? 'W' : 'L';
                              else if (m.homeScore?.current < m.awayScore?.current) res = isHome ? 'L' : 'W';
                              return <div key={i} className={`f-badge ${res}`} title={`${m.homeTeam?.name || m.homeTeam} ${m.homeScore?.current}-${m.awayScore?.current} ${m.awayTeam?.name || m.awayTeam}`}>{res}</div>
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
                              return <div key={i} className={`f-badge ${res}`} title={`${m.homeTeam?.name || m.homeTeam} ${m.homeScore?.current}-${m.awayScore?.current} ${m.awayTeam?.name || m.awayTeam}`}>{res}</div>
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
                    <div data-tour="workshop-content" className="workshop-view glass-card workshop-overlay">
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
                            data-tour="workshop-away-btn"
                            className={workshopSide === 'away' ? 'active' : ''}
                            onClick={() => { setWorkshopSide('away'); setSwapMode(null); }}
                          >
                            {prediction.match?.awayTeam ?? 'Deplasman'}
                          </button>
                        </div>
                      </div>
                      {/* Genel Güç Göstergesi */}
                      {prediction.comparison?.home?.overallPower != null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', margin: '0 0 10px', borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontSize: '0.7rem' }}>
                          <span style={{ color: 'var(--accent-cyan)', fontWeight: 700, minWidth: 28, textAlign: 'center' }}>
                            {prediction.comparison.home.overallPower}
                          </span>
                          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                            <div style={{
                              position: 'absolute', left: 0, top: 0, height: '100%',
                              width: `${prediction.comparison.home.overallPower}%`,
                              background: 'linear-gradient(90deg, var(--accent-cyan), var(--accent-blue))',
                              borderRadius: 3, transition: 'width 0.5s ease',
                            }} />
                          </div>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.6rem', fontWeight: 600 }}>⚡ Genel Güç</span>
                          <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
                            <div style={{
                              position: 'absolute', right: 0, top: 0, height: '100%',
                              width: `${prediction.comparison.away.overallPower}%`,
                              background: 'linear-gradient(270deg, var(--accent-purple), var(--accent-pink, #e040fb))',
                              borderRadius: 3, transition: 'width 0.5s ease',
                            }} />
                          </div>
                          <span style={{ color: 'var(--accent-purple)', fontWeight: 700, minWidth: 28, textAlign: 'center' }}>
                            {prediction.comparison.away.overallPower}
                          </span>
                        </div>
                      )}
                      <div data-tour="workshop-lineup" className="lineup-grid">
                        {prediction?.lineups?.[workshopSide] ? (
                          <VisualPitch
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
                            missingPlayers={prediction.missingPlayers}
                            side={workshopSide}
                            swapMode={swapMode}
                            onSwapMode={setSwapMode}
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

                                const tempSub = pA.substitute;
                                const tempRes = pA.isReserve;
                                const tempAssigned = pA.assignedPosition || (pA.player?.position || 'M').toUpperCase()[0];

                                pA.substitute = pB.substitute;
                                pA.isReserve = pB.isReserve;
                                pA.assignedPosition = pB.assignedPosition || (pB.player?.position || 'M').toUpperCase()[0];

                                pB.substitute = tempSub;
                                pB.isReserve = tempRes;
                                pB.assignedPosition = tempAssigned;

                                currentPlayers[idxA] = pB;
                                currentPlayers[idxB] = pA;

                                setModifiedLineup(prev => ({ ...prev, [side]: currentPlayers }));
                              }
                              setSwapMode(null);
                            }}
                            onMove={(player, newZonePos, side) => {
                              const base =
                                modifiedLineup[side] !== null
                                  ? modifiedLineup[side]
                                  : prediction.lineups[side]?.players ?? [];
                              const currentPlayers = [...base];

                              const idx = currentPlayers.findIndex(p => p?.player?.id === player?.player?.id);
                              if (idx !== -1) {
                                const p = { ...currentPlayers[idx] };
                                p.assignedPosition = newZonePos;
                                currentPlayers[idx] = p;
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
                      {(() => {
                        const homeCurrentPlayers = modifiedLineup.home !== null ? modifiedLineup.home : prediction?.lineups?.home?.players ?? [];
                        const awayCurrentPlayers = modifiedLineup.away !== null ? modifiedLineup.away : prediction?.lineups?.away?.players ?? [];
                        const homeStartersCount = homeCurrentPlayers.filter(p => !p.substitute && !p.isReserve).length;
                        const awayStartersCount = awayCurrentPlayers.filter(p => !p.substitute && !p.isReserve).length;
                        const isHomeInvalid = homeCurrentPlayers.length > 0 && homeStartersCount !== 11;
                        const isAwayInvalid = awayCurrentPlayers.length > 0 && awayStartersCount !== 11;
                        const invalidLineup = isHomeInvalid || isAwayInvalid;

                        return (
                          <div className="workshop-actions" style={{ flexDirection: 'column' }}>
                            <div style={{ display: 'flex', gap: '12px', width: '100%', justifyContent: 'flex-end' }}>
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
                                data-tour="workshop-recalc-btn"
                                className="workshop-btn primary"
                                disabled={loading || workshopLoading || invalidLineup}
                                title={invalidLineup ? "Simülasyon için İlk 11'de tam olarak 11 oyuncu olmalıdır!" : ""}
                                onClick={() => {
                                  if (selectedMatch) fetchPrediction(selectedMatch.id, modifiedLineup);
                                }}
                              >
                                <Zap size={14} /> Kadroyla Yeniden Hesapla
                              </button>
                            </div>
                            {invalidLineup && (
                              <div style={{ color: '#ff5252', fontSize: '0.8rem', marginTop: '8px', textAlign: 'right' }}>
                                ⚠️ İlk 11'de tam olarak 11 oyuncu seçili olmalıdır. Lütfen kadroyu düzenleyin.
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* ──── METRIC LEDGER ──── */}
                  {activeTab === 'metrics' && (
                    <div data-tour="metrics-content" className="metrics-ledger glass-card">
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
                          {/* Kadro Gücü — LQR bazlı dinamik gösterge */}
                          {(() => {
                            const hLQR = prediction.comparison?.home?.lineupQualityRatio;
                            const aLQR = prediction.comparison?.away?.lineupQualityRatio;
                            const isModified = (hLQR != null && hLQR !== 1) || (aLQR != null && aLQR !== 1);
                            const fmtLQR = (v) => {
                              if (v == null) return '-';
                              const pct = Math.round(v * 100);
                              return `${pct}%`;
                            };
                            const lqrColor = (v) => {
                              if (v == null) return 'var(--text-secondary)';
                              if (v >= 1.0) return '#00ff88';
                              if (v >= 0.85) return '#f1c40f';
                              return '#ff5252';
                            };
                            return (
                              <div className="comparison-row" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6, marginTop: 4 }}>
                                <span className="comp-label" style={{ fontWeight: 700 }}>
                                  ⚡ Kadro Gücü
                                  {isModified && <span style={{ fontSize: '0.6rem', color: '#f1c40f', marginLeft: 4 }}>MOD</span>}
                                </span>
                                <span className="comp-val" style={{ color: lqrColor(hLQR), fontWeight: 700 }}>
                                  {fmtLQR(hLQR)}
                                </span>
                                <span className="comp-val" style={{ color: lqrColor(aLQR), fontWeight: 700 }}>
                                  {fmtLQR(aLQR)}
                                </span>
                              </div>
                            );
                          })()}
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
                            <span>{typeof prediction.analysis?.probabilities?.penaltyChance === 'object' ? `${prediction.analysis.probabilities.penaltyChance.tier} (${prediction.analysis.probabilities.penaltyChance.raw})` : prediction.analysis?.probabilities?.penaltyChance ?? '-'}</span>
                          </div>
                          <div className="ledger-row">
                            <span>Kırmızı Kart Şansı</span>
                            <span>{typeof prediction.analysis?.probabilities?.redCardChance === 'object' ? `${prediction.analysis.probabilities.redCardChance.tier} (${prediction.analysis.probabilities.redCardChance.raw})` : prediction.analysis?.probabilities?.redCardChance ?? '-'}</span>
                          </div>
                          <div className="ledger-row">
                            <span>Lambda Ev</span>
                            <span>{prediction.score?.lambdaHome ?? '-'}</span>
                          </div>
                          <div className="ledger-row">
                            <span>Lambda Dep</span>
                            <span>{prediction.score?.lambdaAway ?? '-'}</span>
                          </div>
                          {prediction.analysis?.probabilities?.surpriseIndex != null && (
                            <div className="ledger-row" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 4, marginTop: 4 }}>
                              <span>🎲 Sürpriz Endeksi</span>
                              <span style={{
                                fontWeight: 700,
                                color: prediction.analysis.probabilities.surpriseIndex > 1.5 ? '#ff5252'
                                     : prediction.analysis.probabilities.surpriseIndex > 0.8 ? '#f1c40f'
                                     : '#00ff88'
                              }}>
                                {prediction.analysis.probabilities.surpriseIndex}
                                {prediction.analysis.probabilities.surpriseIndex > 1.5 ? ' ⚠️' : prediction.analysis.probabilities.surpriseIndex < 0.5 ? ' ✓' : ''}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ──── SIMULATION ──── */}
                  {activeTab === 'simulation' && (
                    <div data-tour="sim-content" style={{ height: '100%' }}>
                      <SimulationPage
                        prediction={prediction}
                        selectedMatch={selectedMatch}
                        modifiedLineup={modifiedLineup}
                        onSimulationComplete={(mode) => {
                          if (mode === 'single') setTourSingleSimDone(true);
                          else if (mode === 'multi') setTourMultiSimDone(true);
                        }}
                      />
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
                    <span style={{ color: 'var(--text-secondary)' }}>Güven</span>
                    {(() => {
                      const conf = prediction.result?.confidence;
                      const tier = conf >= 70 ? 'HIGH' : conf >= 45 ? 'MEDIUM' : 'LOW';
                      const tierLabel = tier === 'HIGH' ? 'High' : tier === 'MEDIUM' ? 'Medium' : 'Low';
                      const tierColor = tier === 'HIGH' ? '#00ff88' : tier === 'MEDIUM' ? '#f1c40f' : '#ff5252';
                      return (
                        <span title={`%${conf != null ? Number(conf).toFixed(1) : '-'}`} style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontWeight: 700,
                          color: tierColor,
                          cursor: 'default'
                        }}>
                          {tierLabel}
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Modal Edge Insights Messages */}
                {prediction.meta?.edgeInsights?.messages?.length > 0 && (
                  <div style={{
                    marginTop: 10,
                    padding: '12px',
                    background: 'linear-gradient(90deg, rgba(188, 19, 254, 0.05) 0%, rgba(0, 242, 255, 0.05) 100%)',
                    border: '1px solid rgba(188, 19, 254, 0.15)',
                    borderRadius: 8,
                    fontSize: '0.70rem'
                  }}>
                    <div style={{ color: 'var(--accent-purple)', fontWeight: 900, marginBottom: 6, letterSpacing: 0.5 }}>
                      🧠 DİNAMİK MODEL STACKING
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {prediction.meta.edgeInsights.messages.map((msg, idx) => (
                        <div key={idx} style={{ color: 'var(--text-secondary)', fontStyle: 'italic', display: 'flex', gap: 6, lineHeight: 1.4 }}>
                          <span style={{ color: msg.includes('Warning') || msg.includes('Toxic') ? '#ff5252' : '#00ff88' }}>
                            {msg.includes('Warning') || msg.includes('Toxic') ? '⚠️' : '✅'}
                          </span>
                          <span>{msg}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
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

      {/* ── GUIDED TOUR ── */}
      <TourGuide
        steps={TOUR_STEPS}
        active={tourActive}
        currentStep={tourStep}
        onStepChange={handleTourStepChange}
        onComplete={completeTour}
        onClose={closeTour}
        isFirstVisit={isFirstVisit}
        prediction={prediction}
        loading={loading}
        modifiedLineup={modifiedLineup}
        workshopSide={workshopSide}
        tourWorkshopDone={tourWorkshopDone}
        tourSingleSimDone={tourSingleSimDone}
        tourMultiSimDone={tourMultiSimDone}
      />
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

function VisualPitch({ title, players, side, swapMode, onSwapMode, onSwap, onMove, missingPlayers }) {
  const safePlayers = Array.isArray(players) ? players : [];

  // Starters: limit to 11
  const starters = safePlayers.filter(p => !p.substitute && !p.isReserve).slice(0, 11);
  const bench = safePlayers.filter(p => !starters.includes(p));

  // Determine assigned zones for starters
  const zones = { 'F': [], 'M': [], 'D': [], 'G': [] };

  starters.forEach(p => {
    const nativePos = (p.player?.position || 'M').toUpperCase()[0];
    const assignedPos = (p.assignedPosition || nativePos).toUpperCase()[0];

    if (zones[assignedPos]) {
      zones[assignedPos].push(p);
    } else {
      zones['M'].push(p);
    }
  });

  const getPlayerGroup = (p) => {
    if (starters.includes(p)) return 'starter';
    return 'bench';
  };

  const handlePlayerClick = (e, p) => {
    e.stopPropagation(); // Prevent bubbling to zone
    const group = getPlayerGroup(p);
    if (!swapMode) {
      onSwapMode({ playerOut: p, fromGroup: group });
    } else {
      if (swapMode.playerOut?.player?.id === p.player?.id) {
        onSwapMode(null); // Deselect
      } else {
        // Allow swap across everything: starter-bench, starter-starter, bench-bench
        onSwap(swapMode.playerOut, p, side);
      }
    }
  };

  const handleZoneClick = (zonePos) => {
    if (swapMode && swapMode.fromGroup === 'starter') {
      // Formasyon/Mevki değişimi: Seçili ilk 11 oyuncusunu bu bölgeye taşı
      if (onMove) {
        onMove(swapMode.playerOut, zonePos, side);
      }
    }
  };

  const renderPlayerCard = (p, group) => {
    const isSelected = swapMode?.playerOut?.player?.id === p.player?.id;
    // Dim bench if bench is selected (optional, but we allow bench to bench swap to organize)
    const isSameGroupBlocked = swapMode?.fromGroup === 'bench' && group === 'bench' && !isSelected;

    const missingInfo = missingPlayers?.find(mp => mp.player?.id === p.player?.id);
    const missingIcon = missingInfo?.type === 'injured' || missingInfo?.type === 'doubtful' ? '🚑' : missingInfo?.type === 'suspended' ? '🟥' : '⚠️';

    const nativePos = (p.player?.position || 'M').toUpperCase()[0];
    const assignedPos = (p.assignedPosition || nativePos).toUpperCase()[0];

    let outOfPosition = false;
    if (group === 'starter' && nativePos !== assignedPos) {
      const map = { 'G': 0, 'D': 1, 'M': 2, 'F': 3 };
      const nIdx = map[nativePos];
      const aIdx = map[assignedPos];
      if (nIdx !== undefined && aIdx !== undefined && nIdx !== aIdx) {
        outOfPosition = true;
      }
    }

    // Pozisyon-duyarlı rating: atanan mevkinin istatistik ağırlıklarıyla hesaplanır
    // Mevki farklıysa organik ceza + rezidüel ceza calculateDynamicRating içinde uygulanır
    const overridePos = outOfPosition ? assignedPos : null;
    const finalPower = calculateDynamicRating(p.player, overridePos);

    return (
      <div
        key={p.player?.id}
        className={`pitch-player ${isSelected ? 'selected' : ''} ${isSameGroupBlocked ? 'swap-blocked' : ''}`}
        onClick={(e) => handlePlayerClick(e, p)}
        title={missingInfo ? missingInfo.type : ''}
      >
        <div className={`player-shirt ${side}-shirt`}>
          {p.player?.shirtNumber || nativePos}
          {outOfPosition && <div className="penalty-indicator" title={`Yanlış Mevki: ${nativePos}→${assignedPos}`}>🔻</div>}
          {missingInfo && <div className="missing-indicator" title={missingInfo.type}>{missingIcon}</div>}
        </div>
        <div className="player-power-badge" style={{
          position: 'absolute',
          top: '-10px',
          background: finalPower >= 85 ? '#00ff88' : finalPower >= 70 ? '#00f2ff' : finalPower >= 60 ? '#f1c40f' : '#ff5252',
          color: '#000',
          fontSize: '0.65rem',
          fontWeight: '900',
          padding: '1px 4px',
          borderRadius: '4px',
          boxShadow: '0 2px 5px rgba(0,0,0,0.5)',
          zIndex: 3
        }}>
          {finalPower}
        </div>
        <div className="player-name-label">
          {p.player?.shortName || p.player?.name}
        </div>
      </div>
    );
  };

  return (
    <div className="pitch-container">
      <h3 style={{ fontSize: '1rem', marginBottom: 10 }}>{title} ({starters.length}/11)</h3>
      <div className={`football-pitch ${swapMode?.fromGroup === 'starter' ? 'formation-mode' : ''}`}>
        <div className="pitch-penalty-top" />
        <div className="pitch-penalty-bottom" />

        {/* Forwards */}
        <div className="pitch-zone zone-f" onClick={() => handleZoneClick('F')} title={swapMode?.fromGroup === 'starter' ? "Buraya Taşı (Forvet)" : ""}>
          {zones['F'].map(p => renderPlayerCard(p, 'starter'))}
        </div>
        {/* Midfielders */}
        <div className="pitch-zone zone-m" onClick={() => handleZoneClick('M')} title={swapMode?.fromGroup === 'starter' ? "Buraya Taşı (Orta Saha)" : ""}>
          {zones['M'].map(p => renderPlayerCard(p, 'starter'))}
        </div>
        {/* Defenders */}
        <div className="pitch-zone zone-d" onClick={() => handleZoneClick('D')} title={swapMode?.fromGroup === 'starter' ? "Buraya Taşı (Defans)" : ""}>
          {zones['D'].map(p => renderPlayerCard(p, 'starter'))}
        </div>
        {/* Goalkeeper */}
        <div className="pitch-zone zone-g" onClick={() => handleZoneClick('G')} title={swapMode?.fromGroup === 'starter' ? "Buraya Taşı (Kaleci)" : ""}>
          {zones['G'].map(p => renderPlayerCard(p, 'starter'))}
        </div>
      </div>

      <div className="bench-container">
        <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Yedekler & Kadro Dışı ({bench.length})</h4>
        <div className="bench-grid">
          {bench.map(p => {
            const isSelected = swapMode?.playerOut?.player?.id === p.player?.id;
            const isBlocked = swapMode?.fromGroup === 'bench' && !isSelected;

            const missingInfo = missingPlayers?.find(mp => mp.player?.id === p.player?.id);
            const missingIcon = missingInfo?.type === 'injured' || missingInfo?.type === 'doubtful' ? '🚑' : missingInfo?.type === 'suspended' ? '🟥' : '⚠️';

            // Calculate power for bench
            const finalBenchPower = calculateDynamicRating(p.player);

            return (
              <div
                key={p.player?.id}
                className={`bench-player ${isSelected ? 'selected' : ''} ${isBlocked ? 'swap-blocked' : ''}`}
                onClick={(e) => handlePlayerClick(e, p)}
                title={missingInfo ? missingInfo.type : ''}
              >
                <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>{(p.player?.position || '?').toUpperCase()[0]}</span>
                <span>{p.player?.shortName || p.player?.name} {missingInfo && missingIcon}</span>
                <span style={{
                  marginLeft: 'auto',
                  background: finalBenchPower >= 85 ? 'rgba(0,255,136,0.2)' : finalBenchPower >= 70 ? 'rgba(0,242,255,0.2)' : 'rgba(255,255,255,0.1)',
                  color: finalBenchPower >= 85 ? '#00ff88' : finalBenchPower >= 70 ? '#00f2ff' : '#ccc',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  fontSize: '0.7rem',
                  fontWeight: 700
                }}>
                  {finalBenchPower}
                </span>
              </div>
            )
          })}
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
    const cls = inc.incidentClass;
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
    ['goal', 'card', 'substitution', 'varDecision'].includes(i.incidentType)
  ).sort((a, b) => (a.time ?? 0) - (b.time ?? 0));

  function incidentIcon(inc) {
    const type = inc.incidentType;
    const cls = inc.incidentClass;
    if (type === 'goal') {
      if (cls === 'ownGoal') return '⚽ OG';
      if (cls === 'penalty') return '⚽ P';
      return '⚽';
    }
    if (type === 'card') {
      if (cls === 'yellowCard') return <span style={{ color: '#f7dc6f' }}>🟨</span>;
      if (cls === 'redCard') return <span style={{ color: '#e74c3c' }}>🟥</span>;
      if (cls === 'yellowRedCard') return <span style={{ color: '#e67e22' }}>🟨🟥</span>;
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
                          <div className="stat-bar-home" style={{ width: `${hPct}%` }} />
                          <span className="stat-label-center">{label}</span>
                          <div className="stat-bar-away" style={{ width: `${100 - hPct}%` }} />
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
