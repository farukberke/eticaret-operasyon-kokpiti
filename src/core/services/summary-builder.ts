import type { StoreDataset } from "../domain/dataset";
import { eachDay, previousPeriod, type DateRange } from "../domain/date-range";
import type {
  CountTrend,
  DailyPoint,
  MoneyTrend,
  ProfitSummary,
  SalesSummary,
  TrendDirection,
} from "../domain/metrics";
import { ZERO_MONEY, moneyRatio, multiplyMoney, type Money } from "../domain/money";

import type { CostResolver } from "./cost-resolver";
import {
  aggregateCoverage,
  aggregateDaily,
  aggregateStore,
  netProfitOf,
  netRevenueOf,
} from "./profit-calculator";

/**
 * Ham veriyi ekranın beklediği özetlere çevirir.
 *
 * Trend hesabı burada tek yerde yapılır: "önceki eşit uzunlukta dönem"
 * tanımının iki ekranda farklı olması, panelin kendi kendisiyle çelişmesi
 * demek olurdu.
 */

/** Yönü belirlerken küçük dalgalanmaları "sabit" saymak için eşik. */
const FLAT_THRESHOLD = 0.005;

function directionOf(deltaRatio: number | null): TrendDirection {
  if (deltaRatio === null || Math.abs(deltaRatio) < FLAT_THRESHOLD) return "flat";
  return deltaRatio > 0 ? "up" : "down";
}

/** Önceki dönem sıfırsa oran `null` — "sıfırdan artış" yüzdesi tanımsızdır. */
function deltaRatioOf(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

export function buildMoneyTrend(current: Money, previous: Money): MoneyTrend {
  const deltaRatio = deltaRatioOf(current.minor, previous.minor);
  return { current, previous, deltaRatio, direction: directionOf(deltaRatio) };
}

export function buildCountTrend(current: number, previous: number): CountTrend {
  const deltaRatio = deltaRatioOf(current, previous);
  return { current, previous, deltaRatio, direction: directionOf(deltaRatio) };
}

/** Aralıktaki her gün için tek satır. Satışsız günler 0 ile doldurulur — grafik kopmaz. */
function buildDailyPoints(
  dataset: StoreDataset,
  range: DateRange,
  costs: CostResolver,
): DailyPoint[] {
  const byDate = aggregateDaily(dataset, range, costs);

  return eachDay(range).map((date) => {
    const aggregate = byDate.get(date);
    if (!aggregate) {
      return { date, revenue: ZERO_MONEY, profit: ZERO_MONEY, orders: 0 };
    }
    return {
      date,
      revenue: netRevenueOf(aggregate),
      /**
       * Grafikte gün bazında `null` çizilemez. O gün maliyeti eksik bir ürün
       * satıldıysa kâr bilinmiyordur; sıfır çizmek grafiği yalancı yapar ama
       * çizgiyi kesmek de okunmaz kılar. Bu yüzden **grafik yalnızca
       * ölçülebilir ürünleri** gösterir ve kapsam bilgisi özet satırında
       * ayrıca verilir.
       */
      profit: netProfitOf(aggregate) ?? ZERO_MONEY,
      orders: aggregate.orderCount,
    };
  });
}

export function buildSalesSummary(
  dataset: StoreDataset,
  range: DateRange,
  costs: CostResolver,
): SalesSummary {
  const current = aggregateStore(dataset, range, costs);
  const previous = aggregateStore(dataset, previousPeriod(range), costs);

  const netRevenue = netRevenueOf(current);

  return {
    range,
    grossRevenue: current.grossRevenue,
    netRevenue,
    orderCount: current.orderCount,
    unitsSold: current.unitsSold,
    averageOrderValue:
      current.orderCount > 0
        ? multiplyMoney(netRevenue, 1 / current.orderCount)
        : ZERO_MONEY,

    revenueTrend: buildMoneyTrend(netRevenue, netRevenueOf(previous)),
    orderTrend: buildCountTrend(current.orderCount, previous.orderCount),

    daily: buildDailyPoints(dataset, range, costs),
  };
}

export function buildProfitSummary(
  dataset: StoreDataset,
  range: DateRange,
  costs: CostResolver,
): ProfitSummary {
  const current = aggregateStore(dataset, range, costs);
  const previous = aggregateStore(dataset, previousPeriod(range), costs);

  const netRevenue = netRevenueOf(current);

  /**
   * `aggregateStore` yalnızca maliyeti bilinen ürünleri topladığı için kâr
   * her zaman hesaplanabilir. Kapsam dışı kalanlar `coverage` alanında
   * ayrıca raporlanır — sessizce düşürmek, kullanıcıya eksik bir toplamı
   * tam sanmasına yol açardı.
   */
  const netProfit = netProfitOf(current) ?? ZERO_MONEY;
  const previousProfit = netProfitOf(previous) ?? ZERO_MONEY;
  const marginRatio = moneyRatio(netProfit, netRevenue);
  const previousMargin = moneyRatio(previousProfit, netRevenueOf(previous));

  return {
    range,

    grossRevenue: current.grossRevenue,
    discounts: current.discount,
    refunds: current.refunds,
    netRevenue,

    cogs: current.cogs,
    commission: current.commission,
    shipping: current.shipping,
    packaging: current.packaging,
    adSpend: current.adSpend,

    netProfit,
    marginRatio,
    coverage: aggregateCoverage(dataset, range, costs),

    profitTrend: buildMoneyTrend(netProfit, previousProfit),
    marginDeltaPoints:
      marginRatio !== null && previousMargin !== null
        ? marginRatio - previousMargin
        : null,

    daily: buildDailyPoints(dataset, range, costs),
  };
}
