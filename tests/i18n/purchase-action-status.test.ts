import { describe, expect, it } from "vitest";

import type { PurchaseActionStatus } from "@/core/domain";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * SATIN ALMA EYLEMİ DURUM SÖZLÜĞÜ.
 *
 * `PurchaseActionStatus`in dört durumu (`stockAlerts.actionPlan.status`) ve
 * üç aksiyon/dört özet metni iki dilde de dolu ve ayırt edilebilir olmalı —
 * `stock-alerts.test.ts`teki aynı desen.
 */
const STATUSES: Record<PurchaseActionStatus, true> = {
  pending: true,
  done: true,
  snoozed: true,
  ignored: true,
};
const ALL_STATUSES = Object.keys(STATUSES) as PurchaseActionStatus[];

describe("satın alma eylemi durum sözlüğü", () => {
  for (const [locale, messages] of Object.entries({ tr, en })) {
    const status = messages.stockAlerts.actionPlan.status as unknown as Record<
      string,
      string
    >;
    const statusActions = messages.stockAlerts.actionPlan
      .statusActions as unknown as Record<string, string>;
    const statusSummary = messages.stockAlerts.actionPlan
      .statusSummary as unknown as Record<string, string>;

    it(`${locale}: dört durumun rozet metni dolu ve ayırt edilebilir`, () => {
      const labels = ALL_STATUSES.map((s) => {
        expect(
          status[s]?.trim(),
          `${locale}.stockAlerts.actionPlan.status.${s}`,
        ).toBeTruthy();
        return status[s];
      });
      expect(new Set(labels).size).toBe(labels.length);
    });

    it(`${locale}: üç aksiyon düğmesinin metni dolu`, () => {
      expect(statusActions.done?.trim()).toBeTruthy();
      expect(statusActions.snooze?.trim()).toBeTruthy();
      expect(statusActions.ignore?.trim()).toBeTruthy();
    });

    it(`${locale}: özet satırının dört alanı da dolu`, () => {
      expect(statusSummary.open?.trim()).toBeTruthy();
      expect(statusSummary.done?.trim()).toBeTruthy();
      expect(statusSummary.snoozed?.trim()).toBeTruthy();
      expect(statusSummary.ignored?.trim()).toBeTruthy();
    });
  }

  it("iki dil aynı anahtar kümesini taşıyor: status", () => {
    expect(Object.keys(tr.stockAlerts.actionPlan.status).sort()).toEqual(
      Object.keys(en.stockAlerts.actionPlan.status).sort(),
    );
  });

  it("iki dil aynı anahtar kümesini taşıyor: statusActions", () => {
    expect(Object.keys(tr.stockAlerts.actionPlan.statusActions).sort()).toEqual(
      Object.keys(en.stockAlerts.actionPlan.statusActions).sort(),
    );
  });

  it("iki dil aynı anahtar kümesini taşıyor: statusSummary", () => {
    expect(Object.keys(tr.stockAlerts.actionPlan.statusSummary).sort()).toEqual(
      Object.keys(en.stockAlerts.actionPlan.statusSummary).sort(),
    );
  });
});
