import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Play, Square, RefreshCw, BarChart2, Download, Filter,
  CheckCircle, XCircle, Minus, TrendingUp, ChevronDown, ChevronUp
} from 'lucide-react';

const TC = { HIGH: '#22c55e', MEDIUM: '#f59e0b', LOW: '#ef4444', UNKNOWN: '#6b7280' };
const TB = { HIGH: '#052e1612', MEDIUM: '#451a0312', LOW: '#450a0a12', UNKNOWN: '#11111120' };

const LEAGUES = [
  { id: 'top',  label: 'Top Ligler (PL/LaLiga/BL/L1/SA)' },
  { id: 'all',  label: 'Tüm Ligler' },
  { id: '17',   label: 'Premier League' },
  { id: '8',    label: 'La Liga' },
  { id: '23',   label: 'Serie A' },
  { id: '35',   label: 'Bundesliga' },
  { id: '34',   label: 'Ligue 1' },
  { id: '52',   label: 'Süper Lig' },
  { id: '325',  label: 'Eredivisie' },
  { id: '37',   label: 'Primeira Liga' },
  { id: '7',    label: 'Champions League' },
  { id: 'custom', label: 'Özel ID (virgülle)' },
];

const Ico = ({ ok }) =>
  ok === true  ? <CheckCircle size={13} color="#22c55e" /> :
  ok === false ? <XCircle size={13} color="#ef4444" /> :
  <Minus size={13} color="#4b5563" />;

const pct = (n, d) => d > 0 ? +((n / d) * 100).toFixed(1) : null;
const fmtPct = (v) => v == null ? '—' : `${v}%`;
const clr = (v, good = 60) => v == null ? '#6b7280' : v >= good ? '#22c55e' : v >= 50 ? '#f59e0b' : '#ef4444';
const brierClr = (v) => v == null ? '#6b7280' : v < 0.35 ? '#22c55e' : v < 0.5 ? '#f59e0b' : '#ef4444';

function StatCard({ label, value, sub, color, sub2 }) {
  return (
    <div style={{ background: '#0d0d0d', border: `1px solid ${color || '#222'}40`, borderRadius: 8, padding: '10px 14px', minWidth: 80 }}>
      <div style={{ fontSize: 10, color: '#666', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || '#e5e7eb' }}>{value}</div>
      {sub  && <div style={{ fontSize: 10, color: '#555', marginTop: 1 }}>{sub}</div>}
      {sub2 && <div style={{ fontSize: 10, color: '#444', marginTop: 1 }}>{sub2}</div>}
    </div>
  );
}

function TierChip({ tier, count, acc }) {
  if (!count) return null;
  return (
    <div style={{ padding:'5px 10px', borderRadius:6, background:TB[tier]||TB.UNKNOWN, border:`1px solid ${TC[tier]||TC.UNKNOWN}30`, display:'flex', alignItems:'center', gap:6 }}>
      <span style={{ fontSize:10, fontWeight:700, color:TC[tier]||TC.UNKNOWN }}>{tier}</span>
      <span style={{ fontSize:13, fontWeight:700, color:TC[tier]||TC.UNKNOWN }}>{fmtPct(acc)}</span>
      <span style={{ fontSize:10, color:'#555' }}>{count}m</span>
    </div>
  );
}

export default function BacktestPage({ onBack }) {
  // Controls
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now()-86400000).toISOString().split('T')[0];
  const [date, setDate] = useState(yesterday);
  const [endDate, setEndDate] = useState(yesterday);
  const [limitInput, setLimitInput] = useState('10');
  const [tournamentFilter, setTournamentFilter] = useState('top');
  const [customTournamentIds, setCustomTournamentIds] = useState('');
  const [running, setRunning] = useState(false);

  // Filters
  const [filterTier, setFilterTier] = useState('ALL');
  const [filterHit, setFilterHit] = useState('ALL');    // ALL | CORRECT | WRONG
  const [filterMarket, setFilterMarket] = useState('ALL'); // ALL | 1X2 | OU | BTTS | SCORE
  const [filterValueBet, setFilterValueBet] = useState(false);
  const [filterHTAvail, setFilterHTAvail] = useState(false);
  const [searchTeam, setSearchTeam] = useState('');
  const [sortBy, setSortBy] = useState('order'); // order | brier | confidence | htResult
  const [sortAsc, setSortAsc] = useState(false);
  const [showHTFT, setShowHTFT] = useState(true);
  const [showEngines, setShowEngines] = useState(true);
  const [showTournamentBreakdown, setShowTournamentBreakdown] = useState(false);

  // Data
  const [progress, setProgress] = useState([]);
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  const esRef = useRef(null);
  const logEndRef = useRef(null);
  const orderRef = useRef(0);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior:'smooth' }); }, [progress]);

  const stop = useCallback(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    setRunning(false);
  }, []);

  const start = useCallback(() => {
    stop();
    setResults([]); setSummary(null); setError(null); orderRef.current = 0;
    const limit = Math.min(9999, Math.max(1, parseInt(limitInput) || 10));
    const tFilter = tournamentFilter === 'custom' ? customTournamentIds : tournamentFilter;
    setProgress([`▶ ${date}${endDate!==date?' → '+endDate:''} | ${limit}m | ${tFilter}`]);
    setRunning(true);

    const params = new URLSearchParams({ date, endDate, limit: String(limit), tournament: tFilter });
    const es = new EventSource(`/api/backtest?${params}`);
    esRef.current = es;

    es.addEventListener('progress', e => { const d=JSON.parse(e.data); setProgress(p=>[...p,d.message]); });
    es.addEventListener('match', e => {
      const d=JSON.parse(e.data);
      d._order = orderRef.current++;
      setResults(r=>[...r,d]);
    });
    es.addEventListener('summary', e => {
      const d=JSON.parse(e.data);
      if (d.error) setError(d.error);
      else { setSummary(d); setProgress(p=>[...p,`✅ ${d.total} maç tamamlandı.`]); }
      stop();
    });
    es.addEventListener('error', e => { try { const d=JSON.parse(e.data); setError(d.error||'Hata'); } catch(_){} stop(); });
    es.onerror = () => { setError('Bağlantı hatası'); stop(); };
  }, [date, endDate, limitInput, tournamentFilter, customTournamentIds, stop]);

  useEffect(() => () => stop(), [stop]);

  // Export CSV
  const exportCSV = useCallback(() => {
    if (!results.length) return;
    const cols = ['match','tournament','matchDate','actualResult','actual','actualHT','predictedResult','predicted','predictedHT','simTopScore','hit1X2','hitOU25','hitBTTS','hitScore','hitHTResult','brierScore','logLoss','confidenceTier','maxProbability','probHome','probDraw','probAway','probOU25','probBTTS','isValueBet','modelEdge'];
    const csv = [cols.join(','), ...results.map(r => cols.map(c => JSON.stringify(r[c]??'')).join(','))].join('\n');
    const b = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    const a = document.createElement('a'); a.href=b; a.download=`backtest_${date}.csv`; a.click(); URL.revokeObjectURL(b);
  }, [results, date]);

  // Filtered + sorted results
  const filteredResults = useMemo(() => {
    let r = results;
    if (filterTier !== 'ALL') r = r.filter(x => x.confidenceTier === filterTier);
    if (filterHit === 'CORRECT') r = r.filter(x => x.hit1X2);
    if (filterHit === 'WRONG') r = r.filter(x => !x.hit1X2);
    if (filterMarket === '1X2') r = r.filter(x => x.hit1X2 !== undefined);
    if (filterMarket === 'OU') r = r.filter(x => x.hitOU25 !== undefined);
    if (filterMarket === 'BTTS') r = r.filter(x => x.hitBTTS !== undefined);
    if (filterMarket === 'SCORE') r = r.filter(x => x.hitScore !== undefined);
    if (filterValueBet) r = r.filter(x => x.isValueBet);
    if (filterHTAvail) r = r.filter(x => x.actualHT != null);
    if (searchTeam) { const q=searchTeam.toLowerCase(); r=r.filter(x=>x.match?.toLowerCase().includes(q)||x.tournament?.toLowerCase().includes(q)); }
    r = [...r].sort((a,b) => {
      let diff = 0;
      if (sortBy==='brier') diff = (a.brierScore||0)-(b.brierScore||0);
      else if (sortBy==='confidence') diff = (b.maxProbability||0)-(a.maxProbability||0);
      else if (sortBy==='htResult') diff = (a.hitHTResult?-1:1)-(b.hitHTResult?-1:1);
      else diff = (a._order||0)-(b._order||0);
      return sortAsc ? diff : -diff;
    });
    return r;
  }, [results, filterTier, filterHit, filterMarket, filterValueBet, filterHTAvail, searchTeam, sortBy, sortAsc]);

  const live = { total: results.length, hits1X2: results.filter(r=>r.hit1X2).length, hitsOU25: results.filter(r=>r.hitOU25).length, hitsBTTS: results.filter(r=>r.hitBTTS).length, hitsScore: results.filter(r=>r.hitScore).length, avgBrier: results.length>0 ? (results.reduce((s,r)=>s+r.brierScore,0)/results.length) : null };

  const SortBtn = ({col, label}) => (
    <button onClick={() => { if(sortBy===col) setSortAsc(!sortAsc); else { setSortBy(col); setSortAsc(false); } }}
      style={{background:'none',border:'none',color:sortBy===col?'#a5b4fc':'#6b7280',cursor:'pointer',fontSize:11,display:'flex',alignItems:'center',gap:2,padding:'2px 4px'}}>
      {label}{sortBy===col ? (sortAsc?<ChevronUp size={10}/>:<ChevronDown size={10}/>) : null}
    </button>
  );

  return (
    <div style={{background:'#090909',minHeight:'100vh',color:'#e5e7eb',fontFamily:'monospace',display:'flex',flexDirection:'column'}}>

      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'11px 16px',borderBottom:'1px solid #1a1a1a',background:'#0c0c0c',flexWrap:'wrap'}}>
        <button onClick={onBack} style={{background:'none',border:'1px solid #2d2d2d',borderRadius:5,color:'#888',padding:'5px 10px',cursor:'pointer',display:'flex',alignItems:'center',gap:5,fontSize:12}}>
          <ArrowLeft size={12}/> Geri
        </button>
        <BarChart2 size={16} color="#6366f1"/>
        <span style={{fontWeight:700,fontSize:14}}>Backtest — Gerçek Server Pipeline</span>
        {running && <span style={{fontSize:11,color:'#6366f1'}}>● Çalışıyor…</span>}
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          {results.length>0&&<button onClick={exportCSV} style={{background:'#1f2937',border:'1px solid #374151',borderRadius:5,color:'#9ca3af',padding:'5px 10px',cursor:'pointer',fontSize:11,display:'flex',alignItems:'center',gap:4}}>
            <Download size={11}/> CSV
          </button>}
          {!running ? <button onClick={start} style={{background:'#4f46e5',border:'none',borderRadius:5,color:'#fff',padding:'6px 14px',cursor:'pointer',fontSize:12,fontWeight:600,display:'flex',alignItems:'center',gap:5}}><Play size={12}/> Başlat</button>
          : <button onClick={stop} style={{background:'#991b1b',border:'none',borderRadius:5,color:'#fff',padding:'6px 14px',cursor:'pointer',fontSize:12,display:'flex',alignItems:'center',gap:5}}><Square size={12}/> Durdur</button>}
          {!running&&results.length>0&&<button onClick={start} title="Yeniden" style={{background:'#1f2937',border:'1px solid #374151',borderRadius:5,color:'#888',padding:'5px 8px',cursor:'pointer'}}><RefreshCw size={11}/></button>}
        </div>
      </div>

      {/* Controls */}
      <div style={{display:'flex',gap:10,padding:'10px 16px',borderBottom:'1px solid #141414',background:'#0a0a0a',flexWrap:'wrap',alignItems:'flex-end'}}>
        <div>
          <div style={{fontSize:10,color:'#666',marginBottom:3}}>Başlangıç</div>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inputStyle}/>
        </div>
        <div>
          <div style={{fontSize:10,color:'#666',marginBottom:3}}>Bitiş</div>
          <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} style={inputStyle}/>
        </div>
        <div>
          <div style={{fontSize:10,color:'#666',marginBottom:3}}>Maç Sayısı (1–9999)</div>
          <input type="number" value={limitInput} onChange={e=>setLimitInput(e.target.value)} min="1" max="9999"
            style={{...inputStyle,width:80}} placeholder="10"/>
        </div>
        <div>
          <div style={{fontSize:10,color:'#666',marginBottom:3}}>Turnuva</div>
          <select value={tournamentFilter} onChange={e=>setTournamentFilter(e.target.value)} style={inputStyle}>
            {LEAGUES.map(l=><option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
        </div>
        {tournamentFilter==='custom'&&<div>
          <div style={{fontSize:10,color:'#666',marginBottom:3}}>Tournament ID'leri</div>
          <input value={customTournamentIds} onChange={e=>setCustomTournamentIds(e.target.value)} placeholder="17,8,23" style={{...inputStyle,width:120}}/>
        </div>}
      </div>

      {/* Filters */}
      <div style={{display:'flex',gap:8,padding:'8px 16px',borderBottom:'1px solid #111',background:'#080808',flexWrap:'wrap',alignItems:'center'}}>
        <Filter size={11} color="#555"/>
        <span style={{fontSize:10,color:'#555'}}>Filtre:</span>
        {['ALL','HIGH','MEDIUM','LOW'].map(t=>(
          <button key={t} onClick={()=>setFilterTier(t)} style={{...chipStyle, background:filterTier===t?(TC[t]||'#4f46e5')+'22':'#111', borderColor:filterTier===t?(TC[t]||'#4f46e5'):'#222', color:filterTier===t?(TC[t]||'#a5b4fc'):'#666'}}>
            {t}
          </button>
        ))}
        <div style={{width:1,height:14,background:'#222'}}/>
        {['ALL','CORRECT','WRONG'].map(h=>(
          <button key={h} onClick={()=>setFilterHit(h)} style={{...chipStyle, background:filterHit===h?'#4f46e522':'#111', borderColor:filterHit===h?'#4f46e5':'#222', color:filterHit===h?'#a5b4fc':'#666'}}>
            {h==='ALL'?'Tümü':h==='CORRECT'?'✅ Doğru':'❌ Yanlış'}
          </button>
        ))}
        <div style={{width:1,height:14,background:'#222'}}/>
        <button onClick={()=>setFilterValueBet(!filterValueBet)} style={{...chipStyle, background:filterValueBet?'#f59e0b22':'#111', borderColor:filterValueBet?'#f59e0b':'#222', color:filterValueBet?'#f59e0b':'#666'}}>
          💡 Value Bet
        </button>
        <button onClick={()=>setFilterHTAvail(!filterHTAvail)} style={{...chipStyle, background:filterHTAvail?'#06b6d422':'#111', borderColor:filterHTAvail?'#06b6d4':'#222', color:filterHTAvail?'#06b6d4':'#666'}}>
          HT Verili
        </button>
        <input placeholder="Takım/Turnuva ara..." value={searchTeam} onChange={e=>setSearchTeam(e.target.value)}
          style={{...inputStyle,width:140,fontSize:11}}/>
        <div style={{marginLeft:'auto',display:'flex',gap:6}}>
          <button onClick={()=>setShowHTFT(!showHTFT)} style={{...chipStyle, color:'#666', background:showHTFT?'#06b6d412':'#111', borderColor:showHTFT?'#06b6d4':'#222'}}>
            {showHTFT?'▾':'▸'} İY/MS
          </button>
          <button onClick={()=>setShowEngines(!showEngines)} style={{...chipStyle, color:'#666', background:showEngines?'#8b5cf612':'#111', borderColor:showEngines?'#8b5cf6':'#222'}}>
            {showEngines?'▾':'▸'} Motorlar
          </button>
        </div>
      </div>

      <div style={{display:'flex',flex:1,overflow:'hidden'}}>

        {/* Sol: Log */}
        <div style={{width:240,borderRight:'1px solid #111',padding:10,overflowY:'auto',background:'#060606',flexShrink:0}}>
          <div style={{fontSize:9,color:'#444',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>Log</div>
          {progress.map((m,i)=>(
            <div key={i} style={{fontSize:10,color:i===progress.length-1?'#a5b4fc':'#374151',marginBottom:2,lineHeight:1.4}}>{m}</div>
          ))}
          {error&&<div style={{fontSize:10,color:'#f87171',padding:6,background:'#1f0000',borderRadius:4,marginTop:6}}>⚠ {error}</div>}
          <div ref={logEndRef}/>

          {/* Özet (canlı) */}
          {live.total > 0 && (
            <div style={{marginTop:12,borderTop:'1px solid #1a1a1a',paddingTop:10}}>
              <div style={{fontSize:9,color:'#444',marginBottom:6,textTransform:'uppercase',letterSpacing:1}}>Canlı Özet</div>
              {[['1X2',pct(live.hits1X2,live.total)],['O/U',pct(live.hitsOU25,live.total)],['BTTS',pct(live.hitsBTTS,live.total)],['Exact',pct(live.hitsScore,live.total)]].map(([l,v])=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:11,marginBottom:3}}>
                  <span style={{color:'#555'}}>{l}</span>
                  <span style={{color:clr(v)}}>{fmtPct(v)}</span>
                </div>
              ))}
              {live.avgBrier!=null&&<div style={{display:'flex',justifyContent:'space-between',fontSize:10,marginTop:4}}>
                <span style={{color:'#555'}}>Brier</span>
                <span style={{color:brierClr(live.avgBrier)}}>{live.avgBrier.toFixed(4)}</span>
              </div>}
            </div>
          )}

          {/* Turnuva özeti */}
          {summary?.byTournament?.length>0&&<div style={{marginTop:10}}>
            <button onClick={()=>setShowTournamentBreakdown(!showTournamentBreakdown)} style={{background:'none',border:'none',color:'#555',fontSize:9,cursor:'pointer',textTransform:'uppercase',letterSpacing:1,display:'flex',alignItems:'center',gap:3}}>
              {showTournamentBreakdown?'▾':'▸'} Turnuvalar
            </button>
            {showTournamentBreakdown&&summary.byTournament.map(ts=>(
              <div key={ts.tournamentId} style={{fontSize:10,marginTop:5,paddingLeft:6}}>
                <div style={{color:'#888',marginBottom:1}}>{ts.name} ({ts.total})</div>
                <div style={{display:'flex',gap:8}}>
                  <span style={{color:clr(ts.accuracy1X2)}}>1X2: {fmtPct(ts.accuracy1X2)}</span>
                  <span style={{color:clr(ts.accuracyOU25)}}>O/U: {fmtPct(ts.accuracyOU25)}</span>
                </div>
              </div>
            ))}
          </div>}
        </div>

        {/* Sağ: Sonuçlar */}
        <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column'}}>

          {/* Özet kartları */}
          {(summary||live.total>0)&&(
            <div style={{padding:'12px 14px',borderBottom:'1px solid #111',background:'#080808'}}>
              {/* Genel */}
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
                <StatCard label="1X2" value={fmtPct(pct(live.hits1X2,live.total))} sub={`${live.hits1X2}/${live.total}`} color="#6366f1"/>
                <StatCard label="O/U 2.5" value={fmtPct(pct(live.hitsOU25,live.total))} sub={`${live.hitsOU25}/${live.total}`} color="#06b6d4"/>
                <StatCard label="BTTS" value={fmtPct(pct(live.hitsBTTS,live.total))} sub={`${live.hitsBTTS}/${live.total}`} color="#a78bfa"/>
                <StatCard label="Exact FT" value={fmtPct(pct(live.hitsScore,live.total))} sub={`${live.hitsScore}/${live.total}`} color="#f97316"/>
                {showHTFT&&summary?.htTotal>0&&<StatCard label="HT 1X2" value={fmtPct(summary.htAccuracy1X2)} sub={`/${summary.htTotal}`} color="#34d399"/>}
                {showHTFT&&summary?.htTotal>0&&<StatCard label="HT Exact" value={fmtPct(summary.htAccuracyScore)} sub={`/${summary.htTotal}`} color="#6ee7b7"/>}
                {live.avgBrier!=null&&<StatCard label="Avg Brier" value={live.avgBrier.toFixed(4)} sub="ref: 0.667" color={brierClr(live.avgBrier)}/>}
              </div>
              {/* Tier */}
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
                <TierChip tier="HIGH" count={summary?.high?.count||results.filter(r=>r.isHighConfidence).length} acc={summary?.high?.accuracy1X2||pct(results.filter(r=>r.isHighConfidence&&r.hit1X2).length,results.filter(r=>r.isHighConfidence).length)}/>
                <TierChip tier="MEDIUM" count={summary?.medium?.count||results.filter(r=>r.confidenceTier==='MEDIUM').length} acc={summary?.medium?.accuracy1X2||pct(results.filter(r=>r.confidenceTier==='MEDIUM'&&r.hit1X2).length,results.filter(r=>r.confidenceTier==='MEDIUM').length)}/>
                <TierChip tier="LOW" count={summary?.low?.count||results.filter(r=>r.confidenceTier==='LOW').length} acc={summary?.low?.accuracy1X2||pct(results.filter(r=>r.confidenceTier==='LOW'&&r.hit1X2).length,results.filter(r=>r.confidenceTier==='LOW').length)}/>
              </div>
              {/* Motor + Draw */}
              {showEngines&&(summary?.poissonAccuracy1X2||summary?.simulationAccuracy1X2)&&(
                <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:6}}>
                  <span style={{fontSize:10,color:'#444'}}>Motor 1X2:</span>
                  {[['Hibrit', pct(live.hits1X2,live.total),'#6366f1'],['Poisson',summary.poissonAccuracy1X2,'#22c55e'],['Simülasyon',summary.simulationAccuracy1X2,'#f59e0b']].map(([l,v,c])=>(
                    v!=null&&<span key={l} style={{fontSize:11,background:'#0a0a0a',border:`1px solid ${c}30`,borderRadius:4,padding:'3px 8px'}}>
                      <span style={{color:'#666'}}>{l}: </span><span style={{color:c,fontWeight:700}}>{fmtPct(v)}</span>
                    </span>
                  ))}
                </div>
              )}
              {summary?.drawDetection&&(
                <div style={{display:'flex',gap:8,alignItems:'center',fontSize:10,color:'#555'}}>
                  <span>Beraberlik: gerçek {summary.drawDetection.actual} / tahmin {summary.drawDetection.predicted}</span>
                  {summary.drawDetection.recallRate!=null&&<span style={{color:clr(summary.drawDetection.recallRate,40)}}>Recall: {fmtPct(summary.drawDetection.recallRate)}</span>}
                  {summary.drawDetection.precisionRate!=null&&<span style={{color:clr(summary.drawDetection.precisionRate,40)}}>Prec: {fmtPct(summary.drawDetection.precisionRate)}</span>}
                </div>
              )}
              {summary?.valueBets?.count>0&&(
                <div style={{fontSize:10,color:'#f59e0b',marginTop:4}}>
                  💡 Value bet: {summary.valueBets.count} maç → {fmtPct(summary.valueBets.accuracy1X2)} 1X2
                </div>
              )}
            </div>
          )}

          {/* Tablo */}
          {filteredResults.length>0&&(
            <div style={{overflowX:'auto',flex:1}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead>
                  <tr style={{background:'#0a0a0a',borderBottom:'1px solid #1a1a1a',color:'#555',position:'sticky',top:0,zIndex:1}}>
                    <th style={th}>#</th>
                    <th style={{...th,textAlign:'left',minWidth:160}}>Maç</th>
                    <th style={th}><SortBtn col="order" label="Turnuva"/></th>
                    <th style={th}>Gerçek FT</th>
                    <th style={th}>Tahmin FT</th>
                    <th style={th}>Sim</th>
                    {showHTFT&&<>
                      <th style={th}>Gerçek HT</th>
                      <th style={th}>Tah HT</th>
                      <th style={th}>Sim HT</th>
                      <th style={th}>HT/FT</th>
                    </>}
                    <th style={th}>1X2</th>
                    <th style={th}>O/U</th>
                    <th style={th}>BTTS</th>
                    <th style={th}>Skor</th>
                    {showHTFT&&<th style={th}>HT</th>}
                    <th style={th}><SortBtn col="brier" label="Brier"/></th>
                    <th style={th}><SortBtn col="confidence" label="Tier"/></th>
                    {showEngines&&<th style={th}>P/S</th>}
                    <th style={th}>💡</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((r, i) => (
                    <tr key={r.matchId||i} style={{borderBottom:'1px solid #0d0d0d',background:i%2===0?'#0a0a0a':'#080808'}}>
                      <td style={{...td,color:'#374151'}}>{r._order+1}</td>
                      <td style={{...td,maxWidth:170,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#d1d5db'}} title={r.match}>{r.match}</td>
                      <td style={{...td,maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',color:'#6b7280',fontSize:10}} title={r.tournament}>{r.tournament}</td>
                      <td style={{...td,fontWeight:600,color:'#9ca3af'}}>{r.actual} <span style={{fontSize:9,color:TC[r.actualResult==='1'?'HIGH':r.actualResult==='2'?'LOW':'MEDIUM']}}>{r.actualResult}</span></td>
                      <td style={{...td,color:r.hit1X2?'#86efac':'#fca5a5'}}>{r.predicted} <span style={{fontSize:9}}>{r.predictedResult}</span></td>
                      <td style={{...td,color:'#6b7280',fontSize:10}}>{r.simTopScore||'—'}</td>
                      {showHTFT&&<>
                        <td style={{...td,color:r.actualHT?'#9ca3af':'#374151'}}>{r.actualHT||'—'} {r.actualHTResult&&<span style={{fontSize:9}}>{r.actualHTResult}</span>}</td>
                        <td style={{...td,color:r.hitHTResult===true?'#86efac':r.hitHTResult===false?'#fca5a5':'#6b7280',fontSize:10}}>{r.predictedHT||'—'} {r.predictedHTResult&&<span style={{fontSize:9}}>{r.predictedHTResult}</span>}</td>
                        <td style={{...td,color:'#6b7280',fontSize:10}}>{r.simHTTopScore||'—'}</td>
                        <td style={{...td,color:'#6b7280',fontSize:10}}>{r.htft?.top1||'—'}</td>
                      </>}
                      <td style={td}><Ico ok={r.hit1X2}/></td>
                      <td style={td}><Ico ok={r.hitOU25}/></td>
                      <td style={td}><Ico ok={r.hitBTTS}/></td>
                      <td style={td}><Ico ok={r.hitScore}/></td>
                      {showHTFT&&<td style={td}><Ico ok={r.hitHTResult}/></td>}
                      <td style={{...td,color:brierClr(r.brierScore)}}>{r.brierScore?.toFixed(3)}</td>
                      <td style={td}>
                        <span style={{fontSize:10,fontWeight:600,color:TC[r.confidenceTier]||TC.UNKNOWN,padding:'2px 5px',borderRadius:3,background:(TB[r.confidenceTier]||TB.UNKNOWN)}}>
                          {r.confidenceTier?.slice(0,3)}
                        </span>
                      </td>
                      {showEngines&&<td style={{...td,fontSize:10}}>
                        {r.poisson&&<span style={{color:r.poisson.hit?'#4ade80':'#f87171'}}>{r.poisson.predicted}</span>}
                        {r.simulation&&<span style={{color:'#6b7280'}}>/</span>}
                        {r.simulation&&<span style={{color:r.simulation.hit?'#4ade80':'#f87171'}}>{r.simulation.predicted}</span>}
                      </td>}
                      <td style={td}>{r.isValueBet?<span style={{color:'#f59e0b',fontSize:10}}>+{r.modelEdge}%</span>:<span style={{color:'#1f2937'}}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!running&&results.length===0&&!error&&(
            <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:'#1f2937',gap:10}}>
              <BarChart2 size={40} style={{opacity:0.3}}/>
              <div style={{fontSize:13}}>Tarih seç, Başlat'a tıkla.</div>
              <div style={{fontSize:11,color:'#374151'}}>Sonuçlar gerçek server pipeline'ından akar.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle = { background:'#111', border:'1px solid #2d2d2d', borderRadius:5, color:'#d1d5db', padding:'6px 9px', fontSize:12 };
const chipStyle  = { border:'1px solid #222', borderRadius:4, padding:'3px 8px', cursor:'pointer', fontSize:10, fontWeight:600 };
const th = { padding:'6px 8px', fontWeight:500, textAlign:'center', fontSize:10, whiteSpace:'nowrap' };
const td = { padding:'6px 7px', textAlign:'center', whiteSpace:'nowrap' };
