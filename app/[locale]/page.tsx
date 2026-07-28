import { CockpitPage } from "@/features/cockpit/cockpit-page";
import { resolveLocale } from "@/i18n/locale-param";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Rota dosyaları bilinçli olarak incedir: locale'i çözer ve feature'ı çağırır.
 * Ekranın kendisi `src/features/cockpit` içinde yaşar — böylece Next.js'in
 * dosya sistemi kuralları ürün mantığının yerini belirlemez.
 *
 * `?period=` (ve özel aralıkta `?from=&to=`) analiz penceresini taşır. Durum
 * bileşende değil adreste: sunucu veriyi seçilen aralıkla çeker, bağlantı
 * paylaşılabilir ve yenilemede kaybolmaz.
 */
export default async function Page({ params, searchParams }: PageProps<"/[locale]">) {
  const [locale, query] = await Promise.all([resolveLocale(params), searchParams]);
  return <CockpitPage locale={locale} searchParams={query} />;
}
