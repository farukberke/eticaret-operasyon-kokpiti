# ADR-0001 — Ports & Adapters (Hexagonal) mimarisi

**Tarih:** 2026-07-27
**Durum:** Kabul edildi

## Bağlam

Ürün, ileride Trendyol / Hepsiburada / Shopify gibi pazaryeri API'lerine
bağlanacak. Ancak v1'de **hiçbir API bağlanmayacak**, mock veriyle çalışılacak.

Bu ikilinin naif çözümü, mock veriyi doğrudan bileşenlerin içine gömmek olurdu.
O durumda gerçek entegrasyon geldiğinde her ekranın veri çekme, hesaplama ve
çizim kodu birlikte değişmek zorunda kalırdı — yani v1'in tamamı çöpe giderdi.

## Karar

İş mantığı ve veri erişimi, **portlar** (TypeScript arayüzleri) ile ayrılır.

- `src/core/ports/` altı arayüz tanımlar.
- `src/data/adapters/` bunları uygular.
- `src/data/container.ts` hangi uygulamanın aktif olduğunu söyleyen tek yerdir.
- `src/core` saf TypeScript kalır: React, Next.js, HTTP ve **hiçbir npm paketi**
  bilmez.

Bu kural ESLint ile zorlanır (`eslint-plugin-boundaries`), dokümana bırakılmaz.

Mock adapter'lar hazır cevap döndürmez; üretilmiş veriyi gerçek çekirdek
servislere verip gerçek hesabı yaptırır.

## Sonuçlar

**Olumlu**

- Gerçek entegrasyon geldiğinde değişecek dosya sayısı: **bir** (`container.ts`)
  artı yeni adapter klasörü. Ekranlar ve karar motoru dokunulmaz.
- Karar motoru saf fonksiyonlardan oluştuğu için test edilmesi ucuz: 109 testin
  neredeyse tamamı ağ, DOM veya veritabanı olmadan milisaniyeler içinde koşuyor.
- Aynı motor, ileride LLM tabanlı bir `PriorityPort` uygulamasıyla yan yana
  yaşayabilir; arayüz farkı görmez.

**Olumsuz / maliyet**

- Bir arayüz katmanı fazladan dosya demek. 40 ürünlük bir demo için fazla
  görünebilir; gerekçesi bugünün değil, altıncı ayın maliyeti.
- `core` hiçbir pakete bağlanamadığı için tarih/para yardımcıları elle yazıldı
  (`date-range.ts`, `money.ts`). Bu bilinçli: bu iki dosya toplam ~200 satır ve
  domain'e tam oturuyor.

## Değerlendirilen alternatifler

**Doğrudan veri erişimi (port yok).** En hızlı v1. Reddedildi: entegrasyon günü
tüm ekranların yeniden yazılması gerekirdi.

**Repository pattern (sınıf tabanlı).** Port fikriyle aynı, ama sınıf ve kalıtım
yükü getiriyor. Reddedildi: TypeScript arayüzleri + düz nesneler aynı garantiyi
sıfır çalışma-zamanı maliyetiyle veriyor.

**tRPC / API katmanı ile ayrıştırma.** Ağ sınırı, sürüm uyumu ve serileştirme
yükü getiriyor. Reddedildi: v1'de sunucu bileşenleri veriyi doğrudan çağırıyor,
araya HTTP koymanın bir faydası yok. İleride gerekirse adapter zaten bu işi
yapacak yerde duruyor.
