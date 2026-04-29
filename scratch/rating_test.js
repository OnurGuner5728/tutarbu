const fs = require('fs');
const { calculateDynamicRating } = require('../src/engine/player-rating-utils');

// Mock data based on typical API responses for these players
const players = [
  {
    name: 'Harry Kane',
    position: 'F',
    proposedMarketValue: 100000000,
    statistics: { rating: 7.9, appearances: 30, goals: 25, assists: 5, minutesPlayed: 2500 }
  },
  {
    name: 'Michael Olise',
    position: 'M',
    proposedMarketValue: 60000000,
    statistics: { rating: 7.7, appearances: 25, goals: 10, assists: 12, keyPasses: 40, minutesPlayed: 2000 }
  },
  {
    name: 'Serge Gnabry',
    position: 'M',
    proposedMarketValue: 45000000,
    // Simulate bench player missing rating but having some basic stats or only MV
    seasonStats: { statistics: { appearances: 10, goals: 2, assists: 1, minutesPlayed: 400 } }
  },
  {
    name: 'Nicolas Jackson',
    position: 'F',
    proposedMarketValue: 35000000,
    // Simulate missing rating completely
    statistics: {}
  }
];

players.forEach(p => {
  const rating = calculateDynamicRating(p);
  console.log(`${p.name}: ${rating}`);
  
  // Also calculate what it WOULD be with our new mapping if they had a rating
  if (p.statistics && p.statistics.rating) {
    const r = p.statistics.rating;
    const newMapped = Math.min(99, Math.max(40, Math.round((r - 6.0) * 16 + 58)));
    console.log(`  -> (If mapped using new formula: ${newMapped})`);
  }
});
