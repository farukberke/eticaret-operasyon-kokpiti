import { getTranslations } from "next-intl/server";

import type { ProfitSummary, SalesSummary, Trend } from "@/core/domain";
import { DEFAULT_ANALYSIS_DAYS } from "@/data/container";
import type { Locale } from "@/i18n/routing";
import {
  formatDelta,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPoints,
} from "@/lib/format";
import { Card } from "@/ui/primitives/card";
import { StatTile } from "@/ui/patterns/stat-tile";

/**
 * KPI şeridi — kokpitin ikinci katmanı.
 *
 * Öncelik listesinin **altında** durur, üstünde değil. Klasik panellerin
 * hatası bunu tersine çevirmek: sayılar önce gelince kullanıcı "bu rakam iyi
 * mi kötü mü?" diye düşünmek zorunda kalır. Önce ne yapacağını söyleyip
 * sonra bağlamı vermek, 30 saniye hedefinin kendisidir.
 */
export async function KpiRow({
  sales,
  profit,
  locale,
}: {
  sales: SalesSummary;
  profit: ProfitSummary;
  locale: Locale;
}) {
  const [kpi, common, trend] = await Promise.all([
    getTranslations("kpi"),
    getTranslations("common"),
    getTranslations("trend"),
  ]);

  const comparison = common("comparedToPrevious", {
    days: DEFAULT_ANALYSIS_DAYS,
  });

  /** Ekran okuyucu için: "önceki döneme göre %12,4 arttı". */
  const srDelta = (t: Trend, label: string) =>
    trend("srDelta", { value: label, direction: trend(t.direction) });

  const revenueDelta = formatDelta(sales.revenueTrend.deltaRatio, locale);
  const profitDelta = formatDelta(profit.profitTrend.deltaRatio, locale);
  const orderDelta = formatDelta(sales.orderTrend.deltaRatio, locale);
  const marginDelta = formatPoints(profit.marginDeltaPoints, locale, {
    point: common("point"),
  });

  /** Marj değişiminin yönü puan farkından okunur. */
  const marginDirection =
    profit.marginDeltaPoints === null || Math.abs(profit.marginDeltaPoints) < 0.001
      ? "flat"
      : profit.marginDeltaPoints > 0
        ? "up"
        : "down";

  const revenueSeries = sales.daily.map((point) => point.revenue.minor);
  const profitSeries = profit.daily.map((point) => point.profit.minor);
  const orderSeries = sales.daily.map((point) => point.orders);

  return (
    <Card className="divide-border grid grid-cols-1 divide-y sm:grid-cols-2 sm:divide-x lg:grid-cols-4 lg:divide-y-0">
      <StatTile
        label={kpi("revenue")}
        value={formatMoney(sales.netRevenue, locale)}
        delta={{
          direction: sales.revenueTrend.direction,
          label: revenueDelta,
          higherIsBetter: true,
          srLabel: srDelta(sales.revenueTrend, revenueDelta),
        }}
        comparison={comparison}
        sparkline={revenueSeries}
      />

      <StatTile
        label={kpi("netProfit")}
        value={formatMoney(profit.netProfit, locale)}
        delta={{
          direction: profit.profitTrend.direction,
          label: profitDelta,
          higherIsBetter: true,
          srLabel: srDelta(profit.profitTrend, profitDelta),
        }}
        comparison={comparison}
        sparkline={profitSeries}
      />

      <StatTile
        label={kpi("margin")}
        value={formatPercent(profit.marginRatio, locale)}
        delta={{
          direction: marginDirection,
          label: marginDelta,
          higherIsBetter: true,
        }}
        comparison={comparison}
      />

      <StatTile
        label={kpi("orders")}
        value={formatNumber(sales.orderCount, locale)}
        delta={{
          direction: sales.orderTrend.direction,
          label: orderDelta,
          higherIsBetter: true,
          srLabel: srDelta(sales.orderTrend, orderDelta),
        }}
        comparison={comparison}
        sparkline={orderSeries}
      />
    </Card>
  );
}
