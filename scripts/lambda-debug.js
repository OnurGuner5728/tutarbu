/**
 * Lambda Chain Deep Debugger
 * advanced-derived.js'deki her katmanı loglar.
 */
const { fetchAllMatchData } = require('../src/services/data-fetcher');
const { calculateAllMetrics } = require('../src/engine/metric-calculator');
const { poissonPMF, clamp, round2 } = require('../src/engine/math-utils');

const TEST_EVENTS = [
  { id: 14065221, name: 'Leverkusen vs Augsburg' },
  { id: 14025031, name: 'Brentford vs Fulham' },
  { id: 13980101, name: 'Napoli vs Lazio' },
];

(async () => {
  for (const ev of TEST_EVENTS) {
    try {
      const data = await fetchAllMatchData(ev.id);
      const metrics = calculateAllMetrics(data);
      
      // Extract raw components
      const ha = metrics.home.attack;
      const hd = metrics.home.defense;
      const aa = metrics.away.attack;
      const ad = metrics.away.defense;
      
      const leagueAvgGoals = (() => {
        const rows = data.standingsTotal?.standings?.[0]?.rows || [];
        if (rows.length < 4) return null;
        const totalGoals = rows.reduce((s, r) => s + (r.scoresFor || r.goalsFor || 0), 0);
        const totalGames = rows.reduce((s, r) => s + (r.matches ?? r.played ?? 0), 0);
        return totalGames > 0 ? totalGoals / totalGames : null;
      })();
      
      // xG data  
      const homeStGF = (() => {
        const rows = data.standingsHome?.standings?.[0]?.rows || [];
        const r = rows.find(r => r.team?.id === data.homeTeamId);
        return r && r.matches > 0 ? r.scoresFor / r.matches : null;
      })();
      const awayStGA = (() => {
        const rows = data.standingsAway?.standings?.[0]?.rows || [];
        const r = rows.find(r => r.team?.id === data.awayTeamId);
        return r && r.matches > 0 ? r.scoresAgainst / r.matches : null;
      })();
      const awayStGF = (() => {
        const rows = data.standingsAway?.standings?.[0]?.rows || [];
        const r = rows.find(r => r.team?.id === data.awayTeamId);
        return r && r.matches > 0 ? r.scoresFor / r.matches : null;
      })();
      const homeStGA = (() => {
        const rows = data.standingsHome?.standings?.[0]?.rows || [];
        const r = rows.find(r => r.team?.id === data.homeTeamId);
        return r && r.matches > 0 ? r.scoresAgainst / r.matches : null;
      })();
      
      console.log(`\n========== ${ev.name} ==========`);
      console.log('leagueAvgGoals:', leagueAvgGoals?.toFixed(3));
      console.log('dynamicHomeAdv:', metrics.dynamicHomeAdvantage?.toFixed(4));
      console.log('');
      console.log('--- RAW DATA ---');
      console.log('Home Attack M001 (goals/match avg):', ha.M001?.toFixed(3));
      console.log('Home Attack M002 (goals home only):', ha.M002?.toFixed(3));
      console.log('Away Defense M026 (goals conceded avg):', ad.M026?.toFixed(3));
      console.log('Away Defense M027 (goals conceded away):', ad.M027?.toFixed(3));
      console.log('Away Attack M001:', aa.M001?.toFixed(3));
      console.log('Away Attack M002:', aa.M002?.toFixed(3));
      console.log('Home Defense M026:', hd.M026?.toFixed(3));
      console.log('Home Defense M027:', hd.M027?.toFixed(3));
      console.log('');
      console.log('--- STANDINGS SPECIFIC ---');
      console.log('Home team GF at home (homeStGF):', homeStGF?.toFixed(3));
      console.log('Home team GA at home (homeStGA):', homeStGA?.toFixed(3));
      console.log('Away team GF away (awayStGF):', awayStGF?.toFixed(3));
      console.log('Away team GA away (awayStGA):', awayStGA?.toFixed(3));
      console.log('');
      
      // Dixon-Coles manual recalc
      if (leagueAvgGoals) {
        const homeAtkRate = homeStGF || ha.M001;
        const awayDefRate = awayStGA || ad.M026;
        const awayAtkRate = awayStGF || aa.M001;
        const homeDefRate = homeStGA || hd.M026;
        
        const dcH = (homeAtkRate / leagueAvgGoals) * (awayDefRate / leagueAvgGoals) * leagueAvgGoals;
        const dcA = (awayAtkRate / leagueAvgGoals) * (homeDefRate / leagueAvgGoals) * leagueAvgGoals;
        
        const hAdv = metrics.dynamicHomeAdvantage || 1.0;
        const lH = dcH * hAdv;
        const lA = dcA * (1 / hAdv);
        
        console.log('--- SIMPLE DIXON-COLES (without QF/behav) ---');
        console.log('dcBase_home:', dcH.toFixed(3), '→ with homeAdv:', lH.toFixed(3));
        console.log('dcBase_away:', dcA.toFixed(3), '→ with 1/homeAdv:', lA.toFixed(3));
        console.log('Home/Away ratio:', (lH/lA).toFixed(2));
        
        // What about just sqrt for homeAdv?
        const lH2 = dcH * Math.sqrt(hAdv);
        const lA2 = dcA / Math.sqrt(hAdv);
        console.log('');
        console.log('--- IF sqrt(homeAdv) instead ---');
        console.log('lambda_home:', lH2.toFixed(3), '| lambda_away:', lA2.toFixed(3), '| ratio:', (lH2/lA2).toFixed(2));
      }
      
      console.log('');
      console.log('--- ACTUAL MODEL OUTPUT ---');
      console.log('lambdaHome:', metrics.prediction?.lambdaHome, '| lambdaAway:', metrics.prediction?.lambdaAway);
      console.log('homeWin%:', metrics.prediction?.homeWinProbability?.toFixed(1));
      console.log('drawProb%:', metrics.prediction?.drawProbability?.toFixed(1));
      console.log('awayWin%:', metrics.prediction?.awayWinProbability?.toFixed(1));
      
    } catch (e) {
      console.log(`${ev.name}: ERROR - ${e.message}`);
    }
  }
  process.exit(0);
})();
