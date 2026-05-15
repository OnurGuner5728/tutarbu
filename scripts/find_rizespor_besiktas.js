const api = require('../src/services/playwright-client');
(async () => {
  await api.initBrowser();
  // Bugün ve yakın tarih
  for (const date of ['2026-05-15', '2026-05-14', '2026-05-16', '2026-05-13', '2026-05-17', '2026-05-18']) {
    const ev = await api.getScheduledEvents(date);
    const matches = (ev?.events || []).filter(e => {
      const h = (e.homeTeam?.name || '').toLowerCase();
      const a = (e.awayTeam?.name || '').toLowerCase();
      return (h.includes('rize') || a.includes('rize')) && (h.includes('beşik') || a.includes('beşik') || h.includes('besik') || a.includes('besik'));
    });
    if (matches.length > 0) {
      matches.forEach(m => {
        const ts = m.startTimestamp ? new Date(m.startTimestamp * 1000).toISOString() : '?';
        console.log(`[${date}] ${m.homeTeam.name} vs ${m.awayTeam.name} | id:${m.id} | ts:${ts} | status:${m.status?.type}`);
      });
    }
  }
  await api.closeBrowser?.();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
