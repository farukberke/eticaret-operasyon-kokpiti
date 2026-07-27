import { defineRouting } from "next-intl/routing";

/**
 * Dil yapılandırması.
 *
 * URL yolları İngilizce ve sabit (`/tr/products`, `/en/products`). Yolları da
 * çevirmek (`/tr/urunler`) her sayfa için iki ayrı rota ağacı ve iki ayrı
 * canonical URL demek; v1'in kazanacağından fazlasını maliyet olarak getirir.
 * Kullanıcının gördüğü **etiketler** çevrilir, adresler değil.
 */
export const routing = defineRouting({
  locales: ["tr", "en"],
  defaultLocale: "tr",
  // Her zaman ön ek: `/` her zaman `/tr`'ye yönlenir, tek bir doğru adres olur.
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  tr: "Türkçe",
  en: "English",
};

/** Para birimi şimdilik sabit; çok para birimli mağazalar v1 kapsamı dışında. */
export const CURRENCY = "TRY";
