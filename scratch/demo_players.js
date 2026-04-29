/**
 * Gerçek SofaScore API verileriyle mevki değişikliği testi.
 * Her oyuncuyu hem doğal hem farklı mevkilerde değerlendirir.
 */
const api = require('../src/services/playwright-client');
const { calculateDynamicRating } = require('../src/engine/player-rating-utils');

async function main() {
  try {
    console.log('[Test] Tarayici baslatiliyor...\n');

    // Güncel sezon ID'leri
    const blSeasons = await api.getSeasons(35);
    const blSId = blSeasons?.seasons?.[0]?.id;

    const plSeasons = await api.getSeasons(17);
    const plSId = plSeasons?.seasons?.[0]?.id;

    console.log(`Bundesliga sId: ${blSId}, PL sId: ${plSId}\n`);

    const targets = [
      { teamId: 2672, tId: 35, sId: blSId, names: ['Kane', 'Olise'] },
      { teamId: 44,   tId: 17, sId: plSId, names: ['van Dijk'] },
    ];

    for (const target of targets) {
      const squad = await api.getTeamPlayers(target.teamId);
      const players = squad?.players || [];

      for (const name of target.names) {
        const found = players.find(p => 
          p.player?.name?.includes(name) || p.player?.shortName?.includes(name)
        );
        if (!found) { console.log(`[!] ${name} bulunamadi`); continue; }

        const playerId = found.player.id;
        const playerName = found.player.name;
        const nativePos = (found.player.position || '').toUpperCase()[0];
        const mv = found.player.proposedMarketValue || 0;

        const seasonStats = await api.getPlayerSeasonStats(playerId, target.tId, target.sId);
        const stats = seasonStats?.statistics || {};

        const playerData = {
          position: found.player.position,
          proposedMarketValue: mv,
          statistics: stats,
        };

        // Test: Doğal mevki + tüm diğer mevkiler
        const positions = ['F', 'M', 'D', 'G'];
        
        console.log(`${'='.repeat(70)}`);
        console.log(`OYUNCU: ${playerName} | Dogal Mevki: ${nativePos} | PD: EUR${(mv/1e6).toFixed(0)}M`);
        console.log(`Rating: ${stats.rating?.toFixed(2) ?? 'YOK'} | Mac: ${stats.appearances ?? '-'} | Gol: ${stats.goals ?? '-'} | Asist: ${stats.assists ?? '-'}`);
        console.log(`${'─'.repeat(70)}`);

        for (const testPos of positions) {
          const isNative = testPos === nativePos;
          const override = isNative ? null : testPos;
          const rating = calculateDynamicRating(playerData, override);
          const label = isNative ? `${testPos} (DOGAL)` : testPos;
          const delta = isNative ? '' : ` (${rating - calculateDynamicRating(playerData, null) >= 0 ? '+' : ''}${rating - calculateDynamicRating(playerData, null)})`;
          console.log(`  ${label.padEnd(12)} → Rating: ${rating}${delta}`);
        }
        console.log(`${'='.repeat(70)}\n`);
      }
    }
  } catch (err) {
    console.error('HATA:', err.message);
  } finally {
    await api.closeBrowser();
    process.exit(0);
  }
}

main();
