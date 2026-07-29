import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { AppShell } from "@/features/shell/app-shell";
import { resolveLocale } from "@/i18n/locale-param";
import { routing } from "@/i18n/routing";

import "../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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

/**
 * `<html>`/`<body>` kökü bilinçli olarak burada yaşıyor, ayrı bir
 * `app/layout.tsx` içinde değil: her rota `[locale]` altında yaşıyor
 * (`proxy.ts` her zaman `/tr` veya `/en`'e yönlendiriyor), bu yüzden
 * `<html lang>` yalnızca burada — gerçek `locale` bilindiği yerde —
 * doğru yazılabilir. Next.js kök layout'un `[lang]` klasörüne taşınmasına
 * izin veriyor (bkz. `node_modules/next/dist/docs/01-app/02-guides/
 * internationalization.md`).
 */
export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const locale = await resolveLocale(params);

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <NextIntlClientProvider>
          <AppShell locale={locale}>{children}</AppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
