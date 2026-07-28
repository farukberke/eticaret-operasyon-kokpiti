import { describe, expect, it } from "vitest";

import type {
  PurchaseActionPlanBatch,
  PurchaseActionPlanItem,
} from "@/core/services/purchase-action-plan";
import {
  buildPurchaseActionPlanTexts,
  toPurchaseActionPlanRowView,
  toPurchaseActionPlanRowViews,
  toPurchaseActionPlanSummaryView,
} from "@/features/cockpit/purchase-action-plan-view";
import type { Locale } from "@/i18n/routing";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * GÜNLÜK SATIN ALMA EYLEM PLANI → GÖRÜNÜM.
 *
 * Miktar metninin öncelik sırası burada doğrulanır: `recommendedQuantity`
 * doluysa her zaman o kazanır; boşsa `reason` koduna göre "önce veri
 * düzeltin" ya da "hesaplanamıyor" cümlelerinden biri seçilir; ikisi de
 * uymuyorsa (`leadTimeAlreadyLate` gibi salt zaman çizelgesi gerekçeleri)
 * miktar metni hiç üretilmez — uydurma yapılmaz.
 */

const DICTIONARIES = { tr, en } as const;

function mockTranslator(messages: Record<string, unknown>) {
  return (key: string, values?: Record<string, string | number>): string => {
    let node: unknown = messages;
    for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
    let text = String(node);
    if (values) {
      for (const [name, value] of Object.entries(values)) {
        text = text.replace(`{${name}}`, String(value));
      }
    }
    return text;
  };
}

function textsFor(locale: keyof typeof DICTIONARIES) {
  const translate = mockTranslator(DICTIONARIES[locale].stockAlerts);
  return buildPurchaseActionPlanTexts(
    translate as Parameters<typeof buildPurchaseActionPlanTexts>[0],
  );
}

function item(overrides: Partial<PurchaseActionPlanItem> = {}): PurchaseActionPlanItem {
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

describe("eylem etiketi ve tonu", () => {
  const cases: Array<[PurchaseActionPlanItem["action"], string]> = [
    ["actNow", "danger"],
    ["decideToday", "warning"],
    ["planSoon", "info"],
    ["completeData", "neutral"],
    ["review", "neutral"],
  ];

  for (const [action, tone] of cases) {
    it(`${action}: etiket dolu, ton ${tone}`, () => {
      const view = toPurchaseActionPlanRowView(
        item({ action }),
        "tr" as Locale,
        textsFor("tr"),
      );
      expect(view.actionLabel.trim()).not.toBe("");
      expect(view.tone).toBe(tone);
    });
  }

  it("beş eylemin etiketi birbirinden ayırt edilebilir", () => {
    const labels = cases.map(
      ([action]) =>
        toPurchaseActionPlanRowView(item({ action }), "tr" as Locale, textsFor("tr"))
          .actionLabel,
    );
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("gerekçe metni", () => {
  it("sekiz reason kodunun da metni dolu", () => {
    const reasons: PurchaseActionPlanItem["reason"][] = [
      "stockAlreadyNegative",
      "leadTimeAlreadyLate",
      "orderDueToday",
      "decisionWindowApproaching",
      "leadTimeMissing",
      "stockDataMissing",
      "criticalStock",
      "lowStock",
    ];
    for (const reason of reasons) {
      const view = toPurchaseActionPlanRowView(
        item({ reason }),
        "tr" as Locale,
        textsFor("tr"),
      );
      expect(view.reasonText.trim(), reason).not.toBe("");
    }
  });

  it("late gerekçesi: gecikme cümlesi", () => {
    const view = toPurchaseActionPlanRowView(
      item({ reason: "leadTimeAlreadyLate" }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.reasonText).toBe(tr.stockAlerts.actionPlan.reason.leadTimeAlreadyLate);
  });

  it("dueToday gerekçesi", () => {
    const view = toPurchaseActionPlanRowView(
      item({ reason: "orderDueToday" }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.reasonText).toBe(tr.stockAlerts.actionPlan.reason.orderDueToday);
  });

  it("upcoming (decisionWindowApproaching) gerekçesi", () => {
    const view = toPurchaseActionPlanRowView(
      item({ reason: "decisionWindowApproaching" }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.reasonText).toBe(
      tr.stockAlerts.actionPlan.reason.decisionWindowApproaching,
    );
  });

  it("eksik lead-time gerekçesi (leadTimeMissing)", () => {
    const view = toPurchaseActionPlanRowView(
      item({ reason: "leadTimeMissing" }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.reasonText).toBe(tr.stockAlerts.actionPlan.reason.leadTimeMissing);
  });
});

describe("miktar metni — öncelik sırası", () => {
  it("recommendedQuantity doluysa sayıyı taşır (suggested)", () => {
    const view = toPurchaseActionPlanRowView(
      item({ recommendedQuantity: 24, reason: "leadTimeAlreadyLate" }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.quantityText).toContain("24");
  });

  it("correctStock metni: quantity null + reason stockAlreadyNegative", () => {
    const view = toPurchaseActionPlanRowView(
      item({
        recommendedQuantity: null,
        reason: "stockAlreadyNegative",
        action: "completeData",
      }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.quantityText).toBe(tr.stockAlerts.actionPlan.quantity.correctStock);
  });

  it("needsStockData metni: quantity null + reason stockDataMissing", () => {
    const view = toPurchaseActionPlanRowView(
      item({
        recommendedQuantity: null,
        reason: "stockDataMissing",
        action: "completeData",
      }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.quantityText).toBe(tr.stockAlerts.actionPlan.quantity.needsStockData);
  });

  it("diğer gerekçelerde (ör. leadTimeAlreadyLate) quantity null ise metin de null — uydurma yapılmaz", () => {
    const view = toPurchaseActionPlanRowView(
      item({ recommendedQuantity: null, reason: "leadTimeAlreadyLate" }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.quantityText).toBeNull();
  });

  it("recommendedQuantity doluysa reason ne olursa olsun sayı kazanır", () => {
    const view = toPurchaseActionPlanRowView(
      item({
        recommendedQuantity: 10,
        reason: "stockAlreadyNegative",
        action: "actNow",
      }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.quantityText).toContain("10");
    expect(view.quantityText).not.toBe(tr.stockAlerts.actionPlan.quantity.correctStock);
  });
});

describe("TR/EN biçimlendirme", () => {
  it("İngilizce: eylem etiketi çeviridir", () => {
    const view = toPurchaseActionPlanRowView(
      item({ action: "actNow" }),
      "en" as Locale,
      textsFor("en"),
    );
    expect(view.actionLabel).toBe(en.stockAlerts.actionPlan.action.actNow);
  });

  it("İngilizce: miktar metni İngilizce sayı biçimlendirmesi kullanır", () => {
    const view = toPurchaseActionPlanRowView(
      item({ recommendedQuantity: 1234 }),
      "en" as Locale,
      textsFor("en"),
    );
    expect(view.quantityText).toContain("1,234");
  });

  it("Türkçe: miktar metni Türkçe sayı biçimlendirmesi kullanır", () => {
    const view = toPurchaseActionPlanRowView(
      item({ recommendedQuantity: 1234 }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.quantityText).toContain("1.234");
  });
});

describe("toPurchaseActionPlanRowViews — ürün kimliğine göre toplu görünüm", () => {
  it("her ürün için haritadaki öğeyi görünüme çevirir", () => {
    const views = toPurchaseActionPlanRowViews(
      [item({ productId: "p1" }), item({ productId: "p2", action: "review" })],
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(views.get("p1")?.actionLabel).toBe(tr.stockAlerts.actionPlan.action.actNow);
    expect(views.get("p2")?.actionLabel).toBe(tr.stockAlerts.actionPlan.action.review);
  });
});

describe("özet görünümü", () => {
  function batch(
    overrides: Partial<PurchaseActionPlanBatch["summary"]> = {},
  ): PurchaseActionPlanBatch {
    const summary = {
      total: 0,
      actNowCount: 0,
      decideTodayCount: 0,
      planSoonCount: 0,
      completeDataCount: 0,
      reviewCount: 0,
      ...overrides,
    };
    return { items: [], summary };
  }

  it("boş plan metni: total 0 ise hasActions false ve sakin metin döner", () => {
    const view = toPurchaseActionPlanSummaryView(
      batch(),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.hasActions).toBe(false);
    expect(view.emptyText).toBe(tr.stockAlerts.actionPlan.empty);
    expect(view.rows).toEqual([]);
  });

  it("görünürlük kararı: total > 0 ise dört ana kategori her zaman gösterilir", () => {
    const view = toPurchaseActionPlanSummaryView(
      batch({ total: 2, actNowCount: 2 }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.hasActions).toBe(true);
    expect(view.rows.map((r) => r.action)).toEqual([
      "actNow",
      "decideToday",
      "planSoon",
      "completeData",
    ]);
  });

  it("görünürlük kararı: review yalnızca sayısı > 0 ise beşinci satır olarak eklenir", () => {
    const withoutReview = toPurchaseActionPlanSummaryView(
      batch({ total: 1, actNowCount: 1, reviewCount: 0 }),
      "tr" as Locale,
      textsFor("tr"),
    );
    const withReview = toPurchaseActionPlanSummaryView(
      batch({ total: 2, actNowCount: 1, reviewCount: 1 }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(withoutReview.rows.some((r) => r.action === "review")).toBe(false);
    expect(withReview.rows.some((r) => r.action === "review")).toBe(true);
  });

  it("satır metni zaten birleştirilmiş gelir: 'etiket: sayı'", () => {
    const view = toPurchaseActionPlanSummaryView(
      batch({ total: 2, actNowCount: 2 }),
      "tr" as Locale,
      textsFor("tr"),
    );
    const actNowRow = view.rows.find((r) => r.action === "actNow")!;
    expect(actNowRow.line).toBe(`${actNowRow.label}: ${actNowRow.count}`);
  });

  it("başlık dolu", () => {
    const view = toPurchaseActionPlanSummaryView(
      batch(),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.title).toBe(tr.stockAlerts.actionPlan.title);
  });
});
