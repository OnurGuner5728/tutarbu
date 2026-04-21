'use strict';

/**
 * Pipeline Diagnostic — Bir maç için tüm katmanları inceleyerek
 * lambda, unit, probBase, ve skor tahmininin nerede bozulduğunu bulur.
 */
const api = require('./src/services/playwright-client');
const { fetchAllMatchData } = require('./src/services/data-fetcher');
const { calculateAllMetrics } = require('./src/engine/metric-calculator');
const { getDynamicBaseline } = require('./src/engine/dynamic-baseline');
const { generatePrediction } = require('./src/engine/prediction-generator');

async function diagnose(eventId) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  PIPELINE DIAGNOSIS — Event ${eventId}`);
  console.log(`${'='.repeat(70)}\n`);

  await api.initBrowser();

  try {
    // 1. Fetch data
    const data = await fetchAllMatchData(eventId);
    const ev = data.event?.event;
    console.log(`Match: ${ev?.homeTeam?.name} vs ${ev?.awayTeam?.name}`);
    console.log(`Score: ${ev?.homeScore?.current ?? '?'}-${ev?.awayScore?.current ?? '?'}`);

    // 2. Calculate metrics
    const metrics = calculateAllMetrics(data);

    // 3. Dynamic baseline
    const baseline = getDynamicBaseline(data);

    // ═══ LAYER 1: Raw API-Derived Team Stats ═══
    console.log('\n--- LAYER 1: Raw API Team Stats ---');
    const hStats = data.homeTeamSeasonStats?.statistics || {};
    const aStats = data.awayTeamSeasonStats?.statistics || {};
    console.log('Home Team Season Stats:');
    console.log(`  goalsScored/game:    ${hStats.goalsScored != null ? (hStats.goalsScored / (hStats.matches || 1)).toFixed(3) : 'N/A'}`);
    console.log(`  goalsConceded/game:  ${hStats.goalsConceded != null ? (hStats.goalsConceded / (hStats.matches || 1)).toFixed(3) : 'N/A'}`);
    console.log(`  shotsPerGame:        ${hStats.shots != null && hStats.matches > 0 ? (hStats.shots / hStats.matches).toFixed(3) : 'N/A'}`);
    console.log(`  shotsOnTargetPG:     ${hStats.shotsOnTarget != null && hStats.matches > 0 ? (hStats.shotsOnTarget / hStats.matches).toFixed(3) : 'N/A'}`);
    console.log(`  matches:             ${hStats.matches ?? 'N/A'}`);
    console.log(`  possession:          ${hStats.averageBallPossession ?? hStats.ballPossession ?? 'N/A'}`);
    console.log('Away Team Season Stats:');
    console.log(`  goalsScored/game:    ${aStats.goalsScored != null ? (aStats.goalsScored / (aStats.matches || 1)).toFixed(3) : 'N/A'}`);
    console.log(`  goalsConceded/game:  ${aStats.goalsConceded != null ? (aStats.goalsConceded / (aStats.matches || 1)).toFixed(3) : 'N/A'}`);
    console.log(`  shotsPerGame:        ${aStats.shots != null && aStats.matches > 0 ? (aStats.shots / aStats.matches).toFixed(3) : 'N/A'}`);
    console.log(`  shotsOnTargetPG:     ${aStats.shotsOnTarget != null && aStats.matches > 0 ? (aStats.shotsOnTarget / aStats.matches).toFixed(3) : 'N/A'}`);
    console.log(`  matches:             ${aStats.matches ?? 'N/A'}`);
    console.log(`  possession:          ${aStats.averageBallPossession ?? aStats.ballPossession ?? 'N/A'}`);

    // ═══ LAYER 2: Calculated Metrics (M001-M168) ═══
    console.log('\n--- LAYER 2: Key Calculated Metrics ---');
    const hm = metrics.home;
    const am = metrics.away;
    console.log('Home Attack:');
    console.log(`  M001 (Goals/Match):       ${hm.attack.M001 ?? 'null'}`);
    console.log(`  M002 (Goals/Match Away):  ${hm.attack.M002 ?? 'null'}`);
    console.log(`  M011 (Goal Conv %):       ${hm.attack.M011 ?? 'null'}`);
    console.log(`  M013 (Shots/Match):       ${hm.attack.M013 ?? 'null'}`);
    console.log(`  M014 (SOT/Match):         ${hm.attack.M014 ?? 'null'}`);
    console.log(`  M018 (Big Chances):       ${hm.attack.M018 ?? 'null'}`);
    console.log('Home Defense:');
    console.log(`  M026 (Goals Conceded):    ${hm.defense.M026 ?? 'null'}`);
    console.log(`  M028 (Clean Sheet %):     ${hm.defense.M028 ?? 'null'}`);
    console.log(`  M034 (Blocks):            ${hm.defense.M034 ?? 'null'}`);
    console.log('Away Attack:');
    console.log(`  M001 (Goals/Match):       ${am.attack.M001 ?? 'null'}`);
    console.log(`  M011 (Goal Conv %):       ${am.attack.M011 ?? 'null'}`);
    console.log(`  M013 (Shots/Match):       ${am.attack.M013 ?? 'null'}`);
    console.log(`  M014 (SOT/Match):         ${am.attack.M014 ?? 'null'}`);
    console.log('Away Defense:');
    console.log(`  M026 (Goals Conceded):    ${am.defense.M026 ?? 'null'}`);
    console.log(`  M028 (Clean Sheet %):     ${am.defense.M028 ?? 'null'}`);

    // ═══ LAYER 3: Dynamic Baseline ═══
    console.log('\n--- LAYER 3: Dynamic Baseline ---');
    console.log(`  leagueAvgGoals:  ${baseline.leagueAvgGoals ?? 'null'}`);
    console.log(`  shotsPerMin:     ${baseline.shotsPerMin ?? 'null'}`);
    console.log(`  onTargetRate:    ${baseline.onTargetRate ?? 'null'}`);
    console.log(`  goalConvRate:    ${baseline.goalConvRate ?? 'null'}`);
    console.log(`  gkSaveRate:      ${baseline.gkSaveRate ?? 'null'}`);
    console.log(`  blockRate:       ${baseline.blockRate ?? 'null'}`);
    console.log(`  cornerPerMin:    ${baseline.cornerPerMin ?? 'null'}`);
    console.log(`  penPerMatch:     ${baseline.penPerMatch ?? 'null'}`);
    console.log(`  possessionBase:  ${baseline.possessionBase ?? 'null'}`);

    // ═══ LAYER 4: Dynamic League Averages ═══
    console.log('\n--- LAYER 4: Dynamic League Averages ---');
    const da = metrics.dynamicLeagueAvgs || {};
    console.log(`  M001 avg:  ${da.M001 ?? 'null'}`);
    console.log(`  M011 avg:  ${da.M011 ?? 'null'}`);
    console.log(`  M013 avg:  ${da.M013 ?? 'null'}`);
    console.log(`  M014 avg:  ${da.M014 ?? 'null'}`);
    console.log(`  M026 avg:  ${da.M026 ?? 'null'}`);
    console.log(`  homeAdv:   ${metrics.dynamicHomeAdvantage ?? 'null'}`);

    // ═══ LAYER 5: Poisson Lambda (advanced-derived.js) ═══
    console.log('\n--- LAYER 5: Poisson Lambda ---');
    console.log(`  Lambda Home (M167): ${metrics.home.compositeScores.M167 ?? 'null'}`);
    console.log(`  Lambda Away (M167): ${metrics.away.compositeScores.M167 ?? 'null'}`);

    // ═══ LAYER 6: Unit Scores (SIM_BLOCKS) ═══
    console.log('\n--- LAYER 6: Key Unit Scores ---');
    // Get units from prediction
    const report = generatePrediction(metrics, data, baseline, [], Math.random);
    const homeUnits = report.behavioralAnalysis?.home || {};
    const awayUnits = report.behavioralAnalysis?.away || {};
    const unitKeys = ['BITIRICILIK', 'YARATICILIK', 'SUT_URETIMI', 'SAVUNMA_DIRENCI',
      'SAVUNMA_AKSIYONU', 'GK_REFLEKS', 'GK_ALAN_HAKIMIYETI', 'FORM_KISA', 'FORM_UZUN',
      'TOPLA_OYNAMA', 'BAGLANTI_OYUNU', 'DISIPLIN', 'MOMENTUM_AKIŞI', 'FİŞİ_ÇEKME',
      'ZİHİNSEL_DAYANIKLILIK', 'H2H_DOMINASYON', 'GOL_IHTIYACI', 'KADRO_DERINLIGI',
      'HAKEM_DINAMIKLERI', 'TAKTIKSEL_UYUM', 'TURNUVA_BASKISI', 'MAC_BASLANGICI', 'MAC_SONU'];
    for (const k of unitKeys) {
      const h = homeUnits[k] ?? '-';
      const a = awayUnits[k] ?? '-';
      const hStr = typeof h === 'number' ? h.toFixed(3) : h;
      const aStr = typeof a === 'number' ? a.toFixed(3) : a;
      console.log(`  ${k.padEnd(25)} Home: ${hStr.toString().padStart(6)}  Away: ${aStr.toString().padStart(6)}`);
    }

    // ═══ LAYER 7: Prediction Output ═══
    console.log('\n--- LAYER 7: Prediction Output ---');
    console.log(`  Poisson Score:     ${report.score?.predicted ?? 'null'}`);
    console.log(`  Home Win %:        ${report.result?.homeWin ?? 'null'}`);
    console.log(`  Draw %:            ${report.result?.draw ?? 'null'}`);
    console.log(`  Away Win %:        ${report.result?.awayWin ?? 'null'}`);
    console.log(`  Over 2.5 %:        ${report.goals?.over25 ?? 'null'}`);
    console.log(`  BTTS %:            ${report.goals?.btts ?? 'null'}`);
    console.log(`  Confidence:        ${report.result?.confidence ?? 'null'}`);

    // ═══ LAYER 8: Monte Carlo Summary ═══
    console.log('\n--- LAYER 8: Monte Carlo (1000 runs) ---');
    const sim = report.simulationInsights;
    console.log(`  MC Home Win %:     ${sim?.distribution?.homeWin ?? 'null'}`);
    console.log(`  MC Draw %:         ${sim?.distribution?.draw ?? 'null'}`);
    console.log(`  MC Away Win %:     ${sim?.distribution?.awayWin ?? 'null'}`);
    console.log(`  MC Avg Goals:      ${sim?.distribution?.avgGoals ?? 'null'}`);
    console.log(`  MC Over 2.5 %:     ${sim?.distribution?.over25 ?? 'null'}`);
    console.log(`  MC BTTS %:         ${sim?.distribution?.btts ?? 'null'}`);
    console.log(`  MC Score Freq:     ${JSON.stringify(sim?.distribution?.scoreFrequency ?? {})}`);

    // ═══ LAYER 9: getPower Decomposition ═══
    console.log('\n--- LAYER 9: getPower Decomposition ---');
    const geo2 = (a, b) => Math.sqrt(Math.max(a, 0.01) * Math.max(b, 0.01));
    const geo3 = (a, b, c) => Math.cbrt(Math.max(a, 0.01) * Math.max(b, 0.01) * Math.max(c, 0.01));

    const hAtk1 = geo3(homeUnits.BITIRICILIK || 1, homeUnits.YARATICILIK || 1, homeUnits.SUT_URETIMI || 1);
    const hAtk2 = geo2(homeUnits.FORM_KISA || 1, homeUnits.FORM_UZUN || 1);
    const hAtk3 = geo2(homeUnits.TOPLA_OYNAMA || 1, homeUnits.BAGLANTI_OYUNU || 1);
    const hAtk = hAtk1 * hAtk2 * hAtk3;

    const hDef1 = geo3(homeUnits.SAVUNMA_DIRENCI || 1, homeUnits.SAVUNMA_AKSIYONU || 1, homeUnits.GK_REFLEKS || 1);
    const hDef2 = geo2(homeUnits.DISIPLIN || 1, homeUnits.GK_ALAN_HAKIMIYETI || 1);
    const hDef = hDef1 * hDef2 / Math.max(homeUnits.TURNUVA_BASKISI || 1, 0.1);

    const aAtk1 = geo3(awayUnits.BITIRICILIK || 1, awayUnits.YARATICILIK || 1, awayUnits.SUT_URETIMI || 1);
    const aAtk2 = geo2(awayUnits.FORM_KISA || 1, awayUnits.FORM_UZUN || 1);
    const aAtk3 = geo2(awayUnits.TOPLA_OYNAMA || 1, awayUnits.BAGLANTI_OYUNU || 1);
    const aAtk = aAtk1 * aAtk2 * aAtk3;

    const aDef1 = geo3(awayUnits.SAVUNMA_DIRENCI || 1, awayUnits.SAVUNMA_AKSIYONU || 1, awayUnits.GK_REFLEKS || 1);
    const aDef2 = geo2(awayUnits.DISIPLIN || 1, awayUnits.GK_ALAN_HAKIMIYETI || 1);
    const aDef = aDef1 * aDef2 / Math.max(awayUnits.TURNUVA_BASKISI || 1, 0.1);

    console.log('Home Attack Power decomposition:');
    console.log(`  geo3(BIT,YARAT,SUT)  = ${hAtk1.toFixed(4)}`);
    console.log(`  geo2(FORM_K,FORM_U)  = ${hAtk2.toFixed(4)}`);
    console.log(`  geo2(TOP,BAG)        = ${hAtk3.toFixed(4)}`);
    console.log(`  => hAtk = ${hAtk.toFixed(4)}  (clamped: ${Math.max(0.4, Math.min(2.5, hAtk)).toFixed(4)})`);

    console.log('Home Defense Power decomposition:');
    console.log(`  geo3(SAV_D,SAV_A,GK) = ${hDef1.toFixed(4)}`);
    console.log(`  geo2(DISP,GK_A)      = ${hDef2.toFixed(4)}`);
    console.log(`  /TURNUVA             = ${(homeUnits.TURNUVA_BASKISI || 1).toFixed(4)}`);
    console.log(`  => hDef = ${hDef.toFixed(4)}  (clamped: ${Math.max(0.4, Math.min(2.5, hDef)).toFixed(4)})`);

    console.log('Away Attack Power decomposition:');
    console.log(`  geo3(BIT,YARAT,SUT)  = ${aAtk1.toFixed(4)}`);
    console.log(`  geo2(FORM_K,FORM_U)  = ${aAtk2.toFixed(4)}`);
    console.log(`  geo2(TOP,BAG)        = ${aAtk3.toFixed(4)}`);
    console.log(`  => aAtk = ${aAtk.toFixed(4)}  (clamped: ${Math.max(0.4, Math.min(2.5, aAtk)).toFixed(4)})`);

    console.log('Away Defense Power decomposition:');
    console.log(`  geo3(SAV_D,SAV_A,GK) = ${aDef1.toFixed(4)}`);
    console.log(`  geo2(DISP,GK_A)      = ${aDef2.toFixed(4)}`);
    console.log(`  /TURNUVA             = ${(awayUnits.TURNUVA_BASKISI || 1).toFixed(4)}`);
    console.log(`  => aDef = ${aDef.toFixed(4)}  (clamped: ${Math.max(0.4, Math.min(2.5, aDef)).toFixed(4)})`);

    // Final lambda check
    const leagueAvgGoals = baseline.leagueAvgGoals ?? da.M001 ?? null;
    const homeAdv = metrics.dynamicHomeAdvantage ?? null;
    const clH = Math.max(0.4, Math.min(2.5, hAtk));
    const clAD = Math.max(0.4, Math.min(2.5, aDef));
    const clAA = Math.max(0.4, Math.min(2.5, aAtk));
    const clHD = Math.max(0.4, Math.min(2.5, hDef));

    const recalcLH = leagueAvgGoals != null && homeAdv != null
      ? (clH / clAD) * leagueAvgGoals * homeAdv : null;
    const recalcLA = leagueAvgGoals != null && homeAdv != null
      ? (clAA / clHD) * leagueAvgGoals * (1 / homeAdv) : null;

    console.log('\n--- Lambda Recalculation ---');
    console.log(`  leagueAvgGoals = ${leagueAvgGoals}`);
    console.log(`  homeAdv        = ${homeAdv}`);
    console.log(`  Recalculated lambda_home = (${clH.toFixed(3)} / ${clAD.toFixed(3)}) × ${leagueAvgGoals} × ${homeAdv} = ${recalcLH?.toFixed(3) ?? 'null'}`);
    console.log(`  Recalculated lambda_away = (${clAA.toFixed(3)} / ${clHD.toFixed(3)}) × ${leagueAvgGoals} × ${(1 / (homeAdv || 1)).toFixed(3)} = ${recalcLA?.toFixed(3) ?? 'null'}`);

    // ═══ IDEAL Lambda (Direct from API) ═══
    console.log('\n--- IDEAL Lambda (Direct Dixon-Coles) ---');
    const hGoals = hm.attack.M001;
    const aGoals = am.attack.M001;
    const hConc = hm.defense.M026;
    const aConc = am.defense.M026;
    if (hGoals != null && aConc != null && leagueAvgGoals != null && leagueAvgGoals > 0) {
      const idealLH = (hGoals * aConc) / leagueAvgGoals;
      const idealLA = (aGoals * hConc) / leagueAvgGoals;
      console.log(`  Ideal lambda_home = (${hGoals} × ${aConc}) / ${leagueAvgGoals} = ${idealLH.toFixed(3)}`);
      console.log(`  Ideal lambda_away = (${aGoals} × ${hConc}) / ${leagueAvgGoals} = ${idealLA.toFixed(3)}`);
      console.log(`  -> Expected Score: ~${Math.round(idealLH)}-${Math.round(idealLA)}`);
    } else {
      console.log(`  Cannot calculate — missing data (hGoals=${hGoals}, aGoals=${aGoals}, hConc=${hConc}, aConc=${aConc})`);
    }

    console.log(`\n${'='.repeat(70)}\n`);

  } catch (err) {
    console.error(`FATAL: ${err.message}`);
    console.error(err.stack);
  } finally {
    await api.closeBrowser();
  }
}

// Crystal Palace vs Newcastle — actual 2-1
const eventId = process.argv[2] || 14023999;
diagnose(eventId);
