import React from 'react';

const BehavioralGrid = ({ behavioralAnalysis, homeTeam, awayTeam, compact = false }) => {
  if (!behavioralAnalysis || !behavioralAnalysis.home) return null;

  const categories = {
    "Hücum": ["BITIRICILIK", "YARATICILIK", "SUT_URETIMI", "HAVA_HAKIMIYETI", "DURAN_TOP"],
    "Savunma": ["SAVUNMA_DIRENCI", "SAVUNMA_AKSIYONU", "DISIPLIN"],
    "Psikanaliz": ["ZİHİNSEL_DAYANIKLILIK", "PSIKOLOJIK_KIRILGANLIK", "GOL_IHTIYACI", "TURNUVA_BASKISI"],
    "Bağlam": ["MAC_BASLANGICI", "MAC_SONU", "MENAJER_STRATEJISI", "HAKEM_DINAMIKLERI"],
    "Operasyonel": ["TAKTIKSEL_UYUM", "BAGLANTI_OYUNU", "KADRO_DERINLIGI", "H2H_DOMINASYON", "MOMENTUM_AKIŞI"],
    "Kaleci": ["GK_REFLEKS", "GK_ALAN_HAKIMIYETI", "TOPLA_OYNAMA"]
  };

  const renderUnit = (unitKey, hRaw, aRaw) => {
    const homeVal = hRaw ?? 1.0;
    const awayVal = aRaw ?? 1.0;

    const diff = homeVal - awayVal;
    const winner = diff > 0.05 ? 'home' : (diff < -0.05 ? 'away' : 'neutral');
    const badgeText = winner === 'home' ? 'AVANTAJ' : (winner === 'away' ? 'BASKI' : 'DENGEDE');
    
    return (
      <div
        key={unitKey}
        className={compact ? 'bimUnit bimUnitCompact' : 'bimUnit'}
        style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 6 : 8,
        padding: compact ? '10px 12px' : '12px 14px',
        borderRadius: 12,
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(4px)',
        transition: 'all 0.3s ease',
        overflow: 'hidden'
      }}>
        {/* Unit Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: compact ? 11 : 9, fontWeight: 950, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: compact ? 0.6 : 1 }}>
            {unitKey.replace(/_/g, ' ')}
          </span>
          <span
            className={compact ? 'bimBadge bimBadgeCompact' : 'bimBadge'}
            style={{ 
              fontSize: compact ? 10 : 9, 
              fontWeight: 900, 
              padding: compact ? '2px 10px' : '2px 8px', 
              borderRadius: 999,
              background: winner === 'home' ? 'rgba(52,211,153,0.10)' : (winner === 'away' ? 'rgba(251,113,133,0.10)' : 'rgba(255,255,255,0.05)'),
              color: winner === 'home' ? '#34d399' : (winner === 'away' ? '#fb7185' : 'rgba(255,255,255,0.40)'),
              border: `1px solid ${winner === 'home' ? 'rgba(52,211,153,0.22)' : (winner === 'away' ? 'rgba(251,113,133,0.22)' : 'rgba(255,255,255,0.08)')}`,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {badgeText}
          </span>
        </div>
        
        {/* Values Footer with Team Labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: compact ? 12 : 10, fontWeight: 800 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: compact ? 9 : 8, fontWeight: 900, letterSpacing: 0.6 }}>
              {compact ? (homeTeam || 'HOME') : 'HOME'}
            </span>
            <span style={{ color: winner === 'home' ? '#34d399' : '#fff' }}>{(homeVal).toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'right' }}>
            <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: compact ? 9 : 8, fontWeight: 900, letterSpacing: 0.6 }}>
              {compact ? (awayTeam || 'AWAY') : 'AWAY'}
            </span>
            <span style={{ color: winner === 'away' ? '#fb7185' : '#fff' }}>{(awayVal).toFixed(2)}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={compact ? 'bimRoot bimRootCompact' : 'bimRoot'} style={{ display: 'flex', flexDirection: 'column', gap: compact ? 18 : 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: compact ? 10 : 16, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
           <div style={{ width: 10, height: 10, background: '#00e5ff', borderRadius: '50%', boxShadow: '0 0 10px #00e5ff' }} />
           <h3 style={{ fontSize: compact ? 16 : 18, fontWeight: 950, textTransform: 'uppercase', color: '#fff', fontStyle: 'italic', letterSpacing: 1 }}>Behavioral Intelligence Matrix</h3>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(0,229,255,0.6)', background: 'rgba(0,229,255,0.05)', padding: '4px 10px', borderRadius: 4, border: '1px solid rgba(0,229,255,0.2)' }}>
          26 UNITS SCANNING
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fill, minmax(400px, 1fr))', gap: compact ? 16 : 32 }}>
        {Object.entries(categories).map(([catName, units]) => (
          <div key={catName} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 2, height: 12, background: '#00e5ff' }} />
              <h4 style={{ fontSize: compact ? 12 : 10, fontWeight: 950, color: 'rgba(0,229,255,0.85)', textTransform: 'uppercase', letterSpacing: compact ? 1.6 : 2 }}>{catName} Group</h4>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 1fr', gap: compact ? 10 : 12 }}>
               {units.map(u => renderUnit(u, behavioralAnalysis.home[u], behavioralAnalysis.away[u]))}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        .bimUnitCompact { border-radius: 12px; }
        .bimUnitCompact:hover {
          border-color: rgba(0,229,255,0.22);
          box-shadow: 0 8px 24px rgba(0,0,0,0.22);
        }
        .bimBadgeCompact {
          box-shadow: 0 0 0 1px rgba(0,0,0,0.18) inset;
        }
      `}</style>
    </div>
  );
};

export default BehavioralGrid;
