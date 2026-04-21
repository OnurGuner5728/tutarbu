'use strict';
const { fetchAllMatchData } = require('../src/services/data-fetcher');
const { calculateAllMetrics } = require('../src/engine/metric-calculator');
const { getDynamicBaseline } = require('../src/engine/dynamic-baseline');
const { generatePrediction } = require('../src/engine/prediction-generator');
const { computePositionMVBreakdown, computeAlpha, computeQualityFactors, BLOCK_QF_MAP } = require('../src/engine/quality-factors');
const { computeProbBases, calculateUnitImpact, SIM_BLOCKS } = require('../src/engine/match-simulator');

const eventId = parseInt(process.argv[2] || '15632089');

(async () => {
  console.log('STEP 1: API VERİSİ (event ' + eventId + ')');
  const md = await fetchAllMatchData(eventId);
  console.log('  ' + md.event?.event?.homeTeam?.name + ' vs ' + md.event?.event?.awayTeam?.name);
  console.log('  tournament:', md.tournamentId);
  console.log('  lineups: home=' + (md.lineups?.home?.players?.length || 0) + ' away=' + (md.lineups?.away?.players?.length || 0));
  console.log('  squad: home=' + (md.homePlayers?.players?.length || 0) + ' away=' + (md.awayPlayers?.players?.length || 0));
  console.log('  standings rows:', md.standingsTotal?.standings?.[0]?.rows?.length || 0);
  console.log('  recentMatchDetails: home=' + (md.homeRecentMatchDetails?.length || 0) + ' away=' + (md.awayRecentMatchDetails?.length || 0));
  console.log('  refereeLastEvents:', (md.refereeLastEvents?.events?.length || 0));

  console.log('\nSTEP 2: 168+ METRİK HESAPLAMA');
  const metrics = calculateAllMetrics(md);
  const ha = metrics.home.attack, hd = metrics.home.defense, hf = metrics.home.form;
  const hg = metrics.home.goalkeeper, hp = metrics.home.player, hm = metrics.home.momentum;
  const aa = metrics.away.attack, ad = metrics.away.defense, af = metrics.away.form;
  const ag = metrics.away.goalkeeper, ap = metrics.away.player, am = metrics.away.momentum;
  const ref = metrics.shared.referee, ctx = metrics.shared.contextual;

  console.log('  --- HOME ATTACK ---');
  console.log('    M001(gol/mac)=' + ha.M001 + ' M002(xG)=' + ha.M002 + ' M013(sut/mac)=' + ha.M013 + ' M014(SOT)=' + ha.M014);
  console.log('    M011(golConv)=' + ha.M011 + ' M012(SOTconv)=' + ha.M012 + ' M015(asist)=' + ha.M015);
  console.log('  --- HOME DEFENSE ---');
  console.log('    M026(yenilenGol)=' + hd.M026 + ' M028(cleanSheet)=' + hd.M028 + ' M034(blok)=' + hd.M034);
  console.log('  --- HOME FORM ---');
  console.log('    M046(kisa)=' + hf.M046 + ' M047(uzun)=' + hf.M047);
  console.log('  --- HOME GK ---');
  console.log('    M096(saveRate)=' + hg.M096 + ' M098(xGSave)=' + hg.M098);
  console.log('  --- HOME PLAYER ---');
  console.log('    M066(rating)=' + hp.M066 + ' M096b(yorgunluk)=' + hp.M096b);
  console.log('  --- AWAY ATTACK ---');
  console.log('    M001=' + aa.M001 + ' M013=' + aa.M013 + ' M014=' + aa.M014 + ' M012=' + aa.M012);
  console.log('  --- AWAY DEFENSE ---');
  console.log('    M026=' + ad.M026 + ' M028=' + ad.M028 + ' M034=' + ad.M034);
  console.log('  --- REFEREE ---');
  console.log('    M109(sari/mac)=' + ref.M109 + ' M117(severity)=' + ref.M117 + ' M120(kariyer)=' + ref.M120 + ' M122(blend)=' + ref.M122);
  console.log('  --- CONTEXTUAL ---');
  console.log('    M068(taktik)=' + ctx.M068 + ' M131(oddsHome)=' + ctx.M131 + ' M177h(press)=' + ctx.M177_home + ' M177a=' + ctx.M177_away);
  console.log('  --- META ---');
  console.log('    leagueGoalVolatility:', metrics.meta?.leagueGoalVolatility?.toFixed(4));
  console.log('    leaguePointDensity:', metrics.meta?.leaguePointDensity?.toFixed(4));
  console.log('    dynamicAvgs count:', Object.keys(metrics.dynamicLeagueAvgs || {}).length);

  console.log('\nSTEP 3: DİNAMİK BASELINE');
  const baseline = getDynamicBaseline(md);
  const bKeys = ['leagueAvgGoals','shotsPerMin','onTargetRate','goalConvRate','gkSaveRate','blockRate','cornerPerMin','yellowPerMin','redPerMin','penConvRate','penPerMatch','possessionBase'];
  for (const k of bKeys) {
    console.log('  ' + k + ': ' + (baseline[k] != null ? (typeof baseline[k] === 'number' ? baseline[k].toFixed(5) : baseline[k]) : 'null'));
  }
  baseline.leagueGoalVolatility = metrics.meta?.leagueGoalVolatility ?? null;
  baseline.leaguePointDensity = metrics.meta?.leaguePointDensity ?? null;
  baseline.medianGoalRate     = metrics.meta?.medianGoalRate     ?? null;
  baseline.leagueTeamCount    = metrics.meta?.leagueTeamCount    ?? null;
  baseline.ptsCV              = metrics.meta?.ptsCV              ?? null;
  baseline.normMinRatio       = metrics.meta?.normMinRatio       ?? null;
  baseline.normMaxRatio       = metrics.meta?.normMaxRatio       ?? null;

  console.log('\nSTEP 4: MEVKİ BAZLI PVKD');
  baseline.homeMVBreakdown = computePositionMVBreakdown(md.homePlayers);
  baseline.awayMVBreakdown = computePositionMVBreakdown(md.awayPlayers);
  const hBD = baseline.homeMVBreakdown, aBD = baseline.awayMVBreakdown;
  const fmt = v => (v / 1e6).toFixed(1) + 'M';
  console.log('  Home: GK=' + fmt(hBD.GK) + ' DEF=' + fmt(hBD.DEF) + ' MID=' + fmt(hBD.MID) + ' ATK=' + fmt(hBD.ATK) + ' Total=' + fmt(hBD.total));
  console.log('  Away: GK=' + fmt(aBD.GK) + ' DEF=' + fmt(aBD.DEF) + ' MID=' + fmt(aBD.MID) + ' ATK=' + fmt(aBD.ATK) + ' Total=' + fmt(aBD.total));
  const alph = computeAlpha(baseline.leagueGoalVolatility, baseline.leagueAvgGoals);
  const qf = computeQualityFactors(hBD, aBD, alph);
  console.log('  alpha: ' + (alph != null ? alph.toFixed(4) : 'null'));
  for (const k of ['GK','DEF','MID','ATK','ATK_MID','DEF_GK','ALL']) {
    console.log('  QF ' + k + ': home=' + qf.home[k]?.toFixed(4) + ' away=' + qf.away[k]?.toFixed(4));
  }

  console.log('\nSTEP 5: 27 BİRİM (unit impact hesabı)');
  const homeFlat = Object.assign({}, ha, hd, hf, hp, hg, hm, { M177: ctx.M177_home, M178: ctx.M178_home, M179: ctx.M179_home, M096b: hp.M096b });
  const awayFlat = Object.assign({}, aa, ad, af, ap, ag, am, { M177: ctx.M177_away, M178: ctx.M178_away, M179: ctx.M179_away, M096b: ap.M096b });
  const allIds = new Set([...Object.keys(homeFlat), ...Object.keys(awayFlat)].filter(k => /^M\d{3}[a-z]?$/i.test(k)));
  const dynAvgs = metrics.dynamicLeagueAvgs || {};
  const hU = {}, aU = {};
  for (const blk in SIM_BLOCKS) {
    hU[blk] = calculateUnitImpact(blk, homeFlat, allIds, null, dynAvgs, baseline);
    aU[blk] = calculateUnitImpact(blk, awayFlat, allIds, null, dynAvgs, baseline);
  }
  for (const blk of Object.keys(SIM_BLOCKS)) {
    const qfType = BLOCK_QF_MAP[blk];
    console.log('  ' + blk.padEnd(28) + ' h=' + hU[blk]?.toFixed(4) + ' a=' + aU[blk]?.toFixed(4) + ' QF=' + (qfType || 'null'));
  }

  console.log('\nSTEP 6: PROBBASES (metrik-türetilmiş simülasyon olasılıkları)');
  const hPB = computeProbBases(homeFlat, allIds, hU, baseline, [], qf.home);
  const aPB = computeProbBases(awayFlat, allIds, aU, baseline, [], qf.away);
  const pbFields = ['shotsPerMin','onTargetRate','goalConvRate','blockRate','gkSaveRate','possessionBase','cornerPerMin','yellowPerMin','penPerMatch'];
  for (const k of pbFields) {
    console.log('  ' + k.padEnd(18) + ' home=' + (hPB[k] != null ? hPB[k].toFixed(5) : 'null') + '  away=' + (aPB[k] != null ? aPB[k].toFixed(5) : 'null'));
  }
  console.log('  Home exp.goals (raw MC): ' + (hPB.shotsPerMin * 90 * hPB.onTargetRate * hPB.goalConvRate).toFixed(3));
  console.log('  Away exp.goals (raw MC): ' + (aPB.shotsPerMin * 90 * aPB.onTargetRate * aPB.goalConvRate).toFixed(3));

  console.log('\nSTEP 7: POISSON LAMBDA (Dixon-Coles)');
  console.log('  lambda_home:', metrics.prediction?.lambdaHome);
  console.log('  lambda_away:', metrics.prediction?.lambdaAway);
  console.log('  Poisson score:', metrics.prediction?.mostLikelyScore);
  console.log('  Poisson top5:', metrics.prediction?.top5Scores?.map(s => s.score + ':' + s.probability + '%').join(', '));

  console.log('\nSTEP 8: TAHMİN (Poisson × MC blend + Platt + Competition)');
  let report;
  try {
    report = generatePrediction(metrics, md, baseline, [], Math.random);
  } catch (err) {
    console.error('  ERROR:', err.message);
    console.error('  STACK:', err.stack?.split('\n').slice(0, 5).join('\n'));
    process.exit(1);
  }
  console.log('  1X2: Home=' + report.result?.homeWin + '% Draw=' + report.result?.draw + '% Away=' + report.result?.awayWin + '%');
  console.log('  Calibrated:', report.result?.calibrated);
  console.log('  Source:', report.result?.source);
  console.log('  Confidence:', report.result?.confidence + '%');
  console.log('  Score: ' + report.score?.predicted + ' (' + report.score?.probability + '%)');
  console.log('  Top5: ' + (report.score?.top5 || []).map(s => s.score + ':' + s.probability + '%').join(', '));
  console.log('  MC top5: ' + (report.score?.top5Simulation || []).map(s => s.score + ':' + s.probability + '%').join(', '));
  console.log('  MC avg: ' + report.score?.mcAvgHome?.toFixed(2) + ' - ' + report.score?.mcAvgAway?.toFixed(2));
  console.log('  OU2.5: ' + report.goals?.over25 + '%  BTTS: ' + report.goals?.btts + '%');
  console.log('');

  const actual = md.event?.event;
  const hScore = actual?.homeScore?.current;
  const aScore = actual?.awayScore?.current;
  console.log('  GERCEK SONUC: ' + (hScore != null ? hScore + '-' + aScore : 'bilinmiyor'));

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
