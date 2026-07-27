@AGENTS.md

# E-Ticaret Operasyon Kokpiti

Sabah paneli açan bir e-ticaret satıcısı, **bugün ne yapması gerektiğini 30 saniyede**
anlayabilsin. Bu bir "veri gösteren dashboard" değil, **karar veren bir kokpit**.

Tasarım ve kod kararları bu cümleye göre verilir: bir ekran soru sorduruyorsa
("peki şimdi ne yapmalıyım?") tasarım başarısızdır.

## Katman mimarisi (ESLint ile zorlanır)

```
app      → features, ui, core, i18n, lib
features → core, data, ui, i18n, lib     ← her şeyi birleştiren tek katman
data     → core, lib                     ← features ve ui'yi GÖREMEZ
ui       → lib                           ← core, data ve features'ı GÖREMEZ
core     → core, lib                     ← dış paket dahil hiçbir şeye bağlanmaz
```

`npm run lint` bu kuralları kırar. Bir importu geçirmek için kuralı gevşetme —
büyük ihtimalle kod yanlış katmanda duruyordur.

| Katman         | Sorumluluk                                                                                |
| -------------- | ----------------------------------------------------------------------------------------- |
| `src/core`     | Domain tipleri, portlar (arayüz), saf iş mantığı. React/Next/HTTP **bilmez**.             |
| `src/data`     | Portların uygulamaları (v1: mock). `container.ts` hangi adapter'ın aktif olduğunu söyler. |
| `src/features` | Ekran bazlı dikey dilimler. Veriyi `container` üzerinden çeker, `ui` ile çizer.           |
| `src/ui`       | Design system. İş mantığı bilmez, her projede çalışabilir.                                |
| `src/lib`      | Saf yardımcılar (format, cn). En yaprak katman.                                           |
| `src/i18n`     | `tr.json` / `en.json` sözlükleri ve locale yapılandırması.                                |

## Değişmez kurallar

1. **Para `Money` ile taşınır** — kuruş bazlı tamsayı. `number` ile para hesabı yapılmaz;
   float yuvarlaması kâr rakamını bozar.
2. **Metin koda gömülmez** — kullanıcının gördüğü her string `src/i18n/messages/*.json` içinde.
3. **Ham renk yazılmaz** — `#fff`, `rgb()` yasak. Sadece `src/styles/tokens.css`
   içindeki semantik token'lar (`bg-surface`, `text-fg-muted`, `text-danger`…).
4. **Eşik değerleri `rules.config.ts` içinde** — risk/fırsat kurallarındaki sayılar
   servis kodunun içine serpiştirilmez.
5. **Mock veri deterministiktir** — tohumlu PRNG kullanılır. `Math.random()` yasak:
   sunucuda her render farklı veri üretirse hem hydration bozulur hem panel oyuncak gibi hisseder.
6. **Tekrar eden UI yeni bileşen değil, mevcut pattern'dir** — tablo yazmadan önce
   `ui/patterns/data-table.tsx`, kart yazmadan önce `section-card.tsx` dosyasına bak.
7. **`ui` katmanı domain tipi almaz** — `Signal`, `Money` gibi tipler yerine hazır
   metin/sayı alır. Domain → görünüm çevirisi `features` katmanında yapılır
   (`features/signals/signal-view.ts` örnek). Bu, `ui`'yi yeniden kullanılabilir
   tutar ve biçimlendirmenin locale'i bilen yerde kalmasını sağlar.
8. **Fonksiyonlar sunucu→istemci sınırını geçemez.** Bir istemci bileşenine prop
   olarak fonksiyon (kolon `render`, `sortValue`, formatter) veriliyorsa, onu
   çağıran bileşen de `"use client"` olmak zorundadır. Örnek ayrım:
   `product-table.tsx` (sunucu, veriyi hazırlar) + `product-table.client.tsx`
   (istemci, kolonları kurar).

## Next.js 16 notları

- `params` ve `searchParams` **async** — `await props.params`.
- `middleware.ts` kullanılmaz; dosya adı **`proxy.ts`**, export edilen fonksiyon `proxy`.
- Turbopack varsayılan; `next.config.ts` içinde `turbopack` üst seviyede.
- Tip yardımcıları için `npx next typegen` → `PageProps<'/[locale]'>`, `LayoutProps<…>`.

## Komutlar

```bash
npm run dev        # geliştirme sunucusu
npm run verify     # lint + typecheck + test  (commit öncesi bunu çalıştır)
npm run test       # sadece birim testler
npm run build      # üretim derlemesi
```

## v1 kapsamı dışında

Auth, ödeme, gerçek pazaryeri API'si, veritabanı, otomasyon, çok kiracılılık.
Mimaride yerleri ayrıldı (port, `app/api/`, `proxy.ts`, `container.ts`) — ama kod yazılmaz.
