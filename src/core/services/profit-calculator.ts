import type { StoreDataset } from "../domain/dataset";
import { isWithin, type DateRange, type IsoDate } from "../domain/date-range";
import {
  ZERO_MONEY,
  addMoney,
  allocateMoney,
  moneyRatio,
  multiplyMoney,
  subtractMoney,
  sumMoney,
  type Money,
} from "../domain/money";
import type { Order } from "../domain/order";

/**
 * KÂR HESABI — panelin en çok güvenilmesi gereken sayısı.
 *
 * Zincir:
 *   brüt ciro − iskonto − iade  = net ciro
 *   net ciro − COGS − komisyon − kargo − reklam = NET KÂR
 *
 * İki incelik:
 *
 * 1. Komisyon, kargo ve iskonto **sipariş** düzeyinde oluşur ama ürün bazlı
 *    kârlılık için ürünlere pay edilmeleri gerekir. Pay, satırın ciro içindeki
 *    ağırlığına göre ve kuruş kaybetmeden yapılır (`allocateMoney`).
 *
 * 2. İade edilen ürün fiziksel olarak geri gelir; maliyeti gider yazılmaz.
 *    Bu yüzden COGS **net adet** (satılan − iade) üzerinden hesaplanır.
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
  readonly adSpend: Money;
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
  readonly adSpend: Money;
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
  adSpend: Money;
}

function emptyAggregate(): MutableAggregate {
  return {
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

/** Bir siparişteki satırların ciro değerleri — dağıtım ağırlığı olarak kullanılır. */
function lineRevenues(order: Order): Money[] {
  return order.lines.map((line) => multiplyMoney(line.unitPrice, line.quantity));
}

/**
 * Dönem içindeki her ürün için ham toplamları çıkarır.
 * Ürün bazlı tüm ekranlar (tablo, risk, fırsat) bu tek geçişten beslenir.
 */
export function aggregateByProduct(
  dataset: StoreDataset,
  range: DateRange,
): Map<string, ProductAggregate> {
  const buckets = new Map<string, MutableAggregate>();

  const bucketOf = (productId: string): MutableAggregate => {
    const existing = buckets.get(productId);
    if (existing) return existing;
    const created = emptyAggregate();
    buckets.set(productId, created);
    return created;
  };

  for (const order of dataset.orders) {
    if (!isWithin(order.date, range)) continue;

    const revenues = lineRevenues(order);
    const weights = revenues.map((revenue) => revenue.minor);

    const commissionShares = allocateMoney(order.commission, weights);
    const shippingShares = allocateMoney(order.shippingCost, weights);
    const discountShares = allocateMoney(order.discount, weights);

    order.lines.forEach((line, index) => {
      const bucket = bucketOf(line.productId);
      bucket.unitsSold += line.quantity;
      bucket.grossRevenue = addMoney(
        bucket.grossRevenue,
        revenues[index] ?? ZERO_MONEY,
      );
      bucket.commission = addMoney(
        bucket.commission,
        commissionShares[index] ?? ZERO_MONEY,
      );
      bucket.shipping = addMoney(bucket.shipping, shippingShares[index] ?? ZERO_MONEY);
      bucket.discount = addMoney(bucket.discount, discountShares[index] ?? ZERO_MONEY);
      // COGS iade düşüldükten sonra netleştirilecek; şimdilik brüt tutulur.
      bucket.cogs = addMoney(bucket.cogs, multiplyMoney(line.unitCost, line.quantity));
    });
  }

  for (const record of dataset.returns) {
    if (!isWithin(record.date, range)) continue;
    const bucket = bucketOf(record.productId);
    bucket.unitsReturned += record.quantity;
    bucket.refunds = addMoney(bucket.refunds, record.refund);
  }

  for (const record of dataset.adSpend) {
    if (!isWithin(record.date, range)) continue;
    const bucket = bucketOf(record.productId);
    bucket.adSpend = addMoney(bucket.adSpend, record.amount);
  }

  // İade edilen ürünün maliyetini geri al: mal rafa döndü, gider oluşmadı.
  const unitCostOf = new Map(
    dataset.products.map((product) => [product.id, product.unitCost] as const),
  );

  const result = new Map<string, ProductAggregate>();
  for (const [productId, bucket] of buckets) {
    const unitCost = unitCostOf.get(productId) ?? ZERO_MONEY;
    const returnedCost = multiplyMoney(unitCost, bucket.unitsReturned);

    result.set(productId, {
      productId,
      unitsSold: bucket.unitsSold,
      unitsReturned: bucket.unitsReturned,
      grossRevenue: bucket.grossRevenue,
      discount: bucket.discount,
      refunds: bucket.refunds,
      cogs: subtractMoney(bucket.cogs, returnedCost),
      commission: bucket.commission,
      shipping: bucket.shipping,
      adSpend: bucket.adSpend,
    });
  }

  return result;
}

/**
 * Gün gün mağaza toplamları — **tek geçişte**.
 *
 * Naif yol her gün için `aggregateStore` çağırmaktı; bu, 90 günlük bir grafik
 * için veri kümesini 90 kez baştan taramak demek. Burada tarih anahtarlı
 * kovalar kullanılarak tek tur atılır.
 */
export function aggregateDaily(
  dataset: StoreDataset,
  range: DateRange,
): Map<IsoDate, StoreAggregate> {
  const buckets = new Map<IsoDate, MutableAggregate & { orderCount: number }>();

  const bucketOf = (date: IsoDate) => {
    const existing = buckets.get(date);
    if (existing) return existing;
    const created = { ...emptyAggregate(), orderCount: 0 };
    buckets.set(date, created);
    return created;
  };

  for (const order of dataset.orders) {
    if (!isWithin(order.date, range)) continue;

    const bucket = bucketOf(order.date);
    bucket.orderCount += 1;
    bucket.commission = addMoney(bucket.commission, order.commission);
    bucket.shipping = addMoney(bucket.shipping, order.shippingCost);
    bucket.discount = addMoney(bucket.discount, order.discount);

    for (const line of order.lines) {
      bucket.unitsSold += line.quantity;
      bucket.grossRevenue = addMoney(
        bucket.grossRevenue,
        multiplyMoney(line.unitPrice, line.quantity),
      );
      bucket.cogs = addMoney(bucket.cogs, multiplyMoney(line.unitCost, line.quantity));
    }
  }

  const unitCostOf = new Map(
    dataset.products.map((product) => [product.id, product.unitCost] as const),
  );

  for (const record of dataset.returns) {
    if (!isWithin(record.date, range)) continue;
    const bucket = bucketOf(record.date);
    bucket.refunds = addMoney(bucket.refunds, record.refund);
    // İade edilen mal rafa döndü: maliyeti gider olmaktan çıkar.
    bucket.cogs = subtractMoney(
      bucket.cogs,
      multiplyMoney(unitCostOf.get(record.productId) ?? ZERO_MONEY, record.quantity),
    );
  }

  for (const record of dataset.adSpend) {
    if (!isWithin(record.date, range)) continue;
    const bucket = bucketOf(record.date);
    bucket.adSpend = addMoney(bucket.adSpend, record.amount);
  }

  const result = new Map<IsoDate, StoreAggregate>();
  for (const [date, bucket] of buckets) {
    result.set(date, {
      orderCount: bucket.orderCount,
      unitsSold: bucket.unitsSold,
      grossRevenue: bucket.grossRevenue,
      discount: bucket.discount,
      refunds: bucket.refunds,
      cogs: bucket.cogs,
      commission: bucket.commission,
      shipping: bucket.shipping,
      adSpend: bucket.adSpend,
    });
  }
  return result;
}

/** Mağaza geneli toplamlar. Sipariş sayısı ürün toplamlarından türetilemez, ayrı sayılır. */
export function aggregateStore(
  dataset: StoreDataset,
  range: DateRange,
): StoreAggregate {
  const perProduct = [...aggregateByProduct(dataset, range).values()];

  const ordersInRange = dataset.orders.filter((order) => isWithin(order.date, range));

  return {
    orderCount: ordersInRange.length,
    unitsSold: perProduct.reduce((acc, p) => acc + p.unitsSold, 0),
    grossRevenue: sumMoney(perProduct.map((p) => p.grossRevenue)),
    discount: sumMoney(perProduct.map((p) => p.discount)),
    refunds: sumMoney(perProduct.map((p) => p.refunds)),
    cogs: sumMoney(perProduct.map((p) => p.cogs)),
    commission: sumMoney(perProduct.map((p) => p.commission)),
    shipping: sumMoney(perProduct.map((p) => p.shipping)),
    adSpend: sumMoney(perProduct.map((p) => p.adSpend)),
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

/** net ciro − COGS − komisyon − kargo − reklam */
export function netProfitOf(aggregate: {
  grossRevenue: Money;
  discount: Money;
  refunds: Money;
  cogs: Money;
  commission: Money;
  shipping: Money;
  adSpend: Money;
}): Money {
  const expenses = sumMoney([
    aggregate.cogs,
    aggregate.commission,
    aggregate.shipping,
    aggregate.adSpend,
  ]);
  return subtractMoney(netRevenueOf(aggregate), expenses);
}

/** netKâr / netCiro. Ciro sıfırsa `null`. */
export function marginRatioOf(
  aggregate: Parameters<typeof netProfitOf>[0],
): number | null {
  return moneyRatio(netProfitOf(aggregate), netRevenueOf(aggregate));
}
