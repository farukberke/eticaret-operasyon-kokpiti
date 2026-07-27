import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { container, DEFAULT_ANALYSIS_DAYS } from "@/data/container";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { formatFullDate } from "@/lib/format/date";

import { LocaleSwitcher } from "./locale-switcher";
import { SidebarNav } from "./sidebar-nav";

/**
 * Panel kabuğu: sabit sol menü + üst şerit + içerik.
 *
 * Sunucu bileşeni — yalnızca aktif yolu bilmesi gereken menü bağlantıları
 * istemciye iniyor. Tarih, çeviri ve dönem etiketi sunucuda hesaplanıyor.
 *
 * Mobilde sol menü yatay kaydırılabilir bir şeride dönüşüyor: küçük ekranda
 * bir hamburger menü, "30 saniyede karar ver" hedefine bir tıklama ekler.
 */
export async function AppShell({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const [t, common] = await Promise.all([
    getTranslations("app"),
    getTranslations("common"),
  ]);

  const today = container.clock.today();

  return (
    <div className="lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-border bg-surface border-b lg:sticky lg:top-0 lg:h-dvh lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2 px-4 py-3.5">
          <Link href="/" className="text-fg text-sm font-semibold tracking-tight">
            {t("title")}
          </Link>
        </div>
        <SidebarNav className="hidden px-2 pb-4 lg:flex" />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="border-border bg-canvas/85 sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3 backdrop-blur sm:px-6">
          <p className="text-fg-muted text-sm">{formatFullDate(today, locale)}</p>
          <div className="flex items-center gap-3">
            <span className="text-fg-subtle hidden text-xs sm:inline">
              {common("period", { days: DEFAULT_ANALYSIS_DAYS })}
            </span>
            <LocaleSwitcher current={locale} />
          </div>
        </header>

        {/* Mobil gezinme: menü yerine kaydırılabilir şerit. */}
        <div className="border-border overflow-x-auto border-b px-4 py-2 lg:hidden">
          <SidebarNav className="flex-row gap-4 [&>div]:flex-row [&>div]:items-center [&>div>p]:hidden" />
        </div>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
      </div>
    </div>
  );
}
