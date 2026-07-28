import { describe, expect, it } from "vitest";

import type {
  PurchaseActionKind,
  PurchaseActionReasonCode,
} from "@/core/services/purchase-action-plan";
import type { StockAlertLevel } from "@/core/services/stock-alerts";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * STOK UYARISI SÖZLÜĞÜ.
 *
 * Eksik bir anahtar derlemeyi kırmaz; `next-intl` ham anahtar adını basar.
 * `StockAlertLevel`in dört durumunun iki dilde de gerekçesi ve aksiyonu
 * olduğu bu yüzden burada doğrulanıyor.
 */
const LEVELS: Record<StockAlertLevel, true> = {
  negative: true,
  critical: true,
  unknown: true,
  low: true,
};

const ALL_LEVELS = Object.keys(LEVELS) as StockAlertLevel[];
const dictionaries = { tr, en };

describe("stok uyarısı sözlüğü", () => {
  for (const [locale, messages] of Object.entries(dictionaries)) {
    const reason = messages.stockAlerts.reason as unknown as Record<string, string>;
    const action = messages.stockAlerts.action as unknown as Record<string, string>;

    it(`${locale}: her durumun gerekçesi ve aksiyonu dolu`, () => {
      for (const level of ALL_LEVELS) {
        expect(
          reason[level]?.trim(),
          `${locale}.stockAlerts.reason.${level}`,
        ).toBeTruthy();
        expect(
          action[level]?.trim(),
          `${locale}.stockAlerts.action.${level}`,
        ).toBeTruthy();
      }
    });

    it(`${locale}: dört durumun gerekçesi birbirinden ayırt edilebilir`, () => {
      const labels = ALL_LEVELS.map((level) => reason[level]);
      expect(new Set(labels).size).toBe(labels.length);
    });

    it(`${locale}: kart başlığı ve boş durum metinleri dolu`, () => {
      expect(messages.stockAlerts.title.trim()).not.toBe("");
      expect(messages.stockAlerts.empty.trim()).not.toBe("");
      expect(messages.stockAlerts.noData.trim()).not.toBe("");
    });

    it(`${locale}: adet etiketi sayı yerleştiriyor`, () => {
      expect(messages.stockAlerts.stockLabel).toContain("{count}");
    });

    it(`${locale}: yeniden sipariş metinleri dolu ve yer tutucuları taşıyor`, () => {
      expect(messages.stockAlerts.reorder.quantity.trim()).not.toBe("");
      expect(messages.stockAlerts.reorder.quantity).toContain("{count}");
      expect(messages.stockAlerts.reorder.basis.trim()).not.toBe("");
      expect(messages.stockAlerts.reorder.basis).toContain("{velocity}");
      expect(messages.stockAlerts.reorder.basis).toContain("{days}");
    });

    it(`${locale}: tedarik süresi metinleri dolu ve yer tutucuları taşıyor`, () => {
      const leadTime = messages.stockAlerts.leadTime;
      expect(leadTime.late.trim()).not.toBe("");
      expect(leadTime.late).toContain("{days}");
      expect(leadTime.dueToday.trim()).not.toBe("");
      expect(leadTime.upcoming.trim()).not.toBe("");
      expect(leadTime.upcoming).toContain("{days}");
      expect(leadTime.unknownLeadTime.trim()).not.toBe("");
      expect(leadTime.detail.trim()).not.toBe("");
      expect(leadTime.detail).toContain("{leadDays}");
      expect(leadTime.detail).toContain("{coverDays}");
    });

    it(`${locale}: tedarik süresi durumlarının metinleri birbirinden ayırt edilebilir`, () => {
      const leadTime = messages.stockAlerts.leadTime;
      const labels = [
        leadTime.late,
        leadTime.dueToday,
        leadTime.upcoming,
        leadTime.unknownLeadTime,
      ];
      expect(new Set(labels).size).toBe(labels.length);
    });
  }

  it("iki dil aynı anahtar kümesini taşıyor", () => {
    expect(Object.keys(tr.stockAlerts).sort()).toEqual(
      Object.keys(en.stockAlerts).sort(),
    );
    expect(Object.keys(tr.stockAlerts.reason).sort()).toEqual(
      Object.keys(en.stockAlerts.reason).sort(),
    );
    expect(Object.keys(tr.stockAlerts.action).sort()).toEqual(
      Object.keys(en.stockAlerts.action).sort(),
    );
    expect(Object.keys(tr.stockAlerts.reorder).sort()).toEqual(
      Object.keys(en.stockAlerts.reorder).sort(),
    );
    expect(Object.keys(tr.stockAlerts.leadTime).sort()).toEqual(
      Object.keys(en.stockAlerts.leadTime).sort(),
    );
    expect(Object.keys(tr.stockAlerts.actionPlan).sort()).toEqual(
      Object.keys(en.stockAlerts.actionPlan).sort(),
    );
    expect(Object.keys(tr.stockAlerts.actionPlan.action).sort()).toEqual(
      Object.keys(en.stockAlerts.actionPlan.action).sort(),
    );
    expect(Object.keys(tr.stockAlerts.actionPlan.reason).sort()).toEqual(
      Object.keys(en.stockAlerts.actionPlan.reason).sort(),
    );
    expect(Object.keys(tr.stockAlerts.actionPlan.quantity).sort()).toEqual(
      Object.keys(en.stockAlerts.actionPlan.quantity).sort(),
    );
  });
});

/**
 * GÜNLÜK SATIN ALMA EYLEM PLANI SÖZLÜĞÜ.
 *
 * `PurchaseActionKind` (beş eylem) ve `PurchaseActionReasonCode` (sekiz
 * gerekçe) iki dilde de dolu ve ayırt edilebilir metne sahip olmalı —
 * `stock-alerts.test.ts` / `purchase-priority.test.ts`teki aynı desen.
 */
const ACTIONS: Record<PurchaseActionKind, true> = {
  actNow: true,
  decideToday: true,
  planSoon: true,
  completeData: true,
  review: true,
};
const ALL_ACTIONS = Object.keys(ACTIONS) as PurchaseActionKind[];

const REASONS: Record<PurchaseActionReasonCode, true> = {
  stockAlreadyNegative: true,
  leadTimeAlreadyLate: true,
  orderDueToday: true,
  decisionWindowApproaching: true,
  leadTimeMissing: true,
  stockDataMissing: true,
  criticalStock: true,
  lowStock: true,
};
const ALL_REASONS = Object.keys(REASONS) as PurchaseActionReasonCode[];

describe("satın alma eylem planı sözlüğü", () => {
  for (const [locale, messages] of Object.entries({ tr, en })) {
    const actionPlan = messages.stockAlerts.actionPlan;
    const action = actionPlan.action as unknown as Record<string, string>;
    const reason = actionPlan.reason as unknown as Record<string, string>;

    it(`${locale}: beş eylemin de etiketi dolu ve ayırt edilebilir`, () => {
      const labels = ALL_ACTIONS.map((kind) => {
        expect(
          action[kind]?.trim(),
          `${locale}.stockAlerts.actionPlan.action.${kind}`,
        ).toBeTruthy();
        return action[kind];
      });
      expect(new Set(labels).size).toBe(labels.length);
    });

    it(`${locale}: sekiz gerekçenin de metni dolu ve ayırt edilebilir`, () => {
      const labels = ALL_REASONS.map((code) => {
        expect(
          reason[code]?.trim(),
          `${locale}.stockAlerts.actionPlan.reason.${code}`,
        ).toBeTruthy();
        return reason[code];
      });
      expect(new Set(labels).size).toBe(labels.length);
    });

    it(`${locale}: başlık, boş durum ve miktar metinleri dolu`, () => {
      expect(actionPlan.title.trim()).not.toBe("");
      expect(actionPlan.empty.trim()).not.toBe("");
      expect(actionPlan.quantity.correctStock.trim()).not.toBe("");
      expect(actionPlan.quantity.needsStockData.trim()).not.toBe("");
    });

    it(`${locale}: özet satırı etiket ve sayı yer tutucularını taşıyor`, () => {
      expect(actionPlan.summaryLine).toContain("{label}");
      expect(actionPlan.summaryLine).toContain("{count}");
    });
  }
});
