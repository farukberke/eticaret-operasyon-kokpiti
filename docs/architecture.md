# Mimari

## Ürünün tek cümlesi

> E-ticaret yapan bir kişi sabah bu paneli açtığında **bugün ne yapması gerektiğini
> 30 saniyede** anlayabilsin.

Bu cümle bir pazarlama sloganı değil, mimari kısıt. "Veri gösteren dashboard" ile
"karar veren kokpit" arasındaki fark, kodun neredeyse tamamını belirliyor:
hesaplama ve karar mantığı (`core`) veriden (`data`) ve arayüzden (`ui`) tamamen
ayrık duruyor, çünkü asıl ürün **karar motoru** — arayüz onun vitrini.

## Katmanlar

```
┌──────────────────────────────────────────────────────────┐
│  app/          Next.js rotaları — sadece locale çöz, çağır│
├──────────────────────────────────────────────────────────┤
│  src/features/ Dikey dilimler: kokpit, satış, kâr, ürünler│
├────────────────────────┬─────────────────────────────────┤
│  src/ui/               │  src/core/                      │
│  design system         │  domain + portlar + servisler   │
│  (iş mantığı bilmez)   │  (saf TypeScript)               │
├────────────────────────┴─────────────────────────────────┤
│  src/data/   container.ts → adapters → v1: mock          │
└──────────────────────────────────────────────────────────┘
```

Bağımlılık yönü tek yönlü ve içeriye doğru:

| Katman     | Görebildikleri                                   |
| ---------- | ------------------------------------------------ |
| `app`      | features, ui, core, i18n, lib                    |
| `features` | core, data, ui, i18n, lib                        |
| `data`     | core, lib                                        |
| `ui`       | lib                                              |
| `core`     | core, lib — **dış paket dahil başka hiçbir şey** |

Bu kurallar `eslint.config.mjs` içinde `eslint-plugin-boundaries` ile zorlanır.
`npm run lint` bir ihlalde şu hatayı verir:

```
Katman ihlali: 'ui' katmanı 'core' katmanını içe aktaramaz
`core` saf TypeScript kalmalı — 'clsx' paketi burada kullanılamaz
```

Mimari dokümanda yazan bir temenni değil, derlemede kırılan bir kural.

## Ports & Adapters

`src/core/ports/index.ts` altı arayüz tanımlar: `SalesPort`, `ProfitPort`,
`ProductPort`, `SignalPort`, `PriorityPort`, `ClockPort`.

v1'de bunları `src/data/adapters/mock/` uygular. Kritik nokta: **mock adapter'lar
hazır cevap uydurmaz**. Üretilmiş veriyi çekirdek servislere verir ve gerçek
hesabı yaptırır. Gerçek pazaryeri entegrasyonu geldiğinde:

1. `src/data/adapters/trendyol/` eklenir,
2. `src/data/container.ts` içinde altı satır değişir.

`src/core`, `src/ui` ve `src/features` içinde **tek satır değişmez**.

### Neden `Result<T, E>` yok

Hata modeli bilinçli olarak `Result` tipiyle kurulmadı. Adapter'lar hata durumunda
`throw` eder, Next.js `error.tsx` sınırları yakalar. Bu hem daha az kod hem de
framework'ün kendi mekanizmasıyla uyumlu. v1'de hiçbir adapter hata üretmediği
için kullanılmayan bir soyutlama eklemek "ilk sürüm küçük olsun" kuralına aykırı
olurdu.

## Sinyal — taşıyıcı soyutlama

Risk, fırsat ve öncelik listesi aslında aynı şeyin üç görünümü:
_"bir varlık hakkında, para değeri olan, aciliyeti olan bir gözlem"_.

Bu yüzden tek bir `Signal` tipi (`src/core/domain/signal.ts`) üçüne birden hizmet
eder ve tek bir `SignalCard` bileşeni üç ekranı birden çizer. Bu tek karar,
tahminen 600 satırlık tekrarı baştan siliyor.

### Kanıt (`Evidence`) neden metin değil?

```ts
{ code: "velocityVsStock", values: { perDay: 12, stock: 31, days: 2.6 } }
```

Kanıt hazır cümle olarak değil, **kod + değerler** olarak taşınır:

- `tr` → "günde 12 adet satıyor · 31 adet kaldı · 2,6 gün yeter"
- `en` → "sells 12/day · 31 left · 2.6 days of cover"

Aynı dedektör mantığı iki dili birden besler; çeviri sözlükte yaşar, iş
mantığında değil. Dedektörlerin içinde tek bir kullanıcı metni yoktur.

## Karar motoru

```
Ham veri → ProductPerformance → Dedektörler → Sinyaller → Öncelik motoru
```

| Aşama                            | Dosya                                   |
| -------------------------------- | --------------------------------------- |
| Kâr hesabı, gider dağıtımı       | `core/services/profit-calculator.ts`    |
| Satış hızı, stok yeterlilik günü | `core/services/inventory-analyzer.ts`   |
| 7 risk kuralı                    | `core/services/risk-detector.ts`        |
| 5 fırsat kuralı                  | `core/services/opportunity-detector.ts` |
| Sıralama                         | `core/services/priority-engine.ts`      |
| **Tüm eşikler**                  | `core/services/rules.config.ts`         |

### Skorlama

```
skor = aciliyet(0–10) × etki(0–10)   →  0–100
etki = logaritmik(riskAltındakiPara)
```

Logaritmik ölçek bilinçli: eşit **oranlı** büyümeler eşit puan kazandırır
(₺500→₺5.000 ile ₺50.000→₺500.000 aynı puanı ekler). Doğrusal ölçekte ₺500.000'lik
tek bir kalem listeyi ele geçirir, acil ama küçük işler hiç görünmezdi.

Eşitlik bozucular (para → id) sıranın veriye göre **tamamen belirlenmesini**
garanti eder: aynı veri her zaman aynı listeyi verir.

## Para

Para her zaman `Money` ile taşınır: **kuruş bazlı tamsayı**. `0.1 + 0.2 !== 0.3`
sorunu binlerce satırlık toplamda gözle görülür sapmaya döner.

`allocateMoney` özel olarak önemli: sipariş düzeyindeki giderler (komisyon,
kargo, iskonto) ürünlere pay edilirken naif `tutar × oran` her satırda yuvarlama
artığı bırakır ve parçaların toplamı orijinali tutmaz. "En büyük kalan" yöntemi
`sum(parçalar) === toplam` garantisini verir; test bunu doğrular.

## Determinizm

Mock veri **tohumlu** üreteçle (mulberry32) üretilir. `Math.random()` bu projede
yasak, üç sebeple:

1. Sunucu bileşeni her render'da farklı veri üretirse sayfa yenilendiğinde
   öncelik listesi karışır ve panel oyuncak gibi hissettirir.
2. React hydration uyuşmazlığı çıkar.
3. Testler tutarsızlaşır.

Tohum sabittir (mağazanın "kişiliği" değişmez), tarihler kayar (veri her zaman
bugünde biter). Bir gün içinde sonuç tamamen deterministiktir.

## Sunucu / istemci sınırı

Neredeyse her şey **sunucu bileşeni**. İstemciye inen üç şey var:

| Bileşen      | Neden istemci                       |
| ------------ | ----------------------------------- |
| `SidebarNav` | aktif yolu bilmek (`usePathname`)   |
| `DataTable`  | kolon başlığına tıklayınca sıralama |
| `TrendChart` | Recharts tooltip/crosshair          |

**Fonksiyonlar bu sınırı geçemez.** `DataTable` kolonları `render` ve `sortValue`
fonksiyonları içerdiği için onu çağıran da istemci bileşeni olmak zorunda —
bu yüzden ürün tablosu ikiye ayrılmış durumda:

- `product-table.tsx` (sunucu): çeviri + biçimlendirme, düz veri üretir
- `product-table.client.tsx` (istemci): kolon tanımlarını kurar

Biçimlendirmenin sunucuda bitmesi ayrıca `Intl` iş yükünün tarayıcıya inmemesi
demek.

## Grafik renkleri

Seri renkleri gözle seçilmedi. Renk körlüğü ayrımı, parlaklık bandı, kroma tabanı
ve yüzey kontrastı için doğrulayıcıdan geçirildi:

| Tema | Yüzey     | En kötü CVD ΔE | Normal görüş ΔE |
| ---- | --------- | -------------- | --------------- |
| Açık | `#ffffff` | 27,4           | 32,4            |
| Koyu | `#171b21` | 27,5           | 29,4            |

Hedef eşikler: CVD ≥ 8, normal görüş ≥ 15. Koyu tema `--accent` değeri bu yüzden
L 0,672'den 0,655'e çekildi (veri-görselleştirme parlaklık bandı 0,48–0,67).

Diğer kurallar: tek eksen (asla çift y-ekseni), iki seri için efsane zorunlu,
metin asla seri rengini giymez.

## Sabah özeti — gerçek LLM çağrısı

Tek istisna: `MorningBriefNarratorPort` (`src/core/ports`), yerel bir Ollama
modeline (varsayılan `llama3.1:8b`,
`src/data/adapters/local/ollama-morning-brief-narrator.adapter.ts`) bağlanıp
kural motorunun ürettiği sayıları tek cümlede anlatır.

Bilinçli sınır: model hiçbir karar almaz, hiçbir sayı üretmez — girdisi
zaten hesaplanmış `MorningBrief` özetidir (`core/services/ai-morning-brief.ts`),
çıktısı yalnızca o sayıların doğal dile çevirisidir. Prompt kurma ve model
cevabını temizleme (`core/services/morning-brief-narration.ts`) saf, ağdan
bağımsız fonksiyonlardır — adapter yalnızca HTTP çağrısını yapar. Model
ulaşılamaz/zaman aşımına uğrarsa adapter **throw etmez**, deterministik
`fallbackNarration`a düşer: bu port, dosyanın genelindeki "adapter hata
durumunda throw eder" kuralının bilinçli istisnasıdır (bkz. port yorumu).

Model çıktısı **görüntülenmeden önce reddedilebilir**: Latin dışı bir alfabeden
tek karakter (dil kayması) ya da prompt'un kendi başlıklarının yankısı görülürse
cevap bütünüyle atılır ve şablona düşülür. Varsayılan modelin `qwen2.5:7b`den
`llama3.1:8b`e çekilmesi de bu ölçümün sonucudur — ayrıntı README'de.

## v1 kapsamı dışında

Auth · ödeme · gerçek pazaryeri API'si · veritabanı · otomasyon · çok kiracılılık.

Her biri için mimaride yer ayrıldı (`ports/`, `app/api/`, `proxy.ts`,
`container.ts`) ama kod yazılmadı.
