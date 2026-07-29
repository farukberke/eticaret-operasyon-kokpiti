import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { PurchaseActionStatusRecord } from "@/core/domain";
import type {
  PurchaseActionKind,
  PurchaseActionPlanBatch,
  PurchaseActionPlanItem,
} from "@/core/services/purchase-action-plan";
import { withStatus } from "@/core/services/purchase-action-status";
import { DEFAULT_RULES } from "@/core/services/rules.config";
import { buildSmartInsights } from "@/core/services/smart-insights";

/**
 * AKILLI İÇGÖRÜLER (SMART INSIGHTS).
 *
 * `buildSmartInsights` hiçbir şeyi yeniden hesaplamıyor: girdisi
 * `buildPurchaseActionPlan`in çıktısı (zaten rütbeli, zaten sınıflandırılmış)
 * ve kullanıcının verdiği durum kararları (`Map`). Testler bu yüzden
 * `ai-morning-brief.test.ts`/`task-timeline.test.ts`teki aynı desende:
 * durum × görünürlük tablosu, eşik davranışı, sabit önem sırası,
 * tekrarsızlık, deterministik id/çıktı ve saf davranış ayrı ayrı kovalanıyor.
 */

const TODAY = "2026-07-29";
const EMPTY_STATUSES: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
const CRITICAL_MIN = DEFAULT_RULES.smartInsights.criticalStockPressureMinCount;
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

function typesOf(batch: ReturnType<typeof buildSmartInsights>): string[] {
  return batch.insights.map((insight) => insight.type);
}

describe("buildSmartInsights — boş girdi", () => {
  it("boş plan: hiç içgörü üretilmez, summary sıfırlanır", () => {
    const batch = buildSmartInsights(planOf([]), EMPTY_STATUSES);
    expect(batch.insights).toEqual([]);
    expect(batch.summary).toEqual({
      totalInsights: 0,
      criticalInsights: 0,
      warningInsights: 0,
      positiveInsights: 0,
      neutralInsights: 0,
      activeRelatedActions: 0,
    });
  });

  it("boş status map: kayıtsız ürünler pending kabul edilir", () => {
    const batch = buildSmartInsights(
      planOf([planItem({ productId: "p1" }), planItem({ productId: "p2" })]),
      EMPTY_STATUSES,
    );
    expect(batch.summary.activeRelatedActions).toBe(2);
  });
});

describe("buildSmartInsights — yalnızca pending aksiyonlar", () => {
  it("az sayıda sakin pending aksiyon yalnızca operationsClear üretir", () => {
    const batch = buildSmartInsights(
      planOf([planItem({ productId: "p1" }), planItem({ productId: "p2", rank: 2 })]),
      EMPTY_STATUSES,
    );
    expect(typesOf(batch)).toEqual(["operationsClear"]);
    expect(batch.summary.neutralInsights).toBe(1);
  });
});

describe("buildSmartInsights — kritik stok baskısı", () => {
  it(`negative/critical alertState sayısı ${CRITICAL_MIN}'nin altındaysa üretilmez`, () => {
    const items = Array.from({ length: CRITICAL_MIN - 1 }, (_, i) =>
      planItem({ productId: `p${i + 1}`, rank: i + 1, alertState: "critical" }),
    );
    const batch = buildSmartInsights(planOf(items), EMPTY_STATUSES);
    expect(typesOf(batch)).not.toContain("criticalStockPressure");
  });

  it(`negative/critical alertState sayısı ${CRITICAL_MIN} ya da üstündeyse üretilir`, () => {
    const items = Array.from({ length: CRITICAL_MIN }, (_, i) =>
      planItem({ productId: `p${i + 1}`, rank: i + 1, alertState: "critical" }),
    );
    const batch = buildSmartInsights(planOf(items), EMPTY_STATUSES);
    const insight = batch.insights.find((i) => i.type === "criticalStockPressure");
    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("critical");
    expect(insight?.evidence.count).toBe(CRITICAL_MIN);
    expect(insight?.relatedProductIds).toEqual(items.map((i) => i.productId));
  });

  it("negative ve critical birlikte sayılır", () => {
    const batch = buildSmartInsights(
      planOf([
        planItem({ productId: "neg", alertState: "negative" }),
        planItem({ productId: "crit", rank: 2, alertState: "critical" }),
      ]),
      EMPTY_STATUSES,
    );
    const insight = batch.insights.find((i) => i.type === "criticalStockPressure");
    expect(insight?.evidence.count).toBe(2);
  });

  it("low seviyeli aksiyonlar sayılmaz", () => {
    const items = Array.from({ length: CRITICAL_MIN + 2 }, (_, i) =>
      planItem({ productId: `p${i + 1}`, rank: i + 1, alertState: "low" }),
    );
    const batch = buildSmartInsights(planOf(items), EMPTY_STATUSES);
    expect(typesOf(batch)).not.toContain("criticalStockPressure");
  });

  it("done/ignored aksiyonlar kritik stok baskısı sayımına dahil edilmez", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "done1", "done", TODAY);
    statuses = withStatus(statuses, "ignored1", "ignored", TODAY);

    const items = [
      planItem({ productId: "done1", rank: 1, alertState: "critical" }),
      planItem({ productId: "ignored1", rank: 2, alertState: "critical" }),
      ...Array.from({ length: CRITICAL_MIN - 1 }, (_, i) =>
        planItem({ productId: `active${i + 1}`, rank: i + 3, alertState: "critical" }),
      ),
    ];
    const batch = buildSmartInsights(planOf(items), statuses);
    expect(typesOf(batch)).not.toContain("criticalStockPressure");
  });
});

describe("buildSmartInsights — tedarik süresi riski", () => {
  it("late/dueToday tedarik süresi taşıyan aktif aksiyon varsa üretilir", () => {
    const batch = buildSmartInsights(
      planOf([
        planItem({ productId: "late", leadTimeState: "late" }),
        planItem({ productId: "due", rank: 2, leadTimeState: "dueToday" }),
        planItem({ productId: "upcoming", rank: 3, leadTimeState: "upcoming" }),
      ]),
      EMPTY_STATUSES,
    );
    const insight = batch.insights.find((i) => i.type === "leadTimeExposure");
    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("warning");
    expect(insight?.evidence.count).toBe(2);
    expect(insight?.relatedProductIds).toEqual(["late", "due"]);
  });

  it("yalnızca upcoming/safe/unknownLeadTime/unmeasurable varsa üretilmez", () => {
    const batch = buildSmartInsights(
      planOf([
        planItem({ productId: "p1", leadTimeState: "safe" }),
        planItem({ productId: "p2", rank: 2, leadTimeState: "unknownLeadTime" }),
      ]),
      EMPTY_STATUSES,
    );
    expect(typesOf(batch)).not.toContain("leadTimeExposure");
  });

  it("done/ignored aksiyonlar tedarik süresi sayımına dahil edilmez", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "done", TODAY);

    const batch = buildSmartInsights(
      planOf([planItem({ productId: "p1", leadTimeState: "late" })]),
      statuses,
    );
    expect(typesOf(batch)).not.toContain("leadTimeExposure");
  });
});

describe("buildSmartInsights — satın alma önceliği odağı", () => {
  it("en yüksek rütbeli aktif aksiyon actNow ise üretilir", () => {
    const batch = buildSmartInsights(
      planOf([
        planItem({ productId: "p1", rank: 1, action: "actNow" }),
        planItem({ productId: "p2", rank: 2, action: "planSoon" }),
      ]),
      EMPTY_STATUSES,
    );
    const insight = batch.insights.find((i) => i.type === "urgentPurchaseFocus");
    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("critical");
    expect(insight?.productId).toBe("p1");
    expect(insight?.evidence.rank).toBe(1);
  });

  it("en yüksek rütbeli aktif aksiyon actNow değilse üretilmez", () => {
    const batch = buildSmartInsights(
      planOf([planItem({ productId: "p1", rank: 1, action: "decideToday" })]),
      EMPTY_STATUSES,
    );
    expect(typesOf(batch)).not.toContain("urgentPurchaseFocus");
  });

  it("en yüksek rütbeli aksiyon done ise atlanır, bir sonraki aktif odak olur", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "done", TODAY);

    const batch = buildSmartInsights(
      planOf([
        planItem({ productId: "p1", rank: 1, action: "actNow" }),
        planItem({ productId: "p2", rank: 2, action: "actNow" }),
      ]),
      statuses,
    );
    const insight = batch.insights.find((i) => i.type === "urgentPurchaseFocus");
    expect(insight?.productId).toBe("p2");
  });
});

describe("buildSmartInsights — ertelenmiş görev birikimi", () => {
  it("en az bir snoozed aksiyon varsa üretilir", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "snoozed", TODAY);

    const batch = buildSmartInsights(planOf([planItem({ productId: "p1" })]), statuses);
    const insight = batch.insights.find((i) => i.type === "snoozedActionBacklog");
    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("warning");
    expect(insight?.evidence.count).toBe(1);
    expect(insight?.relatedProductIds).toEqual(["p1"]);
  });

  it("snoozed aksiyon hâlâ aktif sayılır (activeRelatedActions'a dahil)", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "snoozed", TODAY);

    const batch = buildSmartInsights(planOf([planItem({ productId: "p1" })]), statuses);
    expect(batch.summary.activeRelatedActions).toBe(1);
  });

  it("snoozed aksiyon yoksa üretilmez", () => {
    const batch = buildSmartInsights(
      planOf([planItem({ productId: "p1" })]),
      EMPTY_STATUSES,
    );
    expect(typesOf(batch)).not.toContain("snoozedActionBacklog");
  });
});

describe("buildSmartInsights — günlük ilerleme", () => {
  it("en az bir done aksiyon varsa üretilir", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "done", TODAY);

    const batch = buildSmartInsights(planOf([planItem({ productId: "p1" })]), statuses);
    const insight = batch.insights.find((i) => i.type === "executionProgress");
    expect(insight).toBeDefined();
    expect(insight?.severity).toBe("positive");
    expect(insight?.evidence.count).toBe(1);
    expect(insight?.relatedProductIds).toEqual(["p1"]);
  });

  it("done aksiyon yoksa üretilmez", () => {
    const batch = buildSmartInsights(
      planOf([planItem({ productId: "p1" })]),
      EMPTY_STATUSES,
    );
    expect(typesOf(batch)).not.toContain("executionProgress");
  });
});

describe("buildSmartInsights — ignored aksiyonların dışlanması", () => {
  it("ignored aksiyon hiçbir aktif ya da özet sayıma dahil edilmez", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "p1", "ignored", TODAY);

    const batch = buildSmartInsights(
      planOf([
        planItem({ productId: "p1", alertState: "critical", leadTimeState: "late" }),
      ]),
      statuses,
    );
    expect(batch.summary.activeRelatedActions).toBe(0);
    expect(typesOf(batch)).toEqual(["operationsClear"]);
  });
});

describe("buildSmartInsights — kayıtsız aksiyonun varsayılan davranışı", () => {
  it("status kaydı olmayan ürün pending kabul edilir, aktif sayılır", () => {
    const batch = buildSmartInsights(
      planOf([planItem({ productId: "p1" })]),
      EMPTY_STATUSES,
    );
    expect(batch.summary.activeRelatedActions).toBe(1);
  });
});

describe("buildSmartInsights — birden fazla içgörü türü ve sabit önem sırası", () => {
  it("birden fazla tür aynı anda üretilebilir, sıra critical→warning→positive→neutral izler", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "done1", "done", TODAY);
    statuses = withStatus(statuses, "snoozed1", "snoozed", TODAY);

    const criticalItems = Array.from({ length: CRITICAL_MIN }, (_, i) =>
      planItem({ productId: `crit${i + 1}`, rank: i + 1, alertState: "critical" }),
    );

    const batch = buildSmartInsights(
      planOf([
        planItem({ productId: "focus", rank: 0, action: "actNow" }),
        ...criticalItems,
        planItem({ productId: "leadtime", rank: 90, leadTimeState: "late" }),
        planItem({ productId: "snoozed1", rank: 91 }),
        planItem({ productId: "done1", rank: 92 }),
      ]),
      statuses,
    );

    expect(typesOf(batch)).toEqual([
      "criticalStockPressure",
      "urgentPurchaseFocus",
      "leadTimeExposure",
      "snoozedActionBacklog",
      "executionProgress",
    ]);
    expect(batch.insights.map((i) => i.severity)).toEqual([
      "critical",
      "critical",
      "warning",
      "warning",
      "positive",
    ]);
  });

  it("girdi sırası değişse de içgörü sırası aynı sabit sırayı izler", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "done1", "done", TODAY);

    const batch = buildSmartInsights(
      planOf([
        planItem({ productId: "done1", rank: 1 }),
        planItem({ productId: "leadtime", rank: 2, leadTimeState: "late" }),
      ]),
      statuses,
    );

    expect(typesOf(batch)).toEqual(["leadTimeExposure", "executionProgress"]);
  });
});

describe("buildSmartInsights — operasyon net", () => {
  it("kritik/uyarı içgörüsü yok ve aktif aksiyon sayısı nowLimit altındaysa üretilir", () => {
    const items = Array.from({ length: NOW_LIMIT }, (_, i) =>
      planItem({ productId: `p${i + 1}`, rank: i + 1 }),
    );
    const batch = buildSmartInsights(planOf(items), EMPTY_STATUSES);
    expect(typesOf(batch)).toEqual(["operationsClear"]);
    expect(batch.insights[0]?.evidence.count).toBe(NOW_LIMIT);
  });

  it("aktif aksiyon sayısı nowLimit'i aşarsa üretilmez", () => {
    const items = Array.from({ length: NOW_LIMIT + 1 }, (_, i) =>
      planItem({ productId: `p${i + 1}`, rank: i + 1 }),
    );
    const batch = buildSmartInsights(planOf(items), EMPTY_STATUSES);
    expect(typesOf(batch)).not.toContain("operationsClear");
  });

  it("kritik ya da uyarı türünde herhangi bir içgörü varsa üretilmez", () => {
    const batch = buildSmartInsights(
      planOf([planItem({ productId: "p1", rank: 1, leadTimeState: "late" })]),
      EMPTY_STATUSES,
    );
    expect(typesOf(batch)).not.toContain("operationsClear");
  });

  it("boş plan için üretilmez — değerlendirilecek veri yoksa iddia kurulmaz", () => {
    const batch = buildSmartInsights(planOf([]), EMPTY_STATUSES);
    expect(typesOf(batch)).not.toContain("operationsClear");
  });
});

describe("buildSmartInsights — desteklenmeyen veri için içgörü üretilmemesi", () => {
  it("aktif aksiyon sayısı yüksek ve hiçbir eşik aşılmamışsa hiç içgörü üretilmez", () => {
    const items = Array.from({ length: NOW_LIMIT + 3 }, (_, i) =>
      planItem({
        productId: `p${i + 1}`,
        rank: i + 1,
        alertState: "low",
        leadTimeState: "safe",
      }),
    );
    const batch = buildSmartInsights(planOf(items), EMPTY_STATUSES);
    expect(batch.insights).toEqual([]);
  });
});

describe("buildSmartInsights — tekrarsızlık ve deterministik kimlik", () => {
  it("her içgörü türü en fazla bir kez üretilir", () => {
    const criticalItems = Array.from({ length: CRITICAL_MIN + 5 }, (_, i) =>
      planItem({ productId: `p${i + 1}`, rank: i + 1, alertState: "critical" }),
    );
    const batch = buildSmartInsights(planOf(criticalItems), EMPTY_STATUSES);
    const types = typesOf(batch);
    expect(new Set(types).size).toBe(types.length);
  });

  it("id, tür ve (varsa) ürüne göre deterministik kurulur", () => {
    const batch = buildSmartInsights(
      planOf([planItem({ productId: "p1", rank: 1, action: "actNow" })]),
      EMPTY_STATUSES,
    );
    const focus = batch.insights.find((i) => i.type === "urgentPurchaseFocus");
    expect(focus?.id).toBe("smart-insight:urgentPurchaseFocus:p1");
  });

  it("ürüne bağlı olmayan içgörülerde id yalnızca türden kurulur", () => {
    const items = Array.from({ length: CRITICAL_MIN }, (_, i) =>
      planItem({ productId: `p${i + 1}`, rank: i + 1, alertState: "critical" }),
    );
    const batch = buildSmartInsights(planOf(items), EMPTY_STATUSES);
    const insight = batch.insights.find((i) => i.type === "criticalStockPressure");
    expect(insight?.id).toBe("smart-insight:criticalStockPressure");
  });

  it("en fazla beş içgörü üretilir — operationsClear, kritik/uyarı türleriyle asla birlikte oluşmaz", () => {
    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "done1", "done", TODAY);
    statuses = withStatus(statuses, "snoozed1", "snoozed", TODAY);

    const criticalItems = Array.from({ length: CRITICAL_MIN }, (_, i) =>
      planItem({ productId: `crit${i + 1}`, rank: i + 1, alertState: "critical" }),
    );

    const batch = buildSmartInsights(
      planOf([
        planItem({ productId: "focus", rank: 0, action: "actNow" }),
        ...criticalItems,
        planItem({ productId: "leadtime", rank: 90, leadTimeState: "late" }),
        planItem({ productId: "snoozed1", rank: 91 }),
        planItem({ productId: "done1", rank: 92 }),
      ]),
      statuses,
    );
    expect(batch.insights.length).toBeLessThanOrEqual(5);
    expect(typesOf(batch)).not.toContain("operationsClear");
  });
});

describe("buildSmartInsights — deterministik çıktı ve saf davranış", () => {
  it("aynı girdiyle iki çağrı aynı sonucu üretir", () => {
    const plan = planOf([
      planItem({ productId: "a", rank: 1, action: "actNow" }),
      planItem({ productId: "b", rank: 2, alertState: "low" }),
    ]);
    const first = buildSmartInsights(plan, EMPTY_STATUSES);
    const second = buildSmartInsights(plan, EMPTY_STATUSES);
    expect(first).toEqual(second);
  });

  it("input mutate edilmez: actionPlan.items ve statuses değişmeden kalır", () => {
    const items = [planItem({ productId: "a" }), planItem({ productId: "b" })];
    const plan = planOf(items);
    const snapshot = JSON.parse(JSON.stringify(items));

    let statuses: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
    statuses = withStatus(statuses, "a", "snoozed", TODAY);
    const statusesSnapshot = new Map(statuses);

    buildSmartInsights(plan, statuses);

    expect(items).toEqual(snapshot);
    expect(statuses).toEqual(statusesSnapshot);
  });

  it("duplicate productId çökmez, her girdi ayrı işlenir", () => {
    const batch = buildSmartInsights(
      planOf([
        planItem({ productId: "p1", rank: 1, alertState: "critical" }),
        planItem({ productId: "p1", rank: 2, alertState: "critical" }),
      ]),
      EMPTY_STATUSES,
    );
    expect(batch.summary.activeRelatedActions).toBe(2);
  });
});

describe("buildSmartInsights — yeniden hesaplama yapılmaz / Analysis Window korunması", () => {
  it("kaynak dosya forecast/reorder/lead-time/purchase-priority/purchase-action-plan/morning-brief/task-timeline hesap fonksiyonlarını içe aktarmaz", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/smart-insights.ts", import.meta.url),
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
  });

  it("kaynak dosya analiz penceresi/tarih hesaplarını hiç içe aktarmaz", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/smart-insights.ts", import.meta.url),
      ),
      "utf8",
    );
    expect(source).not.toMatch(/analysis-window/);
    expect(source).not.toMatch(/resolveAnalysisWindow|DateRange/);
  });

  it("kaynak dosya Array.prototype.sort çağırmaz — sabit sıra tek geçişte kurulur", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/smart-insights.ts", import.meta.url),
      ),
      "utf8",
    );
    expect(source).not.toMatch(/\.sort\(/);
  });

  it("resolver, CostPort ve para (Money) hiç import edilmez — yeni finansal metrik üretilmez", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/smart-insights.ts", import.meta.url),
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
        new URL("../../src/core/services/smart-insights.ts", import.meta.url),
      ),
      "utf8",
    );
    expect(source).not.toMatch(/Date\.now\(\)/);
    expect(source).not.toMatch(/crypto\.randomUUID|uuid/i);
  });
});
