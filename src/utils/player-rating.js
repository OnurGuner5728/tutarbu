export function calculateDynamicRating(playerData) {
  if (!playerData) return 55;
  
  const stats = playerData.statistics || playerData.seasonStats?.statistics || {};
  const mv = playerData.proposedMarketValue || 0;
  
  // 1. Direct rating is the best source
  if (stats.rating && stats.rating > 0) {
    return Math.round(stats.rating * 10);
  }
  
  // 2. Compute from stats
  let baseScore = 60; // Professional baseline
  
  const matches = stats.appearances || 0;
  if (matches > 0) {
    const goals = stats.goals || 0;
    const assists = stats.assists || 0;
    const gpa = (goals + assists) / matches;
    
    const pos = (playerData.position || '').toUpperCase()[0];
    
    if (pos === 'F') {
      baseScore += Math.min(25, gpa * 35); 
    } else if (pos === 'M') {
      baseScore += Math.min(20, gpa * 45); 
      const keyPasses = stats.keyPasses || stats.bigChancesCreated || 0;
      baseScore += Math.min(10, (keyPasses / matches) * 6);
    } else if (pos === 'D') {
      baseScore += Math.min(10, gpa * 50);
      const cleanSheets = stats.cleanSheets || 0;
      baseScore += Math.min(15, (cleanSheets / matches) * 25);
      const aerial = stats.aerialDuelsWon || 0;
      baseScore += Math.min(5, (aerial / matches) * 2.5);
    } else if (pos === 'G') {
      const cleanSheets = stats.cleanSheets || 0;
      baseScore += Math.min(20, (cleanSheets / matches) * 35);
      const saves = stats.saves || 0;
      baseScore += Math.min(15, (saves / matches) * 6);
    }
    
    // Minute consistency
    const minutes = stats.minutesPlayed || 0;
    if (minutes > 0) {
      const minsPerMatch = minutes / matches;
      if (minsPerMatch > 75) baseScore += 5;
      else if (minsPerMatch > 45) baseScore += 2;
    }
  } else {
    // 3. Fallback to MV if absolutely no stats available
    if (mv > 0) {
      // 1M -> ~10 points, 10M -> ~20 points
      baseScore += Math.min(35, Math.log10(mv / 100000 + 1) * 10);
    } else {
      baseScore = 55; // Unknown reserve
    }
  }

  return Math.min(99, Math.max(40, Math.round(baseScore)));
}
