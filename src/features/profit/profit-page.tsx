import { getTranslations } from "next-intl/server";

import { negateMoney, type Money } from "@/core/domain";
import { container, DEFAULT_ANALYSIS_DAYS, defaultRange } from "@/data/container";
import { CURRENCY, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/cn";
import { formatDelta, formatMoney, formatPercent, formatPoints } from "@/lib/format";
import { TrendChart } from "@/ui/charts/trend-chart";
import { Card } from "@/ui/primitives/card";
import { PageHeader } from "@/ui/patterns/page-header";
import { SectionCard } from "@/ui/patterns/section-card";
import { StatTile } from "@/ui/patterns/stat-tile";

/**
 * Kâr dökümü.
 *
 * Kalemler cirodan net kâra doğru, **hesabın yapıldığı sırayla** listelenir.
 * Amaç kullanıcının "₺2 milyon kâr" rakamını sorgulayabilmesi: hangi kalem
 * ne kadar götürdü sorusuna satır satır cevap verir. Giderler negatif
 * işaretle gösterilir — "Komisyon ₺1.5M" satırı tek başına eklendiği mi
 * çıkarıldığı mı belirsiz kalırdı.
 */
interface BreakdownLine {
  readonly key: string;
  readonly label: string;
  readonly amount: Money;
  /** Ara toplam: kalın ve üstünde çizgiyle ayrılır. */
  readonly subtotal?: boolean;
  readonly deduction?: boolean;
}

export async function ProfitPage({ locale }: { locale: Locale }) {
  const range = defaultRange();

  const [profit, t, common, chart] = await Promise.all([
    container.profit.getSummary(range),
    getTranslations("profit"),
    getTranslations("common"),
    getTranslations("chart"),
  ]);

  const lines: BreakdownLine[] = [
    { key: "grossRevenue", label: t("grossRevenue"), amount: profit.grossRevenue },
    {
      key: "discounts",
      label: t("discounts"),
      amount: profit.discounts,
      deduction: true,
    },
    { key: "refunds", label: t("refunds"), amount: profit.refunds, deduction: true },
    {
      key: "netRevenue",
      label: t("netRevenue"),
      amount: profit.netRevenue,
      subtotal: true,
    },
    { key: "cogs", label: t("cogs"), amount: profit.cogs, deduction: true },
    {
      key: "commission",
      label: t("commission"),
      amount: profit.commission,
      deduction: true,
    },
    { key: "shipping", label: t("shipping"), amount: profit.shipping, deduction: true },
    { key: "adSpend", label: t("adSpend"), amount: profit.adSpend, deduction: true },
    {
      key: "netProfit",
      label: t("netProfit"),
      amount: profit.netProfit,
      subtotal: true,
    },
  ];

  const comparison = common("comparedToPrevious", {
    days: DEFAULT_ANALYSIS_DAYS,
  });

  const marginDirection =
    profit.marginDeltaPoints === null || Math.abs(profit.marginDeltaPoints) < 0.001
      ? "flat"
      : profit.marginDeltaPoints > 0
        ? "up"
        : "down";

  const chartPoints = profit.daily.map((point) => ({
    date: point.date,
    revenue: point.revenue.minor,
    profit: point.profit.minor,
  }));

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="flex flex-col gap-4">
        <Card className="divide-border grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <StatTile
            label={t("netProfit")}
            value={formatMoney(profit.netProfit, locale)}
            delta={{
              direction: profit.profitTrend.direction,
              label: formatDelta(profit.profitTrend.deltaRatio, locale),
              higherIsBetter: true,
            }}
            comparison={comparison}
            sparkline={profit.daily.map((point) => point.profit.minor)}
          />
          <StatTile
            label={t("margin")}
            value={formatPercent(profit.marginRatio, locale)}
            delta={{
              direction: marginDirection,
              label: formatPoints(profit.marginDeltaPoints, locale, {
                point: common("point"),
              }),
              higherIsBetter: true,
            }}
            comparison={comparison}
          />
          <StatTile
            label={t("netRevenue")}
            value={formatMoney(profit.netRevenue, locale)}
            comparison={common("period", { days: DEFAULT_ANALYSIS_DAYS })}
          />
        </Card>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <SectionCard title={t("breakdownTitle")} flush>
            <dl className="px-4 pb-3">
              {lines.map((line) => (
                <div
                  key={line.key}
                  className={cn(
                    "flex items-baseline justify-between gap-4 py-1.5 text-sm",
                    line.subtotal &&
                      "border-border text-fg mt-1 border-t pt-2 font-semibold",
                    !line.subtotal && "text-fg-muted",
                  )}
                >
                  <dt>{line.label}</dt>
                  <dd className="tabular">
                    {formatMoney(
                      line.deduction ? negateMoney(line.amount) : line.amount,
                      locale,
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </SectionCard>

          <SectionCard
            title={t("dailyTitle")}
            description={common("period", { days: DEFAULT_ANALYSIS_DAYS })}
          >
            <TrendChart
              points={chartPoints}
              locale={locale}
              currency={CURRENCY}
              labels={{ revenue: chart("revenue"), profit: chart("profit") }}
              height={300}
            />
          </SectionCard>
        </div>
      </div>
    </>
  );
}
