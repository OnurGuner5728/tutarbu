const { fetchAllMatchData } = require('./src/services/data-fetcher');
const { closeBrowser } = require('./src/services/playwright-client');
const { extractTeamStats } = require('./src/metrics/team-attack');
const fs = require('fs');

async function runTrace(eventId) {
    try {
        console.log(`Starting trace for match ${eventId}...`);
        const data = await fetchAllMatchData(eventId);
        
        let reportText = `AUDIT REPORT FOR MATCH ${eventId}\n`;
        reportText += `Match: ${data.event.event.homeTeam.name} vs ${data.event.event.awayTeam.name}\n`;
        reportText += `--------------------------------------------------\n`;
        
        const sides = ['home', 'away'];

        for (const side of sides) {
            reportText += `\n### SIDE: ${side.toUpperCase()}\n`;
            const isHome = side === 'home';
            const teamId = isHome ? data.homeTeamId : data.awayTeamId;
            const teamName = isHome ? data.event.event.homeTeam.name : data.event.event.awayTeam.name;
            const lastEvents = isHome ? data.homeLastEvents : data.awayLastEvents;
            const recentDetails = (isHome ? data.homeRecentMatchDetails : data.awayRecentMatchDetails) || [];

            const finishedEvents = (lastEvents || []).filter(e => e.status?.type === 'finished');
            const last20 = finishedEvents.slice(0, 20);
            
            reportText += `Team: ${teamName} (${teamId})\n`;
            reportText += `Total finished matches in lastEvents: ${finishedEvents.length}\n`;
            reportText += `Matches used for last20: ${last20.length}\n`;

            // M001 & M002 Trace
            reportText += `\n[M001 & M002 Trace]\n`;
            let m001Sum = 0;
            let m001Count = 0;
            let m002Sum = 0;
            let m002Count = 0;

            last20.forEach((ev, idx) => {
                const isEvHome = ev.homeTeam?.id === teamId;
                const score = isEvHome
                    ? (ev.homeScore?.current ?? ev.homeScore?.display ?? null)
                    : (ev.awayScore?.current ?? ev.awayScore?.display ?? null);
                
                const location = isEvHome ? 'Home' : 'Away';
                const oppName = isEvHome ? ev.awayTeam.name : ev.homeTeam.name;
                
                if (score !== null) {
                    m001Sum += score;
                    m001Count++;
                    
                    if (isEvHome === isHome) {
                        m002Sum += score;
                        m002Count++;
                        reportText += `  Match ${idx+1}: vs ${oppName} (${location}) -> Score: ${score} (M001+M002)\n`;
                    } else {
                        reportText += `  Match ${idx+1}: vs ${oppName} (${location}) -> Score: ${score} (M001 only)\n`;
                    }
                } else {
                    reportText += `  Match ${idx+1}: vs ${oppName} (${location}) -> Score: NULL\n`;
                }
            });

            const M001 = m001Count > 0 ? (m001Sum / m001Count).toFixed(2) : 'NULL';
            const M002 = m002Count > 0 ? (m002Sum / m002Count).toFixed(2) : 'NULL';
            reportText += `RESULT M001: ${M001} (${m001Sum}/${m001Count})\n`;
            reportText += `RESULT M002: ${M002} (${m002Sum}/${m002Count})\n`;

            // M003-M010 Trace
            reportText += `\n[M003-M010 Trace]\n`;
            const goalsByPeriod = { '0-15': 0, '16-30': 0, '31-45': 0, '46-60': 0, '61-75': 0, '76-90': 0 };
            let totalGoalsFromIncidents = 0;
            let firstHalfGoals = 0, secondHalfGoals = 0;

            reportText += `Recent details matches analyzed: ${recentDetails.length}\n`;
            recentDetails.forEach((match, mIdx) => {
                const incidents = match.incidents?.incidents || [];
                const isMatchHome = match.homeTeam?.id === teamId;
                const oppName = isMatchHome ? match.awayTeam?.name : match.homeTeam?.name;
                reportText += `  Deep-dive Match ${mIdx+1}: vs ${oppName}\n`;
                
                incidents.forEach(inc => {
                    if (inc.incidentType === 'goal' && inc.isHome === isMatchHome) {
                        totalGoalsFromIncidents++;
                        const minute = inc.time;
                        reportText += `    Goal at ${minute}'\n`;
                        if (minute <= 45) firstHalfGoals++;
                        else secondHalfGoals++;

                        if (minute <= 15) goalsByPeriod['0-15']++;
                        else if (minute <= 30) goalsByPeriod['16-30']++;
                        else if (minute <= 45) goalsByPeriod['31-45']++;
                        else if (minute <= 60) goalsByPeriod['46-60']++;
                        else if (minute <= 75) goalsByPeriod['61-75']++;
                        else goalsByPeriod['76-90']++;
                    }
                });
            });

            const recentCount = recentDetails.length;
            const M003 = recentCount > 0 ? (firstHalfGoals / recentCount).toFixed(2) : 'NULL';
            const M004 = recentCount > 0 ? (secondHalfGoals / recentCount).toFixed(2) : 'NULL';
            const M005 = totalGoalsFromIncidents > 0 ? ((goalsByPeriod['0-15'] / totalGoalsFromIncidents) * 100).toFixed(1) + '%' : 'NULL';
            const M006 = totalGoalsFromIncidents > 0 ? ((goalsByPeriod['16-30'] / totalGoalsFromIncidents) * 100).toFixed(1) + '%' : 'NULL';
            const M007 = totalGoalsFromIncidents > 0 ? ((goalsByPeriod['31-45'] / totalGoalsFromIncidents) * 100).toFixed(1) + '%' : 'NULL';
            const M008 = totalGoalsFromIncidents > 0 ? ((goalsByPeriod['46-60'] / totalGoalsFromIncidents) * 100).toFixed(1) + '%' : 'NULL';
            const M009 = totalGoalsFromIncidents > 0 ? ((goalsByPeriod['61-75'] / totalGoalsFromIncidents) * 100).toFixed(1) + '%' : 'NULL';
            const M010 = totalGoalsFromIncidents > 0 ? ((goalsByPeriod['76-90'] / totalGoalsFromIncidents) * 100).toFixed(1) + '%' : 'NULL';

            reportText += `RESULT M003: ${M003}\n`;
            reportText += `RESULT M004: ${M004}\n`;
            reportText += `RESULT M005: ${M005}\n`;
            reportText += `RESULT M006: ${M006}\n`;
            reportText += `RESULT M007: ${M007}\n`;
            reportText += `RESULT M008: ${M008}\n`;
            reportText += `RESULT M009: ${M009}\n`;
            reportText += `RESULT M010: ${M010}\n`;

            // M011-M014 Trace (Shots)
            reportText += `\n[M011-M014 Trace - Shots]\n`;
            let totalShots = 0, shotsMatches = 0;
            let totalOnTarget = 0, onTargetMatches = 0;

            recentDetails.forEach((match, mIdx) => {
                const stats = extractTeamStats(match.stats, isHome);
                let matchShots = stats ? stats.totalShots : null;
                let matchOnTarget = stats ? stats.shotsOnTarget : null;
                
                if (matchShots !== null) { totalShots += parseInt(matchShots); shotsMatches++; }
                if (matchOnTarget !== null) { totalOnTarget += parseInt(matchOnTarget); onTargetMatches++; }
                reportText += `  Match ${mIdx+1}: Shots: ${matchShots}, OnTarget: ${matchOnTarget}\n`;
            });

            const M011 = totalShots > 0 ? ((totalGoalsFromIncidents / totalShots) * 100).toFixed(1) + '%' : 'NULL';
            const M012 = totalOnTarget > 0 ? ((totalGoalsFromIncidents / totalOnTarget) * 100).toFixed(1) + '%' : 'NULL';
            const M013 = shotsMatches > 0 ? (totalShots / shotsMatches).toFixed(2) : 'NULL';
            const M014 = onTargetMatches > 0 ? (totalOnTarget / onTargetMatches).toFixed(2) : 'NULL';
            
            reportText += `RESULT M011: ${M011} (Goals: ${totalGoalsFromIncidents} / Shots: ${totalShots})\n`;
            reportText += `RESULT M012: ${M012} (Goals: ${totalGoalsFromIncidents} / OnTarget: ${totalOnTarget})\n`;
            reportText += `RESULT M013: ${M013}\n`;
            reportText += `RESULT M014: ${M014}\n`;

            // M015-M016 Trace (xG)
            reportText += `\n[M015-M016 Trace - xG]\n`;
            let totalXG = 0, xGMatches = 0;
            recentDetails.forEach((match, mIdx) => {
                const shotmap = match.shotmap?.shotmap || [];
                const isMatchHome = match.homeTeam?.id === teamId;
                let matchXG = 0;
                shotmap.forEach(shot => {
                    if (shot.isHome === isMatchHome && shot.xg) matchXG += shot.xg;
                });
                if (shotmap.length > 0) { totalXG += matchXG; xGMatches++; }
                reportText += `  Match ${mIdx+1}: xG: ${matchXG.toFixed(2)}\n`;
            });
            const M015 = xGMatches > 0 ? (totalXG / xGMatches).toFixed(2) : 'NULL';
            const M016 = totalXG > 0 ? (totalGoalsFromIncidents / totalXG).toFixed(2) : 'NULL';
            reportText += `RESULT M015: ${M015}\n`;
            reportText += `RESULT M016: ${M016} (Goals: ${totalGoalsFromIncidents} / totalXG: ${totalXG.toFixed(2)})\n`;

            // M017-M018 Trace (Big Chances)
            reportText += `\n[M017-M018 Trace - Big Chances]\n`;
            let totalBigChances = 0, bigChancesScored = 0, bigChancesMatches = 0;
            recentDetails.forEach((match, mIdx) => {
                const stats = extractTeamStats(match.stats, isHome);
                let matchBC = stats ? stats.bigChances : null;
                let matchBCS = stats ? stats.bigChancesScored : null;

                if (matchBC !== null) { 
                    totalBigChances += parseInt(matchBC); 
                    if (matchBCS !== null) bigChancesScored += parseInt(matchBCS);
                    bigChancesMatches++; 
                }
                reportText += `  Match ${mIdx+1}: BigChances: ${matchBC}, Scored: ${matchBCS}\n`;
            });
            const M017 = bigChancesMatches > 0 ? (totalBigChances / bigChancesMatches).toFixed(2) : 'NULL';
            const M018 = totalBigChances > 0 ? ((bigChancesScored / totalBigChances) * 100).toFixed(1) + '%' : 'NULL';
            reportText += `RESULT M017: ${M017}\n`;
            reportText += `RESULT M018: ${M018} (${bigChancesScored}/${totalBigChances})\n`;

            // M019-M020 Trace (Penalties)
            reportText += `\n[M019-M020 Trace - Penalties]\n`;
            let pWon = 0, pScored = 0, pTaken = 0;
            recentDetails.forEach((match, mIdx) => {
                const incidents = match.incidents?.incidents || [];
                const isMatchHome = match.homeTeam?.id === teamId;
                incidents.forEach(inc => {
                    if (inc.isHome === isMatchHome) {
                        if (inc.incidentType === 'goal' && inc.incidentClass === 'penalty') { pWon++; pScored++; pTaken++; }
                        if (inc.incidentType === 'goal' && inc.incidentClass === 'penaltyMissed') { pWon++; pTaken++; }
                    }
                });
            });
            const M019 = recentCount > 0 ? (pWon / recentCount).toFixed(2) : 'NULL';
            const M020 = pTaken > 0 ? ((pScored / pTaken) * 100).toFixed(1) + '%' : 'NULL';
            reportText += `RESULT M019: ${M019} (Won: ${pWon} / ${recentCount} matches)\n`;
            reportText += `RESULT M020: ${M020} (${pScored}/${pTaken})\n`;

            // M021-M025 Trace (Remaining Attack)
            reportText += `\n[M021-M025 Trace - Attack Extra]\n`;
            let totalPressure = 0, pressurePoints = 0;
            let totalCorners = 0, cornerGoals = 0, cornerMatches = 0;
            let freeKickGoals = 0, totalSetPiece = 0;
            let totalPassFT = 0, totalAccFT = 0, passFTMatches = 0;

            recentDetails.forEach((match, mIdx) => {
                // M021: Pressure
                const gpts = match.graph?.graphPoints || [];
                gpts.forEach(p => {
                    const val = isHome ? p.value : -p.value;
                    if (val > 0) { totalPressure += val; pressurePoints++; }
                });

                // M022, M025: Stats
                const stats = extractTeamStats(match.stats, isHome);
                if (stats) {
                    if (stats.cornerKicks !== undefined) { totalCorners += stats.cornerKicks; cornerMatches++; }
                    if (stats.finalThirdPassesAccurate !== undefined && stats.finalThirdPassesTotal !== undefined) {
                        totalAccFT += stats.finalThirdPassesAccurate;
                        totalPassFT += stats.finalThirdPassesTotal;
                        passFTMatches++;
                    }
                }

                // M023, M024: Shotmap
                const shotmap = match.shotmap?.shotmap || [];
                const isMatchHome = match.homeTeam?.id === teamId;
                shotmap.forEach(shot => {
                    if (shot.isHome === isMatchHome) {
                        if (shot.situation === 'corner') {
                            if (shot.isGoal) cornerGoals++;
                        }
                        if (shot.situation === 'set-piece') {
                            totalSetPiece++; // Approximate attempt count
                            if (shot.isGoal) freeKickGoals++;
                        }
                    }
                });
            });

            const M021 = pressurePoints > 0 ? (totalPressure / pressurePoints).toFixed(1) : 'NULL';
            const M022 = cornerMatches > 0 ? (totalCorners / cornerMatches).toFixed(2) : 'NULL';
            const M023 = totalCorners > 0 ? ((cornerGoals / totalCorners) * 100).toFixed(1) + '%' : 'NULL';
            const M024 = freeKickGoals > 0 ? (freeKickGoals) : 0; // Formula says % but usually count if attempts unknown
            const M025 = totalPassFT > 0 ? ((totalAccFT / totalPassFT) * 100).toFixed(1) + '%' : 'NULL';

            reportText += `RESULT M021: ${M021} (Avg Positive Pressure)\n`;
            reportText += `RESULT M022: ${M022} (Total: ${totalCorners})\n`;
            reportText += `RESULT M023: ${M023} (${cornerGoals} goals from ${totalCorners} corners)\n`;
            reportText += `RESULT M024: ${M024} goals\n`;
            reportText += `RESULT M025: ${M025} (${totalAccFT}/${totalPassFT})\n`;

            // M026-M030 Trace (Defense)
            reportText += `\n[M026-M030 Trace - Defense Basics]\n`;
            let cSum = 0, cCount = 0, locCSum = 0, locCCount = 0, cleanSheets = 0;
            let fhConceded = 0, shConceded = 0;

            last20.forEach((ev, idx) => {
                const isEvHome = ev.homeTeam?.id === teamId;
                const conceded = isEvHome ? (ev.awayScore?.current ?? 0) : (ev.homeScore?.current ?? 0);
                cSum += conceded;
                cCount++;
                if (conceded === 0) cleanSheets++;
                if (isEvHome === isHome) { locCSum += conceded; locCCount++; }
            });

            recentDetails.forEach(match => {
                const isMatchHome = match.homeTeam?.id === teamId;
                const incidents = match.incidents?.incidents || [];
                incidents.forEach(inc => {
                    if (inc.incidentType === 'goal' && inc.isHome !== isMatchHome) {
                        if (inc.time <= 45) fhConceded++;
                        else shConceded++;
                    }
                });
            });

            const M026 = cCount > 0 ? (cSum / cCount).toFixed(2) : 'NULL';
            const M027 = locCCount > 0 ? (locCSum / locCCount).toFixed(2) : 'NULL';
            const M028 = cCount > 0 ? ((cleanSheets / cCount) * 100).toFixed(1) + '%' : 'NULL';
            const M029 = recentCount > 0 ? (fhConceded / recentCount).toFixed(2) : 'NULL';
            const M030 = recentCount > 0 ? (shConceded / recentCount).toFixed(2) : 'NULL';

            reportText += `RESULT M026: ${M026} (${cSum}/${cCount})\n`;
            reportText += `RESULT M027: ${M027} (${locCSum}/${locCCount})\n`;
            reportText += `RESULT M028: ${M028} (${cleanSheets} clean sheets)\n`;
            reportText += `RESULT M029: ${M029} (1st Half Conceded)\n`;
            reportText += `RESULT M030: ${M030} (2nd Half Conceded)\n`;

            // M031-M033 Trace (Defense Time & xG)
            reportText += `\n[M031-M033 Trace - Defense Time & xG]\n`;
            let c015 = 0, c7690 = 0, totalConc = 0, oppXG = 0, xgM = 0;
            recentDetails.forEach(match => {
                const isMatchHome = match.homeTeam?.id === teamId;
                const incidents = match.incidents?.incidents || [];
                incidents.forEach(inc => {
                    if (inc.incidentType === 'goal' && inc.isHome !== isMatchHome) {
                        totalConc++;
                        if (inc.time <= 15) c015++;
                        if (inc.time >= 76 && inc.time <= 90) c7690++;
                    }
                });
                const shotmap = match.shotmap?.shotmap || [];
                let mOppXG = 0;
                shotmap.forEach(shot => {
                    if (shot.isHome !== isMatchHome && shot.xg) mOppXG += shot.xg;
                });
                if (shotmap.length > 0) { oppXG += mOppXG; xgM++; }
            });
            const M031 = totalConc > 0 ? ((c015 / totalConc) * 100).toFixed(1) + '%' : 'NULL';
            const M032 = totalConc > 0 ? ((c7690 / totalConc) * 100).toFixed(1) + '%' : 'NULL';
            const M033 = xgM > 0 ? (oppXG / xgM).toFixed(2) : 'NULL';
            reportText += `RESULT M031: ${M031}\n`;
            reportText += `RESULT M032: ${M032}\n`;
            reportText += `RESULT M033: ${M033}\n`;

            // M034-M038 Trace (Defensive Stats)
            reportText += `\n[M034-M038 Trace - Defensive Stats]\n`;
            let tBlocked = 0, tOppShots = 0, tDWon = 0, tDTotal = 0;
            let tAWon = 0, tATotal = 0, tInt = 0, tFoul = 0, sCount = 0;

            recentDetails.forEach(match => {
                const teamStats = extractTeamStats(match.stats, match.homeTeam?.id === teamId);
                const oppStats = extractTeamStats(match.stats, match.homeTeam?.id !== teamId);
                if (teamStats) {
                    if (teamStats.blockedShots != null) tBlocked += teamStats.blockedShots;
                    if (teamStats.duelsWon != null) tDWon += teamStats.duelsWon;
                    if (teamStats.totalDuels != null) tDTotal += teamStats.totalDuels;
                    if (teamStats.aerialDuelsWon != null) tAWon += teamStats.aerialDuelsWon;
                    if (teamStats.totalAerialDuels != null) tATotal += teamStats.totalAerialDuels;
                    if (teamStats.interceptions != null) tInt += teamStats.interceptions;
                    if (teamStats.fouls != null) tFoul += teamStats.fouls;
                    sCount++;
                }
                if (oppStats && oppStats.totalShots != null) tOppShots += oppStats.totalShots;
            });

            const M034 = tOppShots > 0 ? ((tBlocked / tOppShots) * 100).toFixed(1) + '%' : 'NULL';
            const M035 = tDTotal > 0 ? ((tDWon / tDTotal) * 100).toFixed(1) + '%' : 'NULL';
            const M036 = tATotal > 0 ? ((tAWon / tATotal) * 100).toFixed(1) + '%' : 'NULL';
            const M037 = sCount > 0 ? (tInt / sCount).toFixed(2) : 'NULL';
            const M038 = sCount > 0 ? (tFoul / sCount).toFixed(2) : 'NULL';

            reportText += `RESULT M034: ${M034}\n`;
            reportText += `RESULT M035: ${M035}\n`;
            reportText += `RESULT M036: ${M036}\n`;
            reportText += `RESULT M037: ${M037}\n`;
            reportText += `RESULT M038: ${M038}\n`;

            // M039-M040 Trace (Cards)
            reportText += `\n[M039-M040 Trace - Cards]\n`;
            let yellows = 0, reds = 0;
            recentDetails.forEach(match => {
                const isMatchHome = match.homeTeam?.id === teamId;
                const incidents = match.incidents?.incidents || [];
                incidents.forEach(inc => {
                    if (inc.incidentType === 'card' && inc.isHome === isMatchHome) {
                        if (inc.incidentClass === 'yellow') yellows++;
                        if (inc.incidentClass === 'red' || inc.incidentClass === 'yellowRed') reds++;
                    }
                });
            });
            const M039 = recentCount > 0 ? (yellows / recentCount).toFixed(2) : 'NULL';
            const M040 = recentCount > 0 ? (reds / recentCount).toFixed(2) : 'NULL';
            reportText += `RESULT M039: ${M039}\n`;
            reportText += `RESULT M040: ${M040}\n`;

            // M041-M045 Trace (Advanced Defense)
            reportText += `\n[M041-M045 Trace - Advanced Defense]\n`;
            let goalsUnderP = 0, timesAhead = 0, lostFromAhead = 0, wonFromAhead = 0;
            let totalReactionMins = 0, reactionCount = 0, totalOppCorners = 0, goalsFromOppCorner = 0;

            recentDetails.forEach(match => {
                const isMatchHome = match.homeTeam?.id === teamId;
                const incidents = match.incidents?.incidents || [];
                const graphPoints = match.graph?.graphPoints || [];
                const sortedIncidents = incidents.slice().sort((a,b) => (a.time||0) - (b.time||0));
                
                // M041
                incidents.forEach(inc => {
                    if (inc.incidentType === 'goal' && inc.isHome !== isMatchHome) {
                        const nearPoint = graphPoints.find(p => Math.abs(p.minute - inc.time) <= 2);
                        if (nearPoint) {
                            const pVal = isMatchHome ? nearPoint.value : -nearPoint.value;
                            if (pVal < -30) goalsUnderP++;
                        }
                    }
                });

                // M042, M043
                let tG = 0, oG = 0, everAhead = false;
                sortedIncidents.forEach(inc => {
                    if (inc.incidentType === 'goal') {
                        const prevLeading = tG > oG;
                        if (inc.isHome === isMatchHome) tG++; else oG++;
                        if (!prevLeading && (tG > oG)) { timesAhead++; everAhead = true; }
                    }
                });
                if (everAhead) {
                    const finalT = isMatchHome ? match.homeScore?.current : match.awayScore?.current;
                    const finalO = isMatchHome ? match.awayScore?.current : match.homeScore?.current;
                    if (finalT != null && finalO != null) {
                        if (finalO >= finalT) lostFromAhead++;
                        if (finalT > finalO) wonFromAhead++;
                    }
                }

                // M044
                const goals = incidents.filter(i => i.incidentType === 'goal').sort((a,b) => (a.time||0)-(b.time||0));
                for (let i=0; i<goals.length; i++) {
                    if (goals[i].isHome !== isMatchHome) {
                        for (let j=i+1; j<goals.length; j++) {
                            if (goals[j].isHome === isMatchHome) {
                                totalReactionMins += (goals[j].time - goals[i].time);
                                reactionCount++;
                                break;
                            }
                        }
                    }
                }

                // M045
                const oppStats = extractTeamStats(match.stats, !isMatchHome);
                if (oppStats && oppStats.cornerKicks != null) totalOppCorners += oppStats.cornerKicks;
                const shotmap = match.shotmap?.shotmap || [];
                shotmap.forEach(shot => {
                    if (shot.isHome !== isMatchHome && shot.situation === 'corner' && shot.isGoal) goalsFromOppCorner++;
                });
            });

            const M041 = totalConc > 0 ? ((goalsUnderP / totalConc) * 100).toFixed(1) + '%' : 'NULL';
            const M042 = timesAhead > 0 ? ((lostFromAhead / timesAhead) * 100).toFixed(1) + '%' : 'NULL';
            const M043 = timesAhead > 0 ? ((wonFromAhead / timesAhead) * 100).toFixed(1) + '%' : 'NULL';
            const M044 = reactionCount > 0 ? (totalReactionMins / reactionCount).toFixed(1) : 'NULL';
            const M045 = totalOppCorners > 0 ? ((1 - (goalsFromOppCorner / totalOppCorners)) * 100).toFixed(1) + '%' : 'NULL';

            reportText += `RESULT M041: ${M041} (${goalsUnderP} goals under pressure)\n`;
            reportText += `RESULT M042: ${M042} (Lost: ${lostFromAhead} / Ahead: ${timesAhead})\n`;
            reportText += `RESULT M043: ${M043} (Won: ${wonFromAhead} / Ahead: ${timesAhead})\n`;
            reportText += `RESULT M044: ${M044} mins avg reaction\n`;
            reportText += `RESULT M045: ${M045} (Opp Corner Goals: ${goalsFromOppCorner} / Corners: ${totalOppCorners})\n`;

            // M046-M050 Trace (Form & Streaks)
            reportText += `\n[M046-M050 Trace - Form & Streaks]\n`;
            const getPoints = (events) => {
                let pts = 0, valid = 0;
                events.forEach(ev => {
                    const isEvH = ev.homeTeam?.id === teamId;
                    const s = isEvH ? ev.homeScore?.current : ev.awayScore?.current;
                    const c = isEvH ? ev.awayScore?.current : ev.homeScore?.current;
                    if (s != null && c != null) {
                        valid++;
                        if (s > c) pts += 3; else if (s === c) pts += 1;
                    }
                });
                return { pts, valid };
            };

            const fp5 = getPoints(finishedEvents.slice(0, 5));
            const fp10 = getPoints(finishedEvents.slice(0, 10));
            const fp20 = getPoints(finishedEvents.slice(0, 20));

            const fData = data.form || {};
            const sideForm = isHome ? fData.home : fData.away;
            const mString = sideForm?.value || '';
            const fScore = mString.split('').reduce((s, c) => s + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0);
            const mScore = mString.length * 3;
            const fPct = mScore > 0 ? (fScore / mScore) * 100 : null;

            const m046raw = fp5.valid > 0 ? (fp5.pts / (fp5.valid * 3)) * 100 : null;
            const M046 = (m046raw != null && fPct != null) ? (m046raw * 0.7 + fPct * 0.3).toFixed(1) + '%' : (m046raw ? m046raw.toFixed(1)+'%' : 'NULL');
            const M047 = fp10.valid > 0 ? (fp10.pts / (fp10.valid * 3) * 100).toFixed(1) + '%' : 'NULL';
            const M048 = fp20.valid > 0 ? (fp20.pts / (fp20.valid * 3) * 100).toFixed(1) + '%' : 'NULL';

            let winS = 0, noLossS = 0, sDone = false, nlDone = false;
            for (const ev of finishedEvents) {
                const isEvH = ev.homeTeam?.id === teamId;
                const s = isEvH ? ev.homeScore?.current : ev.awayScore?.current;
                const c = isEvH ? ev.awayScore?.current : ev.homeScore?.current;
                if (s == null || c == null) break;
                if (!sDone) { if (s > c) winS++; else sDone = true; }
                if (!nlDone) { if (s >= c) noLossS++; else nlDone = true; }
            }
            const M049 = winS;
            const avgR = sideForm?.avgRating;
            let M050;
            if (avgR != null) {
                const sP = Math.min(noLossS, 10) * 10;
                const rP = Math.min(Math.max((avgR - 6) / 3, 0), 1) * 100;
                M050 = (sP * 0.6 + rP * 0.4).toFixed(1) + '%';
            } else {
                M050 = (Math.min(noLossS, 10) * 10).toFixed(1) + '%';
            }

            reportText += `RESULT M046: ${M046} (Form String: ${mString})\n`;
            reportText += `RESULT M047: ${M047}\n`;
            reportText += `RESULT M048: ${M048}\n`;
            reportText += `RESULT M049: ${M049} (Wins Streak)\n`;
            reportText += `RESULT M050: ${M050} (Unbeaten Streak: ${noLossS}, AvgRating: ${avgR})\n`;

            // M051-M054 Trace (Streaks & Trends)
            reportText += `\n[M051-M054 Trace - Streaks & Trends]\n`;
            let scS = 0, clS = 0, scDone = false, clDone = false;
            for (const ev of finishedEvents) {
                const isEvH = ev.homeTeam?.id === teamId;
                const s = isEvH ? ev.homeScore?.current : ev.awayScore?.current;
                const c = isEvH ? ev.awayScore?.current : ev.homeScore?.current;
                if (s == null || c == null) break;
                if (!scDone) { if (s > 0) scS++; else scDone = true; }
                if (!clDone) { if (c === 0) clS++; else clDone = true; }
            }
            const M051 = scS;
            const M052 = clS;

            const last5 = finishedEvents.slice(0, 5);
            const prev5 = finishedEvents.slice(5, 10);
            const getG = (events, tId, own) => {
                let g = 0;
                events.forEach(ev => {
                    const isH = ev.homeTeam?.id === tId;
                    const s = isH ? ev.homeScore?.current : ev.awayScore?.current;
                    const c = isH ? ev.awayScore?.current : ev.homeScore?.current;
                    if (s != null && c != null) g += own ? s : c;
                });
                return g;
            };
            const l5G = getG(last5, teamId, true);
            const p5G = getG(prev5, teamId, true);
            const l5C = getG(last5, teamId, false);
            const p5C = getG(prev5, teamId, false);
            const l5Avg = last5.length > 0 ? l5G / last5.length : 0;
            const p5Avg = prev5.length > 0 ? p5G / prev5.length : 0;
            const l5CAvg = last5.length > 0 ? l5C / last5.length : 0;
            const p5CAvg = prev5.length > 0 ? p5C / prev5.length : 0;

            const M053 = p5Avg > 0 ? (((l5Avg - p5Avg) / p5Avg) * 100).toFixed(1) + '%' : 'NULL';
            const M054 = p5CAvg > 0 ? (((l5CAvg - p5CAvg) / p5CAvg) * 100).toFixed(1) + '%' : 'NULL';

            reportText += `RESULT M051: ${M051} (Scoring Streak)\n`;
            reportText += `RESULT M052: ${M052} (Clean Sheet Streak)\n`;
            reportText += `RESULT M053: ${M053} (Goal Trend: ${l5Avg.toFixed(2)} vs ${p5Avg.toFixed(2)})\n`;
            reportText += `RESULT M054: ${M054} (Conceded Trend: ${l5CAvg.toFixed(2)} vs ${p5CAvg.toFixed(2)})\n`;

            // M055-M058 Trace (Standings)
            reportText += `\n[M055-M058 Trace - Standings]\n`;
            const getStand = (st, tId) => {
                if (!st || !st.standings) return null;
                for (const g of st.standings) {
                    const found = (g.rows || []).find(r => r.team?.id === tId);
                    if (found) return { row: found, total: g.rows.length };
                }
                return null;
            };
            const sTotalInfo = getStand(data.standingsTotal, teamId);
            const sHomeInfo = getStand(data.standingsHome, teamId);
            const sAwayInfo = getStand(data.standingsAway, teamId);
            
            const rowT = sTotalInfo?.row;
            const totalT = sTotalInfo?.total || 0;
            const rowH = sHomeInfo?.row;
            const rowA = sAwayInfo?.row;

            const M055 = rowT && totalT > 0 ? (((totalT - rowT.position + 1) / totalT) * 100).toFixed(1) + '%' : 'NULL';
            const M056 = rowH && totalT > 0 ? (((totalT - rowH.position + 1) / totalT) * 100).toFixed(1) + '%' : 'NULL';
            const M057 = rowA && totalT > 0 ? (((totalT - rowA.position + 1) / totalT) * 100).toFixed(1) + '%' : 'NULL';
            const M058 = rowT ? (rowT.scoresFor - rowT.scoresAgainst) : 'NULL';

            reportText += `RESULT M055: ${M055} (Pos: ${rowT?.position}/${totalT})\n`;
            reportText += `RESULT M056: ${M056} (Home Pos: ${rowH?.position})\n`;
            reportText += `RESULT M057: ${M057} (Away Pos: ${rowA?.position})\n`;
            reportText += `RESULT M058: ${M058} (Goal Diff)\n`;

            // M059-M061 Trace (O/U 2.5, BTTS)
            reportText += `\n[M059-M061 Trace - Goals]\n`;
            let o25 = 0, u25 = 0, bttsCount = 0, gMatchCount = 0;
            last20.forEach(ev => {
                const s = isHome ? ev.homeScore?.current : ev.awayScore?.current;
                const c = isHome ? ev.awayScore?.current : ev.homeScore?.current;
                if (s != null && c != null) {
                    gMatchCount++;
                    if ((s + c) > 2.5) o25++; else u25++;
                    if (s > 0 && c > 0) bttsCount++;
                }
            });
            const M059 = gMatchCount > 0 ? ((o25 / gMatchCount) * 100).toFixed(1) + '%' : 'NULL';
            const M060 = gMatchCount > 0 ? ((u25 / gMatchCount) * 100).toFixed(1) + '%' : 'NULL';
            const M061 = gMatchCount > 0 ? ((bttsCount / gMatchCount) * 100).toFixed(1) + '%' : 'NULL';

            reportText += `RESULT M059: ${M059} (Over 2.5)\n`;
            reportText += `RESULT M060: ${M060} (Under 2.5)\n`;
            reportText += `RESULT M061: ${M061} (BTTS %)\n`;

            // M062-M065 Trace (Match Scenarios)
            reportText += `\n[M062-M065 Trace - Match Scenarios]\n`;
            let fGS = 0, fGW = 0, tBehind = 0, cBacks = 0;
            recentDetails.forEach(match => {
                const isMatchH = match.homeTeam?.id === teamId;
                const incs = (match.incidents?.incidents || []).slice().sort((a,b) => (a.time||0)-(b.time||0));
                const goals = incs.filter(i => i.incidentType === 'goal');
                if (goals.length > 0 && goals[0].isHome === isMatchH) {
                    fGS++;
                    const sT = isMatchH ? match.homeScore?.current : match.awayScore?.current;
                    const sO = isMatchH ? match.awayScore?.current : match.homeScore?.current;
                    if (sT > sO) fGW++;
                }
                let tG = 0, oG = 0, wasBehind = false;
                incs.forEach(inc => {
                    if (inc.incidentType === 'goal') {
                        if (inc.isHome === isMatchH) tG++; else oG++;
                        if (oG > tG) wasBehind = true;
                    }
                });
                if (wasBehind) {
                    tBehind++;
                    const sT = isMatchH ? match.homeScore?.current : match.awayScore?.current;
                    const sO = isMatchH ? match.awayScore?.current : match.homeScore?.current;
                    if (sT >= sO) cBacks++;
                }
            });
            const M062 = recentCount > 0 ? ((fGS / recentCount) * 100).toFixed(1) + '%' : 'NULL';
            const M063 = fGS > 0 ? ((fGW / fGS) * 100).toFixed(1) + '%' : 'NULL';
            const M064 = tBehind > 0 ? ((cBacks / tBehind) * 100).toFixed(1) + '%' : 'NULL';

            let tWins = 0, bWins = 0;
            last20.forEach(ev => {
                const isEvH = ev.homeTeam?.id === teamId;
                const sT = isEvH ? ev.homeScore?.current : ev.awayScore?.current;
                const sO = isEvH ? ev.awayScore?.current : ev.homeScore?.current;
                if (sT != null && sO != null && sT > sO) {
                    tWins++;
                    if ((sT - sO) >= 2) bWins++;
                }
            });
            const M065 = tWins > 0 ? ((bWins / tWins) * 100).toFixed(1) + '%' : 'NULL';

            reportText += `RESULT M062: ${M062} (First Goals: ${fGS} in ${recentCount} matches)\n`;
            reportText += `RESULT M063: ${M063} (Wins after First Goal: ${fGW} / ${fGS})\n`;
            reportText += `RESULT M064: ${M064} (Comebacks: ${cBacks} / ${tBehind})\n`;
            reportText += `RESULT M065: ${M065} (Big Wins: ${bWins} / ${tWins})\n`;

            // M066-M070 Trace (Player Performance)
            reportText += `\n[M066-M070 Trace - Player Performance]\n`;
            const pStats = isHome ? data.homePlayerStats : data.awayPlayerStats;
            const starters = (pStats || []).filter(p => !p.substitute);
            const subs = (pStats || []).filter(p => p.substitute);

            // Simple minutes map for trace (not fully complex like player-perf.js but functional for audit)
            const getMinMap = (matches, stats) => {
                const map = {};
                (stats || []).forEach(p => map[p.playerId] = 90); // Default 90
                matches.forEach(m => {
                    const isMHome = m.homeTeam?.id === teamId;
                    (m.incidents?.incidents || []).forEach(inc => {
                        if (inc.incidentType === 'substitution') {
                            if (inc.playerOut?.id) map[inc.playerOut.id] = (map[inc.playerOut.id] || 90) * 0.5 + inc.time * 0.5;
                            if (inc.playerIn?.id) map[inc.playerIn.id] = (map[inc.playerIn.id] || 0) * 0.5 + (90 - inc.time) * 0.5;
                        }
                    });
                });
                return map;
            };
            const minMap = getMinMap(recentDetails, pStats);

            const getWeightedRating = (plist, weightFactor = 1.0) => {
                let totalW = 0, totalR = 0;
                plist.forEach(p => {
                    const r = p.seasonStats?.statistics?.rating;
                    if (r > 0) {
                        const w = (minMap[p.playerId] || 90) / 90 * weightFactor;
                        totalR += r * w;
                        totalW += w;
                    }
                });
                return totalW > 0 ? totalR / totalW : null;
            };

            const M066 = getWeightedRating(starters);
            const M067 = getWeightedRating(subs, 0.6);
            
            const allR = (pStats || []).map(p => p.seasonStats?.statistics?.rating).filter(r => r > 0);
            const M068 = allR.length > 0 ? (Math.max(...allR) - Math.min(...allR)).toFixed(2) : 'NULL';

            let fwdG = 0, totalG = 0;
            starters.forEach(p => {
                const g = p.seasonStats?.statistics?.goals || 0;
                const a = p.seasonStats?.statistics?.assists || 0;
                totalG += (g + a);
                if (p.position === 'F' || p.position === 'FW') fwdG += (g + a);
            });
            const M069 = totalG > 0 ? ((fwdG / totalG) * 100).toFixed(1) + '%' : 'NULL';

            let midC = 0, midCount = 0;
            starters.forEach(p => {
                if (p.position === 'M' || p.position === 'MF') {
                    const kp = p.seasonStats?.statistics?.keyPasses || 0;
                    const a = p.seasonStats?.statistics?.assists || 0;
                    const app = p.seasonStats?.statistics?.appearances || 1;
                    midC += (kp + a) / app;
                    midCount++;
                }
            });
            const M070 = midCount > 0 ? (midC / midCount).toFixed(2) : 'NULL';

            reportText += `RESULT M066: ${M066 ? M066.toFixed(2) : 'NULL'} (Starter Rating)\n`;
            reportText += `RESULT M067: ${M067 ? M067.toFixed(2) : 'NULL'} (Sub Rating)\n`;
            reportText += `RESULT M068: ${M068} (Rating Range)\n`;
            reportText += `RESULT M069: ${M069} (Forward Contribution)\n`;
            reportText += `RESULT M070: ${M070} (Midfield Creativity)\n`;

            // M071-M080 Trace (Advanced Player & Squad)
            reportText += `\n[M071-M080 Trace - Advanced Player & Squad]\n`;
            const defs = starters.filter(p => p.position === 'D' || p.position === 'DF');
            const M071 = defs.length > 0 ? (defs.reduce((s,p) => s + (p.seasonStats?.statistics?.rating||0), 0) / defs.length).toFixed(2) : 'NULL';

            let totalPlayerXG = 0, maxXG = 0;
            starters.forEach(p => {
                const x = p.seasonStats?.statistics?.expectedGoals || 0;
                totalPlayerXG += x;
                if (x > maxXG) maxXG = x;
            });
            const M072 = totalPlayerXG > 0 ? (maxXG / totalPlayerXG).toFixed(2) : 'NULL';

            const M073 = totalG > 0 ? ((Math.max(...starters.map(p => (p.seasonStats?.statistics?.goals||0)+(p.seasonStats?.statistics?.assists||0))) / totalG) * 100).toFixed(1) + '%' : 'NULL';

            let sD = 0, tD = 0, aP = 0, tP = 0, aW = 0, tA = 0;
            starters.forEach(p => {
                const st = p.seasonStats?.statistics;
                if (st) {
                    sD += st.successfulDribbles || 0;
                    tD += st.totalDribbles || (st.successfulDribbles||0) + (st.failedDribbles||0);
                    aP += st.accuratePasses || 0;
                    tP += st.totalPasses || 0;
                    aW += st.aerialDuelsWon || 0;
                    tA += st.totalAerialDuels || (st.aerialDuelsWon||0) + (st.aerialDuelsLost||0);
                }
            });
            const M074 = tD > 0 ? ((sD / tD) * 100).toFixed(1) + '%' : 'NULL';
            const M075 = tP > 0 ? ((aP / tP) * 100).toFixed(1) + '%' : 'NULL';
            const M076 = tA > 0 ? ((aW / tA) * 100).toFixed(1) + '%' : 'NULL';

            const missing = (data.missingPlayers?.players || []).filter(mp => mp.team?.id === teamId);
            let inj = 0, susp = 0;
            missing.forEach(m => {
                const r = 7.0; // Assume avg rating for missing in trace
                if (m.type === 'injured') inj += r / 7.0;
                else if (m.type === 'suspended') susp += r / 7.0;
            });
            const M077 = inj.toFixed(1);
            const M078 = susp.toFixed(1);

            const totalCount = (isHome ? data.homePlayers : data.awayPlayers)?.players?.length || 0;
            const M079 = M066 ? (((totalCount / 25) * (M066 / 7.0)) / 1.5 * 100).toFixed(1) + '%' : 'NULL';

            const mins = starters.map(p => p.seasonStats?.statistics?.minutesPlayed || 0).filter(m => m > 0);
            const M080 = mins.length > 0 ? Math.max(...mins) - Math.min(...mins) : 'NULL';

            reportText += `RESULT M071: ${M071} (Def Stability)\n`;
            reportText += `RESULT M072: ${M072} (xG Contrib)\n`;
            reportText += `RESULT M073: ${M073} (Dependency)\n`;
            reportText += `RESULT M074: ${M074} (Dribbling)\n`;
            reportText += `RESULT M075: ${M075} (Passing)\n`;
            reportText += `RESULT M076: ${M076} (Aerial)\n`;
            reportText += `RESULT M077: ${M077} (Injured Impact)\n`;
            reportText += `RESULT M078: ${M078} (Suspended Impact)\n`;
            reportText += `RESULT M079: ${M079} (Squad Depth)\n`;
            reportText += `RESULT M080: ${M080} (Fatigue/Minutes Diff)\n`;
        }

        fs.writeFileSync('audit_report_15632083.txt', reportText);
        console.log('Trace completed. Report saved to audit_report_15632083.txt');

    } catch (err) {
        console.error('Trace failed:', err);
    } finally {
        await closeBrowser();
    }
}

runTrace(15632083);
