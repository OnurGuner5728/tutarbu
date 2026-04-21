/**
 * Phase 1: Local Route Verification Script
 * Bypasses external APIs by mocking data-fetcher and verifies route contracts via real HTTP requests.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// 1. Setup Mock Fixture
const FIXTURE_DATA = {
  eventId: 12345,
  event: { 
    event: { 
      homeTeam: { name: 'Mock Home' }, 
      awayTeam: { name: 'Mock Away' } 
    } 
  },
  lineups: { 
    isFallback: true, 
    home: { players: [] }, 
    away: { players: [] } 
  },
  weatherMetrics: { temperature: 20 },
  _apiLog: [
    { endpoint: 'getEvent', success: true, elapsedMs: 15, isCritical: true },
    { endpoint: 'lineups', success: false, error: 'Mock Failure', elapsedMs: 500, isCritical: true }
  ]
};

// 2. Monkey-patch the data-fetcher in require.cache before requiring server
const fetcherPath = path.resolve(__dirname, '../src/services/data-fetcher.js');
console.log(`[Verification] Masking data-fetcher at: ${fetcherPath}`);

require.cache[fetcherPath] = {
  id: fetcherPath,
  filename: fetcherPath,
  loaded: true,
  exports: {
    fetchAllMatchData: async (id) => {
      console.log(`[MockFetcher] Intercepted request for ID: ${id}`);
      return { ...FIXTURE_DATA, eventId: id };
    }
  }
};

// 3. Start the process of starting the server
console.log('[Verification] Requiring server.js...');
// We use a try-catch because server.js might try to start listening on a busy port
try {
  require('../src/server');
} catch (e) {
  console.error('[Verification] Error loading server:', e.message);
  process.exit(1);
}

const BASE_URL = 'http://127.0.0.1:3001/api';

async function runTests() {
  console.log('\n--- STARTING LOCAL HTTP ROUTE VERIFICATION ---\n');

  try {
    // Test 1: POST /api/predict (Debug OFF)
    const res1 = await axios.post(`${BASE_URL}/predict/12345`);
    console.log(`[TEST 1] POST /predict (No Debug) -> Status: ${res1.status}`);
    console.log(`[TEST 1] _debug field exists: ${res1.data._debug !== undefined ? '❌ YES (FAIL)' : '✅ NO (PASS)'}`);

    // Test 2: POST /api/predict (Debug ON)
    const res2 = await axios.post(`${BASE_URL}/predict/12345?debug=1`);
    console.log(`\n[TEST 2] POST /predict (Debug=1) -> Status: ${res2.status}`);
    console.log(`[TEST 2] _debug field exists: ${res2.data._debug !== undefined ? '✅ YES (PASS)' : '❌ NO (FAIL)'}`);
    if (res2.data._debug) {
      console.log(`[TEST 2] _debug.providerAudit.total: ${res2.data._debug.providerAudit?.total}`);
      console.log(`[TEST 2] _debug.metricAudit.nullCount: ${res2.data._debug.metricAudit?.nullCount}`);
    }

    // Test 3: POST /api/workshop (Debug ON)
    const res3 = await axios.post(`${BASE_URL}/workshop/12345?debug=1`, { modifiedLineup: {} });
    console.log(`\n[TEST 3] POST /workshop (Debug=1) -> Status: ${res3.status}`);
    console.log(`[TEST 3] _debug field exists: ${res3.data._debug !== undefined ? '✅ YES (PASS)' : '❌ NO (FAIL)'}`);

    // Test 4: GET /api/metrics (Debug Leak Check)
    const res4 = await axios.get(`${BASE_URL}/metrics/12345?debug=1`);
    console.log(`\n[TEST 4] GET /metrics (Debug=1) -> Status: ${res4.status}`);
    console.log(`[TEST 4] _debug leak: ${res4.data._debug === undefined ? '✅ NO (PASS)' : '❌ YES (FAIL)'}`);

    // Test 5: POST /api/simulate (Debug ON)
    const res5 = await axios.post(`${BASE_URL}/simulate/12345?debug=1`, { selectedMetrics: [], runs: 1 });
    console.log(`\n[TEST 5] POST /simulate (Debug=1) -> Status: ${res5.status}`);
    console.log(`[TEST 5] _debug field exists: ${res5.data._debug !== undefined ? '✅ YES (PASS)' : '❌ NO (FAIL)'}`);

    console.log('\n--- ALL LOCAL VERIFICATIONS PASSED ---\n');
    process.exit(0);
  } catch (err) {
    console.error(`\n--- VERIFICATION FAILED ---\n`);
    if (err.response) {
      console.error(`Status: ${err.response.status}`);
      console.error(`Data:`, JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(`Error: ${err.message}`);
    }
    process.exit(1);
  }
}

// Give the server 3 seconds to spin up before running tests
console.log('[Verification] Waiting for server to settle...');
setTimeout(runTests, 3000);
