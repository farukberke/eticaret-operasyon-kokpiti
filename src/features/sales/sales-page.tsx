import { getTranslations } from "next-intl/server";

import { container, DEFAULT_ANALYSIS_DAYS, defaultRange } from "@/data/container";
import { CURRENCY, type Locale } from "@/i18n/routing";
import { formatDelta, formatMoney, formatNumber } from "@/lib/format";
import { TrendChart } from "@/ui/charts/trend-chart";
import { Card } from "@/ui/primitives/card";
import { PageHeader } from "@/ui/patterns/page-header";
import { SectionCard } from "@/ui/patterns/section-card";
import { StatTile } from "@/ui/patterns/stat-tile";

export async function SalesPage({ locale }: { locale: Locale }) {
  const range = defaultRange();

  const [sales, profit, t, common, chart] = await Promise.all([
    container.sales.getSummary(range),
    container.profit.getSummary(range),
    getTranslations("sales"),
    getTranslations("common"),
    getTranslations("chart"),
  ]);

  const comparison = common("comparedToPrevious", {
    days: DEFAULT_ANALYSIS_DAYS,
  });

  const chartPoints = sales.daily.map((point, index) => ({
    date: point.date,
    revenue: point.revenue.minor,
    profit: profit.daily[index]?.profit.minor ?? 0,
  }));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", { days: DEFAULT_ANALYSIS_DAYS })}
      />

      <div className="flex flex-col gap-4">
        <Card className="divide-border grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
          <StatTile
            label={t("netRevenue")}
            value={formatMoney(sales.netRevenue, locale)}
            delta={{
              direction: sales.revenueTrend.direction,
              label: formatDelta(sales.revenueTrend.deltaRatio, locale),
              higherIsBetter: true,
            }}
            comparison={comparison}
            sparkline={sales.daily.map((point) => point.revenue.minor)}
          />
          <StatTile
            label={t("grossRevenue")}
            value={formatMoney(sales.grossRevenue, locale)}
          />
          <StatTile
            label={t("orderCount")}
            value={formatNumber(sales.orderCount, locale)}
            delta={{
              direction: sales.orderTrend.direction,
              label: formatDelta(sales.orderTrend.deltaRatio, locale),
              higherIsBetter: true,
            }}
            comparison={comparison}
            sparkline={sales.daily.map((point) => point.orders)}
          />
          <StatTile
            label={t("averageOrderValue")}
            value={formatMoney(sales.averageOrderValue, locale)}
          />
        </Card>

        <SectionCard
          title={t("dailyTitle")}
          description={common("period", { days: DEFAULT_ANALYSIS_DAYS })}
        >
          <TrendChart
            points={chartPoints}
            locale={locale}
            currency={CURRENCY}
            labels={{ revenue: chart("revenue"), profit: chart("profit") }}
            height={320}
          />
        </SectionCard>
      </div>
    </>
  );
}
