import React from 'react';

function JsonViewer({ data, depth = 0 }) {
  const [collapsed, setCollapsed] = React.useState(depth > 1);

  if (data === null) return <span style={{ color: '#94a3b8' }}>null</span>;
  if (data === undefined) return <span style={{ color: '#94a3b8' }}>undefined</span>;
  if (typeof data === 'boolean') return <span style={{ color: '#f59e0b' }}>{String(data)}</span>;
  if (typeof data === 'number') return <span style={{ color: '#34d399' }}>{data}</span>;
  if (typeof data === 'string') return <span style={{ color: '#fca5a5' }}>"{data.length > 120 ? data.slice(0, 120) + '…' : data}"</span>;

  if (Array.isArray(data)) {
    if (data.length === 0) return <span style={{ color: '#94a3b8' }}>[]</span>;
    return (
      <span>
        <button onClick={() => setCollapsed(c => !c)} style={toggleBtnStyle}>
          {collapsed ? '▶' : '▼'} Array[{data.length}]
        </button>
        {!collapsed && (
          <div style={{ paddingLeft: 16, borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
            {data.slice(0, 50).map((item, i) => (
              <div key={i} style={{ marginTop: 2 }}>
                <span style={{ color: '#64748b', marginRight: 6 }}>{i}:</span>
                <JsonViewer data={item} depth={depth + 1} />
              </div>
            ))}
            {data.length > 50 && <div style={{ color: '#64748b', marginTop: 4 }}>…{data.length - 50} more</div>}
          </div>
        )}
      </span>
    );
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data);
    if (keys.length === 0) return <span style={{ color: '#94a3b8' }}>{'{}'}</span>;
    return (
      <span>
        <button onClick={() => setCollapsed(c => !c)} style={toggleBtnStyle}>
          {collapsed ? '▶' : '▼'} Object{'{'}…{keys.length}{'}'}
        </button>
        {!collapsed && (
          <div style={{ paddingLeft: 16, borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
            {keys.map(k => (
              <div key={k} style={{ marginTop: 2 }}>
                <span style={{ color: '#a0c4ff', marginRight: 6 }}>{k}:</span>
                <JsonViewer data={data[k]} depth={depth + 1} />
              </div>
            ))}
          </div>
        )}
      </span>
    );
  }

  return <span style={{ color: '#e2e8f0' }}>{String(data)}</span>;
}

const toggleBtnStyle = {
  background: 'none',
  border: 'none',
  color: '#94a3b8',
  cursor: 'pointer',
  fontSize: '0.75rem',
  padding: '0 4px',
  fontFamily: 'inherit',
};

export default function DebugPage({ eventId, onBack }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [expanded, setExpanded] = React.useState(null); // index of expanded row

  React.useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    setExpanded(null);
    fetch(`/api/match-debug/${eventId}`)
      .then(r => {
        if (!r.ok) return r.json().then(e => { throw new Error(e.error || `HTTP ${r.status}`); });
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [eventId]);

  const s = {
    container: { padding: '24px', fontFamily: "'JetBrains Mono','Fira Code',monospace", color: '#e2e8f0', maxWidth: '960px', margin: '0 auto' },
    headerRow: { display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' },
    backBtn: { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#a0c4ff', padding: '6px 14px', cursor: 'pointer', fontSize: '0.8rem' },
    meta: { color: '#64748b', fontSize: '0.75rem', marginBottom: '18px' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.81rem' },
    th: { padding: '10px 12px', textAlign: 'left', background: '#1a1a2e', color: '#a0c4ff', fontWeight: 600, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.5px' },
  };

  if (loading) return <div style={s.container}><div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Event {eventId} için API debug verisi yükleniyor...</div></div>;
  if (error || !data) return <div style={s.container}><div style={s.headerRow}><button style={s.backBtn} onClick={onBack}>← Geri</button><span style={{ color: '#f87171' }}>Hata: {error || 'bilinmeyen hata'}</span></div></div>;

  const log = data.apiLog || [];
  const totalBytes = log.reduce((sum, e) => sum + (e.responseSize || 0), 0);
  const ok = log.filter(e => e.success).length;

  return (
    <div style={s.container}>
      <div style={s.headerRow}>
        <button style={s.backBtn} onClick={onBack}>← Geri</button>
        <h2 style={{ margin: 0, fontSize: '1.05rem' }}>API Debug — {data.homeTeam ?? '?'} vs {data.awayTeam ?? '?'}</h2>
      </div>

      <p style={s.meta}>Event: {data.eventId} | {data.timestamp}</p>

      {/* Stats strip */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          ['Toplam', log.length, '#a0c4ff'],
          ['Başarılı', ok, '#4ade80'],
          ['Başarısız', log.length - ok, log.length - ok > 0 ? '#f87171' : '#475569'],
          ['Toplam Boyut', (totalBytes / 1024).toFixed(1) + ' KB', '#cbd5e1'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 16px', minWidth: '110px' }}>
            <div style={{ fontSize: '0.62rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '3px' }}>{label}</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <table style={s.table}>
        <thead>
          <tr>
            <th style={{ ...s.th, width: '28px' }}>#</th>
            <th style={s.th}>Endpoint</th>
            <th style={{ ...s.th, width: '90px', textAlign: 'center' }}>Durum</th>
            <th style={{ ...s.th, width: '110px', textAlign: 'right' }}>Boyut</th>
            <th style={{ ...s.th, width: '70px', textAlign: 'center' }}>Detay</th>
          </tr>
        </thead>
        <tbody>
          {log.map((entry, i) => (
            <React.Fragment key={i}>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                <td style={{ padding: '9px 12px', color: '#475569', fontSize: '0.72rem' }}>{i + 1}</td>
                <td style={{ padding: '9px 12px' }}>
                  <div style={{ color: '#a0c4ff', fontWeight: 600 }}>{entry.endpoint}</div>
                  {entry.url && <div style={{ color: '#475569', fontSize: '0.7rem', marginTop: '2px' }}>{entry.url}</div>}
                  {entry.error && <div style={{ color: '#f87171', fontSize: '0.7rem', marginTop: '2px' }}>{entry.error}</div>}
                </td>
                <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                  <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700, background: entry.success ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', color: entry.success ? '#4ade80' : '#f87171', border: `1px solid ${entry.success ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}` }}>
                    {entry.success ? 'OK' : 'FAIL'}
                  </span>
                </td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: '#cbd5e1' }}>
                  {entry.responseSize != null ? (entry.responseSize > 1024 ? (entry.responseSize / 1024).toFixed(1) + ' KB' : entry.responseSize + ' B') : '-'}
                </td>
                <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                  {entry.data != null && (
                    <button
                      onClick={() => setExpanded(expanded === i ? null : i)}
                      style={{ background: expanded === i ? 'rgba(160,196,255,0.15)' : 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', color: '#a0c4ff', cursor: 'pointer', fontSize: '0.72rem', padding: '3px 10px' }}
                    >
                      {expanded === i ? '▲ Kapat' : '▼ Gör'}
                    </button>
                  )}
                </td>
              </tr>
              {expanded === i && entry.data != null && (
                <tr style={{ background: 'rgba(0,0,0,0.3)' }}>
                  <td colSpan={5} style={{ padding: '16px 20px', borderBottom: '2px solid rgba(160,196,255,0.2)' }}>
                    <div style={{ fontSize: '0.76rem', lineHeight: '1.6', overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
                      <JsonViewer data={entry.data} depth={0} />
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
