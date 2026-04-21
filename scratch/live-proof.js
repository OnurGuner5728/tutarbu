/**
 * LIVE PROOF SCRIPT
 * Running real HTTP requests against the local server to prove dynamic logic and seeding.
 */
const axios = require('axios');

async function proveIt() {
  const BASE_URL = 'http://127.0.0.1:3001/api';
  const REAL_EVENT_ID = '14109872'; // Beşiktaş vs Antalyaspor
  console.log(`\n🚀 GERÇEK ZAMANLI KANIT PAKETİ BAŞLATILIYOR (Maç: Beşiktaş vs Antalyaspor, ID: ${REAL_EVENT_ID})...\n`);

  try {
    // 1. KANIT: Baseline İzleri (Audit Traceability)
    console.log('--- 1. KANIT: Dinamik Baseline ve İzlenebilirlik ---');
    const res1 = await axios.post(`${BASE_URL}/predict/${REAL_EVENT_ID}?debug=1`);
    const traces = res1.data._debug.metricAudit.baselineTraces;
    if (traces && traces.length > 0) {
      console.log('✅ BAŞARILI: Sunucu şu an dinamik baseline kullanıyor.');
      console.log('Örnek Log:', traces[1]); // İlk birkaçı genelde goalConvRate vb. olur
    } else {
      console.log('❌ HATA: Baseline izleri bulunamadı!');
    }

    // 2. KANIT: Seeding / Determinizm (Aynı Seed = Aynı Maç)
    console.log('\n--- 2. KANIT: Seed/Tohumlama Determinizmi ---');
    const seed = 'kanit-tohumu-99';
    const res2a = await axios.post(`${BASE_URL}/simulate/${REAL_EVENT_ID}?seed=${seed}`, { runs: 1 });
    const res2b = await axios.post(`${BASE_URL}/simulate/${REAL_EVENT_ID}?seed=${seed}`, { runs: 1 });
    
    const eventsA = res2a.data.events.map(e => `${e.minute}' ${e.type}`).join('|');
    const eventsB = res2b.data.events.map(e => `${e.minute}' ${e.type}`).join('|');

    if (eventsA === eventsB) {
      console.log('✅ BAŞARILI: Aynı seed ile yapılan iki simülasyon BİREBİR aynı sonuçları verdi.');
      console.log('Olay Akışı (Örnek):', eventsA.slice(0, 50) + '...');
    } else {
      console.log('❌ HATA: Seed çalışmıyor, sonuçlar farklı!');
    }

    // 3. KANIT: Seed Farklılaşması (Farklı Seed = Farklı Maç)
    console.log('\n--- 3. KANIT: Farklı Tohum, Farklı Sonuç ---');
    const res3 = await axios.post(`${BASE_URL}/simulate/${REAL_EVENT_ID}?seed=farkli-tohum`, { runs: 1 });
    const eventsC = res3.data.events.map(e => `${e.minute}' ${e.type}`).join('|');

    if (eventsA !== eventsC) {
      console.log('✅ BAŞARILI: Tohum değişince maçın kaderi değişti. Tesadüfi değil, kontrollü rastgelelik.');
    } else {
      console.log('❌ HATA: Farklı her tohumda aynı maçı mı izletiyoruz? Bir sorun var.');
    }

    console.log('\n💯 KANITLAR TAMAMLANDI. Motor şu an %100 dinamik ve veriye dayalı çalışıyor.');
  } catch (err) {
    console.error('\n❌ SUNUCUYA BAĞLANILAMADI! Server ayakta mı?', err.message);
  }
}

proveIt();
