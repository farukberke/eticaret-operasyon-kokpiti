import type {
  AdSpendRecord,
  IsoDate,
  Order,
  OrderLine,
  Product,
  ReturnRecord,
  StoreDataset,
} from "@/core/domain";
import { ZERO_MONEY, lira } from "@/core/domain";

/**
 * Test fixture'ları — elle kurulan, gözle doğrulanabilir küçük senaryolar.
 *
 * Mock üreticiyle (`src/data/mock`) bilinçli olarak ayrı: testler üreticinin
 * doğruluğuna değil, kendi kurdukları veriye dayanmalı. Aksi halde üreticideki
 * bir hata testleri de birlikte yanıltır.
 */

export const TODAY: IsoDate = "2026-07-27";

export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    sku: "SKU-1",
    name: "Test Ürünü",
    category: "Test",
    price: lira(100),
    unitCost: lira(60),
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
    unitCost: lira(60),
    ...overrides,
  };
}

export function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1",
    date: TODAY,
    lines: [makeLine()],
    shippingCost: ZERO_MONEY,
    commission: ZERO_MONEY,
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

export function makeDataset(overrides: Partial<StoreDataset> = {}): StoreDataset {
  return {
    products: [makeProduct()],
    orders: [makeOrder()],
    returns: [],
    adSpend: [],
    ...overrides,
  };
}
