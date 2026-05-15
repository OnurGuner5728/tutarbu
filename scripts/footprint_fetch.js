/**
 * Detaylı fetch ayak izi — her endpoint'in tek tek süresini ölçer.
 * playwright-client'a hook ile her API çağrısının başlangıç/bitiş zamanını yakalar.
 */
const api = require('../src/services/playwright-client');
const { fetchAllMatchData } = require('../src/services/data-fetcher');

const MATCH_ID = parseInt(process.argv[2] || '14109920', 10);

// Hook: her fetchAPI çağrısını yakala
const _originalFetch = api.getEvent.bind(api);
const callLog = [];

// playwright-client.fetchAPI'yi monkey-patch — tüm endpoint çağrılarını yakala
const origMethods = {};
const apiMethodNames = Object.keys(api).filter(k => typeof api[k] === 'function' && k.startsWith('get'));

apiMethodNames.forEach(name => {
  origMethods[name] = api[name].bind(api);
  api[name] = async (...args) => {
    const t0 = Date.now();
    const result = await origMethods[name](...args);
    const elapsed = Date.now() - t0;
    callLog.push({
      method: name,
      args: args.slice(0, 3).map(a => typeof a === 'object' ? '[obj]' : String(a)).join(','),
      elapsedMs: elapsed,
      ts: t0,
      success: result !== null && result !== undefined,
      cached: elapsed < 50, // <50ms muhtemelen cache hit (1500ms rate limit yok)
    });
    return result;
  };
});

(async () => {
  console.log(`\n══ FETCH AYAK İZİ — Match ${MATCH_ID} ══\n`);

  const tInit0 = Date.now();
  await api.initBrowser();
  const tInit = Date.now() - tInit0;
  console.log(`Browser init: ${tInit}ms`);

  const tFetch0 = Date.now();
  await fetchAllMatchData(MATCH_ID);
  const tFetch = Date.now() - tFetch0;

  console.log(`\nToplam fetch süresi: ${(tFetch/1000).toFixed(1)}s`);
  console.log(`Toplam endpoint çağrı: ${callLog.length}`);
  console.log(`Cache hit (<50ms): ${callLog.filter(c => c.cached).length}`);
  console.log(`Gerçek API: ${callLog.filter(c => !c.cached).length}`);
  console.log(`Başarısız: ${callLog.filter(c => !c.success).length}\n`);

  // Method bazında özet
  const byMethod = {};
  callLog.forEach(c => {
    if (!byMethod[c.method]) byMethod[c.method] = { count: 0, totalMs: 0, fails: 0, cachedCount: 0 };
    byMethod[c.method].count++;
    byMethod[c.method].totalMs += c.elapsedMs;
    if (!c.success) byMethod[c.method].fails++;
    if (c.cached) byMethod[c.method].cachedCount++;
  });

  console.log('=== METHOD BAZINDA ===');
  console.log('Method                              Count  Total(s)  Avg(ms)  Cached  Fails');
  console.log('-'.repeat(80));
  const sorted = Object.entries(byMethod).sort((a, b) => b[1].totalMs - a[1].totalMs);
  sorted.forEach(([m, s]) => {
    console.log(
      `${m.padEnd(36)} ${s.count.toString().padStart(5)} ` +
      `${(s.totalMs/1000).toFixed(2).padStart(8)} ${(s.totalMs/s.count).toFixed(0).padStart(8)} ` +
      `${s.cachedCount.toString().padStart(7)} ${s.fails.toString().padStart(6)}`
    );
  });

  // En yavaş 10 çağrı
  console.log('\n=== EN YAVAŞ 10 ÇAĞRI ===');
  callLog.sort((a, b) => b.elapsedMs - a.elapsedMs).slice(0, 10).forEach((c, i) => {
    console.log(`${(i+1).toString().padStart(2)}. ${c.method}(${c.args}) — ${c.elapsedMs}ms ${c.success ? '' : '[FAIL]'}`);
  });

  // Zaman çizelgesi (paralelizm var mı?)
  console.log('\n=== EŞZAMANLILIK ANALİZİ ===');
  callLog.sort((a, b) => a.ts - b.ts);
  const startTs = callLog[0]?.ts || 0;
  let maxConcurrent = 0;
  const events = [];
  callLog.forEach(c => {
    events.push({ t: c.ts - startTs, type: 'start' });
    events.push({ t: c.ts - startTs + c.elapsedMs, type: 'end' });
  });
  events.sort((a, b) => a.t - b.t);
  let inflight = 0;
  events.forEach(e => {
    if (e.type === 'start') inflight++;
    else inflight--;
    if (inflight > maxConcurrent) maxConcurrent = inflight;
  });
  console.log(`Maksimum eşzamanlı in-flight çağrı: ${maxConcurrent}`);
  console.log(`(1 = tamamen sıralı, >1 = paralel — rate-limit queue paralelliği yiyor mu?)`);

  await api.closeBrowser?.();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
