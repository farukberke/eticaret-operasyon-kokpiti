import { ProductsPage } from "@/features/products/products-page";
import { readFocusProductId } from "@/features/products/product-focus";
import { resolveLocale } from "@/i18n/locale-param";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Analiz penceresi kokpitteki bağlantılarla `?period=` olarak gelir.
 * `?product=` ise kokpitteki stok uyarısından gelindiğinde hangi satırın
 * vurgulanacağını taşır.
 */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/[locale]/products">) {
  const [locale, query] = await Promise.all([resolveLocale(params), searchParams]);
  const focusProductId = readFocusProductId(query);

  return (
    <ProductsPage
      locale={locale}
      searchParams={query}
      {...(focusProductId ? { focusProductId } : {})}
    />
  );
}
