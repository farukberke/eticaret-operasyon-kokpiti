import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing, type Locale } from "./routing";

/**
 * Rota parametresinden geçerli locale'i çözer.
 *
 * Üç işi tek yerde toplar: `params`'ı bekle, geçerliliğini doğrula, statik
 * üretim için istek bağlamına yaz. Yedi sayfanın bu üç satırı tekrar etmesi
 * yerine tek çağrı — ve `Locale` tipine daraltma bedava gelir.
 */
export async function resolveLocale(
  params: Promise<{ locale: string }>,
): Promise<Locale> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  return locale;
}
