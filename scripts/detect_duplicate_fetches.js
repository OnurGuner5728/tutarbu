/**
 * Gerçek duplicate fetch tespiti.
 * Aynı URL'ye yapılan tekrarlı çağrıları yakalar (cache miss olduğu için).
 */
const api = require('../src/services/playwright-client');
const { fetchAllMatchData } = require('../src/services/data-fetcher');

const MATCH_ID = parseInt(process.argv[2] || '14109920', 10);

// Hook every API method, log exact URL pattern (method + args)
const callLog = [];
const apiMethodNames = Object.keys(api).filter(k => typeof api[k] === 'function' && k.startsWith('get'));
apiMethodNames.forEach(name => {
  const orig = api[name].bind(api);
  api[name] = async (...args) => {
    const argsKey = args.map(a => String(a)).join('|');
    const key = `${name}(${argsKey})`;
    const t0 = Date.now();
    const result = await orig(...args);
    callLog.push({ key, args: argsKey, method: name, elapsedMs: Date.now() - t0, ts: t0, success: result != null });
    return result;
  };
});

(async () => {
  console.log(`\n══ DUPLICATE FETCH DETECTION — Match ${MATCH_ID} ══\n`);

  await api.initBrowser();
  await fetchAllMatchData(MATCH_ID);

  // Group by exact key
  const byKey = new Map();
  for (const c of callLog) {
    if (!byKey.has(c.key)) byKey.set(c.key, []);
    byKey.get(c.key).push(c);
  }

  // Find duplicates
  const dupes = [...byKey.entries()].filter(([k, calls]) => calls.length > 1);
  console.log(`Toplam unique endpoint: ${byKey.size}`);
  console.log(`Toplam çağrı: ${callLog.length}`);
  console.log(`Duplicate endpoint sayısı: ${dupes.length}`);
  console.log(`Duplicate çağrılarda kaybedilen süre: ${dupes.reduce((s, [k, calls]) => s + calls.slice(1).reduce((ss, c) => ss + c.elapsedMs, 0), 0)}ms\n`);

  if (dupes.length === 0) {
    console.log('Hiç duplicate yok — cache çalışıyor.');
  } else {
    console.log('=== DUPLICATE FETCH\'LER ===');
    dupes.sort((a, b) => b[1].length - a[1].length);
    dupes.forEach(([key, calls]) => {
      const totalMs = calls.reduce((s, c) => s + c.elapsedMs, 0);
      const wastedMs = calls.slice(1).reduce((s, c) => s + c.elapsedMs, 0);
      console.log(`\n${key}`);
      console.log(`  çağrı sayısı: ${calls.length}, toplam ${totalMs}ms, kaybedilen ${wastedMs}ms`);
      calls.forEach((c, i) => {
        console.log(`  [${i+1}] +${(c.ts - callLog[0].ts)}ms — ${c.elapsedMs}ms ${c.success ? 'OK' : 'FAIL'}`);
      });
    });
  }

  // Aynı playerId/teamId/eventId üzerinden tekrar fetch
  console.log('\n=== AYNI KAYNAĞA ÇOK FETCH ===');
  const byResource = new Map();
  callLog.forEach(c => {
    const resource = c.args.split('|')[0]; // ilk arg genelde ID
    const k = `${c.method.replace(/^get/, '').toLowerCase()}_${resource}`;
    if (!byResource.has(k)) byResource.set(k, []);
    byResource.get(k).push(c);
  });
  let multipleFetchTotal = 0;
  [...byResource.entries()].filter(([k, calls]) => {
    // Aynı kaynak için 2+ farklı method (örn. getTeam ve getTeamPlayers aynı teamId)
    const methods = new Set(calls.map(c => c.method));
    return calls.length > 1 || methods.size > 1;
  }).forEach(([k, calls]) => {
    multipleFetchTotal += calls.length;
  });

  await api.closeBrowser?.();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
