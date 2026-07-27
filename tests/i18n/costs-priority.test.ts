import { describe, expect, it } from "vitest";

import type { MissingCostLevel, MissingCostReason } from "@/core/domain";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * EKSİK MALİYET BÖLÜMÜNÜN SÖZLÜĞÜ.
 *
 * Seviye ve gerekçe anahtarları arayüzde `t(\`priorityLevel.${level}\`)` gibi
 * **dinamik** kuruluyor; eksik bir anahtar derlemeyi de testi de kırmaz,
 * kullanıcıya ham anahtar adını basar. Bu yüzden domain'deki her değer için
 * karşılığının varlığı burada doğrulanıyor.
 */

const LEVELS: readonly MissingCostLevel[] = ["critical", "high", "normal"];
const REASONS: readonly MissingCostReason[] = ["revenue", "volume", "age"];

const FLAT_KEYS = [
  "priorityTitle",
  "priorityDescription",
  "priorityImpact",
  "priorityDetail",
  "priorityCta",
  "priorityRemaining",
  "priorityAllCovered",
  "priorityAllCoveredHint",
  "priorityNoData",
  "priorityNoDataHint",
] as const;

const dictionaries = { tr, en };

describe("costs.priority sözlüğü", () => {
  for (const [locale, messages] of Object.entries(dictionaries)) {
    const costs = messages.costs as unknown as Record<string, unknown>;

    it(`${locale}: bölüm metinleri dolu`, () => {
      for (const key of FLAT_KEYS) {
        expect(typeof costs[key], `${locale}.costs.${key}`).toBe("string");
        expect(String(costs[key]).trim()).not.toBe("");
      }
    });

    it(`${locale}: her öncelik seviyesi ve gerekçesi karşılığını buluyor`, () => {
      const levels = costs["priorityLevel"] as Record<string, string>;
      const reasons = costs["priorityReason"] as Record<string, string>;

      for (const level of LEVELS) {
        expect(levels[level]?.trim(), `${locale}.priorityLevel.${level}`).toBeTruthy();
      }
      for (const reason of REASONS) {
        expect(
          reasons[reason]?.trim(),
          `${locale}.priorityReason.${reason}`,
        ).toBeTruthy();
      }

      // Fazladan anahtar da bir hata: domain'de karşılığı olmayan bir seviye
      // ekranda hiç görünmez ve sessizce ölü metin olarak kalır.
      expect(Object.keys(levels).sort()).toEqual([...LEVELS].sort());
      expect(Object.keys(reasons).sort()).toEqual([...REASONS].sort());
    });

    it(`${locale}: etki cümlesi sipariş sayısını ve tutarı birlikte söylüyor`, () => {
      const impact = String(costs["priorityImpact"]);
      expect(impact).toContain("{orders");
      expect(impact).toContain("{revenue}");
    });

    it(`${locale}: eylem çağrısı ile bölüm başlığı ayrı metinler`, () => {
      expect(costs["priorityCta"]).not.toBe(costs["priorityTitle"]);
    });
  }

  it("iki dil aynı anahtar kümesini taşıyor", () => {
    const keysOf = (messages: typeof tr | typeof en) =>
      Object.keys(messages.costs as unknown as Record<string, unknown>)
        .filter((key) => key.startsWith("priority"))
        .sort();

    expect(keysOf(tr)).toEqual(keysOf(en));
  });

  it("başarı metni kârın tamamen kesin olduğunu iddia etmiyor", () => {
    // Maliyet tamamlanmış olabilir; reklam, iade ve komisyon hâlâ modeldir.
    expect(tr.costs.priorityAllCoveredHint).toContain("ayrı");
    expect(en.costs.priorityAllCoveredHint.toLowerCase()).toContain("separately");
  });
});
