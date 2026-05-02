/**
 * Backtest Runner
 * Fetches historical matches (finished), runs predictions, and compares outcomes.
 * Usage: node src/engine/backtest-runner.js <YYYY-MM-DD>
 */

const api = require('../services/playwright-client');
const { fetchAllMatchData } = require('../services/data-fetcher');
const { calculateAllMetrics } = require('./metric-calculator');
const { generatePrediction } = require('./prediction-generator');
const { getDynamicBaseline } = require('./dynamic-baseline');
const { computePositionMVBreakdown } = require('./quality-factors');

// Top 5 ligi + önemli turnuvalar için filtreleme (opsiyonel)
const TOP_TOURNAMENT_IDS = new Set([
  17,   // Premier League
  8,    // La Liga
  23,   // Serie A
  35,   // Bundesliga
  34,   // Ligue 1
  7,    // Champions League
  679,  // Europa League
  52,   // Süper Lig
  325,  // Eredivisie
  37,   // Primeira Liga
]);

async function runBacktest(date, matchLimit = 10) {
  console.log(`\x1b[35m[Backtest] Starting backtest for date: ${date} (limit: ${matchLimit})\x1b[0m`);

  try {
    await api.initBrowser();

    // 1. Get matches — tek günde yeterli yoksa geriye doğru gez
    let collected = [];
    let cursor = date;
    const MAX_DAYS_BACK = 14;
    for (let d = 0; d < MAX_DAYS_BACK && collected.length < matchLimit; d++) {
      const events = await api.getScheduledEvents(cursor);
      if (events?.events?.length) {
        let dayFinished = events.events.filter(e =>
          e.status.type === 'finished' &&
          e.tournament?.uniqueTournament?.id &&
          TOP_TOURNAMENT_IDS.has(e.tournament.uniqueTournament.id)
        );
        if (dayFinished.length === 0) {
          dayFinished = events.events.filter(e =>
            e.status.type === 'finished' && e.tournament?.uniqueTournament?.id
          );
        }
        collected.push(...dayFinished);
        console.log(`[Backtest] ${cursor}: +${dayFinished.length} (toplam ${collected.length})`);
      }
      if (collected.length >= matchLimit) break;
      // Bir gün geri kay
      const prev = new Date(cursor);
      prev.setDate(prev.getDate() - 1);
      cursor = prev.toISOString().split('T')[0];
    }

    const finishedMatches = collected.slice(0, matchLimit);
    console.log(`[Backtest] Processing ${finishedMatches.length} matches.`);

    const results = [];
    const mlTrainingData = [];
    let hits1X2 = 0, hitsOU25 = 0, hitsBTTS = 0, hitsScore = 0;
    let totalBrier = 0, totalLogLoss = 0;

    // Ayrı motor izleme — Poisson-only vs Simulation-only vs Hybrid
    let poissonHits1X2 = 0, simHits1X2 = 0;
    let poissonTotal = 0, simTotal = 0;

    // Deduplication: aynı maç ID'si birden fazla tarih penceresinde toplanabilir
    const processedMatchIds = new Set();

    const INTER_MATCH_DELAY_MS = 5000; // 5s maçlar arası — rate limit / IP ban önlemi

    for (let mi = 0; mi < finishedMatches.length; mi++) {
      const match = finishedMatches[mi];

      // Mükerrer maç kontrolü
      if (processedMatchIds.has(String(match.id))) {
        console.log(`\x1b[90m[Backtest] Skipping duplicate match ID ${match.id}\x1b[0m`);
        continue;
      }
      processedMatchIds.add(String(match.id));

      if (mi > 0) {
        console.log(`\x1b[90m[Backtest] Waiting ${INTER_MATCH_DELAY_MS / 1000}s before next match...\x1b[0m`);
        await new Promise(r => setTimeout(r, INTER_MATCH_DELAY_MS));
      }
      const matchLabel = `${match.homeTeam.name} vs ${match.awayTeam.name}`;
      console.log(`\n\x1b[36m[Backtest] Processing (${mi + 1}/${finishedMatches.length}): ${matchLabel} (ID: ${match.id})\x1b[0m`);
      
      try {
        // Fetch full data
        const fullData = await fetchAllMatchData(match.id);
        
        // Calculate metrics
        const metrics = calculateAllMetrics(fullData);
        
        // Calculate dynamic baseline
        const baseline = getDynamicBaseline(fullData);
        
        // Inject league physical parameters into baseline
        baseline.leagueGoalVolatility = metrics.meta?.leagueGoalVolatility ?? null;
        baseline.leaguePointDensity   = metrics.meta?.leaguePointDensity   ?? null;
        baseline.medianGoalRate       = metrics.meta?.medianGoalRate       ?? null;
        baseline.leagueTeamCount      = metrics.meta?.leagueTeamCount      ?? null;
        baseline.ptsCV                = metrics.meta?.ptsCV                ?? null;
        baseline.normMinRatio         = metrics.meta?.normMinRatio         ?? null;
        baseline.normMaxRatio         = metrics.meta?.normMaxRatio         ?? null;
        // HT/FT reversal oranları — morale cascade kalibrasyonu için
        baseline._htLeadContinuation = metrics.dynamicLeagueAvgs?._htLeadContinuation ?? null;
        baseline._htDrawToWinRate = metrics.dynamicLeagueAvgs?._htDrawToWinRate ?? null;
        baseline._htReversalRate = metrics.dynamicLeagueAvgs?._htReversalRate ?? null;

        // Inject Position-based Market Value Breakdown (PVKD)
        baseline.homeMVBreakdown = computePositionMVBreakdown(fullData.homePlayers || []);
        baseline.awayMVBreakdown = computePositionMVBreakdown(fullData.awayPlayers || []);
        
        // Generate prediction (with baseline and audit)
        const report = generatePrediction(metrics, fullData, baseline, metrics.metricAudit, Math.random);

        // Reality Check
        const realHS = match.homeScore.current;
        const realAS = match.awayScore.current;
        const realTotal = realHS + realAS;
        const realResult = realHS > realAS ? '1' : (realHS < realAS ? '2' : 'X');
        const realOU25 = realTotal > 2.5 ? 'Over' : 'Under';
        const realBTTS = (realHS > 0 && realAS > 0) ? 'Yes' : 'No';

        // Predicted result — use final harmonized blend (Poisson + Simulation + Calibration)
        const simDist = report.simulationInsights?.distribution || {};
        // Final harmonized blend (report.result) contains the weighted combination of Poisson and Simulation
        const pHome = report.result.homeWin || parseFloat(simDist.homeWin) || 0;
        const pDraw = report.result.draw || parseFloat(simDist.draw) || 0; 
        const pAway = report.result.awayWin || parseFloat(simDist.awayWin) || 0;
        
        let normalizedPredicted = 'X';
        if (pHome >= pDraw && pHome >= pAway) normalizedPredicted = '1';
        else if (pAway >= pDraw && pAway >= pHome) normalizedPredicted = '2';
        
        const pOU25 = parseFloat(simDist.over25) || report.goals?.over25 || 0;
        // Öneri C: Ligin/takımların gerçekleşen Over25 oranından türetilen dinamik eşik.
        // report.goals.over25DynamicThreshold null ise 50.0'a düşülür (mevcut davranış korunur).
        const ou25Threshold = report.goals?.over25DynamicThreshold ?? 50.0;
        const predictedOU25 = pOU25 > ou25Threshold ? 'Over' : 'Under';

        const pBTTS = parseFloat(simDist.btts) || report.goals?.btts || 0;
        // Öneri D: Ligin/takımların gerçekleşen BTTS oranından + takım gol atma kapasitesinden
        // türetilen dinamik eşik. report.goals.bttsDynamicThreshold null ise 50.0'a düşülür.
        const bttsThreshold = report.goals?.bttsDynamicThreshold ?? 50.0;
        const predictedBTTS = pBTTS > bttsThreshold ? 'Yes' : 'No';

        const predictedScore = report.score?.predicted || 'N/A';

        const hit1X2 = normalizedPredicted === realResult;
        const hitOU25 = predictedOU25 === realOU25;
        const hitBTTS = predictedBTTS === realBTTS;
        const hitScore = predictedScore === `${realHS}-${realAS}`;

        if (hit1X2) hits1X2++;
        if (hitOU25) hitsOU25++;
        if (hitBTTS) hitsBTTS++;
        if (hitScore) hitsScore++;

        // ── Poisson-Only ve Simulation-Only ayrı izleme ────────────────────────
        const poissonRes = report.poissonResult;
        const simRes = report.simulationResult;
        if (poissonRes?.predicted) {
          poissonTotal++;
          if (poissonRes.predicted === realResult) poissonHits1X2++;
        }
        if (simRes?.predicted) {
          simTotal++;
          if (simRes.predicted === realResult) simHits1X2++;
        }

        // ── Brier Score + Log Loss ──────────────────────────────────────────────
        // Brier (3-outcome): Σ(p_i - o_i)² — kalibre olasılık için en iyi metrik
        // Log Loss: -Σ o_i × log(p_i) — olasılık kalibrasyon kalitesi
        const eps = 1e-10;
        const pH_n = pHome / 100, pD_n = pDraw / 100, pA_n = pAway / 100;
        const oH = realResult === '1' ? 1 : 0, oD = realResult === 'X' ? 1 : 0, oA = realResult === '2' ? 1 : 0;
        const brierScore = (pH_n - oH) ** 2 + (pD_n - oD) ** 2 + (pA_n - oA) ** 2;
        const logLoss = -(oH * Math.log(pH_n + eps) + oD * Math.log(pD_n + eps) + oA * Math.log(pA_n + eps));
        totalBrier += brierScore;
        totalLogLoss += logLoss;

        console.log(`[Result] Actual: ${realHS}-${realAS} (${realResult}) | Final Blend: ${pHome.toFixed(1)}/${pDraw.toFixed(1)}/${pAway.toFixed(1)} -> ${normalizedPredicted}`);
        console.log(`[Engine] Poisson Analitik: ${report.prediction?.homeWinProbability?.toFixed(1)}% | Simülasyon Davranışsal: ${simDist?.homeWin?.toFixed(1)}% | Kaynak: ${report.result?.source}`);
        console.log(`[Score]  Predicted Score: ${predictedScore} | O/U2.5: ${pOU25.toFixed(1)}% -> ${predictedOU25} | BTTS: ${pBTTS.toFixed(1)}% -> ${predictedBTTS}`);
        console.log(`[Check]  1X2: ${hit1X2 ? '✅' : '❌'} | O/U 2.5: ${hitOU25 ? '✅' : '❌'} | BTTS: ${hitBTTS ? '✅' : '❌'} | Skor: ${hitScore ? '✅' : '❌'} | Brier: ${brierScore.toFixed(4)}`);

        const coverageCtrl = report.coverageControl || {};
        const resultEntry = {
          match: matchLabel,
          tournament: match.tournament?.name || '',
          tournamentId: match.tournament?.uniqueTournament?.id || null,
          actual: `${realHS}-${realAS}`,
          actualResult: realResult,
          actualOU25: realOU25,
          actualBTTS: realBTTS,
          predicted: predictedScore,
          predictedResult: normalizedPredicted,
          predictedOU25,
          predictedBTTS,
          probHome: pHome,
          probDraw: pDraw,
          probAway: pAway,
          probOU25: pOU25,
          probBTTS: pBTTS,
          hit1X2, hitOU25, hitBTTS, hitScore,
          confidence: report.result?.confidence || 0,
          avgGoals: simDist.avgGoals || 0,
          brierScore: +brierScore.toFixed(4),
          logLoss: +logLoss.toFixed(4),
          confidenceTier: coverageCtrl.confidenceTier || 'UNKNOWN',
          maxProbability: coverageCtrl.maxProbability || 0,
          isHighConfidence: coverageCtrl.isHighConfidence || false,
          restDays: {
            home: report.metadata?.homeRestDays ?? null,
            away: report.metadata?.awayRestDays ?? null,
          },
        };
        results.push(resultEntry);

        // ML Training Format kaydı (Poisson + Sim ayrı sonuçları ile)
        mlTrainingData.push({
          matchId: match.id,
          date,
          tournamentId: match.tournament?.uniqueTournament?.id || null,
          homeTeamId: match.homeTeam?.id,
          awayTeamId: match.awayTeam?.id,
          actualResult: realResult,
          actualScore: `${realHS}-${realAS}`,
          actualOU25: realOU25,
          actualBTTS: realBTTS,
          // Hibrit (final tahmin)
          probHome: pHome, probDraw: pDraw, probAway: pAway,
          probOU25: pOU25, probBTTS: pBTTS,
          hit1X2, hitOU25, hitBTTS, hitScore,
          brierScore: +brierScore.toFixed(4),
          logLoss: +logLoss.toFixed(4),
          // Ayrı motor sonuçları
          poisson: poissonRes ? {
            homeWin: poissonRes.homeWin, draw: poissonRes.draw, awayWin: poissonRes.awayWin,
            predicted: poissonRes.predicted,
            hit: poissonRes.predicted === realResult,
            lambdaHome: poissonRes.lambdaHome, lambdaAway: poissonRes.lambdaAway,
          } : null,
          simulation: simRes ? {
            homeWin: simRes.homeWin, draw: simRes.draw, awayWin: simRes.awayWin,
            predicted: simRes.predicted,
            hit: simRes.predicted === realResult,
            over25: simRes.over25, btts: simRes.btts,
          } : null,
          confidenceTier: coverageCtrl.confidenceTier || 'UNKNOWN',
          maxProbability: coverageCtrl.maxProbability || 0,
          isHighConfidence: coverageCtrl.isHighConfidence || false,
          confidence: report.result?.confidence || 0,
          // MEDIUM tier piyasa yönü kontrolü (Shin dönüşümlü M131-M133)
          marketDirection: (() => {
            const m131 = metrics.shared?.contextual?.M131;
            const m132 = metrics.shared?.contextual?.M132;
            const m133 = metrics.shared?.contextual?.M133;
            if (m131 == null || m133 == null) return null;
            if (m131 >= m132 && m131 >= m133) return '1';
            if (m133 >= m131 && m133 >= m132) return '2';
            return 'X';
          })(),
        });

      } catch (err) {
        console.error(`[Backtest] Error processing ${matchLabel}: ${err.message}`);
      }
    }

    // 3. Overall Report
    const total = results.length;
    if (total === 0) {
      console.log('\n[Backtest] No matches processed successfully.');
      return;
    }

    console.log('\n\x1b[32m' + '═'.repeat(60));
    console.log('          BACKTEST SUMMARY (' + date + ')');
    console.log('═'.repeat(60) + '\x1b[0m');
    console.log(`Total Matches Analyzed: ${total}`);
    console.log(`─────────────────────────────────────────`);
    console.log(`1X2 Accuracy:   ${((hits1X2 / total) * 100).toFixed(1)}% (${hits1X2}/${total})`);
    console.log(`O/U 2.5 Acc:    ${((hitsOU25 / total) * 100).toFixed(1)}% (${hitsOU25}/${total})`);
    console.log(`BTTS Accuracy:  ${((hitsBTTS / total) * 100).toFixed(1)}% (${hitsBTTS}/${total})`);
    console.log(`Exact Score:    ${((hitsScore / total) * 100).toFixed(1)}% (${hitsScore}/${total})`);
    console.log('─────────────────────────────────────────');
    console.log(`Avg Brier Score: ${(totalBrier / total).toFixed(4)} (ref random=0.667, hedef<0.45)`);
    console.log(`Avg Log Loss:    ${(totalLogLoss / total).toFixed(4)} (ref random=1.099, hedef<0.85)`);
    console.log('─────────────────────────────────────────');
    // Coverage-controlled accuracy (HIGH confidence only)
    const highConfResults = results.filter(r => r.isHighConfidence);
    const mediumConfResults = results.filter(r => r.confidenceTier === 'MEDIUM');
    const lowConfResults = results.filter(r => r.confidenceTier === 'LOW');
    if (highConfResults.length > 0) {
      const hcHits = highConfResults.filter(r => r.hit1X2).length;
      console.log(`HIGH Confidence:   ${highConfResults.length}/${total} maç → 1X2: ${((hcHits / highConfResults.length) * 100).toFixed(1)}%`);
    }
    if (mediumConfResults.length > 0) {
      const mcHits = mediumConfResults.filter(r => r.hit1X2).length;
      // MEDIUM tier'da piyasa yönü filtresi
      const medMarketAligned = mlTrainingData.filter(d =>
        d.confidenceTier === 'MEDIUM' && d.marketDirection != null &&
        d.marketDirection === (d.probHome >= d.probDraw && d.probHome >= d.probAway ? '1' :
          d.probAway >= d.probHome && d.probAway >= d.probDraw ? '2' : 'X')
      );
      const medAlignedHits = medMarketAligned.filter(d => d.hit1X2).length;
      console.log(`MEDIUM Confidence: ${mediumConfResults.length}/${total} maç → 1X2: ${((mcHits / mediumConfResults.length) * 100).toFixed(1)}% | Piyasa hizalı: ${medMarketAligned.length} maç → ${medMarketAligned.length > 0 ? ((medAlignedHits/medMarketAligned.length)*100).toFixed(1) : 'N/A'}%`);
    }
    if (lowConfResults.length > 0) {
      const lcHits = lowConfResults.filter(r => r.hit1X2).length;
      console.log(`LOW  Confidence:   ${lowConfResults.length}/${total} maç → 1X2: ${((lcHits / lowConfResults.length) * 100).toFixed(1)}%`);
    }
    console.log('─────────────────────────────────────────');
    // Motor karşılaştırması
    if (poissonTotal > 0) console.log(`Poisson-Only 1X2:  ${((poissonHits1X2 / poissonTotal) * 100).toFixed(1)}% (${poissonHits1X2}/${poissonTotal})`);
    if (simTotal > 0)     console.log(`Simulation-Only 1X2: ${((simHits1X2 / simTotal) * 100).toFixed(1)}% (${simHits1X2}/${simTotal})`);
    console.log('─────────────────────────────────────────');

    // Detailed results table
    console.log('\n\x1b[33m--- DETAILED RESULTS ---\x1b[0m');
    for (const r of results) {
      const flags = [
        r.hit1X2 ? '✅1X2' : '❌1X2',
        r.hitOU25 ? '✅O/U' : '❌O/U',
        r.hitBTTS ? '✅BTTS' : '❌BTTS',
      ].join(' ');
      console.log(`  ${r.match.padEnd(45)} | ${r.actual} vs ${r.predicted.padEnd(5)} | ${flags}`);
    }

    console.log('\x1b[32m' + '═'.repeat(60) + '\x1b[0m');

    // Export results as JSON for artifact
    const fs = require('fs');
    const avgBrier = totalBrier / total;
    const avgLogLoss = totalLogLoss / total;
    const outputPath = `backtest_${date}.json`;
    fs.writeFileSync(outputPath, JSON.stringify({
      date,
      summary: {
        total, hits1X2, hitsOU25, hitsBTTS, hitsScore,
        accuracy1X2: +((hits1X2 / total) * 100).toFixed(1),
        accuracyOU25: +((hitsOU25 / total) * 100).toFixed(1),
        accuracyBTTS: +((hitsBTTS / total) * 100).toFixed(1),
        accuracyScore: +((hitsScore / total) * 100).toFixed(1),
        avgBrierScore: +avgBrier.toFixed(4),
        avgLogLoss: +avgLogLoss.toFixed(4),
        highConfidenceCount: results.filter(r => r.isHighConfidence).length,
        highConfidenceAccuracy1X2: (() => {
          const hc = results.filter(r => r.isHighConfidence);
          return hc.length > 0 ? +((hc.filter(r => r.hit1X2).length / hc.length) * 100).toFixed(1) : null;
        })(),
      },
      results,
    }, null, 2), 'utf-8');
    console.log(`[Backtest] Results saved to ${outputPath}`);

    // ML Training veri birikimi — model eğitimi için jsonl formatında kayıt
    if (mlTrainingData.length > 0) {
      const trainingPath = `backtest_training_data_${new Date().getFullYear()}.jsonl`;
      const newLines = mlTrainingData.map(d => JSON.stringify(d)).join('\n') + '\n';
      fs.appendFileSync(trainingPath, newLines, 'utf-8');
      console.log(`[Backtest] ML training data appended to ${trainingPath} (${mlTrainingData.length} records)`);
    }

  } catch (err) {
    console.error(`[Backtest FATAL] ${err.message}`);
  } finally {
    await api.closeBrowser();
  }
}

// Get date and match count from args
const targetDate = process.argv[2] || new Date(Date.now() - 86400000).toISOString().split('T')[0];
const matchLimit = parseInt(process.argv[3], 10) || 10;
runBacktest(targetDate, matchLimit);
