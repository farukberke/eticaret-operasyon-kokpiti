import { describe, expect, it } from "vitest";

import { eachDay, lira, type SignalCode, type StoreDataset } from "@/core/domain";
import { createAnalysisContext } from "@/core/services/analysis-context";
import { detectOpportunities } from "@/core/services/opportunity-detector";

import { TODAY, makeDataset, makeLine, makeOrder, makeProduct } from "./fixtures";

const WEEK = { from: "2026-07-21", to: TODAY };
const PREVIOUS_WEEK = { from: "2026-07-14", to: "2026-07-20" };

function dailyOrders(
  days: string[],
  perDay: number,
  options: {
    productId?: string;
    line?: Partial<Parameters<typeof makeLine>[0]>;
  } = {},
) {
  const productId = options.productId ?? "p1";
  return days.map((date, index) =>
    makeOrder({
      id: `o-${productId}-${date}-${index}`,
      date,
      lines: [makeLine({ productId, quantity: perDay, ...options.line })],
    }),
  );
}

function codesOf(dataset: StoreDataset): SignalCode[] {
  const context = createAnalysisContext({ dataset, range: WEEK, today: TODAY });
  return detectOpportunities(context).map((signal) => signal.code);
}

describe("TRENDING_UP", () => {
  it("satış hızı belirgin artınca tetiklenir", () => {
    // 10/gün → 15/gün = %50 artış, eşik %30.
    const dataset = makeDataset({
      products: [makeProduct({ stock: 5000 })],
      orders: [
        ...dailyOrders(eachDay(PREVIOUS_WEEK), 10),
        ...dailyOrders(eachDay(WEEK), 15),
      ],
    });

    expect(codesOf(dataset)).toContain("TRENDING_UP");
  });

  it("artış eşiğin altındayken tetiklenmez", () => {
    // 10 → 11 = %10 artış.
    const dataset = makeDataset({
      products: [makeProduct({ stock: 5000 })],
      orders: [
        ...dailyOrders(eachDay(PREVIOUS_WEEK), 10),
        ...dailyOrders(eachDay(WEEK), 11),
      ],
    });

    expect(codesOf(dataset)).not.toContain("TRENDING_UP");
  });
});

describe("RESTOCK_WINNER", () => {
  it("yüksek marjlı ürünün stoğu azalınca tetiklenir", () => {
    // 5/gün hız, 60 stok → 12 gün: kritik eşiğin (7) üstünde,
    // tazeleme eşiğinin (21) altında.
    const dataset = makeDataset({
      products: [makeProduct({ price: lira(100), stock: 60 })],
      orders: dailyOrders(eachDay(WEEK), 5),
      unitCosts: { p1: lira(50) },
    });

    expect(codesOf(dataset)).toContain("RESTOCK_WINNER");
  });

  it("kritik stok eşiğinin altında tetiklenmez", () => {
    // Bu ürün zaten STOCKOUT_IMMINENT riski olarak listede;
    // aynı ürünü iki kez göstermek kokpiti gürültüye boğardı.
    const dataset = makeDataset({
      products: [makeProduct({ price: lira(100), stock: 15 })],
      orders: dailyOrders(eachDay(WEEK), 5),
      unitCosts: { p1: lira(50) },
    });

    expect(codesOf(dataset)).not.toContain("RESTOCK_WINNER");
  });

  it("marj düşükse tetiklenmez", () => {
    const dataset = makeDataset({
      products: [makeProduct({ price: lira(100), stock: 60 })],
      orders: dailyOrders(eachDay(WEEK), 5),
      unitCosts: { p1: lira(95) },
    });

    expect(codesOf(dataset)).not.toContain("RESTOCK_WINNER");
  });
});

describe("PRICE_TEST_CANDIDATE", () => {
  it("marj çok yüksekken tetiklenir", () => {
    // %55 marj, eşik %40.
    const dataset = makeDataset({
      products: [makeProduct({ price: lira(100), stock: 5000 })],
      orders: dailyOrders(eachDay(WEEK), 5),
      unitCosts: { p1: lira(45) },
    });

    expect(codesOf(dataset)).toContain("PRICE_TEST_CANDIDATE");
  });

  it("orta marjda tetiklenmez", () => {
    const dataset = makeDataset({
      products: [makeProduct({ price: lira(100), stock: 5000 })],
      orders: dailyOrders(eachDay(WEEK), 5),
      unitCosts: { p1: lira(70) },
    });

    expect(codesOf(dataset)).not.toContain("PRICE_TEST_CANDIDATE");
  });
});

describe("HIGH_MARGIN_LOW_ADSPEND", () => {
  it("kâr eden ama reklam almayan üründe tetiklenir", () => {
    const dataset = makeDataset({
      products: [makeProduct({ price: lira(100), stock: 5000 })],
      orders: dailyOrders(eachDay(WEEK), 5),
      unitCosts: { p1: lira(50) },
      adSpend: [],
    });

    expect(codesOf(dataset)).toContain("HIGH_MARGIN_LOW_ADSPEND");
  });

  it("zaten reklam alıyorsa tetiklenmez", () => {
    // Ciro 3.500; %2 eşiğin üstünde harcama var.
    const dataset = makeDataset({
      products: [makeProduct({ price: lira(100), stock: 5000 })],
      orders: dailyOrders(eachDay(WEEK), 5),
      unitCosts: { p1: lira(50) },
      adSpend: [{ date: TODAY, productId: "p1", amount: lira(300) }],
    });

    expect(codesOf(dataset)).not.toContain("HIGH_MARGIN_LOW_ADSPEND");
  });

  it("stok yoksa tetiklenmez", () => {
    // Satamayacağın ürüne reklam vermek fırsat değil.
    const dataset = makeDataset({
      products: [makeProduct({ price: lira(100), stock: 0 })],
      orders: dailyOrders(eachDay(WEEK), 5),
      unitCosts: { p1: lira(50) },
    });

    expect(codesOf(dataset)).not.toContain("HIGH_MARGIN_LOW_ADSPEND");
  });
});

describe("BUNDLE_CANDIDATE", () => {
  const pairedOrders = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      makeOrder({
        id: `pair-${index}`,
        date: TODAY,
        lines: [makeLine({ productId: "a" }), makeLine({ productId: "b" })],
      }),
    );

  const twoProducts = [
    makeProduct({ id: "a", name: "Ürün A" }),
    makeProduct({ id: "b", name: "Ürün B" }),
  ];

  it("birlikte alım eşiği aşılınca tetiklenir", () => {
    const dataset = makeDataset({
      products: twoProducts,
      orders: pairedOrders(10),
    });

    expect(codesOf(dataset)).toContain("BUNDLE_CANDIDATE");
  });

  it("birlikte alım seyrekse tetiklenmez", () => {
    const dataset = makeDataset({
      products: twoProducts,
      orders: pairedOrders(3),
    });

    expect(codesOf(dataset)).not.toContain("BUNDLE_CANDIDATE");
  });

  it("kanıt olarak partner ürünü taşır", () => {
    const context = createAnalysisContext({
      dataset: makeDataset({ products: twoProducts, orders: pairedOrders(10) }),
      range: WEEK,
      today: TODAY,
    });

    const signal = detectOpportunities(context).find(
      (s) => s.code === "BUNDLE_CANDIDATE",
    );

    expect(signal?.evidence[0]?.values.partner).toBe("Ürün B");
    expect(signal?.evidence[0]?.values.count).toBe(10);
  });

  it("öneri sayısını sınırlar", () => {
    // 4 ürün → 6 olası çift; hepsi eşiği geçse bile liste sınırlı kalmalı.
    const products = ["a", "b", "c", "d"].map((id) => makeProduct({ id }));
    const orders = Array.from({ length: 12 }, (_, index) =>
      makeOrder({
        id: `all-${index}`,
        date: TODAY,
        lines: products.map((p) => makeLine({ productId: p.id })),
      }),
    );

    const bundles = codesOf(makeDataset({ products, orders })).filter(
      (code) => code === "BUNDLE_CANDIDATE",
    );

    expect(bundles).toHaveLength(2);
  });

  it("aynı ürünün iki farklı paketi çakışmayan kimlik alır", () => {
    const products = ["a", "b", "c"].map((id) => makeProduct({ id }));
    const orders = Array.from({ length: 12 }, (_, index) =>
      makeOrder({
        id: `trio-${index}`,
        date: TODAY,
        lines: products.map((p) => makeLine({ productId: p.id })),
      }),
    );

    const context = createAnalysisContext({
      dataset: makeDataset({ products, orders }),
      range: WEEK,
      today: TODAY,
    });

    const ids = detectOpportunities(context)
      .filter((s) => s.code === "BUNDLE_CANDIDATE")
      .map((s) => s.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
