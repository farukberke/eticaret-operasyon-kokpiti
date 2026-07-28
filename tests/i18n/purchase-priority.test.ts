import { describe, expect, it } from "vitest";

import type { PurchasePriorityLevel } from "@/core/services/purchase-priority";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * SATIN ALMA ÖNCELİK SÖZLÜĞÜ.
 *
 * `PurchasePriorityLevel` yalnızca üç durumu kapsıyor (negative/critical/low —
 * `unknown` bilinçli olarak dışarıda, bkz. `purchase-priority.ts`). Bu üçünün
 * iki dilde de "ertelenirse ne olur" cevabı olduğu burada doğrulanıyor.
 */
const LEVELS: Record<PurchasePriorityLevel, true> = {
  negative: true,
  critical: true,
  low: true,
};

const ALL_LEVELS = Object.keys(LEVELS) as PurchasePriorityLevel[];
const dictionaries = { tr, en };

describe("satın alma önceliği sözlüğü", () => {
  for (const [locale, messages] of Object.entries(dictionaries)) {
    const impact = messages.purchasePriority.impact as unknown as Record<
      string,
      string
    >;

    it(`${locale}: üç durumun da ertelenme etkisi dolu`, () => {
      for (const level of ALL_LEVELS) {
        expect(
          impact[level]?.trim(),
          `${locale}.purchasePriority.impact.${level}`,
        ).toBeTruthy();
      }
    });

    it(`${locale}: üç durumun etki metni birbirinden ayırt edilebilir`, () => {
      const labels = ALL_LEVELS.map((level) => impact[level]);
      expect(new Set(labels).size).toBe(labels.length);
    });

    it(`${locale}: rütbe rozeti sıra numarasını yerleştiriyor`, () => {
      expect(messages.purchasePriority.rankBadge).toContain("{rank}");
    });
  }

  it("iki dil aynı anahtar kümesini taşıyor", () => {
    expect(Object.keys(tr.purchasePriority).sort()).toEqual(
      Object.keys(en.purchasePriority).sort(),
    );
    expect(Object.keys(tr.purchasePriority.impact).sort()).toEqual(
      Object.keys(en.purchasePriority.impact).sort(),
    );
  });

  it("kart başlığı satın alma önceliğini yansıtır ve boş değil", () => {
    expect(tr.stockAlerts.title.trim()).not.toBe("");
    expect(en.stockAlerts.title.trim()).not.toBe("");
  });
});
