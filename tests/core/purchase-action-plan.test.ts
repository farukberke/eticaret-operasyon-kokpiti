import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildPurchaseActionPlan,
  type PurchaseActionPlanItem,
} from "@/core/services/purchase-action-plan";
import type { PurchasePriorityItem } from "@/core/services/purchase-priority";
import type {
  ReorderRecommendation,
  ReorderSuggestion,
} from "@/core/services/reorder-suggestion";

/**
 * GÜNLÜK SATIN ALMA EYLEM PLANI.
 *
 * `buildPurchaseActionPlan` hiçbir şeyi yeniden hesaplamıyor: girdisi
 * `buildPurchasePriorities`in çıktısı (`PurchasePriorityItem[]`, zaten
 * rütbeli) ve `buildReorderRecommendations`in çıktısı (`Map`). Testler bu
 * yüzden karar tablosunu (level × leadTimeState × reorder kind), miktar
 * uydurmama garantisini, rütbenin/ sıranın korunmasını, eksik eşleşmelerin
 * güvenli davranışını ve özet sayılarını ayrı ayrı kovalıyor.
 */

function priorityItem(
  overrides: Partial<PurchasePriorityItem> = {},
): PurchasePriorityItem {
  return {
    productId: "p1",
    productName: "Test Ürünü",
    level: "critical",
    stock: 5,
    daysRemaining: 5,
    dailyVelocity: 2,
    reorderQuantity: null,
    leadTimeStatus: "safe",
    orderDecisionDays: 30,
    shortageGapDays: null,
    rank: 1,
    ...overrides,
  };
}

function suggested(overrides: Partial<ReorderSuggestion> = {}): ReorderRecommendation {
  return {
    kind: "suggested",
    quantity: 24,
    targetStockUnits: 44,
    dailyVelocity: 2,
    targetCoverageDays: 21,
    currentStock: 5,
    ...overrides,
  };
}

const NO_RECOMMENDATIONS: ReadonlyMap<string, ReorderRecommendation> = new Map();

function itemOf(items: readonly PurchaseActionPlanItem[], productId: string) {
  const found = items.find((item) => item.productId === productId);
  if (!found) throw new Error(`item not found: ${productId}`);
  return found;
}

describe("buildPurchaseActionPlan — lead-time durumuna göre eylem (critical/low)", () => {
  it("late ürün actNow olur", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ leadTimeStatus: "late" })],
      NO_RECOMMENDATIONS,
    );
    expect(items[0]).toMatchObject({ action: "actNow", reason: "leadTimeAlreadyLate" });
  });

  it("dueToday ürünü decideToday olur", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ leadTimeStatus: "dueToday" })],
      NO_RECOMMENDATIONS,
    );
    expect(items[0]).toMatchObject({ action: "decideToday", reason: "orderDueToday" });
  });

  it("upcoming ürünü planSoon olur", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ leadTimeStatus: "upcoming" })],
      NO_RECOMMENDATIONS,
    );
    expect(items[0]).toMatchObject({
      action: "planSoon",
      reason: "decisionWindowApproaching",
    });
  });

  it("unknownLeadTime ürünü completeData olur", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ leadTimeStatus: "unknownLeadTime" })],
      NO_RECOMMENDATIONS,
    );
    expect(items[0]).toMatchObject({
      action: "completeData",
      reason: "leadTimeMissing",
    });
  });

  it("safe critical ürün planSoon olur, reason criticalStock", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ level: "critical", leadTimeStatus: "safe" })],
      NO_RECOMMENDATIONS,
    );
    expect(items[0]).toMatchObject({ action: "planSoon", reason: "criticalStock" });
  });

  it("safe low ürün planSoon olur, reason lowStock — actNow'a yükseltilmez", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ level: "low", leadTimeStatus: "safe" })],
      NO_RECOMMENDATIONS,
    );
    expect(items[0]).toMatchObject({ action: "planSoon", reason: "lowStock" });
    expect(items[0]!.action).not.toBe("actNow");
  });

  it("unmeasurable güvenli davranır — en yükseğe atlamaz, review'e düşer", () => {
    const { items } = buildPurchaseActionPlan(
      [
        priorityItem({
          productId: "critical",
          level: "critical",
          leadTimeStatus: "unmeasurable",
        }),
        priorityItem({
          productId: "low",
          level: "low",
          leadTimeStatus: "unmeasurable",
        }),
      ],
      NO_RECOMMENDATIONS,
    );
    expect(itemOf(items, "critical")).toMatchObject({
      action: "review",
      reason: "criticalStock",
    });
    expect(itemOf(items, "low")).toMatchObject({
      action: "review",
      reason: "lowStock",
    });
  });
});

describe("buildPurchaseActionPlan — negative stock davranışı", () => {
  it("negative + reorder önerisi yoksa (mevcut sistemin gerçek davranışı) completeData olur, miktar uydurulmaz", () => {
    const { items } = buildPurchaseActionPlan(
      [
        priorityItem({
          level: "negative",
          leadTimeStatus: "unmeasurable",
          daysRemaining: null,
        }),
      ],
      new Map([["p1", { kind: "correctStock" }]]),
    );
    expect(items[0]).toMatchObject({
      action: "completeData",
      reason: "stockAlreadyNegative",
      recommendedQuantity: null,
    });
  });

  it("negative + reorder eşleşmesi hiç yoksa da aynı şekilde completeData olur (güvenli düşüş)", () => {
    const { items } = buildPurchaseActionPlan(
      [
        priorityItem({
          level: "negative",
          leadTimeStatus: "unmeasurable",
          daysRemaining: null,
        }),
      ],
      NO_RECOMMENDATIONS,
    );
    expect(items[0]).toMatchObject({
      action: "completeData",
      reason: "stockAlreadyNegative",
      recommendedQuantity: null,
    });
  });

  it("negative + gerçekten suggested dönerse (servis varsaymaz, olduğu gibi okur) actNow olur", () => {
    const { items } = buildPurchaseActionPlan(
      [
        priorityItem({
          level: "negative",
          leadTimeStatus: "unmeasurable",
          daysRemaining: null,
        }),
      ],
      new Map([["p1", suggested()]]),
    );
    expect(items[0]).toMatchObject({
      action: "actNow",
      reason: "stockAlreadyNegative",
    });
  });

  it("negative her zaman tedarik süresi durumundan bağımsız aynı gerekçeyi taşır", () => {
    const { items } = buildPurchaseActionPlan(
      [
        priorityItem({
          level: "negative",
          leadTimeStatus: "late",
          daysRemaining: null,
        }),
      ],
      NO_RECOMMENDATIONS,
    );
    expect(items[0]!.reason).toBe("stockAlreadyNegative");
  });
});

describe("buildPurchaseActionPlan — reorder kind'ı miktar guardı", () => {
  it("suggested reorder miktarı korunur", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ leadTimeStatus: "late" })],
      new Map([["p1", suggested({ quantity: 39 })]]),
    );
    expect(items[0]!.recommendedQuantity).toBe(39);
  });

  it("correctStock durumu korunur — miktar null kalır", () => {
    const { items } = buildPurchaseActionPlan(
      [
        priorityItem({
          level: "negative",
          leadTimeStatus: "unmeasurable",
          daysRemaining: null,
        }),
      ],
      new Map([["p1", { kind: "correctStock" }]]),
    );
    expect(items[0]!.recommendedQuantity).toBeNull();
  });

  it("needsStockData durumu korunur — action completeData/stockDataMissing, miktar null", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ leadTimeStatus: "late" })],
      new Map([["p1", { kind: "needsStockData" }]]),
    );
    expect(items[0]).toMatchObject({
      action: "completeData",
      reason: "stockDataMissing",
      recommendedQuantity: null,
    });
  });

  it("none için miktar uydurulmaz", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ leadTimeStatus: "upcoming" })],
      new Map([["p1", { kind: "none" }]]),
    );
    expect(items[0]!.recommendedQuantity).toBeNull();
  });

  it("lead time durumu reorder miktarını değiştirmez — aynı öneri farklı lead-time durumlarında aynı kalır", () => {
    const late = buildPurchaseActionPlan(
      [priorityItem({ leadTimeStatus: "late" })],
      new Map([["p1", suggested({ quantity: 12 })]]),
    );
    const upcoming = buildPurchaseActionPlan(
      [priorityItem({ leadTimeStatus: "upcoming" })],
      new Map([["p1", suggested({ quantity: 12 })]]),
    );
    expect(late.items[0]!.recommendedQuantity).toBe(12);
    expect(upcoming.items[0]!.recommendedQuantity).toBe(12);
  });

  it("negatif önerilen miktar gösterilmez", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ leadTimeStatus: "late" })],
      new Map([["p1", suggested({ quantity: -5 })]]),
    );
    expect(items[0]!.recommendedQuantity).toBeNull();
  });

  it("NaN miktar UI alanına sızmaz", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ leadTimeStatus: "late" })],
      new Map([["p1", suggested({ quantity: Number.NaN })]]),
    );
    expect(items[0]!.recommendedQuantity).toBeNull();
  });

  it("Infinity miktar UI alanına sızmaz", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ leadTimeStatus: "late" })],
      new Map([["p1", suggested({ quantity: Number.POSITIVE_INFINITY })]]),
    );
    expect(items[0]!.recommendedQuantity).toBeNull();
  });
});

describe("buildPurchaseActionPlan — sayısal alanlar NaN/Infinity sızdırmaz", () => {
  it("daysRemaining NaN ise null'a düşer", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ daysRemaining: Number.NaN })],
      NO_RECOMMENDATIONS,
    );
    expect(items[0]!.daysRemaining).toBeNull();
  });

  it("orderDecisionDays Infinity ise null'a düşer", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ orderDecisionDays: Number.POSITIVE_INFINITY })],
      NO_RECOMMENDATIONS,
    );
    expect(items[0]!.orderDecisionDays).toBeNull();
  });

  it("shortageGapDays NaN ise null'a düşer", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ leadTimeStatus: "late", shortageGapDays: Number.NaN })],
      NO_RECOMMENDATIONS,
    );
    expect(items[0]!.shortageGapDays).toBeNull();
  });
});

describe("buildPurchaseActionPlan — rütbe ve sıra korunur", () => {
  it("purchase priority rank olduğu gibi taşınır", () => {
    const { items } = buildPurchaseActionPlan(
      [
        priorityItem({ productId: "a", rank: 1 }),
        priorityItem({ productId: "b", rank: 2 }),
        priorityItem({ productId: "c", rank: 3 }),
      ],
      NO_RECOMMENDATIONS,
    );
    expect(items.map((i) => i.rank)).toEqual([1, 2, 3]);
  });

  it("global sıra yeniden oluşturulmaz — girdi sırası çıktı sırasıyla birebir aynı", () => {
    const priorities = [
      priorityItem({
        productId: "z",
        rank: 1,
        level: "negative",
        leadTimeStatus: "unmeasurable",
        daysRemaining: null,
      }),
      priorityItem({ productId: "a", rank: 2, level: "low" }),
      priorityItem({ productId: "m", rank: 3, level: "critical" }),
    ];
    const { items } = buildPurchaseActionPlan(priorities, NO_RECOMMENDATIONS);
    expect(items.map((i) => i.productId)).toEqual(["z", "a", "m"]);
  });

  it("giriş batch sıraları (reorderRecommendations Map ekleme sırası) sonucu etkilemez", () => {
    const priorities = [
      priorityItem({ productId: "a", rank: 1 }),
      priorityItem({ productId: "b", rank: 2 }),
    ];
    const recA = new Map([
      ["a", suggested({ quantity: 5 })],
      ["b", suggested({ quantity: 9 })],
    ]);
    const recB = new Map([
      ["b", suggested({ quantity: 9 })],
      ["a", suggested({ quantity: 5 })],
    ]);
    const first = buildPurchaseActionPlan(priorities, recA).items.map(
      (i) => i.productId,
    );
    const second = buildPurchaseActionPlan(priorities, recB).items.map(
      (i) => i.productId,
    );
    expect(first).toEqual(second);
    expect(first).toEqual(["a", "b"]);
  });
});

describe("buildPurchaseActionPlan — eksik eşleşmeler güvenli davranır", () => {
  it("eksik reorder eşleşmesi çökmez, miktar null, aksiyon lead-time durumuna göre belirlenir", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ leadTimeStatus: "dueToday" })],
      NO_RECOMMENDATIONS,
    );
    expect(items[0]).toMatchObject({
      action: "decideToday",
      recommendedQuantity: null,
    });
  });

  it("reorderRecommendations haritasında olup priorities'te olmayan ürünler plana hiç girmez", () => {
    const { items } = buildPurchaseActionPlan(
      [priorityItem({ productId: "p1" })],
      new Map([
        ["p1", suggested()],
        ["p-yabanci", suggested()],
      ]),
    );
    expect(items.map((i) => i.productId)).toEqual(["p1"]);
  });

  it("duplicate productId sözleşmeye uygun davranır — çökmez, her girdi ayrı işlenir", () => {
    const { items } = buildPurchaseActionPlan(
      [
        priorityItem({ productId: "p1", rank: 1 }),
        priorityItem({ productId: "p1", rank: 2 }),
      ],
      NO_RECOMMENDATIONS,
    );
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.rank)).toEqual([1, 2]);
    expect(items.every((i) => i.productId === "p1")).toBe(true);
  });
});

describe("buildPurchaseActionPlan — kapsam", () => {
  it("priorities zaten yalnızca negative/critical/low içerdiği için unknown/noSales plana hiç girmez", () => {
    // buildPurchaseActionPlan yalnızca priorities'i okur; unknown/noSales
    // zaten buildPurchasePriorities aşamasında elenmiş olur — burada ikinci
    // bir filtre yazmaya gerek yok, girdi sözleşmesi bunu garanti eder.
    const { items, summary } = buildPurchaseActionPlan([], NO_RECOMMENDATIONS);
    expect(items).toEqual([]);
    expect(summary.total).toBe(0);
  });
});

describe("buildPurchaseActionPlan — özet sayıları", () => {
  it("action summary sayıları doğru", () => {
    const { summary } = buildPurchaseActionPlan(
      [
        priorityItem({ productId: "a", leadTimeStatus: "late" }),
        priorityItem({ productId: "b", leadTimeStatus: "dueToday" }),
        priorityItem({ productId: "c", leadTimeStatus: "upcoming" }),
        priorityItem({ productId: "d", leadTimeStatus: "unknownLeadTime" }),
        priorityItem({
          productId: "e",
          level: "critical",
          leadTimeStatus: "unmeasurable",
        }),
      ],
      NO_RECOMMENDATIONS,
    );
    expect(summary).toEqual({
      total: 5,
      actNowCount: 1,
      decideTodayCount: 1,
      planSoonCount: 1,
      completeDataCount: 1,
      reviewCount: 1,
    });
  });

  it("total sayısı doğru", () => {
    const { summary } = buildPurchaseActionPlan(
      [priorityItem({ productId: "a" }), priorityItem({ productId: "b" })],
      NO_RECOMMENDATIONS,
    );
    expect(summary.total).toBe(2);
  });

  it("boş plan özeti doğru — tüm sayaçlar sıfır", () => {
    const { summary } = buildPurchaseActionPlan([], NO_RECOMMENDATIONS);
    expect(summary).toEqual({
      total: 0,
      actNowCount: 0,
      decideTodayCount: 0,
      planSoonCount: 0,
      completeDataCount: 0,
      reviewCount: 0,
    });
  });
});

describe("buildPurchaseActionPlan — yeniden hesaplama yapılmaz", () => {
  it("kaynak dosya forecast/reorder/lead-time/purchase-priority hesap fonksiyonlarını içe aktarmaz, yalnızca tip olarak kullanır", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/purchase-action-plan.ts", import.meta.url),
      ),
      "utf8",
    );
    const importLines = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import "))
      .join("\n");

    expect(importLines).not.toMatch(/forecastStockCoverage|buildStockForecasts/);
    expect(importLines).not.toMatch(
      /reorderRecommendationFor|buildReorderRecommendations/,
    );
    expect(importLines).not.toMatch(/leadTimeRiskFor|buildLeadTimeRisks/);
    expect(importLines).not.toMatch(/buildPurchasePriorities/);
    expect(source).not.toMatch(/\.sort\(/);
  });

  it("resolver ve CostPort import edilmez", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/purchase-action-plan.ts", import.meta.url),
      ),
      "utf8",
    );

    expect(source).not.toMatch(/cost-resolver/);
    expect(source).not.toMatch(/CostPort/);
  });
});
