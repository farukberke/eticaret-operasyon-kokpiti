import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

import { CostsPage } from "@/features/costs/costs-page";
import { resolveLocale } from "@/i18n/locale-param";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Sekme başlığı: "Kokpit" değil "Maliyetler".
 *
 * Layout'un `app.title` başlığı tüm alt rotalara miras kalıyordu; birkaç
 * sekme açıkken hangisinin hangi sayfa olduğu ayırt edilemiyordu. Başlık
 * sayfanın kendi sözlüğünden (`costs.title`) gelir — ekrandaki `PageHeader`
 * ile aynı anahtar, dolayısıyla ikisi ayrışamaz.
 */
export async function generateMetadata({
  params,
}: PageProps<"/[locale]/costs">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "costs" });

  return { title: t("title"), description: t("description") };
}

export default async function Page({ params }: PageProps<"/[locale]/costs">) {
  const locale = await resolveLocale(params);
  return <CostsPage locale={locale} />;
}
