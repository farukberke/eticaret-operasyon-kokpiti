import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { eachDay, type Product } from "@/core/domain";
import { createCostResolver } from "@/core/services/cost-resolver";
import { buildProductPerformance } from "@/core/services/inventory-analyzer";
import { buildLeadTimeRisks, type LeadTimeRisk } from "@/core/services/lead-time-risk";
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
 * `buildStockAlerts`, `buildReorderRecommendations` ve `buildLeadTimeRisks`in
 * çıktısı. Testler bu yüzden beş şeyi ayrı ayrı kovalıyor: kapsam (hangi üç
 * durum girer), öncelik sırası (grup → lead-time grubu → karar günü →
 * boşluk günü → gün → hız → adet → stok → id), reorder/forecast/lead-time
 * servislerine bağlılık (resolver/CostPort davranışı değişmedi), eksik/bozuk
 * lead-time verisinin güvenli düşmesi ve kartın gördüğü listeyi kuran
 * `orderStockAlertsByPriority`.
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

function risk(overrides: Partial<LeadTimeRisk> = {}): LeadTimeRisk {
  return {
    state: "safe",
    leadTimeDays: 3,
    daysOfCover: 30,
    shortageGapDays: null,
    orderDecisionDays: 27,
    ...overrides,
  };
}

const NO_RECOMMENDATIONS: ReadonlyMap<string, ReorderRecommendation> = new Map();
const NO_RISKS: ReadonlyMap<string, LeadTimeRisk> = new Map();

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
  const leadTimeRisks = buildLeadTimeRisks(performance, forecasts);
  return {
    priorities: buildPurchasePriorities(
      alerts,
      recommendations,
      leadTimeRisks.byProduct,
    ),
    alerts,
    recommendations,
    leadTimeRisks,
  };
}

describe("buildPurchasePriorities — grup sırası (stok alarm grubu üst seviyede kalır)", () => {
  it("negative her zaman ilk sırada durur — lead-time durumu ne olursa olsun", () => {
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
      NO_RECOMMENDATIONS,
      new Map([
        ["dusuk", risk({ state: "late", shortageGapDays: 10, orderDecisionDays: -10 })],
        [
          "kritik",
          risk({ state: "late", shortageGapDays: 10, orderDecisionDays: -10 }),
        ],
        ["negatif", risk({ state: "safe" })],
      ]),
    );

    expect(priorities[0]!.productId).toBe("negatif");
  });

  it("critical low'dan önce gelir — lead-time durumu ne olursa olsun", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "dusuk", level: "low", daysRemaining: 1 }),
        alert({ productId: "kritik", level: "critical", daysRemaining: 20 }),
      ],
      NO_RECOMMENDATIONS,
      new Map([
        ["dusuk", risk({ state: "late", shortageGapDays: 10, orderDecisionDays: -10 })],
        ["kritik", risk({ state: "safe" })],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["kritik", "dusuk"]);
  });

  it("unknown seviyesi listeye hiç girmez — bu motor yalnızca satın alma kararı verilebilen durumları kapsar", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "kritik", level: "critical", daysRemaining: 3 }),
        alert({ productId: "bilinmiyor", level: "unknown", daysRemaining: null }),
      ],
      NO_RECOMMENDATIONS,
      NO_RISKS,
    );

    expect(priorities.map((p) => p.productId)).toEqual(["kritik"]);
  });
});

describe("buildPurchasePriorities — örnek senaryo (görev tanımındaki A/B)", () => {
  it("aynı grupta (critical) ve aynı kapsama gününde lead time'ı geç olan ürün önce gelir", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "urunA", level: "critical", daysRemaining: 5 }),
        alert({ productId: "urunB", level: "critical", daysRemaining: 5 }),
      ],
      NO_RECOMMENDATIONS,
      new Map([
        [
          "urunA",
          risk({
            state: "safe",
            leadTimeDays: 2,
            daysOfCover: 5,
            orderDecisionDays: 3,
          }),
        ],
        [
          "urunB",
          risk({
            state: "late",
            leadTimeDays: 9,
            daysOfCover: 5,
            shortageGapDays: 4,
            orderDecisionDays: -4,
          }),
        ],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["urunB", "urunA"]);
  });
});

describe("buildPurchasePriorities — aynı grup içinde lead-time risk sırası", () => {
  it("late, dueToday'den önce gelir", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "bugun", level: "critical", daysRemaining: 5 }),
        alert({ productId: "gec", level: "critical", daysRemaining: 5 }),
      ],
      NO_RECOMMENDATIONS,
      new Map([
        ["bugun", risk({ state: "dueToday", orderDecisionDays: 0 })],
        ["gec", risk({ state: "late", shortageGapDays: 2, orderDecisionDays: -2 })],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["gec", "bugun"]);
  });

  it("dueToday, upcoming'den önce gelir", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "yaklasan", level: "critical", daysRemaining: 5 }),
        alert({ productId: "bugun", level: "critical", daysRemaining: 5 }),
      ],
      NO_RECOMMENDATIONS,
      new Map([
        ["yaklasan", risk({ state: "upcoming", orderDecisionDays: 3 })],
        ["bugun", risk({ state: "dueToday", orderDecisionDays: 0 })],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["bugun", "yaklasan"]);
  });

  it("upcoming, safe'den önce gelir", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "guvenli", level: "critical", daysRemaining: 5 }),
        alert({ productId: "yaklasan", level: "critical", daysRemaining: 5 }),
      ],
      NO_RECOMMENDATIONS,
      new Map([
        ["guvenli", risk({ state: "safe", orderDecisionDays: 30 })],
        ["yaklasan", risk({ state: "upcoming", orderDecisionDays: 3 })],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["yaklasan", "guvenli"]);
  });

  it("unknownLeadTime, safe'den önce gelir — eksik bilgi 'acil değil'den daha riskli sayılır", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "guvenli", level: "critical", daysRemaining: 5 }),
        alert({ productId: "eksik", level: "critical", daysRemaining: 5 }),
      ],
      NO_RECOMMENDATIONS,
      new Map([
        ["guvenli", risk({ state: "safe", orderDecisionDays: 30 })],
        [
          "eksik",
          risk({
            state: "unknownLeadTime",
            leadTimeDays: null,
            orderDecisionDays: null,
          }),
        ],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["eksik", "guvenli"]);
  });

  it("unknownLeadTime, upcoming'den sonra gelir", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "eksik", level: "critical", daysRemaining: 5 }),
        alert({ productId: "yaklasan", level: "critical", daysRemaining: 5 }),
      ],
      NO_RECOMMENDATIONS,
      new Map([
        [
          "eksik",
          risk({
            state: "unknownLeadTime",
            leadTimeDays: null,
            orderDecisionDays: null,
          }),
        ],
        ["yaklasan", risk({ state: "upcoming", orderDecisionDays: 3 })],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["yaklasan", "eksik"]);
  });

  it("unmeasurable, safe ve unknownLeadTime'dan sonra en sona düşer — güvenli deterministik fallback", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "olcusuz", level: "critical", daysRemaining: 5 }),
        alert({ productId: "guvenli", level: "critical", daysRemaining: 5 }),
        alert({ productId: "eksik", level: "critical", daysRemaining: 5 }),
      ],
      NO_RECOMMENDATIONS,
      new Map([
        [
          "olcusuz",
          risk({
            state: "unmeasurable",
            leadTimeDays: null,
            daysOfCover: null,
            orderDecisionDays: null,
          }),
        ],
        ["guvenli", risk({ state: "safe", orderDecisionDays: 30 })],
        [
          "eksik",
          risk({
            state: "unknownLeadTime",
            leadTimeDays: null,
            orderDecisionDays: null,
          }),
        ],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["eksik", "guvenli", "olcusuz"]);
  });
});

describe("buildPurchasePriorities — grup içi karar günü / boşluk günü bağ bozucuları", () => {
  it("daha küçük orderDecisionDays önce gelir (aynı lead-time durumunda)", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "gec-karar", level: "critical", daysRemaining: 5 }),
        alert({ productId: "erken-karar", level: "critical", daysRemaining: 5 }),
      ],
      NO_RECOMMENDATIONS,
      new Map([
        ["gec-karar", risk({ state: "upcoming", orderDecisionDays: 6 })],
        ["erken-karar", risk({ state: "upcoming", orderDecisionDays: 2 })],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["erken-karar", "gec-karar"]);
  });

  it("negatif orderDecisionDays daha acildir (late içinde daha derin gecikme önce gelir)", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "az-gecikmis", level: "critical", daysRemaining: 5 }),
        alert({ productId: "cok-gecikmis", level: "critical", daysRemaining: 5 }),
      ],
      NO_RECOMMENDATIONS,
      new Map([
        [
          "az-gecikmis",
          risk({ state: "late", shortageGapDays: 1, orderDecisionDays: -1 }),
        ],
        [
          "cok-gecikmis",
          risk({ state: "late", shortageGapDays: 8, orderDecisionDays: -8 }),
        ],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["cok-gecikmis", "az-gecikmis"]);
  });

  it("late durumunda daha büyük shortageGapDays önce gelir (orderDecisionDays eşitken)", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "az-bosluk", level: "critical", daysRemaining: 5 }),
        alert({ productId: "cok-bosluk", level: "critical", daysRemaining: 5 }),
      ],
      NO_RECOMMENDATIONS,
      new Map([
        [
          "az-bosluk",
          risk({ state: "late", shortageGapDays: 2, orderDecisionDays: -5 }),
        ],
        [
          "cok-bosluk",
          risk({ state: "late", shortageGapDays: 9, orderDecisionDays: -5 }),
        ],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["cok-bosluk", "az-bosluk"]);
  });

  it("NaN orderDecisionDays sıralamaya sızmaz — bir sonraki ölçüte düşer", () => {
    // Kimlikler bilinçli olarak ters alfabetik: eğer guard çalışmıyorsa
    // (NaN'lı fark doğrudan kullanılsa) productId bağ bozucusu "z-gecerli"yi
    // ikinci sıraya düşürürdü. Guard doğru çalışıyorsa geçerli (finite) değer
    // her zaman önde kalır — id sırası bunu maskeleyemez.
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "z-gecerli", level: "critical", daysRemaining: 5 }),
        alert({ productId: "a-nan", level: "critical", daysRemaining: 5 }),
      ],
      NO_RECOMMENDATIONS,
      new Map([
        ["z-gecerli", risk({ state: "upcoming", orderDecisionDays: 3 })],
        ["a-nan", risk({ state: "upcoming", orderDecisionDays: Number.NaN })],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["z-gecerli", "a-nan"]);
  });

  it("Infinity orderDecisionDays sıralamaya sızmaz", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "z-gecerli", level: "critical", daysRemaining: 5 }),
        alert({ productId: "a-sonsuz", level: "critical", daysRemaining: 5 }),
      ],
      NO_RECOMMENDATIONS,
      new Map([
        ["z-gecerli", risk({ state: "upcoming", orderDecisionDays: 3 })],
        [
          "a-sonsuz",
          risk({ state: "upcoming", orderDecisionDays: Number.POSITIVE_INFINITY }),
        ],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["z-gecerli", "a-sonsuz"]);
  });
});

describe("buildPurchasePriorities — eski bağ bozucular korunur", () => {
  it("aynı lead-time durumunda eski daysRemaining tie-break'i korunur", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "cok-gun", level: "critical", daysRemaining: 6 }),
        alert({ productId: "az-gun", level: "critical", daysRemaining: 2 }),
      ],
      NO_RECOMMENDATIONS,
      new Map([
        ["cok-gun", risk({ state: "safe", orderDecisionDays: 30 })],
        ["az-gun", risk({ state: "safe", orderDecisionDays: 30 })],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["az-gun", "cok-gun"]);
  });

  it("dailyVelocity tie-break'i korunur", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "hizli", level: "critical", daysRemaining: 5 }),
        alert({ productId: "yavas", level: "critical", daysRemaining: 5 }),
      ],
      new Map([
        ["hizli", suggested({ dailyVelocity: 4, quantity: 10 })],
        ["yavas", suggested({ dailyVelocity: 2, quantity: 100 })],
      ]),
      new Map([
        ["hizli", risk({ state: "safe", orderDecisionDays: 30 })],
        ["yavas", risk({ state: "safe", orderDecisionDays: 30 })],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["hizli", "yavas"]);
  });

  it("recommendedQuantity (önerilen sipariş adedi) tie-break'i korunur", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "az-adet", level: "critical", daysRemaining: 5 }),
        alert({ productId: "cok-adet", level: "critical", daysRemaining: 5 }),
      ],
      new Map([
        ["az-adet", suggested({ dailyVelocity: 3, quantity: 20 })],
        ["cok-adet", suggested({ dailyVelocity: 3, quantity: 50 })],
      ]),
      new Map([
        ["az-adet", risk({ state: "safe", orderDecisionDays: 30 })],
        ["cok-adet", risk({ state: "safe", orderDecisionDays: 30 })],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["cok-adet", "az-adet"]);
  });

  it("stock tie-break'i korunur", () => {
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
      NO_RECOMMENDATIONS,
      NO_RISKS,
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
        NO_RECOMMENDATIONS,
        NO_RISKS,
      ).map((p) => p.productId);

    expect(build()).toEqual(["a", "b"]);
    expect(build()).toEqual(build());
  });
});

describe("buildPurchasePriorities — rütbe ve gösterim alanları", () => {
  it("rank 1'den başlar, kesintisiz artar", () => {
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
      NO_RECOMMENDATIONS,
      NO_RISKS,
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
      NO_RISKS,
    );

    expect(priorities[0]).toMatchObject({ dailyVelocity: null, reorderQuantity: null });
  });

  it("öneri 'suggested' ise hız ve adet olduğu gibi taşınır", () => {
    const priorities = buildPurchasePriorities(
      [alert({ productId: "p1", level: "critical", daysRemaining: 5 })],
      new Map([["p1", suggested({ dailyVelocity: 2.4, quantity: 39 })]]),
      NO_RISKS,
    );

    expect(priorities[0]).toMatchObject({ dailyVelocity: 2.4, reorderQuantity: 39 });
  });

  it("leadTimeStatus/orderDecisionDays/shortageGapDays haritadan olduğu gibi taşınır", () => {
    const priorities = buildPurchasePriorities(
      [alert({ productId: "p1", level: "critical", daysRemaining: 5 })],
      NO_RECOMMENDATIONS,
      new Map([
        [
          "p1",
          risk({
            state: "late",
            leadTimeDays: 9,
            daysOfCover: 5,
            shortageGapDays: 4,
            orderDecisionDays: -4,
          }),
        ],
      ]),
    );

    expect(priorities[0]).toMatchObject({
      leadTimeStatus: "late",
      orderDecisionDays: -4,
      shortageGapDays: 4,
    });
  });
});

describe("buildPurchasePriorities — eksik/bozuk lead-time verisi güvenli davranır", () => {
  it("leadTimeRisks haritasında eşleşme yoksa unmeasurable'a düşer, en yükseğe atlamaz", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "eslesmeyen", level: "critical", daysRemaining: 5 }),
        alert({ productId: "gecikmis", level: "critical", daysRemaining: 5 }),
      ],
      NO_RECOMMENDATIONS,
      new Map([
        [
          "gecikmis",
          risk({ state: "late", shortageGapDays: 2, orderDecisionDays: -2 }),
        ],
      ]),
    );

    expect(priorities.map((p) => p.productId)).toEqual(["gecikmis", "eslesmeyen"]);
    expect(priorities[1]).toMatchObject({
      productId: "eslesmeyen",
      leadTimeStatus: "unmeasurable",
    });
  });

  it("boş leadTimeRisks haritasıyla çağrıldığında hiç çökmez, tüm ürünler unmeasurable sayılır", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "p1", level: "critical", daysRemaining: 5 }),
        alert({ productId: "p2", level: "critical", daysRemaining: 2 }),
      ],
      NO_RECOMMENDATIONS,
      NO_RISKS,
    );

    expect(priorities.every((p) => p.leadTimeStatus === "unmeasurable")).toBe(true);
    // Eski tie-break (daysRemaining) hâlâ çalışıyor.
    expect(priorities.map((p) => p.productId)).toEqual(["p2", "p1"]);
  });

  it("duplicate productId varsa çökmez, girdi sırasını korur (stabil sıralama)", () => {
    const priorities = buildPurchasePriorities(
      [
        alert({ productId: "p1", level: "critical", daysRemaining: 5, stock: 5 }),
        alert({ productId: "p1", level: "critical", daysRemaining: 5, stock: 5 }),
      ],
      NO_RECOMMENDATIONS,
      NO_RISKS,
    );

    expect(priorities).toHaveLength(2);
    expect(priorities.map((p) => p.rank)).toEqual([1, 2]);
    expect(priorities.every((p) => p.productId === "p1")).toBe(true);
  });
});

describe("buildPurchasePriorities — giriş sırası sonucu etkilemez", () => {
  it("alerts sırası değişse de sonuç aynıdır", () => {
    const a = alert({ productId: "a", level: "critical", daysRemaining: 5 });
    const b = alert({ productId: "b", level: "critical", daysRemaining: 5 });
    const risks = new Map([
      ["a", risk({ state: "late", shortageGapDays: 3, orderDecisionDays: -3 })],
      ["b", risk({ state: "safe", orderDecisionDays: 30 })],
    ]);

    const first = buildPurchasePriorities([a, b], NO_RECOMMENDATIONS, risks).map(
      (p) => p.productId,
    );
    const second = buildPurchasePriorities([b, a], NO_RECOMMENDATIONS, risks).map(
      (p) => p.productId,
    );

    expect(first).toEqual(second);
    expect(first).toEqual(["a", "b"]);
  });

  it("reorderRecommendations Map'inin ekleme sırası sonucu etkilemez", () => {
    const alerts = [
      alert({ productId: "a", level: "critical", daysRemaining: 5 }),
      alert({ productId: "b", level: "critical", daysRemaining: 5 }),
    ];
    const recA = new Map([
      ["a", suggested({ dailyVelocity: 5 })],
      ["b", suggested({ dailyVelocity: 1 })],
    ]);
    const recB = new Map([
      ["b", suggested({ dailyVelocity: 1 })],
      ["a", suggested({ dailyVelocity: 5 })],
    ]);

    const first = buildPurchasePriorities(alerts, recA, NO_RISKS).map(
      (p) => p.productId,
    );
    const second = buildPurchasePriorities(alerts, recB, NO_RISKS).map(
      (p) => p.productId,
    );

    expect(first).toEqual(second);
  });

  it("leadTimeRisks Map'inin ekleme sırası sonucu etkilemez", () => {
    const alerts = [
      alert({ productId: "a", level: "critical", daysRemaining: 5 }),
      alert({ productId: "b", level: "critical", daysRemaining: 5 }),
    ];
    const risksA = new Map([
      ["a", risk({ state: "late", shortageGapDays: 3, orderDecisionDays: -3 })],
      ["b", risk({ state: "safe", orderDecisionDays: 30 })],
    ]);
    const risksB = new Map([
      ["b", risk({ state: "safe", orderDecisionDays: 30 })],
      ["a", risk({ state: "late", shortageGapDays: 3, orderDecisionDays: -3 })],
    ]);

    const first = buildPurchasePriorities(alerts, NO_RECOMMENDATIONS, risksA).map(
      (p) => p.productId,
    );
    const second = buildPurchasePriorities(alerts, NO_RECOMMENDATIONS, risksB).map(
      (p) => p.productId,
    );

    expect(first).toEqual(second);
    expect(first).toEqual(["a", "b"]);
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

  it("gerçek boru hattında leadTimeDays tanımlı ürün ölçülebilir bir leadTimeStatus alır", () => {
    const { priorities } = priorityFor(
      [makeProduct({ id: "kritik", stock: 5, leadTimeDays: 3 })],
      dailyOrders(DAYS, 1, "kritik"),
    );

    expect(priorities[0]!.leadTimeStatus).not.toBe("unmeasurable");
  });

  it("leadTimeDays tanımsız ürün unknownLeadTime alır", () => {
    const { priorities } = priorityFor(
      [makeProduct({ id: "kritik", stock: 5 })],
      dailyOrders(DAYS, 1, "kritik"),
    );

    expect(priorities[0]!.leadTimeStatus).toBe("unknownLeadTime");
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
    const risksShort = buildLeadTimeRisks(performanceShort, forecastsShort);
    const prioritiesShort = buildPurchasePriorities(
      alertsShort,
      recommendationsShort,
      risksShort.byProduct,
    );

    const performanceWeek = buildProductPerformance(dataset, WEEK, costsFor(dataset));
    const forecastsWeek = buildStockForecasts(performanceWeek, WEEK);
    const alertsWeek = buildStockAlerts(performanceWeek, forecastsWeek);
    const recommendationsWeek = buildReorderRecommendations(
      performanceWeek,
      forecastsWeek,
    );
    const risksWeek = buildLeadTimeRisks(performanceWeek, forecastsWeek);
    const prioritiesWeek = buildPurchasePriorities(
      alertsWeek,
      recommendationsWeek,
      risksWeek.byProduct,
    );

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
      const leadTimeRisks = buildLeadTimeRisks(performance, forecasts);
      return {
        priorities: buildPurchasePriorities(
          alerts,
          recommendations,
          leadTimeRisks.byProduct,
        ),
        alerts,
      };
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

  it("purchase-priority.ts resolver ya da CostPort import etmez", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/purchase-priority.ts", import.meta.url),
      ),
      "utf8",
    );

    expect(source).not.toMatch(/cost-resolver/);
    expect(source).not.toMatch(/CostPort/);
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
      leadTimeStatus: "unmeasurable",
      orderDecisionDays: null,
      shortageGapDays: null,
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
      leadTimeStatus: "safe",
      orderDecisionDays: 10,
      shortageGapDays: null,
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
