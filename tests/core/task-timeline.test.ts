import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { PurchaseActionStatusRecord } from "@/core/domain";
import { withStatus } from "@/core/services/purchase-action-status";
import type {
  PurchaseActionKind,
  PurchaseActionPlanBatch,
  PurchaseActionPlanItem,
} from "@/core/services/purchase-action-plan";
import { DEFAULT_RULES } from "@/core/services/rules.config";
import { buildTaskTimeline } from "@/core/services/task-timeline";

/**
 * GÜNLÜK ZAMAN AKIŞI (TASK TIMELINE).
 *
 * `buildTaskTimeline` hiçbir şeyi yeniden hesaplamıyor: girdisi
 * `buildPurchaseActionPlan`in çıktısı (zaten rütbeli) ve durum haritasıdır
 * (`PurchaseActionStatusRecord`). Testler bu yüzden yalnızca gruplama
 * kararını (durum × rütbe sırası), tekrarsızlığı, sıranın korunmasını ve
 * özet sayılarını kovalıyor — `purchase-action-plan.test.ts`teki aynı desen.
 */

const TODAY = "2026-07-29";
const NOW_LIMIT = DEFAULT_RULES.taskTimeline.nowLimit;
const TODAY_LIMIT = DEFAULT_RULES.taskTimeline.todayLimit;

const EMPTY_STATUSES: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();

function planItem(
  overrides: Partial<PurchaseActionPlanItem> = {},
): PurchaseActionPlanItem {
  return {
    productId: "p1",
    rank: 1,
    action: "actNow",
    recommendedQuantity: null,
    alertState: "critical",
    leadTimeState: "late",
    daysRemaining: 5,
    orderDecisionDays: -2,
    shortageGapDays: 2,
    reason: "leadTimeAlreadyLate",
    ...overrides,
  };
}

function planOf(items: readonly PurchaseActionPlanItem[]): PurchaseActionPlanBatch {
  const counts: Record<PurchaseActionKind, number> = {
    actNow: 0,
    decideToday: 0,
    planSoon: 0,
    completeData: 0,
    review: 0,
  };
  for (const item of items) counts[item.action] += 1;

  return {
    items,
    summary: {
      total: items.length,
      actNowCount: counts.actNow,
      decideTodayCount: counts.decideToday,
      planSoonCount: counts.planSoon,
      completeDataCount: counts.completeData,
      reviewCount: counts.review,
    },
  };
}

/** `count` adet pending plan satırı, rank 1..count, productId "p1".."pN". */
function pendingItems(count: number): PurchaseActionPlanItem[] {
  return Array.from({ length: count }, (_, i) =>
    planItem({ productId: `p${i + 1}`, rank: i + 1 }),
  );
}

function itemOf(
  items: ReturnType<typeof buildTaskTimeline>["items"],
  productId: string,
) {
  const found = items.find((item) => item.productId === productId);
  if (!found) throw new Error(`item not found: ${productId}`);
  return found;
}

describe("buildTaskTimeline — boş girdi", () => {
  it("boş plan: boş çıktı, tüm sayaçlar sıfır", () => {
    const batch = buildTaskTimeline(planOf([]), EMPTY_STATUSES);
    expect(batch.items).toEqual([]);
    expect(batch.summary).toEqual({
      totalItems: 0,
      activeItems: 0,
      nowItems: 0,
      todayItems: 0,
      laterItems: 0,
      completedItems: 0,
    });
  });

  it("boş status map: tüm aksiyonlar pending kabul edilir, hiçbiri kaybolmaz", () => {
    const batch = buildTaskTimeline(planOf(pendingItems(2)), EMPTY_STATUSES);
    expect(batch.items).toHaveLength(2);
    expect(batch.items.every((item) => item.status === "pending")).toBe(true);
  });
});

describe("buildTaskTimeline — yalnızca pending aksiyonlar, plan sırasına göre dağıtım", () => {
  it("en yüksek rütbeli pending aksiyonlar now grubuna girer", () => {
    const batch = buildTaskTimeline(planOf(pendingItems(NOW_LIMIT)), EMPTY_STATUSES);
    expect(batch.items.every((item) => item.group === "now")).toBe(true);
    expect(batch.summary.nowItems).toBe(NOW_LIMIT);
  });

  it("now sınırını aşan pending aksiyonlar today grubuna girer", () => {
    const total = NOW_LIMIT + TODAY_LIMIT;
    const batch = buildTaskTimeline(planOf(pendingItems(total)), EMPTY_STATUSES);
    expect(batch.summary.nowItems).toBe(NOW_LIMIT);
    expect(batch.summary.todayItems).toBe(TODAY_LIMIT);
    expect(batch.summary.laterItems).toBe(0);

    for (const item of batch.items) {
      const expectedGroup = item.rank <= NOW_LIMIT ? "now" : "today";
      expect(item.group).toBe(expectedGroup);
    }
  });

  it("now+today sınırını aşan pending aksiyonlar later grubuna düşer", () => {
    const total = NOW_LIMIT + TODAY_LIMIT + 2;
    const batch = buildTaskTimeline(planOf(pendingItems(total)), EMPTY_STATUSES);
    expect(batch.summary.nowItems).toBe(NOW_LIMIT);
    expect(batch.summary.todayItems).toBe(TODAY_LIMIT);
    expect(batch.summary.laterItems).toBe(2);

    const lastTwo = batch.items.slice(-2);
    expect(lastTwo.every((item) => item.group === "later")).toBe(true);
  });

  it("aktif aksiyon sayısı now+today+later toplamına eşittir", () => {
    const total = NOW_LIMIT + TODAY_LIMIT + 3;
    const batch = buildTaskTimeline(planOf(pendingItems(total)), EMPTY_STATUSES);
    expect(batch.summary.activeItems).toBe(
      batch.summary.nowItems + batch.summary.todayItems + batch.summary.laterItems,
    );
    expect(batch.summary.activeItems).toBe(total);
  });
});

describe("buildTaskTimeline — status davranışı", () => {
  it("snoozed aksiyon rütbesinden bağımsız her zaman later grubuna girer", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "snoozed", TODAY);

    const batch = buildTaskTimeline(
      planOf([planItem({ productId: "p1", rank: 1 })]),
      statuses,
    );
    expect(itemOf(batch.items, "p1").group).toBe("later");
    expect(batch.summary.laterItems).toBe(1);
    expect(batch.summary.nowItems).toBe(0);
  });

  it("done aksiyon completed grubuna girer, aktif gruplarda görünmez", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "done", TODAY);

    const batch = buildTaskTimeline(
      planOf([planItem({ productId: "p1", rank: 1 })]),
      statuses,
    );
    expect(itemOf(batch.items, "p1").group).toBe("completed");
    expect(batch.summary.completedItems).toBe(1);
    expect(batch.summary.activeItems).toBe(0);
  });

  it("ignored aksiyon timeline'da hiç görünmez", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "ignored", TODAY);

    const batch = buildTaskTimeline(
      planOf([
        planItem({ productId: "p1", rank: 1 }),
        planItem({ productId: "p2", rank: 2 }),
      ]),
      statuses,
    );
    expect(batch.items.map((item) => item.productId)).toEqual(["p2"]);
    expect(batch.summary.totalItems).toBe(1);
  });

  it("status kaydı olmayan aksiyon pending kabul edilir", () => {
    const batch = buildTaskTimeline(
      planOf([planItem({ productId: "p1", rank: 1 })]),
      EMPTY_STATUSES,
    );
    expect(itemOf(batch.items, "p1").status).toBe("pending");
  });

  it("karışık durumlar: her aksiyon tam olarak doğru gruba düşer", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "done1", "done", TODAY);
    statuses = withStatus(statuses, "snoozed1", "snoozed", TODAY);
    statuses = withStatus(statuses, "ignored1", "ignored", TODAY);

    const batch = buildTaskTimeline(
      planOf([
        planItem({ productId: "pending1", rank: 1 }),
        planItem({ productId: "done1", rank: 2 }),
        planItem({ productId: "snoozed1", rank: 3 }),
        planItem({ productId: "ignored1", rank: 4 }),
      ]),
      statuses,
    );

    expect(itemOf(batch.items, "pending1").group).toBe("now");
    expect(itemOf(batch.items, "done1").group).toBe("completed");
    expect(itemOf(batch.items, "snoozed1").group).toBe("later");
    expect(batch.items.some((item) => item.productId === "ignored1")).toBe(false);
    expect(batch.items).toHaveLength(3);
  });
});

describe("buildTaskTimeline — tekrarsızlık ve sıra", () => {
  it("aynı aksiyon birden fazla gruba eklenmez — her aksiyon tam olarak bir kez görünür", () => {
    const batch = buildTaskTimeline(planOf(pendingItems(6)), EMPTY_STATUSES);
    const productIds = batch.items.map((item) => item.productId);
    expect(new Set(productIds).size).toBe(productIds.length);
  });

  it("plan sırası korunur — çıktı sırası girdi sırasıyla birebir aynı", () => {
    const items = [
      planItem({ productId: "z", rank: 1 }),
      planItem({ productId: "a", rank: 2 }),
      planItem({ productId: "m", rank: 3 }),
    ];
    const batch = buildTaskTimeline(planOf(items), EMPTY_STATUSES);
    expect(batch.items.map((item) => item.productId)).toEqual(["z", "a", "m"]);
  });

  it("rank olduğu gibi taşınır — yeniden hesaplanmaz", () => {
    const items = [
      planItem({ productId: "a", rank: 5 }),
      planItem({ productId: "b", rank: 9 }),
    ];
    const batch = buildTaskTimeline(planOf(items), EMPTY_STATUSES);
    expect(itemOf(batch.items, "a").rank).toBe(5);
    expect(itemOf(batch.items, "b").rank).toBe(9);
  });

  it("her grup içinde estimatedOrder 1'den başlayarak artar", () => {
    const batch = buildTaskTimeline(planOf(pendingItems(NOW_LIMIT)), EMPTY_STATUSES);
    expect(batch.items.map((item) => item.estimatedOrder)).toEqual(
      Array.from({ length: NOW_LIMIT }, (_, i) => i + 1),
    );
  });

  it("duplicate productId çökmez, her girdi ayrı işlenir", () => {
    const batch = buildTaskTimeline(
      planOf([
        planItem({ productId: "p1", rank: 1 }),
        planItem({ productId: "p1", rank: 2 }),
      ]),
      EMPTY_STATUSES,
    );
    expect(batch.items).toHaveLength(2);
    expect(batch.items.every((item) => item.productId === "p1")).toBe(true);
    expect(batch.items.map((item) => item.rank)).toEqual([1, 2]);
  });

  it("deterministic çıktı: aynı girdi her zaman aynı sonucu üretir", () => {
    const plan = planOf(pendingItems(8));
    const first = buildTaskTimeline(plan, EMPTY_STATUSES);
    const second = buildTaskTimeline(plan, EMPTY_STATUSES);
    expect(first).toEqual(second);
  });

  it("input mutate edilmez — actionPlan.items ve statuses değişmeden kalır", () => {
    const items = [planItem({ productId: "p1", rank: 1 })];
    const plan = planOf(items);
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "snoozed", TODAY);
    const statusesSnapshot = new Map(statuses);

    buildTaskTimeline(plan, statuses);

    expect(plan.items).toEqual(items);
    expect(statuses).toEqual(statusesSnapshot);
  });
});

describe("buildTaskTimeline — özet sayıları", () => {
  it("summary alanları doğru toplanır", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "done1", "done", TODAY);
    statuses = withStatus(statuses, "snoozed1", "snoozed", TODAY);

    const batch = buildTaskTimeline(
      planOf([
        planItem({ productId: "pending1", rank: 1 }),
        planItem({ productId: "pending2", rank: 2 }),
        planItem({ productId: "done1", rank: 3 }),
        planItem({ productId: "snoozed1", rank: 4 }),
      ]),
      statuses,
    );

    expect(batch.summary).toEqual({
      totalItems: 4,
      activeItems: 3,
      nowItems: 2,
      todayItems: 0,
      laterItems: 1,
      completedItems: 1,
    });
  });
});

describe("buildTaskTimeline — yeniden hesaplama yapılmaz", () => {
  it("kaynak dosya forecast/reorder/lead-time/purchase-priority/purchase-action-plan/morning-brief hesap fonksiyonlarını içe aktarmaz, sort çağırmaz", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/task-timeline.ts", import.meta.url),
      ),
      "utf8",
    );
    const importLines = source
      .split("\n")
      .filter((line) => line.trimStart().startsWith("import "))
      .join("\n");

    expect(importLines).not.toMatch(/forecastStockCoverage|buildStockForecasts/);
    expect(importLines).not.toMatch(/buildStockAlerts/);
    expect(importLines).not.toMatch(
      /reorderRecommendationFor|buildReorderRecommendations/,
    );
    expect(importLines).not.toMatch(/leadTimeRiskFor|buildLeadTimeRisks/);
    expect(importLines).not.toMatch(/buildPurchasePriorities/);
    expect(importLines).not.toMatch(/buildPurchaseActionPlan\b/);
    expect(importLines).not.toMatch(/buildMorningBrief/);
    expect(source).not.toMatch(/\.sort\(/);
  });

  it("resolver ve CostPort import edilmez", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/task-timeline.ts", import.meta.url),
      ),
      "utf8",
    );

    expect(source).not.toMatch(/cost-resolver/);
    expect(source).not.toMatch(/CostPort/);
  });
});
