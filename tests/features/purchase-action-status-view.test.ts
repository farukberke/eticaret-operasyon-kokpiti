import { describe, expect, it } from "vitest";

import type { PurchaseActionStatus } from "@/core/domain";
import type { PurchaseActionStatusSummary } from "@/core/services/purchase-action-status";
import {
  buildPurchaseActionStatusTexts,
  toPurchaseActionStatusRowView,
  toPurchaseActionStatusSummaryLine,
} from "@/features/cockpit/purchase-action-status-view";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * SATIN ALMA EYLEMİ DURUMU → GÖRÜNÜM.
 *
 * Rozet metni/tonu ve görünürlük burada doğrulanır — core'daki
 * `isVisibleByDefault`in view-model üzerinden aynen taşındığı, ikinci bir
 * görünürlük kuralı icat edilmediği.
 */

const DICTIONARIES = { tr, en } as const;

function mockTranslator(messages: Record<string, unknown>) {
  return (key: string): string => {
    let node: unknown = messages;
    for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
    return String(node);
  };
}

function textsFor(locale: keyof typeof DICTIONARIES) {
  const translate = mockTranslator(DICTIONARIES[locale].stockAlerts);
  return buildPurchaseActionStatusTexts(
    translate as Parameters<typeof buildPurchaseActionStatusTexts>[0],
  );
}

describe("toPurchaseActionStatusRowView — rozet ve görünürlük", () => {
  it("pending badge: etiket dolu, görünür", () => {
    const view = toPurchaseActionStatusRowView("pending", textsFor("tr"));
    expect(view.label).toBe(tr.stockAlerts.actionPlan.status.pending);
    expect(view.visible).toBe(true);
  });

  it("done badge: etiket dolu, gizli (görünürlük: false)", () => {
    const view = toPurchaseActionStatusRowView("done", textsFor("tr"));
    expect(view.label).toBe(tr.stockAlerts.actionPlan.status.done);
    expect(view.visible).toBe(false);
  });

  it("snoozed badge: etiket dolu, görünür", () => {
    const view = toPurchaseActionStatusRowView("snoozed", textsFor("tr"));
    expect(view.label).toBe(tr.stockAlerts.actionPlan.status.snoozed);
    expect(view.visible).toBe(true);
  });

  it("ignored badge: etiket dolu, gizli (görünürlük: false)", () => {
    const view = toPurchaseActionStatusRowView("ignored", textsFor("tr"));
    expect(view.label).toBe(tr.stockAlerts.actionPlan.status.ignored);
    expect(view.visible).toBe(false);
  });

  it("dört durumun rozet metni birbirinden ayırt edilebilir", () => {
    const statuses: PurchaseActionStatus[] = ["pending", "done", "snoozed", "ignored"];
    const labels = statuses.map(
      (status) => toPurchaseActionStatusRowView(status, textsFor("tr")).label,
    );
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("İngilizce: rozet etiketi çeviridir", () => {
    const view = toPurchaseActionStatusRowView("done", textsFor("en"));
    expect(view.label).toBe(en.stockAlerts.actionPlan.status.done);
  });
});

describe("toPurchaseActionStatusSummaryLine — özet satırı", () => {
  function summary(
    overrides: Partial<PurchaseActionStatusSummary> = {},
  ): PurchaseActionStatusSummary {
    return {
      total: 0,
      pendingCount: 0,
      doneCount: 0,
      snoozedCount: 0,
      ignoredCount: 0,
      ...overrides,
    };
  }

  it("sayaçlar: açık (pending+snoozed), tamamlandı, ertelendi, yoksayıldı satırda görünür", () => {
    const line = toPurchaseActionStatusSummaryLine(
      summary({
        total: 4,
        pendingCount: 1,
        doneCount: 1,
        snoozedCount: 1,
        ignoredCount: 1,
      }),
      textsFor("tr"),
    );

    expect(line).toContain(`${tr.stockAlerts.actionPlan.statusSummary.open}: 2`);
    expect(line).toContain(`${tr.stockAlerts.actionPlan.statusSummary.done}: 1`);
    expect(line).toContain(`${tr.stockAlerts.actionPlan.statusSummary.snoozed}: 1`);
    expect(line).toContain(`${tr.stockAlerts.actionPlan.statusSummary.ignored}: 1`);
  });

  it("boş durum: tüm sayaçlar 0 iken de geçerli bir metin döner", () => {
    const line = toPurchaseActionStatusSummaryLine(summary(), textsFor("tr"));
    expect(line).toContain(`${tr.stockAlerts.actionPlan.statusSummary.open}: 0`);
    expect(line).toContain(`${tr.stockAlerts.actionPlan.statusSummary.done}: 0`);
  });

  it("İngilizce: özet satırı çeviridir", () => {
    const line = toPurchaseActionStatusSummaryLine(
      summary({ total: 1, doneCount: 1 }),
      textsFor("en"),
    );
    expect(line).toContain(`${en.stockAlerts.actionPlan.statusSummary.done}: 1`);
  });
});
