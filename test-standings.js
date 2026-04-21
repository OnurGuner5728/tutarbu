'use strict';

const api = require('./src/services/playwright-client');
const { fetchAllMatchData } = require('./src/services/data-fetcher');

async function debugData(eventId) {
  await api.initBrowser();
  try {
    const data = await fetchAllMatchData(eventId);
    console.log("data.standingsTotal keys:", Object.keys(data.standingsTotal || {}));
    if (data.standingsTotal && data.standingsTotal.standings) {
      console.log("data.standingsTotal.standings length:", data.standingsTotal.standings.length);
      console.log("data.standingsTotal.standings[0] keys:", Object.keys(data.standingsTotal.standings[0] || {}));
      console.log("rows in standings[0]:", data.standingsTotal.standings[0].rows?.length);
      if (data.standingsTotal.standings[0].rows?.length > 0) {
        console.log("First row keys:", Object.keys(data.standingsTotal.standings[0].rows[0]));
        console.log("First row goals:", data.standingsTotal.standings[0].rows[0].scoresFor);
      }
    } else {
      console.log("data.standingsTotal.standings is undefined. Array maybe?");
      if (Array.isArray(data.standingsTotal)) {
        console.log("data.standingsTotal is an array of length", data.standingsTotal.length);
        if (data.standingsTotal.length > 0) console.log("Keys of first element:", Object.keys(data.standingsTotal[0]));
        if (data.standingsTotal[0].rows) {
          console.log("Rows in first element:", data.standingsTotal[0].rows.length);
        }
      }
    }
  } finally {
    await api.closeBrowser();
  }
}

debugData(14023999);
