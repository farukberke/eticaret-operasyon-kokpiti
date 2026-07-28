import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Badge, type BadgeTone } from "@/ui/primitives/badge";

import { missingCostAnchorId } from "./cost-focus";

/**
 * KUYRUK SATIRI — iki ekranın ortak dili.
 *
 * Aynı satır iki yerde görünüyor: maliyet ekranındaki "Önce bunları
 * tamamlayın" bölümünde ve kokpitin en üstündeki görev kartında. İkisi de
 * aynı servisten (`getMissingCostImpacts`) besleniyor; markup da tek yerde
 * durmak zorunda. İkinci bir kopya, "neden öncelikli" cümlesinin bir ekranda
 * değişip diğerinde kalması demekti — kullanıcı aynı işi iki farklı gerekçeyle
 * okuduğunda hangisine inanacağını bilemez.
 *
 * Değişen tek şey **eylem**: maliyet ekranında satırın altında form açılır,
 * kokpitte maliyet ekranına giden bir bağlantı vardır. Bu yüzden eylem bir
 * `ReactNode` olarak dışarıdan verilir; bileşen fonksiyon prop'u almaz ve
 * sunucu bileşeninden de kullanılabilir (bkz. CLAUDE.md kural 8).
 */
export interface MissingCostItemView {
  readonly productId: string;
  readonly name: string;
  /** SKU, varsa barkodla birlikte. */
  readonly identifier: string;

  readonly level: "critical" | "high" | "normal";
  readonly tone: BadgeTone;
  readonly reason: "revenue" | "volume" | "age";

  readonly orders: number;
  readonly lines: number;
  readonly unitsLabel: string;
  readonly revenueLabel: string;
  readonly firstDateLabel: string;
  readonly lastDateLabel: string;
}

export function MissingCostItem({
  row,
  rank,
  action,
  children,
}: {
  row: MissingCostItemView;
  /** Kuyruktaki sırası — kullanıcı yukarıdan aşağı çalışsın diye. */
  rank: number;
  action: ReactNode;
  /** Satırın altında açılan içerik (maliyet formu). */
  children?: ReactNode;
}) {
  const t = useTranslations("costs");

  return (
    <li
      // Çapa: kokpitten gelen bağlantı doğrudan bu satıra iner.
      id={missingCostAnchorId(row.productId)}
      className="border-border bg-surface scroll-mt-4 rounded-lg border p-3"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span
          className="text-fg-subtle tabular w-5 shrink-0 pt-0.5 text-sm font-semibold"
          aria-hidden
        >
          {rank}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-fg truncate text-sm font-medium">{row.name}</p>
            <Badge tone={row.tone}>{t(`priorityLevel.${row.level}`)}</Badge>
          </div>
          <p className="text-fg-subtle text-xs">{row.identifier}</p>

          {/* Asıl mesaj: teknik durum değil, operasyonel sonuç. */}
          <p className="text-fg-muted mt-1.5 text-sm">
            {t("priorityImpact", { orders: row.orders, revenue: row.revenueLabel })}
          </p>

          <p className="text-fg-subtle mt-1 text-xs">
            {t("priorityDetail", {
              units: row.unitsLabel,
              lines: row.lines,
              from: row.firstDateLabel,
              to: row.lastDateLabel,
            })}
          </p>

          <p className="text-fg-subtle mt-0.5 text-xs">
            {t(`priorityReason.${row.reason}`)}
          </p>
        </div>

        {action}
      </div>

      {children && <div className="mt-3">{children}</div>}
    </li>
  );
}
