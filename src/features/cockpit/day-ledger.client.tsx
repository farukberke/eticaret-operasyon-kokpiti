"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import type { IsoDate } from "@/core/domain";
import { buildTaskLedger, type LedgerEntry } from "@/core/services/task-ledger";
import { useTasks } from "@/features/tasks/task-state-provider.client";
import { formatMoney, formatNumber } from "@/lib/format";
import { Card } from "@/ui/primitives/card";

/**
 * DÜNÜN DEFTERİ — ürünün kendi faturasını savunduğu satır.
 *
 * Panel bugüne kadar yalnızca yapılacak işleri gösteriyordu. Kullanıcı işleri
 * yapıyor ama panelin işe yarayıp yaramadığını hiç öğrenmiyordu. Yenileme
 * kararı geldiğinde "bu ay korunan ₺340.000" satırı, aylık ücretin yanında
 * duran tek somut kanıt olur.
 *
 * En altta ve kompakt: bugünün işini bitirdikten sonra okunacak bir kapanış
 * notu, kararın önüne geçen bir başlık değil.
 */
function Cell({
  label,
  entry,
  countLabel,
  locale,
  emphasis = false,
}: {
  label: string;
  entry: LedgerEntry;
  countLabel: (count: string) => string;
  locale: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-fg-muted text-xs">{label}</span>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span
          className={
            emphasis
              ? "text-success text-lg leading-none font-semibold"
              : "text-fg text-lg leading-none font-semibold"
          }
        >
          {/* Kuruşsuz: defter toplamları ya büyük ya sıfırdır, "₺0,00" gürültü. */}
          {formatMoney(entry.gain, locale, { decimals: 0 })}
        </span>
        <span className="text-fg-subtle text-xs">
          {countLabel(formatNumber(entry.count, locale))}
        </span>
      </span>
    </div>
  );
}

export function DayLedger({ today, locale }: { today: IsoDate; locale: string }) {
  const t = useTranslations("ledger");
  const { states, loaded } = useTasks();

  const ledger = useMemo(
    () => buildTaskLedger(states.values(), today),
    [states, today],
  );

  /**
   * Hiç iş kapatılmamışsa defter **hiç görünmez**.
   *
   * Yeni kullanıcıya "0 iş · ₺0" göstermek hem moral bozucu hem bilgisiz.
   * İlk tamamlamada ortaya çıkması, özelliğin kendisini bir ödül hâline
   * getiriyor.
   */
  if (!loaded || ledger.month.count === 0) return null;

  return (
    <section>
      <p className="text-fg-subtle mb-1.5 text-xs">{t("title")}</p>
      <Card className="divide-border grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        <Cell
          label={t("yesterday")}
          entry={ledger.yesterday}
          countLabel={(count) => t("taskCount", { count })}
          locale={locale}
        />
        <Cell
          label={t("thisMonth")}
          entry={ledger.month}
          countLabel={(count) => t("taskCount", { count })}
          locale={locale}
          emphasis
        />
      </Card>
    </section>
  );
}
