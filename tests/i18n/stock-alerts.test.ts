import { describe, expect, it } from "vitest";

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
  });
});
