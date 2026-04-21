1) Home-win olasılıklarına isotonic regression veya Platt scaling uygulamak

Senin backtest’te en net problem şu: model ev sahibi galibiyetini sistematik olarak fazla yüksek veriyor. Yani sıralama fena değil, ama olasılık ölçeği şişik. Rapordaki örnekle, model %60 dediğinde gerçekleşme yaklaşık %45, %80 dediğinde yaklaşık %66 çıkıyor. Bu tam bir kalibrasyon sorunu.

Burada amaç “tahmini değiştirmek” değil, olasılığı yeniden ölçeklemek.

Platt scaling daha basit ve daha düzgün bir yaklaşım. Kabaca modelin verdiği ham home-win probability’yi alırsın, bunun üstüne lojistik bir dönüşüm öğrenirsin. Avantajı:

Az veriyle daha stabil çalışır
Fazla oynamaz
Overconfidence’ı yumuşatır

Isotonic regression ise daha serbesttir. Modelin %0.62 dediği yerlerin tarihsel olarak gerçekte kaç geldiğine bakıp monoton bir eşleme öğrenir. Avantajı:

Kalibrasyon eğrisine daha iyi oturabilir
Özellikle sistematik eğrilik varsa güçlüdür

Ama riski de var:

Veri azsa overfit edebilir
176 maçta dikkatli uygulanmalı, 500+ maçta daha güvenilir olur

Pratikte ne yapardım?

Önce Platt scaling denerdim
Sonra daha büyük veriyle isotonic karşılaştırırdım
Değerlendirmeyi accuracy ile değil, özellikle log loss, Brier, calibration curve, ECE ile yapardım

Beklenen sonuç:

Accuracy çok artmayabilir
Ama log loss belirgin iyileşir
Kitapçıya yaklaşma şansı artar
Model “%85” gibi fazla sert tahminleri daha makul seviyeye iner

Senin rapordaki “uç olasılıklarda [0.85, 0.10, 0.05] yerine [0.75, 0.15, 0.10] gibi daha muhafazakâr olmalı” tespitin tam olarak buna işaret ediyor.

2) MAÇ_SONU, TAKTİKSEL_UYUM, DURAN_TOP bloklarını kapatmak veya yeniden yazmak

Burada mesele şu: her feature iyi feature değildir. Bazı bloklar teorik olarak mantıklı görünür ama pratikte sinyal değil gürültü taşır.

Senin ablation ve directional analizde:

DURAN_TOP rastgele altı
TAKTİKSEL_UYUM düşük
MAÇ_SONU açıkça ters yönlü/problemli görünüyor

Bu üç blok için yaklaşım farklı olmalı.

MAÇ_SONU
Bu en problemli olan. DirAcc %34.8; yani neredeyse ters sinyal üretiyor. Bu durumda iki ihtimal var:

feature yanlış tanımlanmış
doğru tanımlı ama ters işaretle modele giriyor
ya da iyi feature ama yanlış pazarı etkiliyor

Ben önce bunu tamamen off yapardım. Çünkü zarar verme ihtimali en yüksek blok bu. Sonra yeniden yazarken şunlara bakardım:

lateGoalRate gerçekten maç sonucu için mi anlamlı, yoksa sadece OU/BTTS için mi?
trailing state yokken geç gol eğilimi anlamsız olabilir
skor bağımlı etkiler pre-match modelde ters çalışıyor olabilir

Yani bu blok muhtemelen 1X2’ye doğrudan değil, daha çok toplam gol, son 15 dk gol, canlı maç motoru gibi yerlere ait.

TAKTİKSEL_UYUM
Bu blok teoride güzel, ama formasyon string’lerinden türeyen birçok taktik feature pratikte çok kaba kalır. Raporun kendisi de taktik analizin formasyon string’e dayalı olmasının sınırlı olduğunu söylüyor.

Sebep şu:

4-3-3 ile 4-2-3-1 kağıt üstünde benzer görünse de davranış tamamen farklı olabilir
Kağıt üstü formasyon maç içi shape’i vermez
Press, rest defense, line height gibi şeyler sadece formasyonla tam anlaşılmaz

Burada önerim:

Bu bloğu ya kapat
Ya da sadece gerçekten işe yarayan alt sinyalleri bırak
Özellikle M177/M178/M179 gibi sonuç bazlı pressing/territorial sinyalleri, salt formation parsing’den daha kıymetli olabilir

DURAN_TOP
Bu da muhtemelen bağlama çok bağımlı. Duran top tehdidi takım gücüyle, hakemle, rakip savunma zaafıyla, oyuncu profiliyle değişir. Sadece corner/free-kick/penalty frekansını almak 1X2 için doğrudan güçlü sinyal üretmeyebilir. Bu yüzden:

ya ağırlığını düşür
ya sadece OU/BTTS gibi pazarlarda kullan
ya da “set-piece finishing quality” gibi daha net alt feature’larla yeniden kur

Özet kararım:

MAÇ_SONU: önce kapat
TAKTİKSEL_UYUM: sadeleştir veya yeniden tasarla
DURAN_TOP: 1X2’den çıkar, alternatif pazarlarda dene

3) LaLiga ve Avrupa kupaları için competition-specific calibration layer eklemek

Lig bazlı breakdown’da çok net bir pattern var:

bazı liglerde iyi
bazı liglerde kötü
özellikle LaLiga ve Europa League bariz sorunlu

Bu şu anlama geliyor:
Modelin global yapısı çalışıyor, ama bazı competition’ların kendi “fiziği” farklı.

Mesela neden olabilir?

LaLiga’da tempo, skor dağılımı, BTTS yapısı, ev sahibi avantajı farklı olabilir
Avrupa kupalarında rotasyon, ilk maç/ikinci maç stratejisi, deplasman yaklaşımı, kadro motivasyonu çok farklı olabilir
Eleme maçları lig maçları gibi davranmaz

Competition-specific calibration layer tam burada işe yarar. Ana model aynı kalır; ama çıktı üstüne yarışma/lige göre ikinci bir düzeltme uygulanır.

Örnek mantık:

Premier League için modelin verdiği home-win %0.62 aynen kalabilir
LaLiga için aynı %0.62 belki tarihsel olarak fazla yüksekse %0.55’e çekilir
Europa League’de beraberlik/upset eğilimi daha yüksekse o sınıflara biraz kütle kaydırılır

Bu iki seviyede yapılabilir:

Basit seviye
Her lig için ayrı calibration curve öğrenirsin.

Daha güçlü seviye
Lig tipine göre meta-feature eklersin:

domestic league
knockout
two-leg tie
continental competition
derby/high variance match

Ben önce basit olanı yapardım:

minimum örneklem şartı koy
veri az liglerde ayrı model değil, shrinkage uygula
örneğin Europa League verisi azsa tamamen ayrı layer yerine “global + partial league adjustment” kullan

Burada kritik nokta şu:
Amaç “LaLiga için ayrı model” kurmak değil. Önce sadece çıktıyı yarışma bağlamına göre kalibre etmek. Çünkü ana sorun büyük ihtimalle base ranking değil, output scaling.

4) 500–1000 maçlık rolling out-of-sample test yapmak

Bu bence en önemli madde.

176 maçlık backtest artık ciddidir, ama yine de modelin gerçekten kalıcı gücünü görmek için daha uzun ve daha sert bir test gerekir. Çünkü futbol modellerinde kısa dönem performansı yanıltıcı olabilir.

“Rolling out-of-sample” şu yüzden önemli:
Modeli bugünün bilgisiyle geçmişe bakarak değil, gerçekten zaman akışına sadık şekilde test edersin.

Doğru kurulum şu mantıkta olur:

gün 1–60 verisiyle calibration/parametre ayarı
gün 61–75 tahmin
sonra pencere kayar
gün 1–75 ile gün 76–90 tahmin
böyle böyle ileri gidersin

Yani her tahmin sadece o tarihte mevcut olabilecek bilgiyle yapılır. Bu, veri sızıntısı riskini düşürür.

Neden 500–1000 maç?
Çünkü o zaman:

lig bazlı sonuçlar daha anlamlı olur
calibration curve daha güvenilir olur
feature’ların katkısı daha net görünür
variance azalır
gerçekten bookmaker’a ne kadar yakın olduğun daha dürüst görünür

Bu testte bakılması gereken ana metrikler:

1X2 Brier
Log loss
RPS
OU/BTTS Brier
calibration by bin
bookmaker closing odds farkı
league-by-league breakdown
edge decile analizi

Özellikle edge decile güzel olur:
Modelin “en güçlü edge” dediği maçlar gerçekten daha mı iyi sonuç veriyor? Eğer modelin top %10 confidence bucket’ı da iyi çalışıyorsa, o zaman sistem sadece ortalamada değil seçimde de değerli demektir.

Ben bunu şöyle çerçevelerim:

176 maçlık test: modelin çalıştığını gösteriyor
500–1000 rolling OOS test: modelin güvenilir olduğunu kanıtlar

En kısa özet:

Kalibrasyon: modelin sertliğini düzeltir
Blok temizliği: zararlı feature’ları ayıklar
Competition layer: lig/turnuva fiziği farklarını emer
Rolling OOS: bunların gerçekten işe yarayıp yaramadığını dürüst biçimde ispatlar

# 118 Statik Değer Bulgusu ve Dinamik Dönüşüm Takibi

Aşağıdaki liste, simülasyon motorundaki hardcoded değerleri ve bunların dinamik dönüşüm durumlarını takip eder.

## [engine/match-simulator.js] (28 Bulgu)
- [x] **B001:** `1.0` (calculateUnitImpact varsayılan birim ağırlığı) -> *Dinamikleştirildi: getUnitFallback (PPG/Rank bazlı) eklendi.*
- [x] **B002:** `0.01` (calculateUnitImpact epsilon/güvenlik payı) -> *Dinamikleştirildi: (leagueAvgGoals / 1000) bazlı EPS değişkenine bağlandı.*
- [x] **B003:** `3, 2, 1, 4` (SIM_BLOCKS metrik ağırlıkları) -> *Dinamikleştirildi: IMPORTANCE seviyelerine bağlandı ve leaguePointDensity (rekabet yoğunluğu) ile ölçeklenen dynamicWeight mekanizması eklendi.*
- [x] **B004:** `90` (Maç süresi normalizasyon böleni) -> *Dinamikleştirildi: baseline.matchMinutes (Youth liglerinde 80, standartta 90) değişkenine bağlandı.*
- [x] **B005:** `0.50` (Nötr possession/topla oynama simetrisi) -> *Dinamikleştirildi: ND.POSSESSION (0.50) merkezine bağlandı ve baseline.possessionBase ile ezilebilir hale getirildi.*
- [x] **B006:** `100` (Yüzdelik ölçekleme katsayısı) -> *Dinamikleştirildi: ND.PERCENT_BASE katsayısına bağlandı.*
- [x] **B007:** `0.75` (Metrik normalizasyon alt sınırı) -> *Dinamikleştirildi: normLimits.MIN (Lig volatilitesine göre 0.60 - 0.75 arası esner) yapıldı.*
- [x] **B008:** `1.35` (Metrik normalizasyon üst sınırı) -> *Dinamikleştirildi: normLimits.MAX (Lig volatilitesine göre 1.35 - 1.60 arası esner) yapıldı.*
- [x] **B009:** `0.3` (Minimum güç/savunma direnci eşiği) -> *Dinamikleştirildi: SIM_CONFIG.LIMITS.POWER.MIN sınırına bağlandı.*
- [x] **B010:** `45` (Devre arası dakika sabiti) -> *Dinamikleştirildi: HT (M/2) formülüyle dinamik süreli maçlara uyarlandı.*
- [x] **B011:** `20` (Erken oyun fazı bitiş dakikası) -> *Dinamikleştirildi: Math.floor(M * 0.22) ile maç süresine bağlandı.*
- [x] **B012:** `75` (Geç oyun fazı başlangıç dakikası) -> *Dinamikleştirildi: Math.floor(M * 0.83) ile maç süresine bağlandı.*
- [x] **B013:** `50` (Nötr gösterge/başarı puanı) -> *Dinamikleştirildi: ND.WIN_PROBABILITY_SYMMETRY (50) merkezine bağlandı.*
- [x] **B014:** `0.05` (Lambda anchor ölçekleme alt sınırı) -> *Dinamikleştirildi: anchorLimits.MIN (Lig volatilitesine göre 0.01 - 0.05 arası) yapıldı.*
- [x] **B015:** `5.0` (Lambda anchor ölçekleme üst sınırı) -> *Dinamikleştirildi: anchorLimits.MAX (Lig volatilitesine göre 5.0 - 10.0 arası) yapıldı.*
- [x] **B016:** `0.10` (Kırmızı kart ceza alt sınırı) -> *Dinamikleştirildi: Lig volatilitesine bağlı _rcMinPenalty formülüne bağlandı.*
- [x] **B017:** `0.60` (Kırmızı kart ceza üst sınırı) -> *Dinamikleştirildi: Lig volatilitesine bağlı _rcMaxPenalty formülüne bağlandı.*

## [engine/simulatorEngine.js] (27 Bulgu)
- [ ] **B029:** `1000` (Simülasyon tur sayısı)
- [ ] **B035:** `0.01` (Matematiksel güvenlik payı)

[... Devamı Gelecek ...]
