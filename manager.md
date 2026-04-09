https://www.sofascore.com/api/v1/event/{eventId}/managers
https://www.sofascore.com/api/v1/manager/{managerId}/events/last/0
https://www.sofascore.com/api/v1/manager/{managerId}

1. Etkinlik Menajerleri API'si (.../event/{eventId}/managers)
Amacı: Belirli bir maçtaki ev sahibi ve deplasman takımı menajerlerinin ID'lerini ve temel bilgilerini almak. Maç bazlı analizlerde "kim kiminle kapışıyor" sorusunun cevabıdır.

Kritik Değişkenler:

homeManager.id / awayManager.id: Diğer API'lerde kullanılacak benzersiz kimlikler.
homeManager.name / awayManager.name: Menajerlerin adları (Örn: Luis Enrique, Jürgen Klopp).
homeManager.slug / awayManager.slug: URL yapıları için kullanılan metinler.
homeManager.shortName: Kısaltılmış ad.

2. Menajer Son Maçları API'si (.../manager/{managerId}/events/last/0)
Amacı: Bir menajerin son yönettiği maçların sonuçlarını getirerek form durumunu (M139/M140) hesaplamak. /career endpoint'i çoğu zaman 404 döndüğü için, taktiksel form analizi bu liste üzerinden yapılır.

Kritik Değişkenler:

events (Array): Son maçların listesi.
homeScore.current / awayScore.current: Maç sonuçları.
status.description: "Ended" (Bitmiş) kontrolü için kullanılır.
winnerCode: 1 (Ev), 2 (Deplasman), 3 (Beraberlik) — Menajerin takımının kazanıp kazanmadığını hızlıca anlamak için. (Menajerin o maçta hangi takımda olduğunu kontrol etmek şarttır).
startTimestamp: Maçın tarihi.

3. Menajer Profili API'si (.../manager/{managerId})
Amacı: Menajerin kişisel bilgilerini, tercih ettiği dizilişi (formation) ve kariyer geçmişini (varsa) almak.

Kritik Değişkenler:

manager.name: Tam adı.
manager.preferredFormation: Tercih ettiği ana taktik (Örn: "4-3-3", "4-2-3-1"). Kadro workshop'unda varsayılan diziliş için kritiktir.
manager.dateOfBirthTimestamp: Yaş hesabı için.
manager.country.name: Uyruğu.
manager.team.name: Şu an yönettiği takım.

💡 Geliştirici İçin Özet Senaryo:
Eğer bir "Taktiksel Düello" modülü yapıyorsan:

1. API (event-managers) ile her iki hocanın ID'sini çekersin.
2. API (last/0) ile her iki hocanın son 5-10 maç performansını kıyaslarsın. Takımları gol yemeden mi kazanıyor yoksa "kaos futbolu" mu oynatıyorlar? (Gol ortalamaları üzerinden).
Menajerlerin "Maç Başı Puan" (Points Per Match) verisini, son maçlardaki galibiyetleri/beraberlikleri üzerinden kendin hesaplayabilirsin (M139/M140 metrikleri bu şekilde türetilir).
Eğer preferredFormation verisi geliyorsa, prediction-generator'da kadro formasyon fallback'i (4-4-2 yerine) bu gerçek veriyle güncellenmelidir.

Menajer Etkisi (Manager Impact):
Evet, çıkarılır. Menajerin son maçlardaki galibiyet yüzdesi ve tercih ettiği taktik ile mevcut kadronun uyumu (oyuncuların pozisyonları) üzerinden bir "Taktiksel Uyum Skoru" üretilebilir.
