import type {
  AdSpendRecord,
  CostTable,
  IsoDate,
  Money,
  Order,
  OrderLine,
  Product,
  ProductCost,
  ReturnRecord,
  StoreDataset,
} from "@/core/domain";
import { ZERO_MONEY, basisPoints, lira } from "@/core/domain";
import { createCostResolver, type CostResolver } from "@/core/services/cost-resolver";

/**
 * Test fixture'ları — elle kurulan, gözle doğrulanabilir küçük senaryolar.
 *
 * Mock üreticiyle (`src/data/mock`) bilinçli olarak ayrı: testler üreticinin
 * doğruluğuna değil, kendi kurdukları veriye dayanmalı.
 *
 * **Maliyet artık ürünün üzerinde değil.** `makeProduct({ unitCost })` yerine
 * `makeDataset({ unitCosts: { p1: lira(60) } })` kullanılır; fixture bunu
 * gerçek `ProductCost` kayıtlarına çevirir — üretimdeki akışın aynısı.
 */

export const TODAY: IsoDate = "2026-07-27";

/** Maliyet kayıtlarının geçerlilik başlangıcı — tüm test aralıklarından önce. */
export const COST_EPOCH: IsoDate = "2025-01-01";

/** Varsayılan birim maliyet: testlerin çoğu belirli bir değer umursamaz. */
export const DEFAULT_UNIT_COST = lira(60);

export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    sku: "SKU-1",
    name: "Test Ürünü",
    category: "Test",
    price: lira(100),
    stock: 100,
    listedAt: "2026-01-01",
    ...overrides,
  };
}

export function makeLine(overrides: Partial<OrderLine> = {}): OrderLine {
  return {
    productId: "p1",
    quantity: 1,
    unitPrice: lira(100),
    ...overrides,
  };
}

export function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    date: TODAY,
    lines: [makeLine()],
    discount: ZERO_MONEY,
    ...overrides,
  };
}

export function makeReturn(overrides: Partial<ReturnRecord> = {}): ReturnRecord {
  return {
    id: "r1",
    orderId: "o1",
    productId: "p1",
    date: TODAY,
    quantity: 1,
    refund: lira(100),
    ...overrides,
  };
}

export function makeAdSpend(overrides: Partial<AdSpendRecord> = {}): AdSpendRecord {
  return {
    date: TODAY,
    productId: "p1",
    amount: lira(50),
    ...overrides,
  };
}

export interface DatasetSpec extends Partial<Omit<StoreDataset, "costs">> {
  /**
   * Ürün → birim maliyet. Verilmeyen ürünler varsayılan maliyeti alır;
   * `null` verilen ürünün maliyeti **bilinçli olarak eksiktir**.
   */
  readonly unitCosts?: Readonly<Record<string, Money | null>>;
  /** Komisyon oranı (yüzde). Varsayılan %0 — çoğu test komisyonla ilgilenmez. */
  readonly commissionPercent?: number;
  readonly shippingCost?: Money;
  readonly packagingPerUnit?: Money;
  /** Doğrudan verilen maliyet kayıtları — tarihsel senaryolar için. */
  readonly costRecords?: readonly ProductCost[];
}

export function makeDataset(spec: DatasetSpec = {}): StoreDataset {
  const products = spec.products ?? [makeProduct()];
  const overrides = spec.unitCosts ?? {};

  const seeded: ProductCost[] = spec.costRecords
    ? [...spec.costRecords]
    : products.flatMap((product) => {
        const cost =
          product.id in overrides ? overrides[product.id] : DEFAULT_UNIT_COST;
        if (cost === null || cost === undefined) return [];
        return [
          {
            productId: product.id,
            effectiveFrom: COST_EPOCH,
            unitCost: cost,
            source: "seed" as const,
          },
        ];
      });

  const costs: CostTable = {
    products: seeded,
    defaults: [
      {
        scope: { kind: "store" },
        effectiveFrom: COST_EPOCH,
        commissionRate: basisPoints(spec.commissionPercent ?? 0),
        ...(spec.shippingCost ? { shippingCost: spec.shippingCost } : {}),
        ...(spec.packagingPerUnit ? { packagingPerUnit: spec.packagingPerUnit } : {}),
      },
    ],
  };

  return {
    products,
    orders: spec.orders ?? [makeOrder()],
    returns: spec.returns ?? [],
    adSpend: spec.adSpend ?? [],
    costs,
  };
}

/** Veri kümesinin maliyet çözümleyicisi — hesap fonksiyonlarına geçirilir. */
export function costsFor(dataset: StoreDataset): CostResolver {
  return createCostResolver(
    dataset.costs,
    new Map(dataset.products.map((p) => [p.id, p.category] as const)),
  );
}
