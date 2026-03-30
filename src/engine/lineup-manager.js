/**
 * Lineup Manager — Kadro Yönetimi
 * Otomatik kadro seçimi + sakatlık/ceza filtreleme + kullanıcı değişikliği.
 * Değişiklik yapıldığında metriklerin yeniden hesaplanmasını tetikler.
 */

const api = require('../services/sofascore-client');

/**
 * Bir takım için mevcut kadroyu ve önerilen ilk 11'i hazırlar.
 * @param {object} data - fetchAllMatchData() çıktısı
 * @param {string} side - 'home' | 'away'
 * @returns {object} Kadro bilgisi
 */
function buildLineup(data, side) {
  const isHome = side === 'home';
  const teamId = isHome ? data.homeTeamId : data.awayTeamId;
  const teamPlayers = isHome ? data.homePlayers : data.awayPlayers;
  const missingPlayers = data.missingPlayers;
  const recentDetails = isHome ? data.homeRecentMatchDetails : data.awayRecentMatchDetails;

  // 1. Tüm kadroyu al
  const allPlayers = (teamPlayers?.players || []).map(p => ({
    id: p.player.id,
    name: p.player.name,
    shortName: p.player.shortName || p.player.name,
    position: p.player.position, // G, D, M, F
    shirtNumber: p.player.jerseyNumber || p.player.shirtNumber || '',
    country: p.player.country?.name || '',
    marketValue: p.player.proposedMarketValue || 0,
    status: 'available', // available, injured, suspended, doubtful
    missingReason: null,
  }));

  // 2. Sakat/cezalı oyuncuları işaretle
  const missingList = missingPlayers?.players || [];
  for (const mp of missingList) {
    if ((mp.team?.id || mp.missingTeamId) !== teamId) continue;
    const player = allPlayers.find(p => p.id === mp.player?.id);
    if (player) {
      if (mp.type === 'injured' || mp.reason?.description?.includes('Injury')) {
        player.status = 'injured';
        player.missingReason = mp.reason?.description || mp.reason || 'Injury';
      } else if (mp.type === 'suspended' || mp.reason?.description?.includes('Suspended')) {
        player.status = 'suspended';
        player.missingReason = mp.reason?.description || 'Suspended';
      } else if (mp.type === 'doubtful') {
        player.status = 'doubtful';
        player.missingReason = mp.reason?.description || 'Doubtful';
      } else {
        player.status = 'injured';
        player.missingReason = mp.reason || mp.type || 'Unknown';
      }
    }
  }

  // 3. Son maçın ilk 11'ini al (referans kadro)
  let lastLineup = [];
  let lastFormation = '4-4-2';

  if (recentDetails.length > 0) {
    // lastMatchId bu scope'ta kullanılmıyor — kaldırıldı (dead code)
    const lineups = data.lineups;
    if (lineups) {
      const teamLineup = isHome ? lineups.home : lineups.away;
      if (teamLineup) {
        lastFormation = teamLineup.formation || '4-4-2';
        const starters = (teamLineup.players || []).filter(p => !p.substitute);
        lastLineup = starters.map(p => p.player?.id);
      }
    }
  }

  // 4. Mevcut maç için ilk 11 öner
  const availablePlayers = allPlayers.filter(p => p.status === 'available' || p.status === 'doubtful');
  let suggestedStarting = [];

  if (lastLineup.length === 11) {
    // Son maçın ilk 11'ini temel al
    for (const playerId of lastLineup) {
      const player = allPlayers.find(p => p.id === playerId);
      if (player && (player.status === 'available' || player.status === 'doubtful')) {
        suggestedStarting.push(player);
      } else {
        // Sakat/cezalı — aynı pozisyonda yedek bul
        const originalPlayer = allPlayers.find(p => p.id === playerId);
        const position = originalPlayer?.position || 'M';
        const replacement = findBestAvailableForPosition(
          availablePlayers, position, suggestedStarting.map(p => p.id)
        );
        if (replacement) suggestedStarting.push(replacement);
      }
    }
  }

  // Eğer son maç kadrosu yoksa, pozisyon bazlı seç
  if (suggestedStarting.length < 11) {
    suggestedStarting = buildDefaultLineup(availablePlayers, lastFormation);
  }

  const startingIds = new Set(suggestedStarting.map(p => p.id));
  const substitutes = availablePlayers
    .filter(p => !startingIds.has(p.id))
    .slice(0, 9); // Max 9 yedek

  const notInSquad = allPlayers.filter(p =>
    !startingIds.has(p.id) &&
    !substitutes.some(s => s.id === p.id) &&
    p.status === 'available'
  );

  const injured = allPlayers.filter(p => p.status === 'injured');
  const suspended = allPlayers.filter(p => p.status === 'suspended');
  const doubtful = allPlayers.filter(p => p.status === 'doubtful');

  return {
    formation: lastFormation,
    starting: suggestedStarting.map(p => ({ ...p, role: 'starting' })),
    substitutes: substitutes.map(p => ({ ...p, role: 'substitute' })),
    notInSquad: notInSquad.map(p => ({ ...p, role: 'notInSquad' })),
    injured: injured.map(p => ({ ...p, role: 'injured' })),
    suspended: suspended.map(p => ({ ...p, role: 'suspended' })),
    doubtful: doubtful.map(p => ({ ...p, role: 'doubtful' })),
    totalPlayers: allPlayers.length,
    missingCount: injured.length + suspended.length,
  };
}

/**
 * Kullanıcı kadro değişikliği uygular.
 * @param {object} lineup - buildLineup() çıktısı
 * @param {number} playerOutId - Çıkan oyuncu ID
 * @param {number} playerInId - Giren oyuncu ID
 * @returns {object} Güncellenmiş kadro
 */
function applyLineupChange(lineup, playerOutId, playerInId) {
  const updatedLineup = JSON.parse(JSON.stringify(lineup)); // Deep copy

  const outIdx = updatedLineup.starting.findIndex(p => p.id === playerOutId);
  if (outIdx === -1) {
    return { error: `Player ${playerOutId} not found in starting lineup`, lineup };
  }

  // Oyuncuyu yedekler, kadro dışı veya tüm listede bul
  const allAvailable = [
    ...updatedLineup.substitutes,
    ...updatedLineup.notInSquad,
    ...updatedLineup.doubtful,
  ];
  const inPlayer = allAvailable.find(p => p.id === playerInId);
  if (!inPlayer) {
    return { error: `Player ${playerInId} not available`, lineup };
  }

  // Swap
  const outPlayer = updatedLineup.starting[outIdx];
  updatedLineup.starting[outIdx] = { ...inPlayer, role: 'starting' };

  // Çıkan oyuncuyu yedeğe al
  updatedLineup.substitutes = updatedLineup.substitutes.filter(p => p.id !== playerInId);
  updatedLineup.notInSquad = updatedLineup.notInSquad.filter(p => p.id !== playerInId);
  updatedLineup.substitutes.push({ ...outPlayer, role: 'substitute' });

  return { lineup: updatedLineup, changed: true, playerOut: outPlayer.name, playerIn: inPlayer.name };
}

/**
 * Formasyon değişikliği uygular.
 * @param {object} lineup
 * @param {string} newFormation - Ör: '4-3-3', '3-5-2'
 * @returns {object}
 */
function changeFormation(lineup, newFormation) {
  const updated = JSON.parse(JSON.stringify(lineup));
  updated.formation = newFormation;
  // Oyuncular aynı kalır, sadece formasyon değişir
  // UI tarafında formasyon görseli güncellenir
  return updated;
}

// ── Yardımcı Fonksiyonlar ──

function findBestAvailableForPosition(availablePlayers, position, excludeIds) {
  const candidates = availablePlayers.filter(p =>
    p.position === position && !excludeIds.includes(p.id)
  );
  if (candidates.length > 0) {
    // Piyasa değerine göre sırala (en yüksek = en iyi)
    candidates.sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0));
    return candidates[0];
  }
  // Aynı pozisyonda kimse yoksa en yakın pozisyonu dene
  const allCandidates = availablePlayers.filter(p => !excludeIds.includes(p.id));
  if (allCandidates.length > 0) {
    allCandidates.sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0));
    return allCandidates[0];
  }
  return null;
}

function buildDefaultLineup(availablePlayers, formation) {
  const positions = parseFormation(formation);
  const lineup = [];
  const usedIds = new Set();

  // Kaleci
  const gk = availablePlayers.find(p => p.position === 'G' && !usedIds.has(p.id));
  if (gk) { lineup.push(gk); usedIds.add(gk.id); }

  // Defans
  const defCount = positions.defenders || 4;
  const defenders = availablePlayers
    .filter(p => p.position === 'D' && !usedIds.has(p.id))
    .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0))
    .slice(0, defCount);
  for (const d of defenders) { lineup.push(d); usedIds.add(d.id); }

  // Orta saha
  const midCount = positions.midfielders || 4;
  const mids = availablePlayers
    .filter(p => p.position === 'M' && !usedIds.has(p.id))
    .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0))
    .slice(0, midCount);
  for (const m of mids) { lineup.push(m); usedIds.add(m.id); }

  // Forvet
  const fwCount = positions.forwards || 2;
  const fws = availablePlayers
    .filter(p => p.position === 'F' && !usedIds.has(p.id))
    .sort((a, b) => (b.marketValue || 0) - (a.marketValue || 0))
    .slice(0, fwCount);
  for (const f of fws) { lineup.push(f); usedIds.add(f.id); }

  // Eksik kalan varsa doldur
  while (lineup.length < 11) {
    const remaining = availablePlayers.find(p => !usedIds.has(p.id));
    if (remaining) { lineup.push(remaining); usedIds.add(remaining.id); }
    else break;
  }

  return lineup;
}

function parseFormation(formation) {
  const parts = (formation || '4-4-2').split('-').map(Number);
  if (parts.length === 3) {
    return { defenders: parts[0], midfielders: parts[1], forwards: parts[2] };
  }
  if (parts.length === 4) {
    return { defenders: parts[0], midfielders: parts[1] + parts[2], forwards: parts[3] };
  }
  return { defenders: 4, midfielders: 4, forwards: 2 };
}

module.exports = { buildLineup, applyLineupChange, changeFormation };
