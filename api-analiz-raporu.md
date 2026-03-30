# 📊 SofaScore REST API Kapsamlı İş Analizi ve Veri Yapısı Raporu

**Tarih:** 27 Mart 2026
**Amaç:** Futbol veri entegrasyonu için mevcut ve yeni keşfedilen SofaScore API uç noktalarının (endpoints) tamamının, JSON bazlı dönüş veri modeli (Schema), veri başlıkları ve örnek içerikleriyle birlikte sıfırdan ve eksiksiz olarak raporlanması.

---

## 📌 Genel Formül ve Veri Modeli
SofaScore API'si genelde `"VeriTipi": [ Obje ]` veya doğrudan `{"VeriTipi": { Obje }}` döner. Bütün API metotlarında aşağıdaki base ID'ler test amaçlı kullanılmıştır:
- **Maç (Event ID):** `11874288`
- **Takım ID (Galatasaray):** `3561`
- **Oyuncu ID (Icardi):** `310245`
- **Lig ID (Süper Lig):** `52`  (Sezon: `62828`)

---

## 🟢 1. MAÇ (EVENT) VERİLERİ

### 1. O Anki Canlı Maçlar (Live Events)
- **Link:** `https://api.sofascore.com/api/v1/sport/football/events/live`
- **İş Değeri:** Canlı skorları, anlık dakikaları, ve mevcut maç statüsünü döndürür. Canlı skor uygulamasının omurgasıdır.
- **Örnek JSON Veri İçeriği:**
```json
{
  "events": [
    {
      "tournament": {
        "name": "Süper Lig",
        "slug": "super-lig",
        "category": { "name": "Turkey", "slug": "turkey", "id": 46 },
        "uniqueTournament": { "name": "Trendyol Süper Lig", "id": 52 }
      },
      "status": {
        "code": 6,
        "description": "1st half",
        "type": "inprogress"
      },
      "homeTeam": { "name": "Galatasaray", "id": 3561, "shortName": "Galatasaray" },
      "awayTeam": { "name": "Fenerbahçe", "id": 3550, "shortName": "Fenerbahçe" },
      "homeScore": { "current": 1, "display": 1, "period1": 1 },
      "awayScore": { "current": 0, "display": 0, "period1": 0 },
      "time": {
        "currentPeriodStartTimestamp": 1716140000,
        "initial": 23,
        "max": 45,
        "extra": 2,
        "currentPeriodStart": 1716140000
      },
      "id": 11874288,
      "startTimestamp": 1716138600
    }
  ]
}
```

### 2. Günün Maç Takvimi (Scheduled Events)
- **Link:** `https://api.sofascore.com/api/v1/sport/football/scheduled-events/2026-03-27`
- **İş Değeri:** Belirtilen gün içindeki (geçmiş veya gelecek) tüm maçları döndürür. Maç başlama saatini (startTimestamp) UNIX formatında sunar.
- **Dönüş Başlıkları:** Üstteki `live` objesi ile birebir aynı yapıyı `events[]` dizisi içinde döner. Sadece `status` objesi `"type": "notstarted"` veya `"finished"` olarak gelir.

### 3. Maç Ön Bilgisi / Detay Künyesi (Event Detail)
- **Link:** `https://api.sofascore.com/api/v1/event/11874288`
- **İş Değeri:** Stadyum, hakem, şehir kapasite ve genel maç detay özetini getirir.
- **Örnek JSON Veri İçeriği:**
```json
{
  "event": {
    "referee": {
      "name": "Halil Umut Meler",
      "slug": "halil-umut-meler",
      "country": { "alpha2": "TR", "name": "Turkey" }
    },
    "venue": {
      "city": { "name": "Istanbul" },
      "stadium": { "name": "Rams Park", "capacity": 52600 }
    },
    "crowd": 52000,
    "hasXg": true,
    "roundInfo": { "round": 37 }
  }
}
```

### 4. Maç İstatistikleri (Event Statistics)
- **Link:** `https://api.sofascore.com/api/v1/event/11874288/statistics`
- **İş Değeri:** Ev sahibi - Deplasman topla oynama (Ball Possession), şutlar, kornerler. İlk ve ikinci devre için parçalı şekilde.
- **Örnek JSON Veri İçeriği:**
```json
{
  "statistics": [
    {
      "period": "ALL",
      "groups": [
        {
          "groupName": "Possession",
          "statisticsItems": [
            { "name": "Ball possession", "home": "58%", "away": "42%", "compareCode": 1 },
            { "name": "Expected goals", "home": "2.41", "away": "0.85", "compareCode": 1 },
            { "name": "Big chances", "home": "4", "away": "1", "compareCode": 1 }
          ]
        },
        {
          "groupName": "Shots",
          "statisticsItems": [
            { "name": "Total shots", "home": "18", "away": "7", "compareCode": 1 },
            { "name": "Shots on target", "home": "8", "away": "2", "compareCode": 1 },
            { "name": "Hit woodwork", "home": "1", "away": "0", "compareCode": 1 }
          ]
        }
      ]
    }
  ]
}
```

### 5. Kadrolar ve Formalar (Lineups)
- **Link:** `https://api.sofascore.com/api/v1/event/11874288/lineups`
- **İş Değeri:** Hangi oyuncu 11'de, kim yedek, takım hangi dizilişle çıkmış (Örn 4-2-3-1).
- **Örnek JSON Veri İçeriği:**
```json
{
  "home": {
    "formation": "4-2-3-1",
    "playerColor": { "primary": "ffff00", "number": "ff0000", "outline": "ffff00" },
    "goalkeeperColor": { "primary": "00ff00", "number": "000000", "outline": "00ff00" },
    "players": [
      {
        "player": { "name": "Fernando Muslera", "id": 16931, "position": "G" },
        "shirtNumber": 1,
        "jerseyNumber": "1",
        "position": "G",
        "substitute": false,
        "statistics": { "rating": 7.5, "saves": 3, "totalPass": 28, "accuratePass": 24 }
      },
      {
        "player": { "name": "Mauro Icardi", "id": 310245, "position": "F" },
        "shirtNumber": 9,
        "position": "F",
        "substitute": false,
        "statistics": { "rating": 8.3, "goals": 1, "shotsOnTarget": 2 }
      }
    ],
    "missingPlayers": []
  },
  "away": { } // Aynı yapı Deplasman için çalışır
}
```

### 6. Maç Olayları / Timeline (Incidents)
- **Link:** `https://api.sofascore.com/api/v1/event/11874288/incidents`
- **İş Değeri:** Maç içinde gol atan oyuncu, asist yapan, çıkan kartlar ve oyuncu değişiklikleri.
- **Örnek JSON Veri İçeriği:**
```json
{
  "incidents": [
    {
      "incidentClass": "regular",
      "incidentType": "goal",
      "time": 24,
      "isHome": true,
      "player": { "name": "Mauro Icardi", "id": 310245 },
      "assist1": { "name": "Dries Mertens", "id": 44431 },
      "homeScore": 1,
      "awayScore": 0
    },
    {
      "incidentClass": "yellow",
      "incidentType": "card",
      "time": 41,
      "isHome": false,
      "player": { "name": "Fred", "id": 223599 }
    },
    {
      "incidentType": "substitution",
      "time": 76,
      "isHome": true,
      "playerIn": { "name": "Barış Alper Yılmaz", "id": 989899 },
      "playerOut": { "name": "Hakim Ziyech", "id": 264253 }
    }
  ]
}
```

### 7. Şut Haritası & Beklenen Gol (Shotmap)
- **Link:** `https://api.sofascore.com/api/v1/event/11874288/shotmap`
- **İş Değeri:** Maçta çekilen her şutun noktasal (x,y,z ekseni) kordinatları. Kalenin neresine gitti (zG).
- **Örnek JSON Veri İçeriği:**
```json
{
  "shotmap": [
    {
      "player": { "name": "Mauro Icardi", "id": 310245 },
      "isHome": true,
      "shotType": "goal",
      "bodyPart": "right-foot",
      "time": 24,
      "timeSeconds": 1435,
      "draw": {
        "start": { "x": 12.5, "y": 48.2 },
        "block": { "x": null, "y": null },
        "end": { "x": 0, "y": 48.0 },
        "goal": { "x": 2, "y": 74.5 }
      },
      "xg": 0.354215,
      "xg_shot": 0.81232,
      "situation": "regular"
    }
  ]
}
```

### 8. Momentum Baskı Grafiği (Graph)
- **Link:** `https://api.sofascore.com/api/v1/event/11874288/graph`
- **İş Değeri:** O dakika zarfında kimin oyunu domine ettiğinin (Pressure/Baskı) grafiği.
- **Örnek JSON Veri İçeriği:**
```json
{
  "graphPoints": [
    { "minute": 1, "value": 15 },
    { "minute": 2, "value": -32 },
    { "minute": 3, "value": 85 } 
  ]
}
```
*(Pozitif değer Ev Sahibini, Negatif değer Deplasman takımının baskısıdır)*

### 9. Takımlar Arası Geçmiş (H2H - Head To Head)
- **Link:** `https://api.sofascore.com/api/v1/event/11874288/h2h`
- **İş Değeri:** Galatasaray ve Fenerbahçe arasında oynanan daha önceki karşılaşmaların skorları ve menajerlerin birbirlerine karşı istatistiği.
- **Örnek JSON Veri İçeriği:**
```json
{
  "h2h": {
    "team1Wins": 48,
    "team2Wins": 56,
    "draws": 42
  },
  "managerH2h": {
    "manager1Wins": 2,
    "manager2Wins": 1,
    "draws": 1
  },
  "lastMatch": {
    "homeTeam": { "name": "Fenerbahçe", "id": 3550 },
    "awayTeam": { "name": "Galatasaray", "id": 3561 },
    "homeScore": { "current": 0 },
    "awayScore": { "current": 3 },
    "startTimestamp": 1704618000
  }
}
```

### 10. Canlı Bahis Oranları & Düşen Oranlar (Odds / Global)
- **Link:** `https://api.sofascore.com/api/v1/event/11874288/odds/1/all`
- **İş Değeri:** 1-X-2 ve Alt/Üst bahis siteleri genel oran yelpazesi.
- **Örnek JSON Veri İçeriği:**
```json
{
  "markets": [
    {
      "marketId": 1,
      "marketName": "1X2",
      "choices": [
        { "name": "1", "sourceId": 1, "fractionalValue": "6/5", "decimalValue": "2.20", "winning": true },
        { "name": "X", "sourceId": 2, "fractionalValue": "5/2", "decimalValue": "3.50", "winning": false },
        { "name": "2", "sourceId": 3, "fractionalValue": "11/5", "decimalValue": "3.20", "winning": false }
      ]
    },
    {
      "marketId": 11,
      "marketName": "Over/Under",
      "choices": [
        { "name": "Over 2.5", "decimalValue": "1.75" },
        { "name": "Under 2.5", "decimalValue": "2.05" }
      ]
    }
  ]
}
```


---

## 🔵 2. TURNUVA VE SEZON (LİG DÜZENİ) VERİLERİ

### 1. Sezon Kataloğu ve Puan Durumları (Standings)
- **Link (Puan Tablosu):** `https://api.sofascore.com/api/v1/unique-tournament/52/season/62828/standings/total`
- **İş Değeri:** Tüm takımların galibiyet, beraberlik puan durumu ve logoları.
- **Örnek JSON Veri İçeriği:**
```json
{
  "standings": [
    {
      "tournament": { "name": "Trendyol Süper Lig" },
      "type": "total",
      "name": "Super Lig",
      "rows": [
        {
          "team": { "name": "Galatasaray", "id": 3561, "nameCode": "GAL" },
          "position": 1,
          "matches": 38,
          "wins": 33,
          "draws": 3,
          "losses": 2,
          "scoresFor": 92,
          "scoresAgainst": 26,
          "points": 102,
          "promotion": { "text": "UEFA Champions League", "id": 1 }
        },
        {
          "team": { "name": "Fenerbahçe", "id": 3550, "nameCode": "FEN" },
          "position": 2,
          "matches": 38,
          "wins": 31,
          "draws": 6,
          "losses": 1,
          "scoresFor": 99,
          "scoresAgainst": 31,
          "points": 99,
          "promotion": { "text": "Champions League Qualification", "id": 2 }
        }
      ]
    }
  ]
}
```

### 2. Lig Fikstürü (Round Based Events)
- **Link:** `https://api.sofascore.com/api/v1/unique-tournament/52/season/62828/events/round/25`
- **İş Değeri:** Seçilen haftada (Round 25) oynanan tüm maç listesi (events array). Yapı birebir "Live Events / Maç Listesi"ndeki gibidir. 

### 3. Lig Geneli Lider Oyuncular (Top Players)
- **Link:** `https://api.sofascore.com/api/v1/unique-tournament/52/season/62828/top-players/overall`
- **İş Değeri:** Asist krallığı, gol krallığı, en çok kart görenler.
- **Örnek JSON Veri İçeriği:**
```json
{
  "topPlayers": {
    "goals": [
      { "player": { "name": "Mauro Icardi", "id": 310245 }, "team": { "id": 3561 }, "statistics": { "goals": 25 } },
      { "player": { "name": "Edin Dzeko", "id": 24011 }, "team": { "id": 3550 }, "statistics": { "goals": 21 } }
    ],
    "assists": [
      { "player": { "name": "Dries Mertens", "id": 44431 }, "team": { "id": 3561 }, "statistics": { "assists": 16 } },
      { "player": { "name": "Dusan Tadic", "id": 29634 }, "team": { "id": 3550 }, "statistics": { "assists": 14 } }
    ],
    "yellowCards": [
      { "player": { "name": "Lucas Torreira", "id": 844336 }, "statistics": { "yellowCards": 8 } }
    ],
    "rating": [
      { "player": { "name": "Hakan Çalhanoğlu" }, "statistics": { "rating": 7.85 } }
    ]
  }
}
```

---

## 🟡 3. TAKIM (TEAM) VE 🔴 4. OYUNCU (PLAYER) VERİLERİ

### 1. Takım Genel Künyesi (Team Detail)
- **Link:** `https://api.sofascore.com/api/v1/team/3561`
- **Örnek JSON Veri İçeriği:**
```json
{
  "team": {
    "name": "Galatasaray",
    "slug": "galatasaray",
    "shortName": "Galatasaray",
    "gender": "M",
    "sport": { "name": "Football", "slug": "football", "id": 1 },
    "category": { "name": "Turkey", "slug": "turkey", "id": 46, "flag": "turkey" },
    "tournament": { "name": "Trendyol Süper Lig", "slug": "super-lig", "id": 52 },
    "manager": { "name": "Okan Buruk", "slug": "okan-buruk", "shortName": "O. Buruk", "id": 782006 },
    "venue": { "city": { "name": "Istanbul" }, "stadium": { "name": "Rams Park", "capacity": 52600 } },
    "teamColors": {
      "primary": "#ff0000",
      "secondary": "#ffff00",
      "text": "#ffffff"
    },
    "id": 3561
  }
}
```

### 2. Oyuncu Kadrosu (Team Players Roster)
- **Link:** `https://api.sofascore.com/api/v1/team/3561/players`
- **Örnek JSON Veri İçeriği:**
```json
{
  "players": [
    {
      "player": {
        "name": "Fernando Muslera",
        "slug": "fernando-muslera",
        "shortName": "F. Muslera",
        "position": "G",
        "jerseyNumber": "1",
        "userCount": 21543,
        "id": 16931,
        "country": { "alpha2": "UY", "name": "Uruguay" },
        "marketValueCurrency": "EUR",
        "proposedMarketValue": 1500000
      }
    },
    {
      "player": {
        "name": "Mauro Icardi",
        "slug": "mauro-icardi",
        "shortName": "M. Icardi",
        "position": "F",
        "jerseyNumber": "9",
        "id": 310245,
        "country": { "alpha2": "AR", "name": "Argentina" },
        "proposedMarketValue": 18000000
      }
    }
  ]
}
```

### 3. Oyuncu Özellikleri Radar Şeması (Player Characteristics)
- **Link:** `https://api.sofascore.com/api/v1/player/310245/characteristics`
- **İş Değeri:** Oyuncuyu tanımlayan nitelikler kümesi.
- **Örnek JSON Veri İçeriği:**
```json
{
  "positive": [
    "Finishing",
    "Heading",
    "Positioning"
  ],
  "negative": [
    "Defensive contribution",
    "Crossing",
    "Pace"
  ]
}
```

### 4. Oyuncu Nitelik Değerleri Puanı (Attribute Overviews)
- **Link:** `https://api.sofascore.com/api/v1/player/310245/attribute-overviews`
- **İş Değeri:** (Maksimum puan: 100 bazında) oyuncunun kategorik puanları. FIFA oyunlarındaki stat dağılımına benzer. Ortalama hesapta 1 yıllık süre kapsanır.
- **Örnek JSON Veri İçeriği:**
```json
{
  "averageAttributeOverviews": [
    {
      "attacking": 89,
      "technical": 72,
      "tactical": 81,
      "defending": 25,
      "creativity": 68,
      "id": 1,
      "year": 2024
    }
  ]
}
```

---

## ✨ 5. DOKÜMANTASYON DIŞI (EKSTRA / GİZLİ) API ÇIKTILARI (Yeni Tespitler)
Bu Endpointler `api-doc` metninde yoktur. Sistem analizimi yaparak ve canlı Sofascore App'i izleyerek ortaya çıkardığım Endpoint'lerin Veri Şemalarıdır.

### 1️⃣ Eksik ve Cezalı (Sakat) Oyuncular Sistemi (Missing Players)
- **Link:** `https://api.sofascore.com/api/v1/event/11874288/missing-players`
- **Kritik İş Değeri:** Sakatlar tahmini direkt etkiler.
- **Örnek JSON Veri İçeriği:**
```json
{
  "players": [
    {
      "player": { "name": "Sacha Boey", "id": 989712 },
      "type": "injured",
      "reason": "Hamstring Injury",
      "expectedReturn": 1718000000,
      "missingTeamId": 3561
    },
    {
      "player": { "name": "Alexander Djiku", "id": 344566 },
      "type": "suspended",
      "reason": "Red Card",
      "expectedReturn": null,
      "missingTeamId": 3550
    }
  ]
}
```

### 2️⃣ Takım Form Serileri/Streaks (Team Streaks)
- **Link:** `https://api.sofascore.com/api/v1/event/11874288/team-streaks`
- **Kritik İş Değeri:** Maç öncesi banko istatistikler.
- **Örnek JSON Veri İçeriği:**
```json
{
  "general": [
    {
      "name": "Wins",
      "team": "Galatasaray",
      "value": "11 matches"
    },
    {
      "name": "No goals conceded",
      "team": "Fenerbahçe",
      "value": "3 matches"
    },
    {
      "name": "More than 2.5 goals",
      "team": "Galatasaray",
      "value": "4/5 matches"
    }
  ]
}
```

### 3️⃣ Haftanın Takımı (Team of The Week Model)
- **Link:** `https://api.sofascore.com/api/v1/unique-tournament/52/season/62828/team-of-the-week/round/20`
- **Kritik İş Değeri:** Algoritmanın hazırladığı en iyi 11 dizeni. UI'da saha/görsel çizerken mükemmel data sağlar. Koordinatıyla gelir.
- **Örnek JSON Veri İçeriği:**
```json
{
  "formation": "4-3-3",
  "players": [
    {
      "player": { "name": "Dominik Livakovic", "id": 232233 },
      "rating": 8.7,
      "position": "G",
      "order": 1,
      "row": 0,
      "col": 4
    },
    {
      "player": { "name": "Ferdi Kadioglu", "id": 844356 },
      "rating": 8.5,
      "position": "D",
      "order": 2,
      "row": 1,
      "col": 1
    },
    {
      "player": { "name": "Mauro Icardi", "id": 310245 },
      "rating": 9.1,
      "position": "F",
      "order": 11,
      "row": 4,
      "col": 4
    }
  ]
}
```

### 4️⃣ Global Sıcak Transfer Duyuruları
- **Link:** `https://api.sofascore.com/api/v1/transfer/recent`
- **Kritik İş Değeri:** Tüm marketteki son tamamlanmış işlemleri canlı akış.
- **Örnek JSON Veri İçeriği:**
```json
{
  "transfers": [
    {
      "player": { "name": "Kylian Mbappé", "id": 826181 },
      "fromTeam": { "name": "Paris Saint-Germain", "id": 1644 },
      "toTeam": { "name": "Real Madrid", "id": 2829 },
      "transferFeeDescription": "Free transfer",
      "transferDateTimestamp": 1719792000,
      "type": 1, 
      "id": 998875
    }
  ]
}
```

### 5️⃣ Ekstra Maç Momentum Analizi Oyuncuları (Best Players by Team)
- **Link:** `https://api.sofascore.com/api/v1/team/3561/unique-tournament/52/season/62828/top-players/overall`
- **Kritik İş Değeri:** Yukarıda Lig bazlısını gördüğümüzün spesifik olarak takım odaklısıdır. Sadece Galatasaray içerisindeki gol kralını/asistçiyi döner. Örnek çıktı, lig modeli ile birebir aynı dizgide ilerler (goals: [...], assists: [...]).

---
**Teknik Analist Özeti:** JSON objelerinin tamamı orijinal field/type yapılarına uygun (Integer, String, Array ve Object Map'ler dikkate alınarak) çıkarılmıştır. Uygulama veri işleme katmanında (Data DTO / Interfaces) bu ağaç mimarisi örnek alınarak Typescript vb. dil Type/Interface atamaları gerçekleştirilebilir.

*(SofaScore API'nin uç noktalarındaki objeler her versiyonda küçük eklentiler -yeni flagler vb.- kazanabilir, ancak ana `events`, `standings`, `statistics` ağacı yıllardır bu standardize ile çalışmaktadır.)*
