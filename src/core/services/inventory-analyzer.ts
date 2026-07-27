import {
  ZERO_MONEY,
  costStatusOf,
  daysInRange,
  moneyRatio,
  multiplyMoney,
  previousPeriod,
  type DateRange,
  type Money,
  type ProductPerformance,
  type StoreDataset,
} from "../domain";

import type { CostResolver } from "./cost-resolver";
import {
  aggregateByProduct,
  emptyAggregate,
  marginRatioOf,
  netProfitOf,
  netRevenueOf,
} from "./profit-calculator";

/**
 * Ham toplamları, karar verilebilir ürün metriklerine çevirir.
 *
 * En önemli türetilmiş ölçü **stok yeterlilik günü** (days of cover):
 * "elimdeki stok bu hızla kaç gün daha yeter". Satıcının kafasındaki soru
 * "kaç adet kaldı" değil, "ne zaman biter" olduğu için panelin de bu dilde
 * konuşması gerekir.
 */

/** Satış hızı sıfırsa `null` — "sonsuz gün yeter" demek ölü stoğu gizler. */
export function daysOfCoverOf(stock: number, dailyVelocity: number): number | null {
  if (dailyVelocity <= 0) return null;
  return stock / dailyVelocity;
}

/**
 * Bağlı sermaye: elde kalan stoğun alış maliyeti cinsinden değeri.
 *
 * Maliyet bilinmiyorsa `null` — kaç liranın rafta beklediğini bilmiyoruz ve
 * tahmin etmek ölü stok uyarısını uydurma bir tutarla üretirdi.
 */
export function stockValueOf(stock: number, unitCost: Money | null): Money | null {
  if (unitCost === null) return null;
  return multiplyMoney(unitCost, stock);
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
  costs: CostResolver,
): ProductPerformance[] {
  const current = aggregateByProduct(dataset, range, costs);
  const previous = aggregateByProduct(dataset, previousPeriod(range), costs);

  const dayCount = daysInRange(range);
  const previousDayCount = daysInRange(previousPeriod(range));

  return dataset.products.map((product) => {
    const aggregate = current.get(product.id) ?? emptyAggregate(product.id);
    const priorAggregate = previous.get(product.id) ?? emptyAggregate(product.id);

    /**
     * Hiç satışı olmayan ürünlerde toplayıcı "maliyet bilinir" der (hiç satır
     * görmediği için). Ölü stok tespiti bağlı sermayeye ihtiyaç duyduğundan
     * maliyet durumunu bugünün kaydından ayrıca sormamız gerekiyor.
     */
    const todayCost = costs.resolve(product.id, range.to);
    const costKnown = aggregate.costKnown && todayCost.unitCost !== null;
    const measured = { ...aggregate, costKnown };

    const netRevenue = netRevenueOf(aggregate);
    const netProfit = netProfitOf(measured);

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

      costStatus: costStatusOf({
        ...todayCost,
        unitCost: costKnown ? todayCost.unitCost : null,
      }),
      unitCost: todayCost.unitCost,
      commissionRate: todayCost.commissionRate,
      costEffectiveFrom: costs.latestFor(product.id)?.effectiveFrom ?? null,

      netProfit,
      unitProfit:
        netProfit !== null && netUnits > 0
          ? multiplyMoney(netProfit, 1 / netUnits)
          : netProfit !== null
            ? ZERO_MONEY
            : null,
      marginRatio: marginRatioOf(measured),
      returnRate:
        aggregate.unitsSold > 0 ? aggregate.unitsReturned / aggregate.unitsSold : null,
      roas: moneyRatio(netRevenue, aggregate.adSpend),

      dailyVelocity,
      daysOfCover: daysOfCoverOf(product.stock, dailyVelocity),
      previousDailyVelocity:
        previousDayCount > 0 ? previousNetUnits / previousDayCount : 0,
      previousMarginRatio: marginRatioOf(priorAggregate),

      stockValue: stockValueOf(product.stock, costKnown ? todayCost.unitCost : null),
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
