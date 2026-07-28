import { describe, expect, it } from "vitest";

import type { ReorderRecommendation } from "@/core/services/reorder-suggestion";
import {
  buildReorderSuggestionTexts,
  toReorderSuggestionView,
} from "@/features/products/reorder-suggestion-view";
import type { Locale } from "@/i18n/routing";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * YENİDEN SİPARİŞ ÖNERİSİ → GÖRÜNÜM.
 *
 * `suggested` dışındaki durumlar (`correctStock`/`needsStockData`/`none`)
 * bilinçli olarak `null` üretir — bu durumlarda zaten `stockAlerts.action.*`
 * aynı bilgiyi taşıyor.
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
  return buildReorderSuggestionTexts(
    translate as Parameters<typeof buildReorderSuggestionTexts>[0],
  );
}

const SUGGESTED: ReorderRecommendation = {
  kind: "suggested",
  quantity: 39,
  targetStockUnits: 50.4,
  dailyVelocity: 2.4,
  targetCoverageDays: 21,
  currentStock: 12,
};

describe("yeniden sipariş önerisi — görünüm", () => {
  const decimalFor: Record<"tr" | "en", string> = { tr: "2,4", en: "2.4" };

  for (const locale of ["tr", "en"] as const) {
    it(`${locale}: suggested durumunda adet ve dayanak metni dolu`, () => {
      const view = toReorderSuggestionView(
        SUGGESTED,
        locale as Locale,
        textsFor(locale),
      );

      expect(view.quantityLabel).not.toBeNull();
      expect(view.quantityLabel).toContain("39");
      expect(view.basisLabel).not.toBeNull();
      expect(view.basisLabel).toContain("21");
      expect(view.basisLabel).toContain(decimalFor[locale]);
    });
  }

  it("correctStock durumunda null üretir", () => {
    const view = toReorderSuggestionView(
      { kind: "correctStock" },
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.quantityLabel).toBeNull();
    expect(view.basisLabel).toBeNull();
  });

  it("needsStockData durumunda null üretir", () => {
    const view = toReorderSuggestionView(
      { kind: "needsStockData" },
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.quantityLabel).toBeNull();
    expect(view.basisLabel).toBeNull();
  });

  it("none durumunda null üretir", () => {
    const view = toReorderSuggestionView(
      { kind: "none" },
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.quantityLabel).toBeNull();
    expect(view.basisLabel).toBeNull();
  });

  it("recommendation verilmezse null üretir", () => {
    const view = toReorderSuggestionView(undefined, "tr" as Locale, textsFor("tr"));
    expect(view.quantityLabel).toBeNull();
    expect(view.basisLabel).toBeNull();
  });

  it("adet ve gün sayısı locale'e göre biçimlenir (TR binlik/ondalık ayracı)", () => {
    const large: ReorderRecommendation = {
      kind: "suggested",
      quantity: 1234,
      targetStockUnits: 1250,
      dailyVelocity: 10,
      targetCoverageDays: 21,
      currentStock: 16,
    };
    const view = toReorderSuggestionView(large, "tr" as Locale, textsFor("tr"));
    expect(view.quantityLabel).toContain("1.234");
  });
});
