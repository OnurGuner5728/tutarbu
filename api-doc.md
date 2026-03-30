SOFASCORE API
Ücretsiz Endpoint Dokümantasyonu
Base URL: https://api.sofascore.com/api/v1
⚠ Önemli Notlar: Bu endpoint'ler SofaScore'un resmi olmayan, reverse-engineering ile keşfedilmiş API'leridir. Rate limiting uygulanır (25-30 sn aralık önerilir). Cloudflare koruması nedeniyle User-Agent header'ı gerekebilir.

1. Maç (Event) Endpoint'leri
eventId: Maç detay sayfasındaki URL'den veya scheduled-events endpoint'inden bulunur.
Endpoint	Açıklama
/sport/football/events/live	Şu an oynanmakta olan tüm canlı futbol maçlarını döndürür. events[] dizisinde maç bilgisi, skor ve dakika yer alır.
/sport/football/scheduled-events/{YYYY-MM-DD}	Belirtilen tarihteki tüm planlanmış maçları getirir. Tarih formatı: 2025-12-28.
/event/{eventId}	Belirli bir maçın detaylarını döndürür (takımlar, skor, stadyum, hakem, turnuva bilgisi).
/event/{eventId}/statistics	Maçın istatistiklerini getirir: topa sahip olma, şut, pas, korner, faul vb. İlk ve ikinci yarı ayrı listelenir.
/event/{eventId}/lineups	Maçın ilk 11 ve yedek kadrosunu formasyon bilgisiyle döndürür. Her oyuncunun rating ve istatistikleri dahildir.
/event/{eventId}/incidents	Maçtaki tüm olayları listeler: goller, kartlar, oyuncu değişiklikleri, VAR kararları, dakika bilgileriyle birlikte.
/event/{eventId}/shotmap	Maçtaki tüm şutların x-y koordinatları ve xG (beklenen gol) değerlerini döndürür. Shotmap görselleştirmesi için idealdir.
/event/{eventId}/graph	Maçın momentum/baskı grafiğini dakika bazlı döndürür. graphPoints[] dizisinde her dakika için baskı değeri yer alır.
/event/{eventId}/h2h	İki takımın geçmiş karşılaşma istatistiklerini getirir: galibiyet, mağlubiyet, beraberlik sayıları ve son maçlar.
/event/{eventId}/best-players	Maçın en iyi oyuncularını ev sahibi ve deplasman takımı için ayrı ayrı döndürür. Rating bilgisi dahildir.
/event/{eventId}/odds/1/all	Maç için bahis oranlarını getirir: 1X2, handikap, alt/üst oranları farklı bahis sitelerinden derlenir.
/event/{eventId}/highlights	Maçın video özetlerine (highlights) ait linkleri döndürür. Maç sonrası erişilebilir.
/event/{eventId}/managers	Maçta görev yapan teknik direktörlerin bilgilerini döndürür.
/event/{eventId}/pregame-form	Maç öncesi takımların son form durumlarını (WWDLL gibi) getirir.
/event/{eventId}/votes	Kullanıcıların maç için oy dağılımını (ev/deplasman/beraberlik tahminleri) döndürür.
/event/{eventId}/commentary	Maçın canlı yazılı yorumlarını (commentary) dakika bazlı döndürür.
/event/{eventId}/player-heatmap/{playerId}	Belirli bir maçta oyuncunun saha üzerindeki heatmap koordinatlarını döndürür.
/event/{eventId}/average-positions	Maçtaki oyuncuların ortalama pozisyon koordinatlarını getirir (averageX, averageY).

2. Turnuva / Lig Endpoint'leri
tournamentId örnekleri: Premier League=17, La Liga=8, Bundesliga=35, Serie A=23, Ligue 1=34, Süper Lig=52
Endpoint	Açıklama
/unique-tournament/{tournamentId}/seasons	Bir turnuvanın tüm sezonlarını ve sezon ID'lerini listeler. Diğer endpoint'ler için season ID gereklidir.
/unique-tournament/{tournamentId}/season/{seasonId}/standings/total	Sezon puan durumunu döndürür: puan, galibiyet, mağlubiyet, gol averajı. type: total/home/away olarak değiştirilebilir.
/unique-tournament/{tournamentId}/season/{seasonId}/events/round/{round}	Belirli bir haftanın (round) maçlarını listeler. Round numarası 1'den başlar.
/unique-tournament/{tournamentId}/season/{seasonId}/top-players/overall	Sezonun en iyi oyuncularını getirir: en çok gol, asist, rating vb. sıralamaları döndürür.
/unique-tournament/{tournamentId}/season/{seasonId}/team-events/total	Turnuvadaki tüm takımların sezon boyunca oynadığı maçları toplu şekilde döndürür.
/unique-tournament/{tournamentId}/season/{seasonId}/statistics	Lig geneli istatistikleri döndürür: en çok gol atan, en çok asist yapan, en yüksek rating gibi.
/unique-tournament/{tournamentId}/featured-events	Turnuvanın öne çıkan/güncel maçlarını döndürür.
/unique-tournament/{tournamentId}/season/{seasonId}/best-goalscorers	Sezonun en golcü oyuncularını sıralar.
/unique-tournament/{tournamentId}/season/{seasonId}/best-assists	Sezonun en çok asist yapan oyuncularını sıralar.
/unique-tournament/{tournamentId}/image	Turnuvanın logosunu/görselini döndürür (PNG formatında).

3. Takım (Team) Endpoint'leri
teamId örnekleri: Galatasaray=3561, Fenerbahçe=3550, Liverpool=44, Barcelona=2817
Endpoint	Açıklama
/team/{teamId}	Takımın temel bilgilerini döndürür: isim, ülke, stadyum, teknik direktör, renk kodları ve logo bilgisi.
/team/{teamId}/players	Takımın mevcut kadrosunu listeler: her oyuncunun pozisyonu, yaşı, forma numarası ve ülke bilgisi.
/team/{teamId}/unique-tournament/{tId}/season/{sId}/statistics/overall	Takımın belirli bir sezondaki detaylı istatistiklerini döndürür: gol, pas, şut, korner ortalamaları.
/team/{teamId}/events/last/{page}	Takımın son oynadığı maçları sayfalı şekilde döndürür. page=0 en son maçları getirir.
/team/{teamId}/events/next/{page}	Takımın gelecek maçlarını sayfalı şekilde döndürür. page=0 en yakın maçları getirir.
/team/{teamId}/transfers	Takımın transfer geçmişini döndürür: gelen/giden oyuncular, transfer ücreti ve tarihleri.
/team/{teamId}/near-events	Takımın yakın tarihli maçlarını (geçmiş ve gelecek) tek endpoint'te döndürür.
/team/{teamId}/image	Takımın logosunu/armasını döndürür (PNG formatında).
/team/{teamId}/unique-tournament/{tId}/season/{sId}/standings/total	Takımın bulunduğu puan durumu tablosunu döndürür.
/team/{teamId}/results	Takımın geçmişteki tüm maç sonuçlarını getirir.

4. Oyuncu (Player) Endpoint'leri
playerId örnekleri: Salah=159665, Haaland=839956, Icardi=310245. Oyuncu ID'si /search/players/ veya /team/{id}/players ile bulunur.
Endpoint	Açıklama
/player/{playerId}	Oyuncunun tüm temel bilgilerini döndürür: isim, yaş, uyruk, pozisyon, boy, kilo, takım, forma no ve piyasa değeri.
/player/{playerId}/unique-tournament/{tId}/season/{sId}/statistics/overall	Oyuncunun sezon istatistiklerini döndürür: gol, asist, rating, şut, pas, dribling, ikili mücadele vb.
/player/{playerId}/unique-tournament/{tId}/season/{sId}/heatmap/overall	Oyuncunun sezon boyunca saha üzerindeki heatmap koordinatlarını döndürür. Isı haritası oluşturmak için kullanılır.
/player/{playerId}/transfer-history	Oyuncunun tüm transfer geçmişini döndürür: eski takım, yeni takım, transfer ücreti ve tarih.
/player/{playerId}/events/last/{page}	Oyuncunun son oynadığı maçları sayfalı döndürür. page=0 en güncel maçları getirir.
/player/{playerId}/events/next/{page}	Oyuncunun gelecekteki maçlarını sayfalı döndürür.
/player/{playerId}/characteristics	Oyuncunun güçlü ve zayıf yönlerini (strengths/weaknesses) döndürür. SofaScore'un oyuncu profil sayfasındaki radar chartı verisidir.
/player/{playerId}/national-team-statistics	Oyuncunun milli takım istatistiklerini döndürür: maç sayısı, gol, asist.
/player/{playerId}/attribute-overviews	Oyuncunun SofaScore attribute puanlarını döndürür: hücum, defans, pas, fiziksel gibi kategorilerde.
/player/{playerId}/image	Oyuncunun profil fotoğrafını döndürür (PNG formatında).
/player/{playerId}/season-statistics	Oyuncunun tüm sezonlardaki istatistik özetini döndürür.
/player/{playerId}/last-year-summary	Oyuncunun son 1 yıldaki performans özetini getirir.
/player/{playerId}/near-events	Oyuncunun yakın tarihli maçlarını tek seferde döndürür.
/player/{playerId}/media	Oyuncuyla ilgili medya içeriklerini (haberler, videolar) döndürür.

5. Arama (Search) Endpoint'leri
query: Arama terimi doğrudan URL'ye yazılır (URL encoding gerekebilir).
Endpoint	Açıklama
/search/all/{query}	Genel arama yapar: takım, oyuncu, teknik direktör sonuçlarını birlikte döndürür. Örnek: /search/all/salah
/search/teams/{query}	Sadece takımlar arasında arama yapar. Örnek: /search/teams/galatasaray
/search/players/{query}	Sadece oyuncular arasında arama yapar. Örnek: /search/players/haaland

6. Hakem & Teknik Direktör Endpoint'leri
refereeId ve managerId, maç detayından (/event/{eventId}) veya arama ile bulunur.
Endpoint	Açıklama
/referee/{refereeId}	Hakemin temel bilgilerini döndürür: isim, ülke, resim. Hakem ID'si maç detayından (event endpoint) bulunur.
/referee/{refereeId}/statistics/seasons	Hakemin sezon bazlı istatistiklerini getirir: yönettiği maç sayısı, kart ortalaması, penaltı kararları.
/manager/{managerId}	Teknik direktörün bilgilerini döndürür: isim, uyruk, doğum tarihi, mevcut takımı.
/manager/{managerId}/career	Teknik direktörün kariyer geçmişini döndürür: çalıştığı tüm takımlar, tarih aralıkları ve istatistikleri.
/manager/{managerId}/image	Teknik direktörün fotoğrafını döndürür (PNG formatında).

7. Lig Bazlı İstatistik Sıralamaları
fields parametresine örnekler: rating, goals, yellowCards, redCards, assists, expectedGoals, accuratePasses, successfulDribbles
Endpoint	Açıklama
/unique-tournament/{tId}/season/{sId}/statistics?limit=20&order=-rating&accumulation=total&group=summary&fields=...	Lig bazlı oyuncu sıralama istatistiklerini getirir. fields parametresiyle hangi istatistiklerin döneceğini seçebilirsiniz (rating, goals, assists vb.).
/unique-tournament/{tId}/season/{sId}/statistics?accumulation=per90&...	Aynı endpoint ama accumulation=per90 ile 90 dakika başına normalize edilmiş istatistikleri döndürür.
/unique-tournament/{tId}/season/{sId}/statistics?accumulation=perMatch&...	Maç başına normalize edilmiş istatistikleri döndürür.

8. Genel / Kategori Endpoint'leri
Ülke ve turnuva keşfi için kullanılır. Diğer endpoint'lerdeki ID'leri bulmaya yardımcı olur.
Endpoint	Açıklama
/sport/football/categories	Tüm futbol kategorilerini (ülkeleri) ve onların altındaki turnuvaları listeler.
/category/{categoryId}/unique-tournaments	Belirli bir ülkenin/kategorinin turnuvalarını listeler. Örnek: Türkiye için category ID = 46.
/config/unique-tournaments/TR/football	Belirli bir ülke koduna göre popüler turnuvaları döndürür. TR = Türkiye.
/sport/football/top-unique-tournaments	En popüler/büyük futbol turnuvalarını (Premier League, La Liga vb.) listeler.

9. Sık Kullanılan ID Referansları
Lig / Takım	unique-tournament ID	Örnek Season ID
Premier League	17	61627
La Liga	8	61643
Bundesliga	35	61651
Serie A	23	61639
Ligue 1	34	61736
Süper Lig	52	62828
Champions League	7	61644
Europa League	679	61645

10. Gerekli HTTP Headers
User-Agent: Tarayıcı User-Agent string'i kullanın (örn: Mozilla/5.0...). Cloudflare korumasını aşmak için gereklidir.
Accept: application/json
Rate Limit: Her istek arasında en az 25-30 saniye bekleyin, aksi halde IP ban veya 503 hatası alırsınız.
