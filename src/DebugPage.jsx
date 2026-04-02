import React from 'react';

export default function DebugPage({ eventId, onBack }) {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    fetch(`/api/match-debug/${eventId}`)
      .then(r => {
        if (!r.ok) return r.json().then(e => { throw new Error(e.error || `HTTP ${r.status}`); });
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [eventId]);

  const containerStyle = {
    padding: '24px',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    color: 'var(--text-primary, #e2e8f0)',
    maxWidth: '900px',
    margin: '0 auto',
  };

  const headerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '20px',
  };

  const backBtnStyle = {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '8px',
    color: '#a0c4ff',
    padding: '6px 14px',
    cursor: 'pointer',
    fontSize: '0.8rem',
    letterSpacing: '0.5px',
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.82rem',
  };

  const thStyle = {
    padding: '10px 12px',
    textAlign: 'left',
    background: '#1a1a2e',
    color: '#a0c4ff',
    fontWeight: 600,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    fontSize: '0.7rem',
  };

  const metaStyle = {
    color: '#64748b',
    fontSize: '0.75rem',
    marginBottom: '18px',
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
          Fetching API debug data for event {eventId}...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <button style={backBtnStyle} onClick={onBack}>Back</button>
          <span style={{ color: '#f87171' }}>Failed to load debug data: {error || 'Unknown error'}</span>
        </div>
      </div>
    );
  }

  const totalCalls = data.apiLog.length;
  const successCount = data.apiLog.filter(e => e.success).length;
  const failCount = totalCalls - successCount;
  const totalBytes = data.apiLog.reduce((sum, e) => sum + (e.responseSize || 0), 0);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <button style={backBtnStyle} onClick={onBack}>Back</button>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#e2e8f0' }}>
          API Debug — {data.homeTeam ?? '?'} vs {data.awayTeam ?? '?'}
        </h2>
      </div>

      <p style={metaStyle}>
        Event ID: {data.eventId} &nbsp;|&nbsp; {data.timestamp}
      </p>

      {/* Summary strip */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '20px',
        flexWrap: 'wrap',
      }}>
        {[
          { label: 'Total Calls', value: totalCalls, color: '#a0c4ff' },
          { label: 'Success', value: successCount, color: '#4ade80' },
          { label: 'Failed', value: failCount, color: failCount > 0 ? '#f87171' : '#64748b' },
          { label: 'Total Bytes', value: totalBytes.toLocaleString(), color: '#cbd5e1' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '8px',
            padding: '10px 18px',
            minWidth: '120px',
          }}>
            <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>{label}</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: '32px' }}>#</th>
            <th style={thStyle}>Endpoint</th>
            <th style={{ ...thStyle, textAlign: 'center', width: '80px' }}>Status</th>
            <th style={{ ...thStyle, textAlign: 'right', width: '120px' }}>Response Size</th>
          </tr>
        </thead>
        <tbody>
          {data.apiLog.map((entry, i) => (
            <tr
              key={i}
              style={{
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
              }}
            >
              <td style={{ padding: '9px 12px', color: '#475569', fontSize: '0.72rem' }}>{i + 1}</td>
              <td style={{ padding: '9px 12px', color: '#a0c4ff' }}>{entry.endpoint}</td>
              <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 10px',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  background: entry.success ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
                  color: entry.success ? '#4ade80' : '#f87171',
                  border: `1px solid ${entry.success ? 'rgba(74,222,128,0.25)' : 'rgba(248,113,113,0.25)'}`,
                }}>
                  {entry.success ? 'OK' : 'FAIL'}
                </span>
              </td>
              <td style={{ padding: '9px 12px', textAlign: 'right', color: '#cbd5e1' }}>
                {entry.responseSize != null ? entry.responseSize.toLocaleString() + ' B' : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
