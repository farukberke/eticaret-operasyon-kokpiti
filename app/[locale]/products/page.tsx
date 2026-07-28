import { ProductsPage } from "@/features/products/products-page";
import { resolveLocale } from "@/i18n/locale-param";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/** Analiz penceresi kokpitteki bağlantılarla `?period=` olarak gelir. */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/[locale]/products">) {
  const [locale, query] = await Promise.all([resolveLocale(params), searchParams]);
  return <ProductsPage locale={locale} searchParams={query} />;
}
