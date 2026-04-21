const { fetchAllMatchData } = require('../src/services/data-fetcher');
const { calculateAllMetrics } = require('../src/engine/metric-calculator');
const { generatePrediction } = require('../src/engine/prediction-generator');
const { getDynamicBaseline } = require('../src/engine/dynamic-baseline');

async function verifyEvent(eventId) {
    console.log(`\n\n[TEST] Verifying Event ID: ${eventId}`);
    try {
        console.log(`[TEST] Step 1: Fetching data...`);
        const data = await fetchAllMatchData(eventId);
        console.log(`[TEST] Data fetch SUCCESS. Lineups exists: ${!!data.lineups}`);

        console.log(`[TEST] Step 2: Calculating metrics...`);
        const metrics = calculateAllMetrics(data);
        console.log(`[TEST] Metrics calculation SUCCESS.`);

        console.log(`[TEST] Step 3: Generating baseline...`);
        const baseline = getDynamicBaseline(data);
        console.log(`[TEST] Baseline generation SUCCESS.`);

        console.log(`[TEST] Step 4: Generating prediction...`);
        const prediction = generatePrediction(metrics, data, baseline, metrics.metricAudit, Math.random);
        console.log(`[TEST] Prediction generation SUCCESS.`);
        
        console.log(`[TEST] Result: Match ${prediction.match.homeTeam} vs ${prediction.match.awayTeam}`);
        console.log(`[TEST] Confidence: ${prediction.result.confidence}%`);
        console.log(`[TEST] STATUS: PASSED`);

    } catch (err) {
        console.error(`[TEST] FAILED for Event ${eventId}: ${err.message}`);
        console.error(err.stack);
        process.exit(1);
    }
}

async function run() {
    // Problematic events found in user logs
    await verifyEvent(15399012); // AFC Wimbledon vs Stockport County
    await verifyEvent(15832058); // River Plate vs Carabobo FC
    console.log("\n\n[VERIFICATION COMPLETE] All problematic events handled safely.");
}

run();
