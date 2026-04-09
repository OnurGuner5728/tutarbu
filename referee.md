https://www.sofascore.com/api/v1/referee/129910/events/next/0
https://www.sofascore.com/api/v1/referee/129910/events/last/0
https://www.sofascore.com/api/v1/referee/129910

1. Gelecek/Yaklaşan Maçlar API'si (.../referee/129910/events/next/0)
Amacı: Hakemin (José María Sánchez Martínez) henüz başlamamış, atanmış olduğu gelecek maçlarını listelemek.

Kritik Değişkenler:

events (Array): Gelecek maçların listesi.

status.description: Maçın durumu (Burada hep "Not started" olacaktır).

startTimestamp: Maçın planlanan başlama saati (Unix Timestamp, örn: 1775674800).

homeTeam.name / awayTeam.name: Maçı oynayacak takımların adları (Örn: Paris Saint-Germain - Liverpool).

tournament.name: Maçın ait olduğu organizasyon (Örn: UEFA Champions League).

hasNextPage (Boolean): Listede başka bir sayfa olup olmadığını gösterir (false ise planlanan başka maçı henüz sisteme düşmemiş demektir).

2. Geçmiş/Son Yönettiği Maçlar API'si (.../referee/129910/events/last/0)
Amacı: Hakemin düdük çaldığı en son maçların listesini ve sonuçlarını getirmek.

Kritik Değişkenler:

events (Array): Yönetilen son maçların dizisi.

status.description: Maçın durumu (Genellikle "Ended").

homeTeam.name / awayTeam.name: Oynayan takımlar.

homeScore.current / awayScore.current: Maçın nihai skoru.

homeRedCards / awayRedCards (Integer): Hakem istatistiği için çok önemli. Eğer bu alan varsa, hakem o takıma kırmızı kart göstermiş demektir.

tournament.name: Yönetilen lig/turnuva (LaLiga, Copa del Rey vb.).

3. Hakem Profili ve İstatistikleri API'si (.../referee/129910)
Amacı: Doğrudan hakemin kimlik bilgilerini ve kariyeri boyunca çıkardığı genel kart istatistiklerini getirmek.

Kritik Değişkenler:

referee.name: Hakemin tam adı ("José María Sánchez Martínez").

referee.country.name: Hakemin milliyeti/uyruğu ("Spain").

referee.games: Kariyeri boyunca yönettiği toplam maç sayısı (386).

Kart İstatistikleri:

referee.yellowCards: Kariyerinde gösterdiği toplam sarı kart sayısı (2121).

referee.redCards: Doğrudan (direkt) gösterdiği kırmızı kart sayısı (42).

referee.yellowRedCards: İkinci sarıdan gösterdiği kırmızı kart sayısı (56).

referee.dateOfBirthTimestamp: Doğum tarihi (Unix Timestamp).

referee.firstLeagueDebutTimestamp: Birinci ligdeki ilk maçına çıkış tarihi.

💡 Geliştirici İçin Özet Senaryo:
Eğer bir "Hakem İnceleme Ekranı" yapıyorsan:

En üste Hakem Kartını (3. API - manager yerine referee kullanılarak) koyarsın. Toplam maç, sarı kart ortalaması gibi verileri buradan çekersin.

Ortaya bir Gelecek Maç Atamaları modülü koyar ve 1. API'yi (next/0) kullanırsın.

Alt kısma ise hakemin form durumunu ve kart cömertliğini göstermek için Son Yönettiği Maçlar tablosunu 2. API (last/0) ile eklersin. Özellikle homeRedCards / awayRedCards alanlarını kontrol edip maç listesine ikonlar ekleyebilirsin.

En Çok Karşılaşılan Skor (Skor Dağılımı): * Evet, çıkarılır. İkinci API'deki (last/0) her bir maç için homeScore.current ve awayScore.current değerlerini okuyabilirsin. Bu listeyi döngüye sokup hakemin yönettiği son maçların yüzde kaçının 1-1, yüzde kaçının 2-0 bittiğini, hatta maçların genelde "Alt" mı "Üst" mü (2.5 gol altı/üstü) bittiğini analiz edebilirsin.

Kırmızı Kart Eğilimi:

Evet, çıkarılır. Hem profil API'sinde toplam kariyer kırmızı kartları (redCards: 42, yellowRedCards: 56) var hem de maç listesinde homeRedCards ve awayRedCards verileri var. Buradan ev sahibine mi yoksa deplasman takımına mı daha çok kırmızı kart gösterdiğini hesaplayabilirsin.

Genel Kart Sertliği (Kart Ortalaması):

Evet, çıkarılır. Üçüncü API'deki yellowCards: 2121 değerini games: 386 değerine bölerek hakemin kariyeri boyunca maç başına ortalama 5.49 sarı kart gösterdiğini doğrudan bulabilirsin.