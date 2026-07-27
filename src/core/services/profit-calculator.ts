import {
  ZERO_MONEY,
  addMoney,
  allocateMoney,
  applyBasisPoints,
  isWithin,
  moneyRatio,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  type DateRange,
  type IsoDate,
  type Money,
  type CostCoverage,
  type StoreDataset,
} from "../domain";

import type { CostResolver } from "./cost-resolver";

/**
 * KÂR HESABI — panelin en çok güvenilmesi gereken sayısı.
 *
 * Zincir:
 *   brüt ciro − iskonto − iade  = net ciro
 *   net ciro − COGS − komisyon − kargo − reklam − paketleme = NET KÂR
 *
 * Maliyet kalemleri artık siparişin üzerinde değil, **maliyet modelinden**
 * gelir ve sipariş tarihine göre çözümlenir. Bunun somut sonucu: kullanıcı
 * maliyetini bugün girse bile 90 günlük geçmişin kârı doğru hesaplanır.
 *
 * İncelikler:
 *
 * 1. **Kargo paket başınadır.** Bir siparişte aynı üründen 3 adet varsa
 *    kargo bir kez sayılır; paketleme ise gerçekten adet başınadır.
 *
 * 2. **İade edilen ürünün maliyeti gider yazılmaz** — mal rafa döner. COGS
 *    net adet (satılan − iade) üzerinden hesaplanır.
 *
 * 3. **Maliyeti bilinmeyen ürün kâr üretmez.** `netProfit` `null` döner ve
 *    mağaza toplamına dahil edilmez. Sıfır yazmak sahte kâr olurdu.
 */

/** Tek bir ürünün bir dönemdeki ham toplamları. */
export interface ProductAggregate {
  readonly productId: string;
  readonly unitsSold: number;
  readonly unitsReturned: number;
  readonly grossRevenue: Money;
  readonly discount: Money;
  readonly refunds: Money;
  readonly cogs: Money;
  readonly commission: Money;
  readonly shipping: Money;
  readonly packaging: Money;
  readonly adSpend: Money;
  /** Maliyet bilinmiyorsa `cogs` anlamsızdır ve kâr hesaplanamaz. */
  readonly costKnown: boolean;
}

/** Mağaza genelinin bir dönemdeki ham toplamları. */
export interface StoreAggregate {
  readonly orderCount: number;
  readonly unitsSold: number;
  readonly grossRevenue: Money;
  readonly discount: Money;
  readonly refunds: Money;
  readonly cogs: Money;
  readonly commission: Money;
  readonly shipping: Money;
  readonly packaging: Money;
  readonly adSpend: Money;
  readonly costKnown: boolean;
}

interface MutableAggregate {
  unitsSold: number;
  unitsReturned: number;
  grossRevenue: Money;
  discount: Money;
  refunds: Money;
  cogs: Money;
  commission: Money;
  shipping: Money;
  packaging: Money;
  adSpend: Money;
  costKnown: boolean;
}

function emptyMutable(): MutableAggregate {
  return {
    unitsSold: 0,
    unitsReturned: 0,
    grossRevenue: ZERO_MONEY,
    discount: ZERO_MONEY,
    refunds: ZERO_MONEY,
    cogs: ZERO_MONEY,
    commission: ZERO_MONEY,
    shipping: ZERO_MONEY,
    packaging: ZERO_MONEY,
    adSpend: ZERO_MONEY,
    costKnown: true,
  };
}

export function emptyAggregate(productId: string): ProductAggregate {
  return { productId, ...emptyMutable() };
}

/**
 * Dönem içindeki her ürün için ham toplamları çıkarır.
 * Ürün bazlı tüm ekranlar (tablo, risk, fırsat) bu tek geçişten beslenir.
 */
export function aggregateByProduct(
  dataset: StoreDataset,
  range: DateRange,
  costs: CostResolver,
): Map<string, ProductAggregate> {
  const buckets = new Map<string, MutableAggregate>();

  const bucketOf = (productId: string): MutableAggregate => {
    const existing = buckets.get(productId);
    if (existing) return existing;
    const created = emptyMutable();
    buckets.set(productId, created);
    return created;
  };

  for (const order of dataset.orders) {
    if (!isWithin(order.date, range)) continue;

    const revenues = order.lines.map((line) =>
      multiplyMoney(line.unitPrice, line.quantity),
    );
    // İskonto sipariş düzeyinde; satırlara kuruş kaybetmeden pay edilir.
    const discountShares = allocateMoney(
      order.discount,
      revenues.map((revenue) => revenue.minor),
    );

    order.lines.forEach((line, index) => {
      const bucket = bucketOf(line.productId);
      const lineRevenue = revenues[index] ?? ZERO_MONEY;
      const cost = costs.resolve(line.productId, order.date);

      bucket.unitsSold += line.quantity;
      bucket.grossRevenue = addMoney(bucket.grossRevenue, lineRevenue);

      // Komisyon satırın kendi cirosundan, kendi oranıyla hesaplanır.
      bucket.commission = addMoney(
        bucket.commission,
        applyBasisPoints(lineRevenue, cost.commissionRate),
      );
      // Kargo paket başına: adetle çarpılmaz.
      bucket.shipping = addMoney(bucket.shipping, cost.shippingCost);
      bucket.packaging = addMoney(
        bucket.packaging,
        multiplyMoney(cost.packagingPerUnit, line.quantity),
      );

      bucket.discount = addMoney(bucket.discount, discountShares[index] ?? ZERO_MONEY);

      if (cost.unitCost === null) {
        // Tek bir satırın maliyeti bile bilinmiyorsa ürünün kârı hesaplanamaz.
        bucket.costKnown = false;
      } else {
        bucket.cogs = addMoney(
          bucket.cogs,
          multiplyMoney(cost.unitCost, line.quantity),
        );
      }
    });
  }

  for (const record of dataset.returns) {
    if (!isWithin(record.date, range)) continue;
    const bucket = bucketOf(record.productId);
    bucket.unitsReturned += record.quantity;
    bucket.refunds = addMoney(bucket.refunds, record.refund);

    // İade edilen mal rafa döndü: maliyeti gider olmaktan çıkar.
    const cost = costs.resolve(record.productId, record.date);
    if (cost.unitCost !== null) {
      bucket.cogs = subtractMoney(
        bucket.cogs,
        multiplyMoney(cost.unitCost, record.quantity),
      );
    }
  }

  for (const record of dataset.adSpend) {
    if (!isWithin(record.date, range)) continue;
    bucketOf(record.productId).adSpend = addMoney(
      bucketOf(record.productId).adSpend,
      record.amount,
    );
  }

  const result = new Map<string, ProductAggregate>();
  for (const [productId, bucket] of buckets) {
    result.set(productId, { productId, ...bucket });
  }
  return result;
}

/**
 * Gün gün mağaza toplamları — **tek geçişte**.
 *
 * Naif yol her gün için `aggregateStore` çağırmaktı; bu, 90 günlük bir grafik
 * için veri kümesini 90 kez baştan taramak demek.
 */
export function aggregateDaily(
  dataset: StoreDataset,
  range: DateRange,
  costs: CostResolver,
): Map<IsoDate, StoreAggregate> {
  const buckets = new Map<IsoDate, MutableAggregate & { orderCount: number }>();

  const bucketOf = (date: IsoDate) => {
    const existing = buckets.get(date);
    if (existing) return existing;
    const created = { ...emptyMutable(), orderCount: 0 };
    buckets.set(date, created);
    return created;
  };

  for (const order of dataset.orders) {
    if (!isWithin(order.date, range)) continue;

    const bucket = bucketOf(order.date);
    bucket.orderCount += 1;
    bucket.discount = addMoney(bucket.discount, order.discount);

    for (const line of order.lines) {
      const lineRevenue = multiplyMoney(line.unitPrice, line.quantity);
      const cost = costs.resolve(line.productId, order.date);

      bucket.unitsSold += line.quantity;
      bucket.grossRevenue = addMoney(bucket.grossRevenue, lineRevenue);
      bucket.commission = addMoney(
        bucket.commission,
        applyBasisPoints(lineRevenue, cost.commissionRate),
      );
      bucket.shipping = addMoney(bucket.shipping, cost.shippingCost);
      bucket.packaging = addMoney(
        bucket.packaging,
        multiplyMoney(cost.packagingPerUnit, line.quantity),
      );

      if (cost.unitCost === null) {
        bucket.costKnown = false;
      } else {
        bucket.cogs = addMoney(
          bucket.cogs,
          multiplyMoney(cost.unitCost, line.quantity),
        );
      }
    }
  }

  for (const record of dataset.returns) {
    if (!isWithin(record.date, range)) continue;
    const bucket = bucketOf(record.date);
    bucket.refunds = addMoney(bucket.refunds, record.refund);

    const cost = costs.resolve(record.productId, record.date);
    if (cost.unitCost !== null) {
      bucket.cogs = subtractMoney(
        bucket.cogs,
        multiplyMoney(cost.unitCost, record.quantity),
      );
    }
  }

  for (const record of dataset.adSpend) {
    if (!isWithin(record.date, range)) continue;
    const bucket = bucketOf(record.date);
    bucket.adSpend = addMoney(bucket.adSpend, record.amount);
  }

  const result = new Map<IsoDate, StoreAggregate>();
  for (const [date, bucket] of buckets) {
    result.set(date, { ...bucket });
  }
  return result;
}

/**
 * Mağaza geneli toplamlar.
 *
 * **Maliyeti eksik ürünler kâr kalemlerine dahil edilmez.** Ciroları
 * `aggregateCoverage` üzerinden ayrıca raporlanır — sessizce düşürmek de
 * dürüst olmazdı.
 */
export function aggregateStore(
  dataset: StoreDataset,
  range: DateRange,
  costs: CostResolver,
): StoreAggregate {
  const perProduct = [...aggregateByProduct(dataset, range, costs).values()];
  const measurable = perProduct.filter((p) => p.costKnown);

  const ordersInRange = dataset.orders.filter((order) => isWithin(order.date, range));

  return {
    orderCount: ordersInRange.length,
    unitsSold: measurable.reduce((acc, p) => acc + p.unitsSold, 0),
    grossRevenue: sumMoney(measurable.map((p) => p.grossRevenue)),
    discount: sumMoney(measurable.map((p) => p.discount)),
    refunds: sumMoney(measurable.map((p) => p.refunds)),
    cogs: sumMoney(measurable.map((p) => p.cogs)),
    commission: sumMoney(measurable.map((p) => p.commission)),
    shipping: sumMoney(measurable.map((p) => p.shipping)),
    packaging: sumMoney(measurable.map((p) => p.packaging)),
    adSpend: sumMoney(measurable.map((p) => p.adSpend)),
    costKnown: true,
  };
}

export function aggregateCoverage(
  dataset: StoreDataset,
  range: DateRange,
  costs: CostResolver,
): CostCoverage {
  const perProduct = [...aggregateByProduct(dataset, range, costs).values()];
  const missing = perProduct.filter((p) => !p.costKnown);

  return {
    productsMeasured: perProduct.length - missing.length,
    productsMissing: missing.length,
    revenueExcluded: sumMoney(missing.map((p) => netRevenueOf(p))),
  };
}

/** brüt ciro − iskonto − iade */
export function netRevenueOf(aggregate: {
  grossRevenue: Money;
  discount: Money;
  refunds: Money;
}): Money {
  return subtractMoney(
    subtractMoney(aggregate.grossRevenue, aggregate.discount),
    aggregate.refunds,
  );
}

type ProfitInput = {
  grossRevenue: Money;
  discount: Money;
  refunds: Money;
  cogs: Money;
  commission: Money;
  shipping: Money;
  packaging: Money;
  adSpend: Money;
  costKnown: boolean;
};

/**
 * net ciro − COGS − komisyon − kargo − paketleme − reklam
 *
 * Maliyet bilinmiyorsa `null` — sahte kâr üretmenin alternatifi yok.
 */
export function netProfitOf(aggregate: ProfitInput): Money | null {
  if (!aggregate.costKnown) return null;

  const expenses = sumMoney([
    aggregate.cogs,
    aggregate.commission,
    aggregate.shipping,
    aggregate.packaging,
    aggregate.adSpend,
  ]);
  return subtractMoney(netRevenueOf(aggregate), expenses);
}

/** netKâr / netCiro. Ciro sıfırsa ya da maliyet eksikse `null`. */
export function marginRatioOf(aggregate: ProfitInput): number | null {
  const profit = netProfitOf(aggregate);
  if (profit === null) return null;
  return moneyRatio(profit, netRevenueOf(aggregate));
}
