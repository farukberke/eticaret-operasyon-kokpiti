import { SignalPage } from "@/features/signals/signal-page";
import { resolveLocale } from "@/i18n/locale-param";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/** Analiz penceresi kokpitteki "Tümü →" bağlantısıyla `?period=` olarak gelir. */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/[locale]/priorities">) {
  const [locale, query] = await Promise.all([resolveLocale(params), searchParams]);
  return <SignalPage kind="priorities" locale={locale} searchParams={query} />;
}
