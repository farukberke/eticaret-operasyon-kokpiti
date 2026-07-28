import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { PurchaseActionStatusRecord } from "@/core/domain";
import { buildMorningBrief } from "@/core/services/ai-morning-brief";
import type {
  PurchaseActionPlanBatch,
  PurchaseActionPlanItem,
} from "@/core/services/purchase-action-plan";
import { withStatus } from "@/core/services/purchase-action-status";

/**
 * SABAH ÖZETİ (AI MORNING BRIEF).
 *
 * `buildMorningBrief` hiçbir şeyi yeniden hesaplamıyor: girdisi
 * `buildPurchaseActionPlan`in çıktısı (zaten rütbeli, zaten sınıflandırılmış)
 * ve kullanıcının verdiği durum kararları (`Map`). Testler bu yüzden
 * durum × görünürlük tablosunu (pending/snoozed aktif, done/ignored değil),
 * kritik/tedarik süresi sayaçlarını, odak seçimini (rütbeye göre ilk aktif),
 * sıranın korunmasını ve saf/deterministik davranışı ayrı ayrı kovalıyor.
 */

const EMPTY_STATUSES: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
const TODAY = "2026-07-29";

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
  return {
    items,
    summary: {
      total: items.length,
      actNowCount: items.filter((i) => i.action === "actNow").length,
      decideTodayCount: items.filter((i) => i.action === "decideToday").length,
      planSoonCount: items.filter((i) => i.action === "planSoon").length,
      completeDataCount: items.filter((i) => i.action === "completeData").length,
      reviewCount: items.filter((i) => i.action === "review").length,
    },
  };
}

describe("buildMorningBrief — boş girdi", () => {
  it("boş plan: tüm sayaçlar sıfır, items boş, focus null", () => {
    const brief = buildMorningBrief(planOf([]), EMPTY_STATUSES);
    expect(brief.summary).toEqual({
      total: 0,
      activeActions: 0,
      completedActions: 0,
      snoozedActions: 0,
      ignoredActions: 0,
      criticalActions: 0,
    });
    expect(brief.items).toEqual([]);
    expect(brief.focus).toBeNull();
  });
});

describe("buildMorningBrief — yalnızca pending", () => {
  it("kayıtsız ürünler pending sayılır, aktif aksiyon olarak görünür", () => {
    const brief = buildMorningBrief(
      planOf([planItem({ productId: "a" }), planItem({ productId: "b" })]),
      EMPTY_STATUSES,
    );
    expect(brief.summary.activeActions).toBe(2);
    expect(brief.summary.completedActions).toBe(0);
    expect(brief.summary.ignoredActions).toBe(0);
  });
});

describe("buildMorningBrief — done filtreleme", () => {
  it("done ürün aktif sayılmaz ama completedActions'da sayılır", () => {
    const states = withStatus(EMPTY_STATUSES, "p1", "done", TODAY);
    const brief = buildMorningBrief(planOf([planItem({ productId: "p1" })]), states);
    expect(brief.summary.activeActions).toBe(0);
    expect(brief.summary.completedActions).toBe(1);
    expect(brief.focus).toBeNull();
  });
});

describe("buildMorningBrief — ignored filtreleme", () => {
  it("ignored ürün aktif sayılmaz ama ignoredActions'da sayılır", () => {
    const states = withStatus(EMPTY_STATUSES, "p1", "ignored", TODAY);
    const brief = buildMorningBrief(planOf([planItem({ productId: "p1" })]), states);
    expect(brief.summary.activeActions).toBe(0);
    expect(brief.summary.ignoredActions).toBe(1);
    expect(brief.focus).toBeNull();
  });

  it("ignored bir aksiyon items listesinde satır olarak hiç üretilmez", () => {
    const states = withStatus(EMPTY_STATUSES, "p1", "ignored", TODAY);
    const brief = buildMorningBrief(planOf([planItem({ productId: "p1" })]), states);
    expect(brief.items.some((item) => item.kind === "activeActions")).toBe(false);
  });
});

describe("buildMorningBrief — snoozed görünürlüğü", () => {
  it("snoozed ürün aktif sayılır (pending gibi) ve ayrıca snoozedActions'da sayılır", () => {
    const states = withStatus(EMPTY_STATUSES, "p1", "snoozed", TODAY);
    const brief = buildMorningBrief(planOf([planItem({ productId: "p1" })]), states);
    expect(brief.summary.activeActions).toBe(1);
    expect(brief.summary.snoozedActions).toBe(1);
    expect(brief.focus).toEqual({ productId: "p1", rank: 1 });
  });
});

describe("buildMorningBrief — summary oluşturma", () => {
  it("karışık durumlar doğru sayılır", () => {
    let states = withStatus(EMPTY_STATUSES, "a", "done", TODAY);
    states = withStatus(states, "b", "snoozed", TODAY);
    states = withStatus(states, "c", "ignored", TODAY);
    // d kayıtsız -> pending.
    const brief = buildMorningBrief(
      planOf([
        planItem({ productId: "a", rank: 1 }),
        planItem({ productId: "b", rank: 2 }),
        planItem({ productId: "c", rank: 3 }),
        planItem({ productId: "d", rank: 4 }),
      ]),
      states,
    );
    expect(brief.summary).toEqual({
      total: 4,
      activeActions: 2, // b (snoozed) + d (pending)
      completedActions: 1,
      snoozedActions: 1,
      ignoredActions: 1,
      criticalActions: 2,
    });
  });
});

describe("buildMorningBrief — kritik/tedarik süresi sayaçları", () => {
  it("negative/critical alertState kritik sayılır, low sayılmaz", () => {
    const brief = buildMorningBrief(
      planOf([
        planItem({ productId: "neg", alertState: "negative", leadTimeState: "safe" }),
        planItem({ productId: "crit", alertState: "critical", leadTimeState: "safe" }),
        planItem({ productId: "low", alertState: "low", leadTimeState: "safe" }),
      ]),
      EMPTY_STATUSES,
    );
    const criticalStockLine = brief.items.find((item) => item.kind === "criticalStock");
    expect(criticalStockLine?.count).toBe(2);
  });

  it("late/dueToday tedarik süresi riski sayılır, upcoming/safe sayılmaz", () => {
    const brief = buildMorningBrief(
      planOf([
        planItem({ productId: "late", leadTimeState: "late" }),
        planItem({ productId: "due", leadTimeState: "dueToday" }),
        planItem({ productId: "upcoming", leadTimeState: "upcoming" }),
        planItem({ productId: "safe", leadTimeState: "safe" }),
      ]),
      EMPTY_STATUSES,
    );
    const leadTimeLine = brief.items.find((item) => item.kind === "leadTimeRisk");
    expect(leadTimeLine?.count).toBe(2);
  });

  it("done/ignored ürünler kritik sayaçlara hiç girmez", () => {
    const states = withStatus(EMPTY_STATUSES, "p1", "done", TODAY);
    const brief = buildMorningBrief(
      planOf([
        planItem({ productId: "p1", alertState: "negative", leadTimeState: "late" }),
      ]),
      states,
    );
    expect(brief.summary.criticalActions).toBe(0);
  });
});

describe("buildMorningBrief — sıralamanın korunması / odak seçimi", () => {
  it("focus, rütbeye göre ilk aktif ürünü seçer — ikinci bir sıralama yapılmaz", () => {
    const states = withStatus(EMPTY_STATUSES, "birinci", "done", TODAY);
    const brief = buildMorningBrief(
      planOf([
        planItem({ productId: "birinci", rank: 1 }),
        planItem({ productId: "ikinci", rank: 2 }),
        planItem({ productId: "ucuncu", rank: 3 }),
      ]),
      states,
    );
    // birinci done olduğu için atlanır, ikinci focus olur.
    expect(brief.focus).toEqual({ productId: "ikinci", rank: 2 });
  });

  it("girdi rütbe sırası dışında bir sıra üretmez — items her zaman aynı sabit sırayla döner", () => {
    const brief = buildMorningBrief(
      planOf([
        planItem({ productId: "a", alertState: "critical", leadTimeState: "late" }),
      ]),
      EMPTY_STATUSES,
    );
    expect(brief.items.map((item) => item.kind)).toEqual([
      "activeActions",
      "criticalStock",
      "leadTimeRisk",
    ]);
  });
});

describe("buildMorningBrief — duplicate product", () => {
  it("aynı productId iki kez geçerse çökmez, her girdi ayrı sayılır", () => {
    const brief = buildMorningBrief(
      planOf([
        planItem({ productId: "p1", rank: 1 }),
        planItem({ productId: "p1", rank: 2 }),
      ]),
      EMPTY_STATUSES,
    );
    expect(brief.summary.activeActions).toBe(2);
    expect(brief.focus).toEqual({ productId: "p1", rank: 1 });
  });
});

describe("buildMorningBrief — deterministik çıktı", () => {
  it("aynı girdiyle iki çağrı aynı sonucu üretir", () => {
    const plan = planOf([
      planItem({ productId: "a", rank: 1 }),
      planItem({ productId: "b", rank: 2, alertState: "low", leadTimeState: "safe" }),
    ]);
    const first = buildMorningBrief(plan, EMPTY_STATUSES);
    const second = buildMorningBrief(plan, EMPTY_STATUSES);
    expect(first).toEqual(second);
  });
});

describe("buildMorningBrief — input mutate edilmemesi", () => {
  it("actionPlan.items dizisi değişmez", () => {
    const items = [planItem({ productId: "a" }), planItem({ productId: "b" })];
    const plan = planOf(items);
    const snapshot = JSON.parse(JSON.stringify(items));
    buildMorningBrief(plan, EMPTY_STATUSES);
    expect(items).toEqual(snapshot);
  });

  it("statuses haritası değişmez", () => {
    const states = withStatus(EMPTY_STATUSES, "p1", "done", TODAY);
    const snapshot = new Map(states);
    buildMorningBrief(planOf([planItem({ productId: "p1" })]), states);
    expect(states).toEqual(snapshot);
  });
});

describe("buildMorningBrief — Analysis Window korunması", () => {
  it("kaynak dosya analiz penceresi/tarih hesaplarını hiç içe aktarmaz — girdi yalnızca plan ve durum haritasıdır", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/ai-morning-brief.ts", import.meta.url),
      ),
      "utf8",
    );
    expect(source).not.toMatch(/analysis-window/);
    expect(source).not.toMatch(/resolveAnalysisWindow|DateRange/);
  });

  it("kaynak dosya forecast/reorder/lead-time/priority/purchase-action-plan hesap fonksiyonlarını içe aktarmaz, yalnızca tip olarak kullanır", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/ai-morning-brief.ts", import.meta.url),
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
    expect(importLines).not.toMatch(/buildPurchaseActionPlan\b/);
  });

  it("resolver ve CostPort import edilmez", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/core/services/ai-morning-brief.ts", import.meta.url),
      ),
      "utf8",
    );
    expect(source).not.toMatch(/cost-resolver/);
    expect(source).not.toMatch(/CostPort/);
  });
});
