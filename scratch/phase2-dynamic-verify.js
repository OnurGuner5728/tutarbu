/**
 * Phase 2: Dynamic Baseline & Seed Verification Script
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const FIXTURE_DATA = {
  eventId: 12345,
  event: { 
    event: { 
      homeTeam: { name: 'Mock Home' }, 
      awayTeam: { name: 'Mock Away' },
      tournament: { name: 'Mock League' }
    } 
  },
  lineups: { 
    isFallback: true, 
    home: { players: [] }, 
    away: { players: [] } 
  },
  weatherMetrics: { temperature: 20 },
  standings: [
    { teamId: 1, name: 'Mock Home', goalsScored: 50, goalsConceded: 30, matchesPlayed: 20 },
    { teamId: 2, name: 'Mock Away', goalsScored: 40, goalsConceded: 20, matchesPlayed: 20 }
  ],
  homeTeamId: 1,
  awayTeamId: 2,
  _apiLog: []
};

const fetcherPath = path.resolve(__dirname, '../src/services/data-fetcher');
require.cache[fetcherPath + '.js'] = {
  id: fetcherPath + '.js',
  filename: fetcherPath + '.js',
  loaded: true,
  exports: {
    fetchAllMatchData: async (id) => { return { ...FIXTURE_DATA, eventId: id }; }
  }
};

try {
  require('../src/server');
} catch (e) {}

const BASE_URL = 'http://127.0.0.1:3001/api';

async function runTests() {
  console.log('\n--- STARTING DYNAMIC ENGINE VERIFICATION ---\n');

  try {
    // 1. Verify Baseline Traces in Predict
    const res1 = await axios.post(`${BASE_URL}/predict/12345?debug=1`);
    const audit = res1.data._debug.metricAudit;
    console.log(`[TEST 1] Predict Debug Status: ${res1.status}`);
    console.log(`[TEST 1] baselineTraces exists: ${!!audit.baselineTraces}`);
    if (audit.baselineTraces) {
      console.log(`[TEST 1] Sample Trace: ${audit.baselineTraces[0]}`);
    }

    // 2. Verify Simulate Bugfix (computeProbBases is called)
    const res2 = await axios.post(`${BASE_URL}/simulate/12345?debug=1`, { runs: 1 });
    console.log(`\n[TEST 2] Simulate Status: ${res2.status}`);
    console.log(`[TEST 2] probBases exists in result: ${!!res2.data.probBases}`);

    // 3. Verify Determinism (Seed)
    const seed = 'test-seed-123';
    const res3a = await axios.post(`${BASE_URL}/simulate/12345?seed=${seed}`, { runs: 1 });
    const res3b = await axios.post(`${BASE_URL}/simulate/12345?seed=${seed}`, { runs: 1 });
    
    // Compare events of the first 5 minutes to see if they are identical
    const match = JSON.stringify(res3a.data.events) === JSON.stringify(res3b.data.events);
    console.log(`\n[TEST 3] Seed Determinism: ${match ? '✅ MATCHED' : '❌ DIFFERS'}`);
    
    // Different seed should differ
    const res4 = await axios.post(`${BASE_URL}/simulate/12345?seed=other`, { runs: 1 });
    const diff = JSON.stringify(res3a.data.events) !== JSON.stringify(res4.data.events);
    console.log(`[TEST 3] Different Seed Result: ${diff ? '✅ VARIES (PASS)' : '❌ IDENTICAL (FAIL)'}`);

    console.log('\n--- DYNAMIC ENGINE VERIFICATION COMPLETE ---\n');
    process.exit(0);
  } catch (err) {
    console.error(`\n--- VERIFICATION FAILED ---\n`, err.message);
    process.exit(1);
  }
}

setTimeout(runTests, 3000);
