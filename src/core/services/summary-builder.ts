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

import {
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
function buildDailyPoints(dataset: StoreDataset, range: DateRange): DailyPoint[] {
  const byDate = aggregateDaily(dataset, range);

  return eachDay(range).map((date) => {
    const aggregate = byDate.get(date);
    if (!aggregate) {
      return { date, revenue: ZERO_MONEY, profit: ZERO_MONEY, orders: 0 };
    }
    return {
      date,
      revenue: netRevenueOf(aggregate),
      profit: netProfitOf(aggregate),
      orders: aggregate.orderCount,
    };
  });
}

export function buildSalesSummary(
  dataset: StoreDataset,
  range: DateRange,
): SalesSummary {
  const current = aggregateStore(dataset, range);
  const previous = aggregateStore(dataset, previousPeriod(range));

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

    daily: buildDailyPoints(dataset, range),
  };
}

export function buildProfitSummary(
  dataset: StoreDataset,
  range: DateRange,
): ProfitSummary {
  const current = aggregateStore(dataset, range);
  const previous = aggregateStore(dataset, previousPeriod(range));

  const netRevenue = netRevenueOf(current);
  const netProfit = netProfitOf(current);
  const marginRatio = moneyRatio(netProfit, netRevenue);
  const previousMargin = moneyRatio(netProfitOf(previous), netRevenueOf(previous));

  return {
    range,

    grossRevenue: current.grossRevenue,
    discounts: current.discount,
    refunds: current.refunds,
    netRevenue,

    cogs: current.cogs,
    commission: current.commission,
    shipping: current.shipping,
    adSpend: current.adSpend,

    netProfit,
    marginRatio,

    profitTrend: buildMoneyTrend(netProfit, netProfitOf(previous)),
    marginDeltaPoints:
      marginRatio !== null && previousMargin !== null
        ? marginRatio - previousMargin
        : null,

    daily: buildDailyPoints(dataset, range),
  };
}
