import { describe, expect, it } from "vitest";

import { eachDay, type Product } from "@/core/domain";
import { createCostResolver } from "@/core/services/cost-resolver";
import { buildProductPerformance } from "@/core/services/inventory-analyzer";
import {
  buildPurchasePriorities,
  orderStockAlertsByPriority,
  type PurchasePriorityItem,
} from "@/core/services/purchase-priority";
import {
  buildReorderRecommendations,
  type ReorderRecommendation,
  type ReorderSuggestion,
} from "@/core/services/reorder-suggestion";
import { buildStockAlerts, type StockAlert } from "@/core/services/stock-alerts";
import { buildStockForecasts } from "@/core/services/stock-forecast";

import {
  TODAY,
  costsFor,
  makeDataset,
  makeLine,
  makeOrder,
  makeProduct,
} from "./fixtures";

/**
 * SATIN ALMA ÖNCELİK MOTORU.
 *
 * `buildPurchasePriorities` hiçbir şeyi yeniden hesaplamıyor: girdisi
 * `buildStockAlerts` ve `buildReorderRecommendations`in çıktısı. Testler bu
 * yüzden dört şeyi ayrı ayrı kovalıyor: kapsam (hangi üç durum girer),
 * öncelik sırası (grup → gün → hız → adet → stok → id), reorder/forecast
 * servislerine bağlılık (resolver/CostPort davranışı değişmedi) ve kartın
 * gördüğü listeyi kuran `orderStockAlertsByPriority`.
 */

function alert(overrides: Partial<StockAlert> = {}): StockAlert {
  return {
    productId: "p1",
    productName: "Test Ürünü",
    stock: 5,
    level: "critical",
    daysRemaining: 5,
    ...overrides,
  };
}

function suggested(overrides: Partial<ReorderSuggestion> = {}): ReorderRecommendation {
  return {
    kind: "suggested",
    quantity: 10,
    targetStockUnits: 20,
    dailyVelocity: 2,
    targetCoverageDays: 21,
    currentStock: 5,
    ...overrides,
  };
}

const WEEK = { from: "2026-07-21", to: TODAY };
const DAYS = eachDay(WEEK);

function dailyOrders(days: readonly string[], perDay: number, productId: string) {
  return days.map((date, index) =>
    makeOrder({
      id: `o-${productId}-${date}-${index}`,
      date,
      lines: [makeLine({ productId, quantity: perDay })],
    }),
  );
}

function priorityFor(
  products: readonly Product[],
  orders: ReturnType<typeof makeOrder>[],
) {
  const dataset = makeDataset({ products: [...products], orders });
  const performance = buildProductPerformance(dataset, WEEK, costsFor(dataset));
  const forecasts = buildStockForecasts(performance, WEEK);
  const alerts = buildStockAlerts(performance, forecasts);
  const recommendations = buildReorderRecommendations(performance, forecasts);
  return {
    priorities: buildPurchasePriorities(alerts, recommendations),
    alerts,
    recommendations,
  };
}

describe("buildPurchasePriorities — grup sırası", () => {
  it("negative her zaman ilk sırada durur", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "dusuk", level: "low", daysRemaining: 1 }),
        alert({ productId: "kritik", level: "critical", daysRemaining: 1 }),
        alert({
          productId: "negatif",
          level: "negative",
          daysRemaining: null,
          stock: -5,
        }),
      ],
      new Map(),
    );

    expect(priorities[0]!.productId).toBe("negatif");
  });

  it("critical low'dan önce gelir", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "dusuk", level: "low", daysRemaining: 1 }),
        alert({ productId: "kritik", level: "critical", daysRemaining: 20 }),
      ],
      new Map(),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["kritik", "dusuk"]);
  });

  it("unknown seviyesi listeye hiç girmez — bu motor yalnızca satın alma kararı verilebilen durumları kapsar", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "kritik", level: "critical", daysRemaining: 3 }),
        alert({ productId: "bilinmiyor", level: "unknown", daysRemaining: null }),
      ],
      new Map(),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["kritik"]);
  });
});

describe("buildPurchasePriorities — aynı grup içinde bağ bozucular", () => {
  it("kalan gün az olan önce gelir", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "cok-gun", level: "critical", daysRemaining: 6 }),
        alert({ productId: "az-gun", level: "critical", daysRemaining: 2 }),
      ],
      new Map(),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["az-gun", "cok-gun"]);
  });

  it("aynı gün sayısında satış hızı yüksek olan bağı bozar (adet düşük olsa bile)", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "hizli", level: "critical", daysRemaining: 5 }),
        alert({ productId: "yavas", level: "critical", daysRemaining: 5 }),
      ],
      new Map([
        ["hizli", suggested({ dailyVelocity: 4, quantity: 10 })],
        ["yavas", suggested({ dailyVelocity: 2, quantity: 100 })],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["hizli", "yavas"]);
  });

  it("gün ve hız eşitken önerilen sipariş adedi yüksek olan bağı bozar", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "az-adet", level: "critical", daysRemaining: 5 }),
        alert({ productId: "cok-adet", level: "critical", daysRemaining: 5 }),
      ],
      new Map([
        ["az-adet", suggested({ dailyVelocity: 3, quantity: 20 })],
        ["cok-adet", suggested({ dailyVelocity: 3, quantity: 50 })],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["cok-adet", "az-adet"]);
  });

  it("gün, hız ve adet eşitken (ya da hiç veri yokken) mevcut stok düşük olan bağı bozar", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({
          productId: "yuksek-stok",
          level: "negative",
          daysRemaining: null,
          stock: -3,
        }),
        alert({
          productId: "dusuk-stok",
          level: "negative",
          daysRemaining: null,
          stock: -10,
        }),
      ],
      new Map(),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["dusuk-stok", "yuksek-stok"]);
  });

  it("her ölçüt eşitken productId'ye göre kararlı sıralar", () => {
    const build = () =>
      buildPurchasePriorities(
        [
          alert({ productId: "b", level: "negative", daysRemaining: null, stock: -5 }),
          alert({ productId: "a", level: "negative", daysRemaining: null, stock: -5 }),
        ],
        new Map(),
      ).map((p) => p.productId);

    expect(build()).toEqual(["a", "b"]);
    expect(build()).toEqual(build());
  });
});

describe("buildPurchasePriorities — rütbe ve gösterim alanları", () => {
  it("rank 1'den başlar ve sırayla artar", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({
          productId: "negatif",
          level: "negative",
          daysRemaining: null,
          stock: -1,
        }),
        alert({ productId: "kritik", level: "critical", daysRemaining: 3 }),
        alert({ productId: "dusuk", level: "low", daysRemaining: 15 }),
      ],
      new Map(),
    );

    expect(priorities.map((p) => p.rank)).toEqual([1, 2, 3]);
  });

  it("öneri 'suggested' değilse hız ve adet null kalır — ikinci bir hız hesabı yapılmaz", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({
          productId: "negatif",
          level: "negative",
          daysRemaining: null,
          stock: -5,
        }),
      ],
      new Map([["negatif", { kind: "correctStock" }]]),
    );

    expect(priorities[0]).toMatchObject({ dailyVelocity: null, reorderQuantity: null });
  });

  it("öneri 'suggested' ise hız ve adet olduğu gibi taşınır", () => {
    const priorities = buildPurchasePriorities(
      [alert({ productId: "p1", level: "critical", daysRemaining: 5 })],
      new Map([["p1", suggested({ dailyVelocity: 2.4, quantity: 39 })]]),
    );

    expect(priorities[0]).toMatchObject({ dailyVelocity: 2.4, reorderQuantity: 39 });
  });
});

describe("buildPurchasePriorities — kapsam (gerçek boru hattı üzerinden)", () => {
  it("normal ve yüksek stoklu ürünler listeye girmez", () => {
    const { priorities } = priorityFor(
      [
        makeProduct({ id: "normal", stock: 40 }),
        makeProduct({ id: "yuksek", stock: 400 }),
      ],
      [...dailyOrders(DAYS, 1, "normal"), ...dailyOrders(DAYS, 1, "yuksek")],
    );

    expect(priorities).toEqual([]);
  });

  it("satış verisi olmayan (noSales) ürünler listeye girmez", () => {
    const { priorities } = priorityFor([makeProduct({ id: "olu", stock: 500 })], []);
    expect(priorities).toEqual([]);
  });

  it("stok verisi bilinmeyen ürünler listeye girmez", () => {
    const { priorities, alerts } = priorityFor(
      [makeProduct({ id: "bilinmiyor", stock: Number.NaN })],
      [],
    );

    expect(alerts.some((a) => a.level === "unknown")).toBe(true);
    expect(priorities).toEqual([]);
  });

  it("critical ve low ürünler için öncelik üretilir, sıra forecast'in ürettiği durumla birebir aynı kaynaktan gelir", () => {
    const { priorities } = priorityFor(
      [
        makeProduct({ id: "kritik", stock: 5 }),
        makeProduct({ id: "dusuk", stock: 15 }),
      ],
      [...dailyOrders(DAYS, 1, "kritik"), ...dailyOrders(DAYS, 1, "dusuk")],
    );

    expect(priorities.map((p) => p.productId)).toEqual(["kritik", "dusuk"]);
  });
});

describe("buildPurchasePriorities — Analysis Window değişince öncelik değişebilir", () => {
  it("pencere kısaldıkça hız ve dolayısıyla öncelik verisi değişir", () => {
    const orders = DAYS.map((date, index) =>
      makeOrder({
        id: `o-p1-${date}-${index}`,
        date,
        lines: [makeLine({ productId: "p1", quantity: date === TODAY ? 5 : 1 })],
      }),
    );
    const dataset = makeDataset({
      products: [makeProduct({ id: "p1", stock: 20 })],
      orders,
    });

    const shortWindow = { from: TODAY, to: TODAY };
    const performanceShort = buildProductPerformance(
      dataset,
      shortWindow,
      costsFor(dataset),
    );
    const forecastsShort = buildStockForecasts(performanceShort, shortWindow);
    const alertsShort = buildStockAlerts(performanceShort, forecastsShort);
    const recommendationsShort = buildReorderRecommendations(
      performanceShort,
      forecastsShort,
    );
    const prioritiesShort = buildPurchasePriorities(alertsShort, recommendationsShort);

    const performanceWeek = buildProductPerformance(dataset, WEEK, costsFor(dataset));
    const forecastsWeek = buildStockForecasts(performanceWeek, WEEK);
    const alertsWeek = buildStockAlerts(performanceWeek, forecastsWeek);
    const recommendationsWeek = buildReorderRecommendations(
      performanceWeek,
      forecastsWeek,
    );
    const prioritiesWeek = buildPurchasePriorities(alertsWeek, recommendationsWeek);

    expect(prioritiesShort[0]?.dailyVelocity).not.toBe(
      prioritiesWeek[0]?.dailyVelocity,
    );
  });
});

describe("buildPurchasePriorities — resolver ve CostPort davranışı değişmedi", () => {
  it("maliyeti bilinmeyen üründe de öncelik doğru üretilir", () => {
    const { priorities, alerts } = (() => {
      const dataset = makeDataset({
        products: [makeProduct({ id: "p1", stock: 5 })],
        orders: dailyOrders(DAYS, 1, "p1"),
        unitCosts: { p1: null },
      });
      const performance = buildProductPerformance(dataset, WEEK, costsFor(dataset));
      const forecasts = buildStockForecasts(performance, WEEK);
      const alerts = buildStockAlerts(performance, forecasts);
      const recommendations = buildReorderRecommendations(performance, forecasts);
      return { priorities: buildPurchasePriorities(alerts, recommendations), alerts };
    })();

    expect(alerts[0]?.level).toBe("critical");
    expect(priorities[0]).toMatchObject({ productId: "p1", level: "critical" });
  });

  it("CostResolver aynı arayüzle aynı cevabı vermeye devam ediyor", () => {
    const dataset = makeDataset({ products: [makeProduct()], commissionPercent: 15 });
    const resolver = createCostResolver(
      dataset.costs,
      new Map(dataset.products.map((p) => [p.id, p.category] as const)),
    );

    const resolved = resolver.resolve("p1", TODAY);
    expect(resolved.unitCost).not.toBeNull();
  });
});

describe("orderStockAlertsByPriority", () => {
  const priorities: PurchasePriorityItem[] = [
    {
      productId: "negatif",
      productName: "Negatif",
      level: "negative",
      stock: -5,
      daysRemaining: null,
      dailyVelocity: null,
      reorderQuantity: null,
      rank: 1,
    },
    {
      productId: "kritik",
      productName: "Kritik",
      level: "critical",
      stock: 5,
      daysRemaining: 3,
      dailyVelocity: 2,
      reorderQuantity: 10,
      rank: 2,
    },
  ];

  it("rütbeli ürünleri rütbe sırasıyla en öne alır", () => {
    const ordered = orderStockAlertsByPriority(
      [
        alert({ productId: "kritik", level: "critical", daysRemaining: 3 }),
        alert({ productId: "bilinmiyor", level: "unknown", daysRemaining: null }),
        alert({
          productId: "negatif",
          level: "negative",
          daysRemaining: null,
          stock: -5,
        }),
      ],
      priorities,
    );

    expect(ordered.map((a) => a.productId)).toEqual([
      "negatif",
      "kritik",
      "bilinmiyor",
    ]);
  });

  it("rütbesiz (unknown) ürünler arasındaki göreli sıra korunur", () => {
    const ordered = orderStockAlertsByPriority(
      [
        alert({ productId: "u2", level: "unknown", daysRemaining: null }),
        alert({ productId: "u1", level: "unknown", daysRemaining: null }),
        alert({ productId: "kritik", level: "critical", daysRemaining: 3 }),
      ],
      priorities,
    );

    expect(ordered.map((a) => a.productId)).toEqual(["kritik", "u2", "u1"]);
  });

  it("hiç öncelik yoksa orijinal sırayı korur", () => {
    const original = [
      alert({ productId: "u1", level: "unknown", daysRemaining: null }),
      alert({ productId: "u2", level: "unknown", daysRemaining: null }),
    ];

    expect(orderStockAlertsByPriority(original, []).map((a) => a.productId)).toEqual([
      "u1",
      "u2",
    ]);
  });
});
