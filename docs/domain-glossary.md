# Domain sözlüğü

Kodda ve arayüzde geçen terimlerin tanımı. Bir terimin iki farklı yerde iki farklı
şey ifade etmesi, bir veri ürününü öldüren en sessiz hatadır.

## Para ve kâr

**Brüt ciro** — İskonto ve iade düşülmeden önceki satış tutarı.
`Σ (birim fiyat × adet)`

**Net ciro** — `brüt ciro − iskonto − iade`. Gerçekleşen ciro.

**COGS (ürün maliyeti)** — Satılan malın alış maliyeti. **İade edilen adetler
düşülür**: mal fiziksel olarak rafa döner, gider oluşmaz.

**Net kâr** — `net ciro − COGS − komisyon − kargo − reklam`.

**Marj** — `net kâr / net ciro`. Net ciro sıfırsa `null` ("hesaplanamaz"), `0` değil.

**Puan (yüzde puanı)** — Marj %22'den %18'e düştüyse fark **4 puan**tır, "%18
düşüş" değil. Yüzdenin yüzdesi başka bir sayıdır; arayüz bu ikisini asla
karıştırmaz.

## Envanter

**Satış hızı (velocity)** — Günlük ortalama net satış adedi.
`(satılan − iade) / dönem gün sayısı`

**Stok yeterlilik günü (days of cover)** — `stok / satış hızı`. "Elimdeki stok bu
hızla kaç gün daha yeter". Satıcının kafasındaki soru "kaç adet kaldı" değil,
"ne zaman biter" olduğu için panel bu dilde konuşur.

Satış hızı sıfırsa `null` — "sonsuz gün yeter" demek ölü stoğu gizler.

**Bağlı sermaye (stock value)** — `stok × birim maliyet`. Rafta duran paranın
büyüklüğü.

## Reklam

**ROAS** — `net ciro / reklam harcaması`. 1'in altı, reklamın kendini
karşılamadığı anlamına gelir.

## Sinyal kavramları

**Sinyal (Signal)** — Bir varlık hakkında, para değeri olan, aciliyeti olan bir
gözlem. Risk ve fırsat aynı tipin iki türüdür.

**Aciliyet (urgency, 0–10)** — "Ne zaman canımı yakar?" Yarın tükenecek stok 10,
üç ay sonraki fiyat fırsatı 3.

**Etki (impact, 0–10)** — "Ne kadar büyük?" Risk altındaki paradan **logaritmik**
olarak türetilir.

**Masadaki para (money at stake)** — Risk için kaybedilebilecek, fırsat için
kazanılabilecek tutar. Her kuralın kendi hesabı vardır; hepsi
`rules.config.ts` eşikleriyle sınırlanır.

**Şiddet (severity)** — Aciliyetten türetilir: ≥8 kritik, ≥6 yüksek, ≥4 orta,
altı düşük.

**Kanıt (evidence)** — "Bunu neden söylüyorsun?" sorusunun cevabı. Kod + değerler
olarak taşınır, hazır cümle olarak değil.

**Skor** — `aciliyet × etki`, 0–100 aralığına normalize edilmiş. Öncelik
sıralamasının tek ölçütü.

## Risk kuralları

| Kural               | Tetikleyici                                           |
| ------------------- | ----------------------------------------------------- |
| `STOCKOUT_IMMINENT` | stok yeterlilik günü < 7 **ve** satış hızı > 0        |
| `DEAD_STOCK`        | dönemde 0 satış **ve** bağlı sermaye > ₺2.000         |
| `MARGIN_EROSION`    | marj < %10 **veya** önceki döneme göre ≥ 5 puan düşüş |
| `HIGH_RETURN_RATE`  | iade oranı > %15 **ve** satış ≥ 10 adet               |
| `SELLING_AT_LOSS`   | net kâr ≤ 0 **ve** satış > 0                          |
| `AD_SPEND_LEAK`     | reklam harcaması > 0 **ve** ROAS < 1                  |
| `REVENUE_DROP`      | mağaza cirosu önceki döneme göre < −%20               |

## Fırsat kuralları

| Kural                     | Tetikleyici                                       |
| ------------------------- | ------------------------------------------------- |
| `TRENDING_UP`             | satış hızı > +%30 **ve** dönemde ≥ 20 adet satış  |
| `RESTOCK_WINNER`          | marj ≥ %25 **ve** stok yeterlilik günü 7–21 arası |
| `PRICE_TEST_CANDIDATE`    | marj ≥ %40                                        |
| `HIGH_MARGIN_LOW_ADSPEND` | marj ≥ %25 **ve** reklam payı < %2                |
| `BUNDLE_CANDIDATE`        | iki ürün ≥ 8 siparişte birlikte alınmış           |

`TRENDING_UP` kuralındaki adet tabanı önemli: küçük sayılarda yüzdeler yalan
söyler. Ayda 6 adetten 9 adede çıkmak "%50 büyüme" diye listenin başına
oturmamalı.

## Zaman

**Analiz penceresi** — Varsayılan son 30 gün. 7 gün haftalık dalgalanmada
gürültülü, 90 gün dünün sorununu ortalamanın içinde kaybediyor.

**Önceki dönem** — Analiz penceresiyle **aynı uzunlukta ve bitişik** aralık.
Tüm "geçen döneme göre" karşılaştırmalarının tek tanımı budur.

**Gün anahtarı** — Tarihler `Date` değil, `"YYYY-MM-DD"` metni olarak taşınır.
Panel gün bazında düşünür; `Date` kullanmak sunucu UTC'deyken kullanıcının
İstanbul'da olması nedeniyle "dünün" bir gün kayması riskini getirir.
