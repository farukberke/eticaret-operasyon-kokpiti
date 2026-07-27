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
 */
export default async function Page({ params }: PageProps<"/[locale]">) {
  const locale = await resolveLocale(params);
  return <CockpitPage locale={locale} />;
}
