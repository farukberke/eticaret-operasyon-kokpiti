import { ProfitPage } from "@/features/profit/profit-page";
import { resolveLocale } from "@/i18n/locale-param";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function Page({ params }: PageProps<"/[locale]/profit">) {
  const locale = await resolveLocale(params);
  return <ProfitPage locale={locale} />;
}
