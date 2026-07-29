import { describe, expect, it } from "vitest";

import type { SmartInsightSeverity, SmartInsightType } from "@/core/domain";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * AKILLI İÇGÖRÜLER SÖZLÜĞÜ.
 *
 * Dört şiddet etiketi ve altı içgörü türünün başlık/açıklama şablonu iki
 * dilde de dolu ve ayırt edilebilir olmalı — `task-timeline.test.ts`teki
 * aynı desen.
 */
const SEVERITIES: Record<SmartInsightSeverity, true> = {
  critical: true,
  warning: true,
  positive: true,
  neutral: true,
};
const ALL_SEVERITIES = Object.keys(SEVERITIES) as SmartInsightSeverity[];

const TYPES: Record<SmartInsightType, true> = {
  criticalStockPressure: true,
  urgentPurchaseFocus: true,
  leadTimeExposure: true,
  snoozedActionBacklog: true,
  executionProgress: true,
  operationsClear: true,
};
const ALL_TYPES = Object.keys(TYPES) as SmartInsightType[];

describe("akıllı içgörüler sözlüğü", () => {
  for (const [locale, messages] of Object.entries({ tr, en })) {
    const severity = messages.smartInsights.severity as unknown as Record<
      string,
      string
    >;
    const item = messages.smartInsights.item as unknown as Record<
      string,
      { title: string; description: string }
    >;

    it(`${locale}: başlık, alt başlık ve boş durum metni dolu`, () => {
      expect(messages.smartInsights.title?.trim()).toBeTruthy();
      expect(messages.smartInsights.subtitle?.trim()).toBeTruthy();
      expect(messages.smartInsights.empty?.trim()).toBeTruthy();
    });

    it(`${locale}: dört şiddet etiketi dolu ve ayırt edilebilir`, () => {
      const labels = ALL_SEVERITIES.map((s) => {
        expect(
          severity[s]?.trim(),
          `${locale}.smartInsights.severity.${s}`,
        ).toBeTruthy();
        return severity[s];
      });
      expect(new Set(labels).size).toBe(labels.length);
    });

    it(`${locale}: altı içgörü türünün başlığı dolu ve ayırt edilebilir`, () => {
      const titles = ALL_TYPES.map((type) => {
        expect(
          item[type]?.title?.trim(),
          `${locale}.smartInsights.item.${type}.title`,
        ).toBeTruthy();
        return item[type]!.title;
      });
      expect(new Set(titles).size).toBe(titles.length);
    });

    it(`${locale}: altı içgörü türünün açıklaması dolu`, () => {
      for (const type of ALL_TYPES) {
        expect(
          item[type]?.description?.trim(),
          `${locale}.smartInsights.item.${type}.description`,
        ).toBeTruthy();
      }
    });

    it(`${locale}: sayı taşıyan şablonlar {count} yer tutucusunu içerir`, () => {
      const countBased: SmartInsightType[] = [
        "criticalStockPressure",
        "leadTimeExposure",
        "snoozedActionBacklog",
        "executionProgress",
      ];
      for (const type of countBased) {
        expect(item[type]!.description).toMatch(/\{count\}/);
      }
    });

    it(`${locale}: urgentPurchaseFocus şablonu {productName} yer tutucusunu içerir`, () => {
      expect(item.urgentPurchaseFocus!.description).toMatch(/\{productName\}/);
    });

    it(`${locale}: operationsClear şablonu sabittir, yer tutucu içermez`, () => {
      expect(item.operationsClear!.description).not.toMatch(/\{[a-zA-Z]+\}/);
    });
  }

  it("iki dil aynı anahtar kümesini taşıyor: smartInsights", () => {
    expect(Object.keys(tr.smartInsights).sort()).toEqual(
      Object.keys(en.smartInsights).sort(),
    );
  });

  it("iki dil aynı anahtar kümesini taşıyor: smartInsights.severity", () => {
    expect(Object.keys(tr.smartInsights.severity).sort()).toEqual(
      Object.keys(en.smartInsights.severity).sort(),
    );
  });

  it("iki dil aynı anahtar kümesini taşıyor: smartInsights.item", () => {
    expect(Object.keys(tr.smartInsights.item).sort()).toEqual(
      Object.keys(en.smartInsights.item).sort(),
    );
  });

  it("dört şiddet anahtarının tamamı sözlükte tanımlı", () => {
    expect(Object.keys(tr.smartInsights.severity).sort()).toEqual(
      [...ALL_SEVERITIES].sort(),
    );
  });

  it("altı içgörü türü anahtarının tamamı sözlükte tanımlı", () => {
    expect(Object.keys(tr.smartInsights.item).sort()).toEqual([...ALL_TYPES].sort());
  });
});
