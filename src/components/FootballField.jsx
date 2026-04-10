import React from 'react';

const FootballField = ({ homeTeam, awayTeam }) => {
  return (
    <div style={{
      position: 'relative',
      width: 380,
      height: 560,
      background: 'linear-gradient(180deg, rgba(6,78,59,0.5) 0%, rgba(6,78,59,0.2) 100%)',
      border: '2px solid rgba(255,255,255,0.2)',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(10px)',
    }}>
      {/* Grass Stripes */}
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.1,
        backgroundImage: 'repeating-linear-gradient(0deg, #000 0px, #000 40px, transparent 40px, transparent 80px)'
      }} />
      
      {/* Field Markings */}
      {/* Half-way line */}
      <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: 'rgba(255,255,255,0.3)' }} />
      
      {/* Center Circle */}
      <div style={{ 
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', 
        width: 120, height: 120, border: '1px solid rgba(255,255,255,0.3)', borderRadius: '50%' 
      }} />
      <div style={{ 
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', 
        width: 6, height: 6, background: 'rgba(255,255,255,0.6)', borderRadius: '50%' 
      }} />

      {/* Penalty Areas */}
      {/* Top (Away) */}
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 220, height: 80, borderBottom: '1px solid rgba(255,255,255,0.3)', borderLeft: '1px solid rgba(255,255,255,0.3)', borderRight: '1px solid rgba(255,255,255,0.3)' }} />
      <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 90, height: 30, borderBottom: '1px solid rgba(255,255,255,0.3)', borderLeft: '1px solid rgba(255,255,255,0.3)', borderRight: '1px solid rgba(255,255,255,0.3)' }} />

      {/* Bottom (Home) */}
      <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 220, height: 80, borderTop: '1px solid rgba(255,255,255,0.3)', borderLeft: '1px solid rgba(255,255,255,0.3)', borderRight: '1px solid rgba(255,255,255,0.3)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 90, height: 30, borderTop: '1px solid rgba(255,255,255,0.3)', borderLeft: '1px solid rgba(255,255,255,0.3)', borderRight: '1px solid rgba(255,255,255,0.3)' }} />

      {/* Goal Posts */}
      <div style={{ position: 'absolute', top: -2, left: '50%', transform: 'translateX(-50%)', width: 60, height: 4, background: 'rgba(255,255,255,0.4)', borderRadius: 2 }} />
      <div style={{ position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)', width: 60, height: 4, background: 'rgba(255,255,255,0.4)', borderRadius: 2 }} />

      {/* Labels */}
      <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.1)', textTransform: 'uppercase', letterSpacing: 4 }}>
        {awayTeam}
      </div>
      <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 900, color: 'rgba(255,255,255,0.1)', textTransform: 'uppercase', letterSpacing: 4 }}>
        {homeTeam}
      </div>

      {/* Inner Shadow Glow */}
      <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 50px rgba(0,0,0,0.4)', pointerEvents: 'none' }} />
    </div>
  );
};

export default FootballField;
