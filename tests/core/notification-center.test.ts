import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { PurchaseActionStatusRecord } from "@/core/domain";
import { buildNotificationCenter } from "@/core/services/notification-center";
import type {
  PurchaseActionKind,
  PurchaseActionPlanBatch,
  PurchaseActionPlanItem,
} from "@/core/services/purchase-action-plan";
import { withStatus } from "@/core/services/purchase-action-status";
import { DEFAULT_RULES } from "@/core/services/rules.config";

/**
 * UYARI MERKEZİ (NOTIFICATION CENTER).
 *
 * `buildNotificationCenter` hiçbir şeyi yeniden hesaplamıyor: girdisi
 * `buildPurchaseActionPlan`in çıktısı (zaten rütbeli, zaten sınıflandırılmış)
 * ve kullanıcının verdiği durum kararları (`Map`). Testler bu yüzden
 * `smart-insights.test.ts`/`task-timeline.test.ts`teki aynı desende: durum ×
 * görünürlük tablosu, limit davranışı, sabit tür sırası, tekrarsızlık,
 * deterministik id/çıktı ve saf davranış ayrı ayrı kovalanıyor.
 */

const TODAY = "2026-07-29";
const EMPTY_STATUSES: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
const MAX_PER_TYPE = DEFAULT_RULES.priority.cockpitLimit;
const NOW_LIMIT = DEFAULT_RULES.taskTimeline.nowLimit;

function planItem(
  overrides: Partial<PurchaseActionPlanItem> = {},
): PurchaseActionPlanItem {
  return {
    productId: "p1",
    rank: 1,
    action: "planSoon",
    recommendedQuantity: null,
    alertState: "low",
    leadTimeState: "safe",
    daysRemaining: 20,
    orderDecisionDays: 10,
    shortageGapDays: null,
    reason: "lowStock",
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

function typesOf(center: ReturnType<typeof buildNotificationCenter>): string[] {
  return center.notifications.map((n) => n.type);
}

describe("buildNotificationCenter — boş girdi", () => {
  it("boş plan: hiç bildirim üretilmez, summary sıfırlanır", () => {
    const center = buildNotificationCenter(planOf([]), EMPTY_STATUSES);
    expect(center.notifications).toEqual([]);
    expect(center.summary).toEqual({
      totalNotifications: 0,
      criticalNotifications: 0,
      warningNotifications: 0,
      positiveNotifications: 0,
      neutralNotifications: 0,
      activeRelatedActions: 0,
      hiddenByLimit: 0,
    });
  });

  it("boş status map: kayıtsız ürünler pending kabul edilir", () => {
    const center = buildNotificationCenter(
      planOf([planItem({ productId: "p1" }), planItem({ productId: "p2", rank: 2 })]),
      EMPTY_STATUSES,
    );
    expect(center.summary.activeRelatedActions).toBe(2);
  });
});

describe("buildNotificationCenter — yalnızca pending aksiyonlar", () => {
  it("az sayıda sakin pending aksiyon yalnızca operationsClear üretir", () => {
    const center = buildNotificationCenter(
      planOf([planItem({ productId: "p1" }), planItem({ productId: "p2", rank: 2 })]),
      EMPTY_STATUSES,
    );
    expect(typesOf(center)).toEqual(["operationsClear"]);
    expect(center.summary.neutralNotifications).toBe(1);
  });
});

describe("buildNotificationCenter — kritik satın alma aksiyonu", () => {
  it("pending + actNow aksiyon için criticalAction üretilir", () => {
    const center = buildNotificationCenter(
      planOf([planItem({ productId: "p1", rank: 1, action: "actNow" })]),
      EMPTY_STATUSES,
    );
    const notification = center.notifications.find((n) => n.type === "criticalAction");
    expect(notification).toBeDefined();
    expect(notification?.severity).toBe("critical");
    expect(notification?.source).toBe("purchaseActionPlan");
    expect(notification?.productId).toBe("p1");
    expect(notification?.status).toBe("pending");
    expect(notification?.evidence).toEqual({ count: 1, rank: 1 });
  });

  it("actNow olmayan aksiyon criticalAction üretmez", () => {
    const center = buildNotificationCenter(
      planOf([planItem({ productId: "p1", rank: 1, action: "decideToday" })]),
      EMPTY_STATUSES,
    );
    expect(typesOf(center)).not.toContain("criticalAction");
  });

  it("birden fazla actNow aksiyon rütbe sırasıyla MAX_PER_TYPE kadar bildirim üretir", () => {
    const items = Array.from({ length: MAX_PER_TYPE + 2 }, (_, i) =>
      planItem({ productId: `p${i + 1}`, rank: i + 1, action: "actNow" }),
    );
    const center = buildNotificationCenter(planOf(items), EMPTY_STATUSES);
    const criticals = center.notifications.filter((n) => n.type === "criticalAction");
    expect(criticals).toHaveLength(MAX_PER_TYPE);
    expect(criticals.map((n) => n.productId)).toEqual(
      items.slice(0, MAX_PER_TYPE).map((i) => i.productId),
    );
    expect(center.summary.hiddenByLimit).toBe(2);
  });

  it("done/ignored aksiyonlar criticalAction üretmez", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "done1", "done", TODAY);
    statuses = withStatus(statuses, "ignored1", "ignored", TODAY);

    const center = buildNotificationCenter(
      planOf([
        planItem({ productId: "done1", rank: 1, action: "actNow" }),
        planItem({ productId: "ignored1", rank: 2, action: "actNow" }),
      ]),
      statuses,
    );
    expect(typesOf(center)).not.toContain("criticalAction");
  });

  it("snoozed actNow aksiyon criticalAction üretmez — snoozedAction'da toplanır, tamamen kaybolmaz", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "snoozed", TODAY);

    const center = buildNotificationCenter(
      planOf([planItem({ productId: "p1", rank: 1, action: "actNow" })]),
      statuses,
    );
    expect(typesOf(center)).not.toContain("criticalAction");
    expect(typesOf(center)).toContain("snoozedAction");
    expect(center.summary.activeRelatedActions).toBe(1);
  });
});

describe("buildNotificationCenter — tedarik süresi riski", () => {
  it("pending + late/dueToday (actNow değilse) leadTimeRisk üretilir", () => {
    const center = buildNotificationCenter(
      planOf([
        planItem({
          productId: "p1",
          rank: 1,
          action: "decideToday",
          leadTimeState: "dueToday",
        }),
      ]),
      EMPTY_STATUSES,
    );
    const notification = center.notifications.find((n) => n.type === "leadTimeRisk");
    expect(notification).toBeDefined();
    expect(notification?.severity).toBe("warning");
    expect(notification?.productId).toBe("p1");
    expect(notification?.evidence).toEqual({ count: 1, rank: 1 });
  });

  it("actNow aksiyon aynı zamanda late lead-time taşısa bile yalnızca criticalAction üretilir, leadTimeRisk üretilmez", () => {
    const center = buildNotificationCenter(
      planOf([
        planItem({
          productId: "p1",
          rank: 1,
          action: "actNow",
          leadTimeState: "late",
        }),
      ]),
      EMPTY_STATUSES,
    );
    expect(typesOf(center)).toEqual(["criticalAction"]);
    expect(typesOf(center)).not.toContain("leadTimeRisk");
  });

  it("upcoming/safe/unknownLeadTime/unmeasurable leadTimeRisk üretmez", () => {
    const center = buildNotificationCenter(
      planOf([
        planItem({ productId: "p1", rank: 1, leadTimeState: "safe" }),
        planItem({ productId: "p2", rank: 2, leadTimeState: "unknownLeadTime" }),
      ]),
      EMPTY_STATUSES,
    );
    expect(typesOf(center)).not.toContain("leadTimeRisk");
  });

  it("birden fazla leadTimeRisk adayı plan sırasıyla MAX_PER_TYPE kadar bildirim üretir", () => {
    const items = Array.from({ length: MAX_PER_TYPE + 1 }, (_, i) =>
      planItem({
        productId: `p${i + 1}`,
        rank: i + 1,
        action: "decideToday",
        leadTimeState: "dueToday",
      }),
    );
    const center = buildNotificationCenter(planOf(items), EMPTY_STATUSES);
    const risks = center.notifications.filter((n) => n.type === "leadTimeRisk");
    expect(risks).toHaveLength(MAX_PER_TYPE);
    expect(center.summary.hiddenByLimit).toBe(1);
  });

  it("done/ignored/snoozed aksiyonlar leadTimeRisk üretmez", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "done1", "done", TODAY);
    statuses = withStatus(statuses, "snoozed1", "snoozed", TODAY);

    const center = buildNotificationCenter(
      planOf([
        planItem({
          productId: "done1",
          rank: 1,
          action: "decideToday",
          leadTimeState: "late",
        }),
        planItem({
          productId: "snoozed1",
          rank: 2,
          action: "decideToday",
          leadTimeState: "late",
        }),
      ]),
      statuses,
    );
    expect(typesOf(center)).not.toContain("leadTimeRisk");
  });
});

describe("buildNotificationCenter — ertelenmiş görev", () => {
  it("en az bir snoozed aksiyon varsa snoozedAction üretilir", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "snoozed", TODAY);

    const center = buildNotificationCenter(
      planOf([planItem({ productId: "p1" })]),
      statuses,
    );
    const notification = center.notifications.find((n) => n.type === "snoozedAction");
    expect(notification).toBeDefined();
    expect(notification?.severity).toBe("warning");
    expect(notification?.source).toBe("purchaseActionStatus");
    expect(notification?.productId).toBeNull();
    expect(notification?.evidence).toEqual({ count: 1, rank: null });
  });

  it("birden fazla snoozed aksiyon tek bir aggregate bildirimde toplanır", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "snoozed", TODAY);
    statuses = withStatus(statuses, "p2", "snoozed", TODAY);

    const center = buildNotificationCenter(
      planOf([
        planItem({ productId: "p1", rank: 1 }),
        planItem({ productId: "p2", rank: 2 }),
      ]),
      statuses,
    );
    const snoozed = center.notifications.filter((n) => n.type === "snoozedAction");
    expect(snoozed).toHaveLength(1);
    expect(snoozed[0]?.evidence.count).toBe(2);
  });

  it("snoozed aksiyon yoksa üretilmez", () => {
    const center = buildNotificationCenter(
      planOf([planItem({ productId: "p1" })]),
      EMPTY_STATUSES,
    );
    expect(typesOf(center)).not.toContain("snoozedAction");
  });
});

describe("buildNotificationCenter — tamamlanan görev", () => {
  it("en az bir done aksiyon varsa completedAction üretilir", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "done", TODAY);

    const center = buildNotificationCenter(
      planOf([planItem({ productId: "p1" })]),
      statuses,
    );
    const notification = center.notifications.find((n) => n.type === "completedAction");
    expect(notification).toBeDefined();
    expect(notification?.severity).toBe("positive");
    expect(notification?.source).toBe("purchaseActionStatus");
    expect(notification?.productId).toBeNull();
    expect(notification?.evidence).toEqual({ count: 1, rank: null });
  });

  it("done aksiyon yoksa üretilmez", () => {
    const center = buildNotificationCenter(
      planOf([planItem({ productId: "p1" })]),
      EMPTY_STATUSES,
    );
    expect(typesOf(center)).not.toContain("completedAction");
  });

  it("done aksiyon activeRelatedActions'a dahil edilmez", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "done", TODAY);

    const center = buildNotificationCenter(
      planOf([planItem({ productId: "p1" })]),
      statuses,
    );
    expect(center.summary.activeRelatedActions).toBe(0);
  });
});

describe("buildNotificationCenter — ignored aksiyonların dışlanması", () => {
  it("ignored aksiyon hiçbir aktif ya da özet sayıma dahil edilmez, criticalAction/leadTimeRisk üretmez", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "ignored", TODAY);

    const center = buildNotificationCenter(
      planOf([planItem({ productId: "p1", action: "actNow", leadTimeState: "late" })]),
      statuses,
    );
    expect(center.summary.activeRelatedActions).toBe(0);
    expect(typesOf(center)).not.toContain("criticalAction");
    expect(typesOf(center)).not.toContain("leadTimeRisk");
    // Yoksayılan tek aksiyon dışında aktif hiçbir iş yok — plan hâlâ var
    // olduğu için sakin durum operationsClear ile ifade edilir.
    expect(typesOf(center)).toEqual(["operationsClear"]);
  });
});

describe("buildNotificationCenter — status kaydı olmayan aksiyonun varsayılan davranışı", () => {
  it("status kaydı olmayan ürün pending kabul edilir, aktif sayılır", () => {
    const center = buildNotificationCenter(
      planOf([planItem({ productId: "p1", action: "actNow" })]),
      EMPTY_STATUSES,
    );
    expect(center.summary.activeRelatedActions).toBe(1);
    expect(typesOf(center)).toContain("criticalAction");
  });
});

describe("buildNotificationCenter — birden fazla tür ve sabit sıra", () => {
  it("birden fazla tür aynı anda üretilebilir, sıra criticalAction→leadTimeRisk→snoozedAction→completedAction izler", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "done1", "done", TODAY);
    statuses = withStatus(statuses, "snoozed1", "snoozed", TODAY);

    const center = buildNotificationCenter(
      planOf([
        planItem({ productId: "critical1", rank: 1, action: "actNow" }),
        planItem({
          productId: "leadtime1",
          rank: 2,
          action: "decideToday",
          leadTimeState: "dueToday",
        }),
        planItem({ productId: "snoozed1", rank: 3 }),
        planItem({ productId: "done1", rank: 4 }),
      ]),
      statuses,
    );

    expect(typesOf(center)).toEqual([
      "criticalAction",
      "leadTimeRisk",
      "snoozedAction",
      "completedAction",
    ]);
    expect(center.notifications.map((n) => n.severity)).toEqual([
      "critical",
      "warning",
      "warning",
      "positive",
    ]);
  });

  it("girdi sırası değişse de bildirim sırası aynı sabit sırayı izler", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "done1", "done", TODAY);

    const center = buildNotificationCenter(
      planOf([
        planItem({ productId: "done1", rank: 1 }),
        planItem({ productId: "critical1", rank: 2, action: "actNow" }),
      ]),
      statuses,
    );

    expect(typesOf(center)).toEqual(["criticalAction", "completedAction"]);
  });
});

describe("buildNotificationCenter — operasyon net", () => {
  it("kritik/uyarı bildirimi yok ve aktif aksiyon sayısı nowLimit altındaysa üretilir", () => {
    const items = Array.from({ length: NOW_LIMIT }, (_, i) =>
      planItem({ productId: `p${i + 1}`, rank: i + 1 }),
    );
    const center = buildNotificationCenter(planOf(items), EMPTY_STATUSES);
    expect(typesOf(center)).toEqual(["operationsClear"]);
    expect(center.notifications[0]?.evidence.count).toBe(NOW_LIMIT);
  });

  it("aktif aksiyon sayısı nowLimit'i aşarsa üretilmez", () => {
    const items = Array.from({ length: NOW_LIMIT + 1 }, (_, i) =>
      planItem({ productId: `p${i + 1}`, rank: i + 1 }),
    );
    const center = buildNotificationCenter(planOf(items), EMPTY_STATUSES);
    expect(typesOf(center)).not.toContain("operationsClear");
  });

  it("kritik ya da uyarı türünde herhangi bir bildirim varsa üretilmez", () => {
    const center = buildNotificationCenter(
      planOf([
        planItem({
          productId: "p1",
          rank: 1,
          action: "decideToday",
          leadTimeState: "dueToday",
        }),
      ]),
      EMPTY_STATUSES,
    );
    expect(typesOf(center)).not.toContain("operationsClear");
  });

  it("boş plan için üretilmez — değerlendirilecek veri yoksa iddia kurulmaz", () => {
    const center = buildNotificationCenter(planOf([]), EMPTY_STATUSES);
    expect(typesOf(center)).not.toContain("operationsClear");
  });

  it("completedAction (positive) varlığında da operationsClear üretilebilir", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "done1", "done", TODAY);

    const center = buildNotificationCenter(
      planOf([
        planItem({ productId: "p1", rank: 1 }),
        planItem({ productId: "done1", rank: 2 }),
      ]),
      statuses,
    );
    expect(typesOf(center)).toContain("operationsClear");
    expect(typesOf(center)).toContain("completedAction");
  });
});

describe("buildNotificationCenter — desteklenmeyen veri için bildirim üretilmemesi", () => {
  it("aktif aksiyon sayısı yüksek ve hiçbir eşik aşılmamışsa hiç bildirim üretilmez", () => {
    const items = Array.from({ length: NOW_LIMIT + 3 }, (_, i) =>
      planItem({
        productId: `p${i + 1}`,
        rank: i + 1,
        action: "planSoon",
        alertState: "low",
        leadTimeState: "safe",
      }),
    );
    const center = buildNotificationCenter(planOf(items), EMPTY_STATUSES);
    expect(center.notifications).toEqual([]);
  });

  it("mali veya satış tahmini alanı hiç üretilmez", () => {
    const center = buildNotificationCenter(
      planOf([planItem({ productId: "p1", action: "actNow" })]),
      EMPTY_STATUSES,
    );
    for (const notification of center.notifications) {
      expect(notification).not.toHaveProperty("moneyAtStake");
      expect(notification).not.toHaveProperty("revenue");
      expect(notification).not.toHaveProperty("profit");
    }
  });
});

describe("buildNotificationCenter — tekrarsızlık ve deterministik kimlik", () => {
  it("bir ürün en fazla bir bildirim türünde görünür (aynı ürün iki kez bildirilmez)", () => {
    const center = buildNotificationCenter(
      planOf([
        planItem({
          productId: "p1",
          rank: 1,
          action: "actNow",
          leadTimeState: "late",
        }),
      ]),
      EMPTY_STATUSES,
    );
    const productIds = center.notifications
      .map((n) => n.productId)
      .filter((id): id is string => id !== null);
    expect(new Set(productIds).size).toBe(productIds.length);
  });

  it("id, tür ve (varsa) ürüne göre deterministik kurulur", () => {
    const center = buildNotificationCenter(
      planOf([planItem({ productId: "p1", rank: 1, action: "actNow" })]),
      EMPTY_STATUSES,
    );
    const critical = center.notifications.find((n) => n.type === "criticalAction");
    expect(critical?.id).toBe("notification:criticalAction:p1");
  });

  it("ürüne bağlı olmayan (aggregate) bildirimlerde id yalnızca türden kurulur", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "snoozed", TODAY);

    const center = buildNotificationCenter(
      planOf([planItem({ productId: "p1" })]),
      statuses,
    );
    const notification = center.notifications.find((n) => n.type === "snoozedAction");
    expect(notification?.id).toBe("notification:snoozedAction");
  });

  it("her bildirim türü en fazla bir aggregate bildirim üretir", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "s1", "snoozed", TODAY);
    statuses = withStatus(statuses, "s2", "snoozed", TODAY);
    statuses = withStatus(statuses, "d1", "done", TODAY);
    statuses = withStatus(statuses, "d2", "done", TODAY);

    const center = buildNotificationCenter(
      planOf([
        planItem({ productId: "s1", rank: 1 }),
        planItem({ productId: "s2", rank: 2 }),
        planItem({ productId: "d1", rank: 3 }),
        planItem({ productId: "d2", rank: 4 }),
      ]),
      statuses,
    );
    const types = typesOf(center);
    expect(new Set(types).size).toBe(types.length);
  });
});

describe("buildNotificationCenter — bildirim limiti", () => {
  it("kritik bildirim, uyarı düzeyindeki tedarik süresi bildirimleri yüzünden kesilmez", () => {
    const criticalItems = Array.from({ length: MAX_PER_TYPE }, (_, i) =>
      planItem({ productId: `crit${i + 1}`, rank: i + 1, action: "actNow" }),
    );
    const leadTimeItems = Array.from({ length: MAX_PER_TYPE + 5 }, (_, i) =>
      planItem({
        productId: `lead${i + 1}`,
        rank: MAX_PER_TYPE + i + 1,
        action: "decideToday",
        leadTimeState: "dueToday",
      }),
    );
    const center = buildNotificationCenter(
      planOf([...criticalItems, ...leadTimeItems]),
      EMPTY_STATUSES,
    );
    const criticals = center.notifications.filter((n) => n.type === "criticalAction");
    expect(criticals).toHaveLength(MAX_PER_TYPE);
  });

  it("hiddenByLimit summary'de doğru hesaplanır", () => {
    const items = Array.from({ length: MAX_PER_TYPE + 4 }, (_, i) =>
      planItem({ productId: `p${i + 1}`, rank: i + 1, action: "actNow" }),
    );
    const center = buildNotificationCenter(planOf(items), EMPTY_STATUSES);
    expect(center.summary.hiddenByLimit).toBe(4);
  });

  it("limit altındaysa hiddenByLimit sıfırdır", () => {
    const center = buildNotificationCenter(
      planOf([planItem({ productId: "p1", action: "actNow" })]),
      EMPTY_STATUSES,
    );
    expect(center.summary.hiddenByLimit).toBe(0);
  });
});

describe("buildNotificationCenter — deterministik çıktı ve saf davranış", () => {
  it("aynı girdiyle iki çağrı aynı sonucu üretir", () => {
    const plan = planOf([
      planItem({ productId: "a", rank: 1, action: "actNow" }),
      planItem({ productId: "b", rank: 2, alertState: "low" }),
    ]);
    const first = buildNotificationCenter(plan, EMPTY_STATUSES);
    const second = buildNotificationCenter(plan, EMPTY_STATUSES);
    expect(first).toEqual(second);
  });

  it("input mutate edilmez: actionPlan.items ve statuses değişmeden kalır", () => {
    const items = [planItem({ productId: "a" }), planItem({ productId: "b" })];
    const plan = planOf(items);
    const snapshot = JSON.parse(JSON.stringify(items));

    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "a", "snoozed", TODAY);
    const statusesSnapshot = new Map(statuses);

    buildNotificationCenter(plan, statuses);

    expect(items).toEqual(snapshot);
    expect(statuses).toEqual(statusesSnapshot);
  });

  it("duplicate productId çökmez, her girdi ayrı işlenir", () => {
    const center = buildNotificationCenter(
      planOf([
        planItem({ productId: "p1", rank: 1, action: "actNow" }),
        planItem({ productId: "p1", rank: 2, action: "actNow" }),
      ]),
      EMPTY_STATUSES,
    );
    expect(center.summary.activeRelatedActions).toBe(2);
    expect(
      center.notifications.filter((n) => n.type === "criticalAction"),
    ).toHaveLength(2);
  });
});

describe("buildNotificationCenter — yeniden hesaplama yapılmaz / Analysis Window korunması", () => {
  it("kaynak dosya forecast/reorder/lead-time/purchase-priority/purchase-action-plan/morning-brief/task-timeline/smart-insights hesap fonksiyonlarını içe aktarmaz", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/notification-center.ts", import.meta.url),
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
    expect(importLines).not.toMatch(/buildTaskTimeline/);
    expect(importLines).not.toMatch(/buildSmartInsights/);
  });

  it("kaynak dosya analiz penceresi/tarih hesaplarını hiç içe aktarmaz", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/notification-center.ts", import.meta.url),
      ),
      "utf8",
    );
    expect(source).not.toMatch(/analysis-window/);
    expect(source).not.toMatch(/resolveAnalysisWindow|DateRange/);
  });

  it("kaynak dosya Array.prototype.sort çağırmaz — sabit sıra tek geçişte kurulur", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/notification-center.ts", import.meta.url),
      ),
      "utf8",
    );
    expect(source).not.toMatch(/\.sort\(/);
  });

  it("resolver, CostPort ve para (Money) hiç import edilmez — yeni finansal metrik üretilmez", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/notification-center.ts", import.meta.url),
      ),
      "utf8",
    );
    expect(source).not.toMatch(/cost-resolver/);
    expect(source).not.toMatch(/CostPort/);
    expect(source).not.toMatch(/from ["']\.\.\/domain\/money["']/);
    expect(source).not.toMatch(/\blira\(/);
  });

  it("kaynak dosya Date.now ya da rastgele kimlik üretimi kullanmaz", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/notification-center.ts", import.meta.url),
      ),
      "utf8",
    );
    expect(source).not.toMatch(/Date\.now\(\)/);
    expect(source).not.toMatch(/crypto\.randomUUID|uuid/i);
  });
});
