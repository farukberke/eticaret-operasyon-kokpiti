import { ProductsPage } from "@/features/products/products-page";
import { resolveLocale } from "@/i18n/locale-param";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function Page({ params }: PageProps<"/[locale]/products">) {
  const locale = await resolveLocale(params);
  return <ProductsPage locale={locale} />;
}
