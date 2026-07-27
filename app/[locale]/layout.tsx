import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import { AppShell } from "@/features/shell/app-shell";
import { resolveLocale } from "@/i18n/locale-param";
import { routing } from "@/i18n/routing";

/**
 * Maliyet verisi kullanıcıya ait ve çalışma zamanında değişiyor; kâr hesabı
 * da ona bağlı. Bu yüzden sayfalar artık derleme anında dondurulamaz.
 *
 * Statik üretimden vazgeçmek bilinçli: kullanıcıya özel veri gösteren bir
 * SaaS'ta zaten doğru olan bu. Tek satır burada durur, alt rotaların
 * tamamına uygulanır.
 */
export const dynamic = "force-dynamic";

/** Her dil için statik üretim — `/tr` ve `/en` derleme anında hazırlanır. */
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });

  return { title: t("title"), description: t("description") };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const locale = await resolveLocale(params);

  return (
    <NextIntlClientProvider>
      <AppShell locale={locale}>{children}</AppShell>
    </NextIntlClientProvider>
  );
}
