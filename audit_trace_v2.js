
const { fetchAllMatchData } = require('./src/services/data-fetcher');
const { closeBrowser } = require('./src/services/playwright-client');
const fs = require('fs');

async function runTrace(eventId) {
    try {
        console.log(`Starting trace for match ${eventId}...`);
        const data = await fetchAllMatchData(eventId);
        console.log('Data fetched successfully.');

        let reportText = `[AUDIT REPORT - MATCH ${eventId}]\n\n`;
        const sides = ['home', 'away'];

        for (const side of sides) {
            const isHome = side === 'home';
            const teamId = isHome ? data.homeTeamId : data.awayTeamId;
            const teamName = isHome ? data.event?.event?.homeTeam?.name : data.event?.event?.awayTeam?.name;
            reportText += `\n### SIDE: ${side.toUpperCase()} (${teamName})\n`;

            const last20 = (isHome ? data.homeLastEvents : data.awayLastEvents) || [];
            const recentDetails = (isHome ? data.homeRecentMatchDetails : data.awayRecentMatchDetails) || [];
            const pStats = (isHome ? data.homePlayerStats : data.awayPlayerStats) || [];
            const starters = pStats.filter(p => !p.substitute);

            // M062-M065
            let fGS = 0, fGW = 0, tBehind = 0, cBacks = 0;
            recentDetails.forEach(match => {
                const isMatchH = match.homeTeam?.id === teamId;
                const incs = (match.incidents?.incidents || []).slice().sort((a,b) => (a.time||0)-(b.time||0));
                const goals = incs.filter(i => i.incidentType === 'goal');
                if (goals.length > 0 && goals[0].isHome === isMatchH) {
                    fGS++;
                    if ((isMatchH ? match.homeScore?.current : match.awayScore?.current) > (isMatchH ? match.awayScore?.current : match.homeScore?.current)) fGW++;
                }
                let tG = 0, oG = 0, wasB = false;
                incs.forEach(inc => {
                    if (inc.incidentType === 'goal') {
                        if (inc.isHome === isMatchH) tG++; else oG++;
                        if (oG > tG) wasB = true;
                    }
                });
                if (wasB) {
                    tBehind++;
                    if ((isMatchH ? match.homeScore?.current : match.awayScore?.current) >= (isMatchH ? match.awayScore?.current : match.homeScore?.current)) cBacks++;
                }
            });
            reportText += `RESULT M062: ${((fGS / Math.max(1, recentDetails.length)) * 100).toFixed(1)}%\n`;
            reportText += `RESULT M063: ${fGS > 0 ? ((fGW / fGS) * 100).toFixed(1) + '%' : 'NULL'}\n`;
            reportText += `RESULT M064: ${tBehind > 0 ? ((cBacks / tBehind) * 100).toFixed(1) + '%' : 'NULL'}\n`;

            let bWins = 0, wins = 0;
            last20.forEach(ev => {
                const sT = isHome ? ev.homeScore?.current : ev.awayScore?.current;
                const sO = isHome ? ev.awayScore?.current : ev.homeScore?.current;
                if (sT > sO) { wins++; if (sT - sO >= 2) bWins++; }
            });
            reportText += `RESULT M065: ${wins > 0 ? ((bWins / wins) * 100).toFixed(1) + '%' : 'NULL'}\n`;

            // M066-M071
            const ratings = starters.map(p => p.seasonStats?.statistics?.rating).filter(r => r > 0);
            const avgR = ratings.length > 0 ? (ratings.reduce((a,b)=>a+b,0)/ratings.length) : 0;
            reportText += `RESULT M066: ${avgR.toFixed(2)}\n`;
            reportText += `RESULT M068: ${ratings.length > 0 ? (Math.max(...ratings) - Math.min(...ratings)).toFixed(2) : 'NULL'}\n`;
            
            const defs = starters.filter(p => p.position === 'D' || p.position === 'DF');
            const defR = defs.length > 0 ? (defs.reduce((a,b)=>a+(b.seasonStats?.statistics?.rating||0), 0) / defs.length) : 0;
            reportText += `RESULT M071: ${defR.toFixed(2)}\n`;

            // M069-M070
            let totalGA = 0, fwdGA = 0, midCr = 0, midCount = 0;
            starters.forEach(p => {
                const g = p.seasonStats?.statistics?.goals || 0;
                const a = p.seasonStats?.statistics?.assists || 0;
                totalGA += (g + a);
                if (p.position === 'F' || p.position === 'FW') fwdGA += (g + a);
                if (p.position === 'M' || p.position === 'MF') {
                    midCr += ((p.seasonStats?.statistics?.keyPasses || 0) + a) / (p.seasonStats?.statistics?.appearances || 1);
                    midCount++;
                }
            });
            reportText += `RESULT M069: ${totalGA > 0 ? ((fwdGA / totalGA) * 100).toFixed(1) + '%' : '0%'}\n`;
            reportText += `RESULT M070: ${midCount > 0 ? (midCr / midCount).toFixed(2) : 'NULL'}\n`;

            // M072-M076
            let totalXG = 0, maxXG = 0, sD = 0, tD = 0, aP = 0, tP = 0, aW = 0, tA = 0;
            starters.forEach(p => {
                const st = p.seasonStats?.statistics;
                if (st) {
                    totalXG += st.expectedGoals || 0;
                    if ((st.expectedGoals||0) > maxXG) maxXG = st.expectedGoals;
                    sD += st.successfulDribbles || 0;
                    tD += st.totalDribbles || (st.successfulDribbles||0) + (st.failedDribbles||0);
                    aP += st.accuratePasses || 0;
                    tP += st.totalPasses || 0;
                    aW += st.aerialDuelsWon || 0;
                    tA += st.totalAerialDuels || (st.aerialDuelsWon||0) + (st.aerialDuelsLost||0);
                }
            });
            reportText += `RESULT M072: ${totalXG > 0 ? (maxXG / totalXG).toFixed(2) : 'NULL'}\n`;
            reportText += `RESULT M074: ${tD > 0 ? ((sD / tD) * 100).toFixed(1) + '%' : 'NULL'}\n`;
            reportText += `RESULT M075: ${tP > 0 ? ((aP / tP) * 100).toFixed(1) + '%' : 'NULL'}\n`;
            reportText += `RESULT M076: ${tA > 0 ? ((aW / tA) * 100).toFixed(1) + '%' : 'NULL'}\n`;

            // M077-M080
            const missing = (data.missingPlayers?.players || []).filter(mp => mp.team?.id === teamId);
            reportText += `RESULT M077: ${missing.filter(m => m.type === 'injured').length}.0\n`;
            reportText += `RESULT M078: ${missing.filter(m => m.type === 'suspended').length}.0\n`;
            
            const squadSize = (isHome ? data.homePlayers : data.awayPlayers)?.players?.length || 0;
            reportText += `RESULT M079: ${(((squadSize/25)*(avgR/7.0))/1.5*100).toFixed(1)}%\n`;
            
            const mins = starters.map(p => p.seasonStats?.statistics?.minutesPlayed || 0).filter(m => m > 0);
            reportText += `RESULT M080: ${mins.length > 0 ? Math.max(...mins) - Math.min(...mins) : 'NULL'}\n`;
        }

        fs.writeFileSync('audit_report_v2.txt', reportText);
        console.log('Trace completed. Saved to audit_report_v2.txt');

    } catch (err) {
        console.error('Audit failed:', err);
    } finally {
        await closeBrowser();
    }
}

runTrace(15632083);
