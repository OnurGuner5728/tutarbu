'use strict';
/**
 * services/as-of-filter.js
 *
 * fetchAllMatchData() çıktısını verilen kickoff timestamp'inden ÖNCE oluşmuş
 * verilerle sınırlandırır. Backtest'te oynanmış maçın kendi sonucu / kendi sezon
 * istatistiğine etkisi gibi leakage'ları engeller.
 *
 * NOT: Standings ve team season stats kümülatif veridir; API "as-of date" desteklemez.
 *      Bu modül o alanları silmez ama leakage flag'i ekler. Tam çözüm ileri planda
 *      filtrelenmiş last_events üzerinden yeniden inşa gerektirir.
 *
 * Filtrelenen alanlar:
 *   - homeLastEvents.events / awayLastEvents.events
 *   - h2hEvents.events
 *   - h2hMatchDetails (h2hEvents'e bağlı)
 *   - homeRecentMatchDetails / awayRecentMatchDetails
 *   - missingPlayers — kickoff sonrası açıklanan ceza/sakatlık verisi olabilir
 *     (timestamp olmadığı için tam filtrelenmez, mevcut data kullanılır)
 *   - refereeLastEvents.events / managerCareer.events
 */

function _filterEventArray(arr, cutoffSec, excludeEventId = null) {
  if (!Array.isArray(arr)) return arr;
  return arr.filter(e => {
    if (!e) return false;
    if (excludeEventId != null && e.id === excludeEventId) return false;
    const ts = e.startTimestamp ?? e.start_ts ?? null;
    if (ts == null) return false; // ts yoksa kullanma — şüphe lehine ele
    return ts < cutoffSec;
  });
}

function _filterEventWrapper(obj, cutoffSec, excludeEventId = null) {
  if (!obj || !Array.isArray(obj.events)) return obj;
  const filtered = _filterEventArray(obj.events, cutoffSec, excludeEventId);
  return { ...obj, events: filtered, _asOfFiltered: true, _originalCount: obj.events.length };
}

/**
 * @param {object} fullData    fetchAllMatchData() çıktısı (mutate edilebilir)
 * @param {object} opts
 * @param {number} opts.cutoffTs    saniye cinsinden cutoff (typically kickoffTs - 1)
 * @returns {object} aynı obje, filtrelenmiş + meta
 */
function applyAsOfFilter(fullData, opts) {
  if (!fullData || !opts || opts.cutoffTs == null) return fullData;
  const cutoff = opts.cutoffTs;
  const matchEventId = fullData.event?.event?.id ?? fullData.eventId ?? null;
  const meta = {
    cutoffTs: cutoff,
    cutoffISO: new Date(cutoff * 1000).toISOString(),
    filtered: [],
    leakedFields: [],
  };

  // Team last events
  if (fullData.homeLastEvents) {
    const before = fullData.homeLastEvents.events?.length ?? 0;
    fullData.homeLastEvents = _filterEventWrapper(fullData.homeLastEvents, cutoff, matchEventId);
    meta.filtered.push({
      field: 'homeLastEvents',
      kept: fullData.homeLastEvents.events?.length ?? 0,
      total: before,
    });
  }
  if (fullData.awayLastEvents) {
    const before = fullData.awayLastEvents.events?.length ?? 0;
    fullData.awayLastEvents = _filterEventWrapper(fullData.awayLastEvents, cutoff, matchEventId);
    meta.filtered.push({
      field: 'awayLastEvents',
      kept: fullData.awayLastEvents.events?.length ?? 0,
      total: before,
    });
  }

  // H2H events
  if (fullData.h2hEvents) {
    const before = fullData.h2hEvents.events?.length ?? 0;
    fullData.h2hEvents = _filterEventWrapper(fullData.h2hEvents, cutoff, matchEventId);
    meta.filtered.push({
      field: 'h2hEvents',
      kept: fullData.h2hEvents.events?.length ?? 0,
      total: before,
    });
  }

  // H2H match details (object listesi — her elemanın startTimestamp'i olmalı)
  if (Array.isArray(fullData.h2hMatchDetails)) {
    const before = fullData.h2hMatchDetails.length;
    fullData.h2hMatchDetails = fullData.h2hMatchDetails.filter(d => {
      const ts = d?.startTimestamp ?? d?.event?.startTimestamp ?? null;
      if (ts == null) return false;
      return ts < cutoff && d?.id !== matchEventId && d?.event?.id !== matchEventId;
    });
    meta.filtered.push({ field: 'h2hMatchDetails', kept: fullData.h2hMatchDetails.length, total: before });
  }

  // Recent match details
  if (Array.isArray(fullData.homeRecentMatchDetails)) {
    const before = fullData.homeRecentMatchDetails.length;
    fullData.homeRecentMatchDetails = fullData.homeRecentMatchDetails.filter(d => {
      const ts = d?.startTimestamp ?? d?.event?.startTimestamp ?? null;
      if (ts == null) return false;
      return ts < cutoff && d?.id !== matchEventId && d?.event?.id !== matchEventId;
    });
    meta.filtered.push({ field: 'homeRecentMatchDetails', kept: fullData.homeRecentMatchDetails.length, total: before });
  }
  if (Array.isArray(fullData.awayRecentMatchDetails)) {
    const before = fullData.awayRecentMatchDetails.length;
    fullData.awayRecentMatchDetails = fullData.awayRecentMatchDetails.filter(d => {
      const ts = d?.startTimestamp ?? d?.event?.startTimestamp ?? null;
      if (ts == null) return false;
      return ts < cutoff && d?.id !== matchEventId && d?.event?.id !== matchEventId;
    });
    meta.filtered.push({ field: 'awayRecentMatchDetails', kept: fullData.awayRecentMatchDetails.length, total: before });
  }

  // Hakem son maçları
  if (fullData.refereeLastEvents) {
    const before = fullData.refereeLastEvents.events?.length ?? 0;
    fullData.refereeLastEvents = _filterEventWrapper(fullData.refereeLastEvents, cutoff, matchEventId);
    meta.filtered.push({
      field: 'refereeLastEvents',
      kept: fullData.refereeLastEvents.events?.length ?? 0,
      total: before,
    });
  }

  // Menajer son maçları
  if (fullData.homeManagerCareer) {
    const before = fullData.homeManagerCareer.events?.length ?? 0;
    fullData.homeManagerCareer = _filterEventWrapper(fullData.homeManagerCareer, cutoff, matchEventId);
    meta.filtered.push({
      field: 'homeManagerCareer',
      kept: fullData.homeManagerCareer.events?.length ?? 0,
      total: before,
    });
  }
  if (fullData.awayManagerCareer) {
    const before = fullData.awayManagerCareer.events?.length ?? 0;
    fullData.awayManagerCareer = _filterEventWrapper(fullData.awayManagerCareer, cutoff, matchEventId);
    meta.filtered.push({
      field: 'awayManagerCareer',
      kept: fullData.awayManagerCareer.events?.length ?? 0,
      total: before,
    });
  }

  // Standings / team season stats — kümülatif. API as-of vermiyor.
  // Filtre yok ama leakage işareti.
  if (fullData.standingsTotal) meta.leakedFields.push('standingsTotal');
  if (fullData.standingsHome)  meta.leakedFields.push('standingsHome');
  if (fullData.standingsAway)  meta.leakedFields.push('standingsAway');
  if (fullData.homeTeamSeasonStats) meta.leakedFields.push('homeTeamSeasonStats');
  if (fullData.awayTeamSeasonStats) meta.leakedFields.push('awayTeamSeasonStats');

  fullData._asOfMeta = meta;
  return fullData;
}

module.exports = { applyAsOfFilter };
