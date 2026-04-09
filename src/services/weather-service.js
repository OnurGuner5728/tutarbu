/**
 * weather-service.js
 * Ücretsiz Open-Meteo API kullanarak hava durumu verisi çeker.
 * API key gerektirmez, rate limit: 10,000 istek/gün.
 *
 * Maç saati ve stadyum koordinatları ile çağrılır.
 * Dönen veriler simülasyon motorunda M170+ metrikleri olarak kullanılır.
 */

'use strict';

const https = require('https');

/**
 * Open-Meteo API'den hava durumu verisi çeker.
 * @param {number} lat - Stadyum enlemi
 * @param {number} lon - Stadyum boylamı
 * @param {string} matchDate - Maç tarihi (YYYY-MM-DD)
 * @param {number} matchHour - Maç saati (0-23)
 * @returns {Promise<Object|null>} Hava durumu verisi veya null
 */
async function fetchWeatherData(lat, lon, matchDate, matchHour) {
  if (!lat || !lon || !matchDate) return null;

  const hour = matchHour ?? 20; // varsayılan akşam maçı
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m,weather_code&start_date=${matchDate}&end_date=${matchDate}&timezone=auto`;

  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 5000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.hourly || !json.hourly.time) {
            resolve(null);
            return;
          }

          // Maç saatine en yakın veriyi bul
          const times = json.hourly.time;
          let bestIdx = 0;
          let bestDiff = Infinity;
          for (let i = 0; i < times.length; i++) {
            const h = new Date(times[i]).getHours();
            const diff = Math.abs(h - hour);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestIdx = i;
            }
          }

          const result = {
            temperature: json.hourly.temperature_2m?.[bestIdx] ?? null,      // °C
            precipitation: json.hourly.precipitation?.[bestIdx] ?? null,      // mm
            windSpeed: json.hourly.wind_speed_10m?.[bestIdx] ?? null,         // km/h
            humidity: json.hourly.relative_humidity_2m?.[bestIdx] ?? null,    // %
            weatherCode: json.hourly.weather_code?.[bestIdx] ?? null,         // WMO code
          };

          resolve(result);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * Hava durumu verisini simülasyon metriklerine dönüştürür.
 * @param {Object} weather - fetchWeatherData sonucu
 * @returns {Object} M170-M174 metrikleri
 */
function computeWeatherMetrics(weather) {
  if (!weather) return {};

  const metrics = {};

  // M170: Sıcaklık etkisi (0-100)
  // Optimum: 15-22°C. Çok sıcak veya soğuk → performans düşer
  if (weather.temperature != null) {
    const t = weather.temperature;
    if (t >= 15 && t <= 22) {
      metrics.M170 = 100; // optimum
    } else if (t < 15) {
      metrics.M170 = Math.max(40, 100 - (15 - t) * 4); // soğukta düşüş
    } else {
      metrics.M170 = Math.max(30, 100 - (t - 22) * 5); // sıcakta daha hızlı düşüş
    }
  }

  // M171: Yağış etkisi (0-100)
  // 0mm = 100 (ideal), >5mm = ıslak zemin → hata artar, hız düşer
  if (weather.precipitation != null) {
    const p = weather.precipitation;
    if (p <= 0.1) {
      metrics.M171 = 100;
    } else if (p <= 2) {
      metrics.M171 = 80; // hafif yağmur
    } else if (p <= 5) {
      metrics.M171 = 60; // normal yağmur
    } else {
      metrics.M171 = Math.max(25, 60 - (p - 5) * 5); // ağır yağmur
    }
  }

  // M172: Rüzgar etkisi (0-100)
  // 0-15 km/h = ideal, >30 km/h = uzun paslar/orta sahalar etkilenir
  if (weather.windSpeed != null) {
    const w = weather.windSpeed;
    if (w <= 15) {
      metrics.M172 = 100;
    } else if (w <= 30) {
      metrics.M172 = Math.max(55, 100 - (w - 15) * 3);
    } else {
      metrics.M172 = Math.max(30, 55 - (w - 30) * 2);
    }
  }

  // M173: Nem etkisi (0-100)
  // %40-60 optimum. Çok nemi → yorgunluk artar (öz. 2. yarıda)
  if (weather.humidity != null) {
    const h = weather.humidity;
    if (h >= 40 && h <= 60) {
      metrics.M173 = 100;
    } else if (h > 60) {
      metrics.M173 = Math.max(50, 100 - (h - 60) * 1.5);
    } else {
      metrics.M173 = Math.max(60, 100 - (40 - h) * 1.5);
    }
  }

  // M174: Genel hava durumu skoru (0-100)
  // Tüm hava koşullarının ağırlıklı ortalaması
  const vals = [
    [metrics.M170, 2],
    [metrics.M171, 3], // yağış en önemli
    [metrics.M172, 2],
    [metrics.M173, 1],
  ];
  let totalW = 0, totalV = 0;
  for (const [v, w] of vals) {
    if (v != null) { totalV += v * w; totalW += w; }
  }
  if (totalW > 0) {
    metrics.M174 = Math.round(totalV / totalW);
  }

  return metrics;
}

/**
 * Hava durumu metriklerinden simülasyon çarpanı hesapla.
 * @param {Object} weatherMetrics - M170-M174
 * @returns {Object} { goalMult, errorMult, fatigueMult }
 */
function computeWeatherMultipliers(weatherMetrics) {
  if (!weatherMetrics || Object.keys(weatherMetrics).length === 0) {
    return { goalMult: 1.0, errorMult: 1.0, fatigueMult: 1.0 };
  }

  const m174 = weatherMetrics.M174;
  const m171 = weatherMetrics.M171; // yağış
  const m172 = weatherMetrics.M172; // rüzgar

  // goalMult: kötü hava → daha az gol (kontrol zorlaşır, savunma avantajlı)
  let goalMult = 1.0;
  if (m174 != null) {
    goalMult = 0.85 + (m174 / 100) * 0.2; // 0.85 - 1.05 arası
  }

  // errorMult: yağış/rüzgar → daha fazla hata (gol şansı artabilir ama kalite düşer)
  let errorMult = 1.0;
  if (m171 != null) {
    errorMult += (100 - m171) / 100 * 0.15; // ıslak zemin → hata ↑
  }
  if (m172 != null) {
    errorMult += (100 - m172) / 100 * 0.1; // rüzgar → hata ↑
  }

  // fatigueMult: sıcaklık/nem → 2. yarıda yorgunluk
  let fatigueMult = 1.0;
  const m170 = weatherMetrics.M170;
  const m173 = weatherMetrics.M173;
  if (m170 != null && m170 < 80) {
    fatigueMult += (80 - m170) / 100 * 0.15; // sıcak/soğuk → yorgunluk
  }
  if (m173 != null && m173 < 70) {
    fatigueMult += (70 - m173) / 100 * 0.1; // nem → yorgunluk
  }

  return {
    goalMult: Math.max(0.8, Math.min(1.1, goalMult)),
    errorMult: Math.max(1.0, Math.min(1.3, errorMult)),
    fatigueMult: Math.max(1.0, Math.min(1.3, fatigueMult)),
  };
}

module.exports = { fetchWeatherData, computeWeatherMetrics, computeWeatherMultipliers };
