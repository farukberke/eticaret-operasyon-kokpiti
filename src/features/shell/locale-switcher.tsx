"use client";

import { useTranslations } from "next-intl";

import { Link, usePathname } from "@/i18n/navigation";
import { LOCALE_LABELS, routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";

/**
 * Dil değiştirici.
 *
 * `<select>` yerine bağlantı çifti: iki dil için açılır menü fazladan tıklama
 * demek. Ayrıca bağlantılar sunucu tarafında gezinme sağlar — JavaScript
 * yüklenmeden de çalışır.
 *
 * `usePathname` locale ön ekini soyar, `Link` yenisini ekler; kullanıcı
 * bulunduğu sayfada kalır.
 */
export function LocaleSwitcher({ current }: { current: Locale }) {
  const t = useTranslations("common");
  const pathname = usePathname();

  return (
    <div
      className="border-border bg-surface flex items-center gap-0.5 rounded-md border p-0.5"
      role="group"
      aria-label={t("language")}
    >
      {routing.locales.map((locale) => {
        const active = locale === current;
        return (
          <Link
            key={locale}
            href={pathname}
            locale={locale}
            aria-current={active ? "true" : undefined}
            title={LOCALE_LABELS[locale]}
            className={cn(
              "rounded px-2 py-0.5 text-xs font-medium uppercase transition-colors",
              active ? "bg-accent-soft text-accent" : "text-fg-subtle hover:text-fg",
            )}
          >
            {locale}
          </Link>
        );
      })}
    </div>
  );
}
