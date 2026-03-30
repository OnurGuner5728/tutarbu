# SofaScore API — Tam Entegrasyon Rehberi

*Bu belge; uygulamanın fiilen kullandığı **tüm** SofaScore API endpoint'lerini, gerçek JSON yapılarını, veri dönüşümlerini ve teknik uygulama detaylarını kapsar. Kod tabanlı tersine mühendislikle üretilmiştir — her endpoint gerçekten çağrılmaktadır.*

---

## ÖNEMLİ TEKNİK NOTLAR

> - **User-Agent** header zorunludur. Aksi hâlde Cloudflare/Fastly 403 döner.
> - **Rate Limit:** `sofascore-client.js` (native HTTPS): istekler arası **5 saniye** bekleme. `playwright-client.js` (Chromium): **200ms** bekleme (gerçek tarayıcı konteksti daha az şüphe çeker).
> - **Cloudflare Bypass:** Uygulama, gerçek bir Chromium tarayıcısı (Playwright) başlatarak `sofascore.com` domain'ine önce navigate eder, cookie/challenge tamamlandıktan sonra `window.fetch()` ile API çağrılarını tarayıcı içinden yapar. User-Agent tek başına yeterli değildir.
> - **Cache:** Her iki client da in-memory `Map()` cache kullanır (Redis kurulmamıştır). Sunucu yeniden başlatıldığında cache sıfırlanır.
> - **Base URL:** `https://api.sofascore.com/api/v1`
> - **403/503 Retry:** Maksimum 3 deneme; 15s → 30s → 60s exponential backoff.

---

## İÇİNDEKİLER

1. [Maç Listesi Endpoint'leri](#bölüm-1-maç-listesi-endpointleri)
2. [Maç Seviyesi Endpoint'leri](#bölüm-2-maç-seviyesi-endpointleri)
3. [Takım Endpoint'leri](#bölüm-3-takım-endpointleri)
4. [Lig / Turnuva Endpoint'leri](#bölüm-4-lig--turnuva-endpointleri)
5. [Oyuncu Endpoint'leri](#bölüm-5-oyuncu-endpointleri)
6. [Hakem Endpoint'leri](#bölüm-6-hakem-endpointleri)
7. [Menajer Endpoint'leri](#bölüm-7-menajer-endpointleri)
8. [Cache TTL Tablosu](#bölüm-8-cache-ttl-tablosu)
9. [Mimari Özet](#bölüm-9-mimari-özet)

---

## Bölüm 1: Maç Listesi Endpoint'leri

### 1.1. Belirli Bir Tarihteki Fikstür
- **Amaç:** "Bugün" maç listesini oluşturmak.
- **URL:** `GET /sport/football/scheduled-events/{YYYY-MM-DD}`
- **Örnek:** `/sport/football/scheduled-events/2023-12-24`
- **Yanıt:**
```json
{
  "events": [
    {
      "id": 11520663,
      "tournament": {
        "name": "Süper Lig",
        "uniqueTournament": { "id": 52 }
      },
      "season": { "id": 52571 },
      "status": {
        "code": 0,
        "description": "Not started",
        "type": "notstarted"
      },
      "homeTeam": {
        "id": 3020,
        "name": "Konyaspor",
        "shortName": "Konyaspor",
        "manager": { "id": 823456 }
      },
      "awayTeam": {
        "id": 3008,
        "name": "Kayserispor",
        "shortName": "Kayserispor",
        "manager": { "id": 823457 }
      },
      "homeScore": { "current": 0, "display": 0 },
      "awayScore": { "current": 0, "display": 0 },
      "startTimestamp": 1703422800,
      "roundInfo": { "round": 18 }
    }
  ]
}
```
- **Kritik Alanlar:** `id`, `tournament.uniqueTournament.id`, `season.id`, `homeTeam.id`, `awayTeam.id`, `status.type`, `startTimestamp`

---

### 1.2. Tüm Canlı Maçlar
- **Amaç:** Anlık oynanan maçları listelemek.
- **URL:** `GET /sport/football/events/live`
- **Yanıt:**
```json
{
  "events": [
    {
      "id": 11352377,
      "tournament": { "name": "Süper Lig", "uniqueTournament": { "id": 52 } },
      "season": { "id": 52571 },
      "status": {
        "code": 7,
        "description": "2nd half",
        "type": "inprogress"
      },
      "homeTeam": { "id": 3009, "name": "Galatasaray" },
      "awayTeam": { "id": 3012, "name": "Fenerbahçe" },
      "homeScore": { "current": 2, "display": 2, "period1": 1 },
      "awayScore": { "current": 0, "display": 0, "period1": 0 },
      "time": {
        "currentPeriodStartTimestamp": 1686304800,
        "injuryTime1": 3,
        "injuryTime2": 5
      }
    }
  ]
}
```

---

## Bölüm 2: Maç Seviyesi Endpoint'leri

*Tüm bu endpoint'ler tek bir `eventId` ile çağrılır. Uygulama bunları `Promise.allSettled()` ile paralel çeker.*

---

### 2.1. Maç Temel Detayı
- **URL:** `GET /event/{id}`
- **Amaç:** `tournamentId`, `seasonId`, `refereeId`, `managerId` gibi tüm downstream çağrılar için gerekli ID'leri almak.
- **Yanıt:**
```json
{
  "event": {
    "id": 11352377,
    "tournament": {
      "name": "Süper Lig",
      "uniqueTournament": { "id": 52 }
    },
    "season": { "id": 52571 },
    "roundInfo": { "round": 15 },
    "status": { "code": 100, "type": "finished" },
    "homeTeam": {
      "id": 3009,
      "name": "Galatasaray",
      "manager": { "id": 823001 }
    },
    "awayTeam": {
      "id": 3012,
      "name": "Fenerbahçe",
      "manager": { "id": 823002 }
    },
    "homeScore": { "current": 2, "display": 2 },
    "awayScore": { "current": 1, "display": 1 },
    "referee": { "id": 745231, "name": "Abdulkadir Bitigen" },
    "venue": {
      "city": { "name": "Istanbul" },
      "stadium": { "name": "Rams Park", "capacity": 52223 }
    },
    "hasEventPlayerStatistics": true,
    "hasEventPlayerHeatMap": true
  }
}
```

---

### 2.2. Maç İstatistikleri
- **URL:** `GET /event/{id}/statistics`
- **Yanıt:**
```json
{
  "statistics": [
    {
      "period": "ALL",
      "groups": [
        {
          "groupName": "Possession",
          "statisticsItems": [
            {
              "name": "Ball possession",
              "home": "55%",
              "away": "45%",
              "homeValue": 55,
              "awayValue": 45
            }
          ]
        },
        {
          "groupName": "Shots",
          "statisticsItems": [
            { "name": "Total shots", "homeValue": 12, "awayValue": 7 },
            { "name": "Shots on target", "homeValue": 4, "awayValue": 2 },
            { "name": "Big chances", "homeValue": 3, "awayValue": 1 }
          ]
        },
        {
          "groupName": "Passes",
          "statisticsItems": [
            { "name": "Accurate passes", "home": "387/432", "homeValue": 387, "awayValue": 298 },
            { "name": "Total passes", "homeValue": 432, "awayValue": 350 }
          ]
        }
      ]
    }
  ]
}
```
- **Not:** Kod `item.homeValue` / `item.awayValue` sayısal alanları okur. `home`/`away` string alanları (yüzde veya `x/y` formatı) `parseStatValue()` ile parse edilir.

---

### 2.3. Maç Olayları (Incidents)
- **URL:** `GET /event/{id}/incidents`
- **Yanıt:**
```json
{
  "incidents": [
    {
      "time": 25,
      "incidentType": "goal",
      "incidentClass": "regular",
      "isHome": true,
      "player": { "id": 145020, "name": "Mauro Icardi" },
      "playerName": "Mauro Icardi",
      "assist1": { "id": 892341, "name": "Barış Alper Yılmaz" },
      "homeScore": 1,
      "awayScore": 0
    },
    {
      "time": 30,
      "incidentType": "card",
      "incidentClass": "yellow",
      "isHome": false,
      "player": { "id": 234567, "name": "Fred" },
      "playerName": "Fred"
    },
    {
      "time": 55,
      "incidentType": "card",
      "incidentClass": "yellowRed",
      "isHome": false
    },
    {
      "time": 70,
      "incidentType": "goal",
      "incidentClass": "penalty",
      "isHome": true,
      "player": { "id": 145020, "name": "Mauro Icardi" }
    }
  ]
}
```
- **Kritik Alanlar:**
  - `incidentType`: `"goal"` | `"card"` | `"substitution"` | `"varDecision"` | `"injuryTime"` | `"period"`
  - `incidentClass` (goal): `"regular"` | `"penalty"` | `"ownGoal"` | `"penaltyMissed"`
  - `incidentClass` (card): `"yellow"` | `"yellowRed"` | `"red"`
  - `assist1`: Asist yapan oyuncunun nesnesi (boolean değil; varlığı asist olduğunu gösterir)

---

### 2.4. Kadro ve Oyuncu Reytingleri (Lineups)
- **URL:** `GET /event/{id}/lineups`
- **Yanıt:**
```json
{
  "home": {
    "formation": "4-2-3-1",
    "players": [
      {
        "player": {
          "id": 14022,
          "name": "Fernando Muslera",
          "shortName": "Muslera",
          "position": "G"
        },
        "shirtNumber": 1,
        "substitute": false,
        "position": "GK",
        "statistics": {
          "rating": 7.8,
          "saves": 4,
          "touches": 32,
          "minutesPlayed": 90
        }
      },
      {
        "player": { "id": 234567, "name": "Sacha Boey", "position": "D" },
        "shirtNumber": 2,
        "substitute": false,
        "position": "RB"
      }
    ]
  },
  "away": {
    "formation": "4-3-3",
    "players": [...]
  }
}
```
- **Not:**
  - `player.position` string (basit: `"G"`, `"D"`, `"M"`, `"F"`) — metrikler bu alanı kullanır.
  - Üst seviye `position` string (`"GK"`, `"RB"` vs.) — saha yerleşimi için.
  - `substitute: false` → ilk 11; `substitute: true` → yedek.

---

### 2.5. Şut Haritası (Shotmap) ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /event/{id}/shotmap`
- **Amaç:** xG hesaplamaları, şans golü tespiti, kaleci uzak mesafe kurtarışları.
- **Yanıt:**
```json
{
  "shotmap": [
    {
      "id": 1,
      "player": { "id": 145020, "name": "Icardi" },
      "isHome": true,
      "shotType": "goal",
      "situation": "regular",
      "xg": 0.23,
      "xgot": 0.41,
      "draw": {
        "start": { "x": 85.3, "y": 48.2 },
        "end":   { "x": 100.0, "y": 50.0 }
      }
    },
    {
      "id": 2,
      "isHome": false,
      "shotType": "miss",
      "situation": "corner",
      "xg": 0.05,
      "draw": { "start": { "x": 78.1, "y": 20.0 } }
    },
    {
      "id": 3,
      "isHome": true,
      "shotType": "save",
      "situation": "penalty",
      "xg": 0.76
    }
  ]
}
```
- **Kritik Alanlar:**
  - `shotType`: `"goal"` | `"miss"` | `"save"` | `"block"`
  - `situation`: `"regular"` | `"penalty"` | `"corner"` | `"set-piece"` | `"counter"`
  - `xg`: 0–1 arası beklenen gol değeri
  - `draw.start.x`: 0–100 arası saha koordinatı (x > 83 → ceza sahası içi yaklaşık)
- **Kullanım:** M015, M016, M023, M024, M034, M045, M081, M095, M098, M104

---

### 2.6. Baskı / Momentum Grafiği
- **URL:** `GET /event/{id}/graph`
- **Yanıt:**
```json
{
  "graphPoints": [
    { "minute": 1, "value": 15 },
    { "minute": 15, "value": -30, "type": "away" },
    { "minute": 45, "value": 5 }
  ]
}
```
- **Not:** `value > 0` → ev sahibi baskısı; `value < 0` → deplasman baskısı.

---

### 2.7. H2H Olayları (Geçmiş Maçlar)
- **URL:** `GET /event/{id}/h2h/events`
- **Yanıt:**
```json
{
  "events": [
    {
      "id": 10563456,
      "tournament": { "name": "Süper Lig" },
      "homeTeam": { "id": 3012, "name": "Fenerbahçe" },
      "awayTeam": { "id": 3009, "name": "Galatasaray" },
      "homeScore": { "current": 0, "display": 0 },
      "awayScore": { "current": 3, "display": 3 },
      "startTimestamp": 1673197200,
      "status": { "type": "finished" }
    }
  ]
}
```

---

### 2.8. H2H Özeti (Galibiyet/Beraberlik Sayıları) ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /event/{id}/h2h`
- **Amaç:** Toplam galibiyet/beraberlik sayıları ve menajer H2H özeti (event listesi değil).
- **Yanıt:**
```json
{
  "teamDuel": {
    "homeWins": 12,
    "draws": 7,
    "awayWins": 9
  },
  "managerDuel": {
    "homeWins": 3,
    "draws": 2,
    "awayWins": 1
  }
}
```
- **Not:** `teamDuel` alanı bazen `h2h` olarak gelebilir; `managerDuel` bazen `managerH2h`. Kod çoklu fallback okur.
- **Kullanım:** M119, M120, M121, M127

---

### 2.9. Maç Öncesi İddaa Oranları (Odds)
- **URL:** `GET /event/{id}/odds/1/all`
- **Yanıt:**
```json
{
  "markets": [
    {
      "marketId": 1,
      "marketName": "Full time",
      "choices": [
        { "name": "1", "decimalValue": "2.50" },
        { "name": "X", "decimalValue": "3.30" },
        { "name": "2", "decimalValue": "2.75" }
      ]
    },
    {
      "marketId": 10,
      "marketName": "Total goals",
      "choices": [
        { "name": "Over 2.5", "decimalValue": "1.80" },
        { "name": "Under 2.5", "decimalValue": "2.00" }
      ]
    }
  ]
}
```

---

### 2.10. Eksik / Sakat / Cezalı Oyuncular
- **URL:** `GET /event/{id}/missing-players`
- **UYARI:** API tek düz dizi döner — `home`/`away` olarak bölünmüş DEĞİLDİR. Her kayıtta `team.id` vardır, buna göre filtrelenir.
- **Yanıt:**
```json
{
  "players": [
    {
      "player": { "id": 836412, "name": "Lincoln" },
      "team": { "id": 3012, "name": "Fenerbahçe" },
      "reason": { "severity": "Out", "description": "Injury" },
      "type": "injured"
    },
    {
      "player": { "id": 997423, "name": "Sacha Boey" },
      "team": { "id": 3009, "name": "Galatasaray" },
      "reason": { "severity": "Out", "description": "Suspended" },
      "type": "suspended"
    },
    {
      "player": { "id": 112233, "name": "Dries Mertens" },
      "team": { "id": 3009, "name": "Galatasaray" },
      "reason": { "severity": "Questionable", "description": "Muscle" },
      "type": "doubtful"
    }
  ]
}
```
- **`type` Değerleri:** `"injured"` | `"suspended"` | `"doubtful"` *(eski rehberde yanlış olarak `"missing"` gösterilmişti)*
- **Kullanım:** M077, M078

---

### 2.11. Takım Serileri (Streaks)
- **URL:** `GET /event/{id}/team-streaks`
- **Yanıt:**
```json
{
  "general": [
    {
      "name": "No losses",
      "team": "Galatasaray",
      "teamId": 3009,
      "streak": 8
    },
    {
      "name": "Wins",
      "team": "Galatasaray",
      "teamId": 3009,
      "streak": 4
    },
    {
      "name": "Scoring",
      "team": "Fenerbahçe",
      "teamId": 3012,
      "streak": 6
    },
    {
      "name": "No goals conceded",
      "team": "Fenerbahçe",
      "teamId": 3012,
      "streak": 2
    }
  ],
  "head2head": [
    { "name": "More than 4.5 cards", "streak": 5 }
  ]
}
```
- **Not:** `teamId` sayısal alan API'den gelebilir; kod hem `s.team === teamName` hem de `s.teamId === teamId` ile eşleştirme yapar.
- **Kullanım:** M049, M050, M051, M052

---

### 2.12. Maç Öncesi Form Verisi ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /event/{id}/pregame-form`
- **Amaç:** Her iki takımın son maçlarındaki form verisi.
- **Yanıt:**
```json
{
  "homeTeam": {
    "avgRating": 7.12,
    "position": 1,
    "value": "WWDWW",
    "form": [
      { "result": "W", "homeTeam": { "id": 3009 }, "awayTeam": { "id": 3020 }, "id": 11400001 }
    ]
  },
  "awayTeam": {
    "avgRating": 6.95,
    "position": 2,
    "value": "LWWWW",
    "form": [...]
  }
}
```

---

### 2.13. Kullanıcı Tahmin Oylaması ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /event/{id}/votes`
- **Amaç:** Topluluğun 1/X/2 tahmin oranlarını almak (M135–M137 metrikleri).
- **Yanıt:**
```json
{
  "vote1": 52.3,
  "voteX": 18.7,
  "vote2": 29.0
}
```
- **Kullanım:** M135, M136, M137

---

### 2.14. Maç Menajer Bilgisi ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /event/{id}/managers`
- **Yanıt:**
```json
{
  "homeManager": { "id": 823001, "name": "Okan Buruk" },
  "awayManager": { "id": 823002, "name": "İsmail Kartal" }
}
```
- **Not:** Bu endpoint bazen `null` döner. Kod, `event.homeTeam.manager.id` alanından da manager ID'sini okur.

---

## Bölüm 3: Takım Endpoint'leri

*Tüm takım endpoint'leri `teamId` ile çağrılır. Her iki takım için paralel çalışır.*

---

### 3.1. Takım Temel Bilgisi ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /team/{teamId}`
- **Yanıt:**
```json
{
  "team": {
    "id": 3009,
    "name": "Galatasaray",
    "shortName": "Galatasaray",
    "nameCode": "GAL",
    "manager": { "id": 823001, "name": "Okan Buruk" },
    "venue": { "name": "Rams Park" },
    "tournament": { "name": "Süper Lig" }
  }
}
```

---

### 3.2. Takım Kadrosu ve Piyasa Değerleri ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /team/{teamId}/players`
- **Amaç:** Tam kadro listesi, piyasa değerleri (M087, M088).
- **Yanıt:**
```json
{
  "players": [
    {
      "player": {
        "id": 145020,
        "name": "Mauro Icardi",
        "position": "F",
        "proposedMarketValue": 8000000
      },
      "shirtNumber": 9,
      "substitute": false
    },
    {
      "player": {
        "id": 892341,
        "name": "Barış Alper Yılmaz",
        "position": "F",
        "proposedMarketValue": 12000000
      },
      "shirtNumber": 11
    }
  ]
}
```
- **Kullanım:** M087 (ilk 11 toplam değer), M088 (yedek/starter değer oranı)

---

### 3.3. Takımın Son Maçları ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /team/{teamId}/events/last/{page}`
- **`page`:** `0` (en son 10 maç) ve `1` (bir önceki 10 maç) — toplam 20 maç.
- **Yanıt:**
```json
{
  "events": [
    {
      "id": 11400001,
      "tournament": { "name": "Süper Lig", "uniqueTournament": { "id": 52 } },
      "homeTeam": { "id": 3009, "name": "Galatasaray" },
      "awayTeam": { "id": 3020, "name": "Konyaspor" },
      "homeScore": { "current": 3, "display": 3 },
      "awayScore": { "current": 0, "display": 0 },
      "status": { "type": "finished" },
      "startTimestamp": 1702300000
    }
  ]
}
```
- **Kullanım:** M046–M065 (form metrikleri), M090–M095 (tutarlılık, güçlüye gol)

---

### 3.4. Takım Sezon İstatistikleri ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /team/{teamId}/unique-tournament/{tournamentId}/season/{seasonId}/statistics/overall`
- **Amaç:** Takımın sezon geneli istatistiksel profili (M001–M045).
- **Yanıt:**
```json
{
  "statistics": {
    "avgGoals": 2.1,
    "avgConcededGoals": 0.8,
    "avgBallPossession": 58.2,
    "avgShotsOnTarget": 5.3,
    "totalShots": 182,
    "shotsOnTarget": 85,
    "bigChancesCreated": 42,
    "bigChancesMissed": 21,
    "expectedGoals": 1.78,
    "expectedGoalsAgainst": 0.95,
    "cornerKicks": 112,
    "totalCrossesSuccessful": 48,
    "tackles": 320,
    "interceptions": 198,
    "clearances": 244,
    "aerialDuelsWon": 412,
    "accuratePassesPercentage": 84.3
  }
}
```

---

### 3.5. Takımın En İyi Oyuncuları ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /team/{teamId}/unique-tournament/{tournamentId}/season/{seasonId}/top-players/overall`
- **Yanıt:**
```json
{
  "topPlayers": {
    "rating": [
      { "player": { "id": 892341, "name": "Barış Alper Yılmaz" }, "statistics": { "rating": 7.65 } }
    ],
    "goals": [
      { "player": { "id": 145020, "name": "Mauro Icardi" }, "statistics": { "goals": 21 } }
    ],
    "assists": [
      { "player": { "id": 16952, "name": "Dries Mertens" }, "statistics": { "assists": 14 } }
    ],
    "successfulDribbles": [
      { "player": { "id": 892341, "name": "Barış Alper Yılmaz" }, "statistics": { "successfulDribbles": 1.4 } }
    ]
  }
}
```

---

## Bölüm 4: Lig / Turnuva Endpoint'leri

### 4.1. Genel Puan Durumu
- **URL:** `GET /unique-tournament/{id}/season/{seasonId}/standings/total`
- **Yanıt:**
```json
{
  "standings": [
    {
      "tournament": { "name": "Süper Lig", "id": 52 },
      "type": "total",
      "rows": [
        {
          "team": { "id": 3009, "name": "Galatasaray" },
          "position": 1,
          "matches": 38,
          "wins": 33,
          "draws": 3,
          "losses": 2,
          "scoresFor": 92,
          "scoresAgainst": 26,
          "points": 102
        }
      ]
    }
  ]
}
```
- **Kullanım:** M055, M058, M093, M094

---

### 4.2. İç Saha Puan Durumu ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /unique-tournament/{id}/season/{seasonId}/standings/home`
- **Yanıt:** 4.1 ile aynı yapı, sadece ev sahibi maç verileri.
- **Kullanım:** M056

### 4.3. Deplasman Puan Durumu ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /unique-tournament/{id}/season/{seasonId}/standings/away`
- **Yanıt:** 4.1 ile aynı yapı, sadece deplasman maç verileri.
- **Kullanım:** M057

---

### 4.4. Haftanın En İyi Oyuncuları
- **URL:** `GET /unique-tournament/{id}/season/{seasonId}/team-of-the-week/round/{roundId}`
- **Durum:** ⚠️ Endpoint tanımlanmış ama **şu an uygulamada çağrılmıyor**.
- **Yanıt:**
```json
{
  "formation": "4-4-2",
  "players": [
    {
      "player": { "id": 16952, "name": "Edin Džeko" },
      "rating": 8.9,
      "position": { "name": "FW", "x": 80, "y": 60 }
    }
  ]
}
```

---

## Bölüm 5: Oyuncu Endpoint'leri

*Her oyuncu için maç kadrosundaki ilk 11 + ilk 3 yedek (max 14 oyuncu) çağrılır.*

---

### 5.1. Oyuncu Sezon İstatistikleri ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /player/{playerId}/unique-tournament/{tournamentId}/season/{seasonId}/statistics/overall`
- **Amaç:** M066–M095 oyuncu metriklerinin tamamı bu veriye dayanır.
- **Yanıt:**
```json
{
  "statistics": {
    "rating": 7.65,
    "goals": 21,
    "assists": 8,
    "appearances": 35,
    "minutesPlayed": 2845,
    "totalShots": 84,
    "shotsOnTarget": 42,
    "expectedGoals": 18.3,
    "keyPasses": 52,
    "bigChancesCreated": 12,
    "accuratePasses": 689,
    "accuratePassesPercentage": 81.2,
    "totalPasses": 849,
    "successfulDribbles": 48,
    "totalDribbles": 72,
    "failedDribbles": 24,
    "aerialDuelsWon": 38,
    "aerialDuelsLost": 22,
    "saves": 0,
    "goalsConceded": 0,
    "goalsConcededInsideTheBox": 0,
    "savedShotsFromInsideTheBox": 0,
    "errorLeadToGoal": 0,
    "errorsLeadingToGoal": 0,
    "punches": 0,
    "highClaims": 0,
    "totalHighClaim": 0
  }
}
```
- **Kullanım:** M066–M095, M096–M108 (kaleci metrikleri)

---

### 5.2. Oyuncu Nitelikleri (Attribute Overviews) ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /player/{playerId}/attribute-overviews`
- **Yanıt:**
```json
{
  "averageAttributeOverviews": [
    {
      "attacking": 72,
      "technical": 65,
      "tactical": 61,
      "defending": 38,
      "creativity": 58
    }
  ]
}
```
- **Kullanım:** M082 (saldırı), M083 (savunma), M084 (teknik), M106 (kaleci nitelik skoru)

---

### 5.3. Oyuncu Karakteristikleri ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /player/{playerId}/characteristics`
- **Yanıt:**
```json
{
  "positive": ["Strong in the air", "Clinical finisher", "Good movement"],
  "negative": ["Weak on the left foot"]
}
```
- **Kullanım:** M085 (güçlü özellik sayısı / oyuncu ortalaması), M086 (zayıf özellik sayısı / oyuncu ortalaması)

---

## Bölüm 6: Hakem Endpoint'leri

### 6.1. Hakem Sezon İstatistikleri ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /referee/{refereeId}/statistics/seasons`
- **Amaç:** Hakem taraflılığı ve maç karakteristiklerini hesaplamak (M109–M118).
- **Yanıt:**
```json
{
  "statistics": {
    "seasons": [
      {
        "statistics": {
          "gamesPlayed": 28,
          "yellowCards": 98,
          "redCards": 6,
          "yellowCardsPerGame": 3.5,
          "penaltiesAwarded": 9,
          "homeTeamWins": 16,
          "awayTeamWins": 7,
          "goals": 74,
          "goalsPerGame": 2.64,
          "over25": 18,
          "fouls": 312
        }
      }
    ]
  }
}
```
- **Not:** Kod `refereeStats?.statistics?.seasons` veya `refereeStats?.seasons` ile çoklu fallback okur.
- **Kullanım:** M109–M118

---

## Bölüm 7: Menajer Endpoint'leri

### 7.1. Menajer Kariyer Verisi ⚠️ *Önceki rehberde belgelenmemişti*
- **URL:** `GET /manager/{managerId}/career`
- **Amaç:** Menajerle takımın geçmiş birliktelik istatistikleri (M139–M140).
- **Yanıt:**
```json
{
  "career": [
    {
      "team": { "id": 3009, "name": "Galatasaray" },
      "matches": 87,
      "wins": 56,
      "draws": 17,
      "losses": 14,
      "startDate": 1672531200
    },
    {
      "team": { "id": 5678, "name": "Başakşehir" },
      "matches": 42,
      "wins": 22,
      "draws": 10,
      "losses": 10
    }
  ]
}
```
- **Kullanım:** M139 (menajerle bu takımdaki galibiyet oranı), M140 (toplam kariyer tecrübesi)

---

## Bölüm 8: Cache TTL Tablosu

| Kategori | TTL | Endpoint'ler |
|---|---|---|
| `liveEvents` | 30s | `/events/live` |
| `eventDetail` | 5dk | `/event/{id}`, `/event/{id}/statistics`, `/event/{id}/incidents`, `/event/{id}/graph`, `/event/{id}/lineups`, `/event/{id}/shotmap`, `/event/{id}/pregame-form`, `/event/{id}/votes`, `/event/{id}/managers` |
| `odds` | 10dk | `/event/{id}/odds/1/all` |
| `teamLastEvents` | 10dk | `/team/{id}/events/last/{page}` |
| `h2h` | 30dk | `/event/{id}/h2h`, `/event/{id}/h2h/events` |
| `playerStats` | 30dk | `/player/{id}/.../statistics/overall`, `/player/{id}/attribute-overviews`, `/player/{id}/characteristics` |
| `standings` | 1sa | `/unique-tournament/{id}/season/{sId}/standings/{type}` |
| `teamPlayers` | 1sa | `/team/{id}/players`, `/team/{id}`, `/team/{id}/.../statistics/overall`, `/team/{id}/.../top-players/overall` |
| `refereeStats` | 24sa | `/referee/{id}/statistics/seasons` |
| `managerStats` | 24sa | `/manager/{id}/career` |
| `default` | 15dk | Geri kalan tüm endpoint'ler |

---

## Bölüm 9: Mimari Özet

### Uygulama Veri Akışı

```
İstemci (React)
    │
    └─► Express (server.js :3001)
             │
             ├─► data-fetcher.js
             │      ├─► playwright-client.js   ← Cloudflare bypass (Chromium)
             │      └─► sofascore-client.js    ← Yedek HTTPS client
             │
             └─► metrics/*.js   ← 168 metrik hesaplama
                      │
                      └─► advanced-derived.js  ← Poisson modeli, kompozit skorlar
                               │
                               └─► prediction-generator.js  ← Nihai tahmin
```

### Fetch Stratejisi

| Aşama | Endpoint'ler | Strateji |
|---|---|---|
| 1 | `/event/{id}` | Sıralı — ID'ler buradan çıkarılır |
| 2 | 12 maç seviyesi endpoint | `Promise.allSettled` paralel |
| 3 | 8 takım endpoint (her 2 takım × 4) | `Promise.allSettled` paralel |
| 4 | 7 lig endpoint (standings ×3, stats ×2, top-players ×2) | `Promise.allSettled` paralel |
| 5 | Hakem + 2 menajer | Sıralı |
| 6 | Son 3 maçın detayları (incidents + stats + shotmap + graph + lineups) | Her maç için sıralı |
| 7 | Her oyuncunun stats + attributes + characteristics (max 14 oyuncu) | Her oyuncu için sıralı |

> **Not:** `Promise.allSettled` kullanıldığı için herhangi bir endpoint hata verse bile tahmin motoru çalışmaya devam eder. İlgili metrikler `null` döner.

### Geliştirici Notları

1. **Proxy zorunludur.** Tüm API çağrıları Node.js backend üzerinden geçer. Tarayıcıdan doğrudan çağrı yapılamaz (CORS + Cloudflare).
2. **Playwright varsayılan client'tır.** `data-fetcher.js` `playwright-client.js`'i import eder. `sofascore-client.js` (HTTPS) yedek / test senaryoları içindir.
3. **Cache distributed değildir.** Sunucu yeniden başlatıldığında tüm cache sıfırlanır. Production'da Redis entegrasyonu önerilir.
4. **WebSocket kurulmamıştır.** Canlı maç güncellemeleri için endpoint polling yapmak gerekir (`/events/live`, her 30s önerilir).
5. **Rate limit:** Playwright client 200ms aralıkla çalışır. Native HTTPS client 5s bekler. Eğer Playwright bağlantısı kaybedilirse `sofascore-client.js` fallback olarak devreye girer.

### Toplam Endpoint Sayısı

| Kategori | Sayı |
|---|---|
| Maç listesi | 2 |
| Maç seviyesi | 12 |
| Takım | 5 |
| Lig/turnuva | 4 (+ 1 kullanılmayan) |
| Oyuncu | 3 |
| Hakem | 1 |
| Menajer | 1 |
| **Toplam** | **28 aktif** |
