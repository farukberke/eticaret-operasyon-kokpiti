import type { StoreDataset } from "../domain/dataset";
import { daysInRange, previousPeriod, type DateRange } from "../domain/date-range";
import { ZERO_MONEY, moneyRatio, type Money } from "../domain/money";
import type { ProductPerformance } from "../domain/product";

import {
  aggregateByProduct,
  netProfitOf,
  netRevenueOf,
  type ProductAggregate,
} from "./profit-calculator";

/**
 * Ham toplamları, karar verilebilir ürün metriklerine çevirir.
 *
 * En önemli türetilmiş ölçü **stok yeterlilik günü** (days of cover):
 * "elimdeki stok bu hızla kaç gün daha yeter". Satıcının kafasındaki soru
 * "kaç adet kaldı" değil, "ne zaman biter" olduğu için panelin de bu dilde
 * konuşması gerekir.
 */

function emptyAggregate(productId: string): ProductAggregate {
  return {
    productId,
    unitsSold: 0,
    unitsReturned: 0,
    grossRevenue: ZERO_MONEY,
    discount: ZERO_MONEY,
    refunds: ZERO_MONEY,
    cogs: ZERO_MONEY,
    commission: ZERO_MONEY,
    shipping: ZERO_MONEY,
    adSpend: ZERO_MONEY,
  };
}

/** Satış hızı sıfırsa `null` — "sonsuz gün yeter" demek ölü stoğu gizler. */
export function daysOfCoverOf(stock: number, dailyVelocity: number): number | null {
  if (dailyVelocity <= 0) return null;
  return stock / dailyVelocity;
}

/** Bağlı sermaye: elde kalan stoğun alış maliyeti cinsinden değeri. */
export function stockValueOf(product: { stock: number; unitCost: Money }): Money {
  return {
    minor: Math.round(product.unitCost.minor * product.stock),
    currency: product.unitCost.currency,
  };
}

/**
 * Katalogdaki her ürün için dönem performansını hesaplar.
 *
 * Hiç satmayan ürünler de listede kalır — ölü stok tespiti tam olarak
 * "listede olup satışı olmayan"ı bulmak demektir.
 */
export function buildProductPerformance(
  dataset: StoreDataset,
  range: DateRange,
): ProductPerformance[] {
  const current = aggregateByProduct(dataset, range);
  const previous = aggregateByProduct(dataset, previousPeriod(range));

  const dayCount = daysInRange(range);
  const previousDayCount = daysInRange(previousPeriod(range));

  return dataset.products.map((product) => {
    const aggregate = current.get(product.id) ?? emptyAggregate(product.id);
    const priorAggregate = previous.get(product.id) ?? emptyAggregate(product.id);

    const netRevenue = netRevenueOf(aggregate);
    const netProfit = netProfitOf(aggregate);

    const netUnits = aggregate.unitsSold - aggregate.unitsReturned;
    const dailyVelocity = dayCount > 0 ? netUnits / dayCount : 0;
    const previousNetUnits = priorAggregate.unitsSold - priorAggregate.unitsReturned;

    return {
      product,

      unitsSold: aggregate.unitsSold,
      unitsReturned: aggregate.unitsReturned,

      grossRevenue: aggregate.grossRevenue,
      netRevenue,
      refunds: aggregate.refunds,

      cogs: aggregate.cogs,
      commission: aggregate.commission,
      shipping: aggregate.shipping,
      adSpend: aggregate.adSpend,

      netProfit,
      marginRatio: moneyRatio(netProfit, netRevenue),
      returnRate:
        aggregate.unitsSold > 0 ? aggregate.unitsReturned / aggregate.unitsSold : null,
      roas: moneyRatio(netRevenue, aggregate.adSpend),

      dailyVelocity,
      daysOfCover: daysOfCoverOf(product.stock, dailyVelocity),
      previousDailyVelocity:
        previousDayCount > 0 ? previousNetUnits / previousDayCount : 0,
      previousMarginRatio: moneyRatio(
        netProfitOf(priorAggregate),
        netRevenueOf(priorAggregate),
      ),

      stockValue: stockValueOf(product),
    } satisfies ProductPerformance;
  });
}

/**
 * Satış hızının önceki döneme göre değişim oranı.
 * Önceki dönemde hiç satış yoksa `null` — sıfırdan artışın yüzdesi yoktur.
 */
export function velocityChangeOf(performance: ProductPerformance): number | null {
  if (performance.previousDailyVelocity <= 0) return null;
  return (
    (performance.dailyVelocity - performance.previousDailyVelocity) /
    performance.previousDailyVelocity
  );
}
