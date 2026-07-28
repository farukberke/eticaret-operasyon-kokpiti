import { describe, expect, it } from "vitest";

import { ANALYSIS_PRESETS } from "@/core/services/analysis-window";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * ANALİZ DÖNEMİ SÖZLÜĞÜ.
 *
 * Seçenek etiketleri arayüzde `t(\`preset.${preset}\`)` ile **dinamik**
 * kuruluyor: eksik bir anahtar ne derlemeyi ne testi kırar, kullanıcıya ham
 * anahtar adını basar. Bu yüzden domain'deki her preset için karşılığının
 * varlığı burada doğrulanıyor.
 */

const FLAT_KEYS = [
  "label",
  "from",
  "to",
  "apply",
  "invalidRange",
  "windowNote",
] as const;

const dictionaries = { tr, en };

describe("analysis sözlüğü", () => {
  for (const [locale, messages] of Object.entries(dictionaries)) {
    const analysis = messages.analysis as unknown as Record<string, unknown>;

    it(`${locale}: bölüm metinleri dolu`, () => {
      for (const key of FLAT_KEYS) {
        expect(typeof analysis[key], `${locale}.analysis.${key}`).toBe("string");
        expect(String(analysis[key]).trim()).not.toBe("");
      }
    });

    it(`${locale}: her preset karşılığını buluyor`, () => {
      const presets = analysis["preset"] as Record<string, string>;

      for (const preset of ANALYSIS_PRESETS) {
        expect(presets[preset]?.trim(), `${locale}.preset.${preset}`).toBeTruthy();
      }

      // Fazladan anahtar da hata: seçicide karşılığı olmayan bir etiket
      // ekranda hiç görünmez ve sessizce ölü metin olarak kalır.
      expect(Object.keys(presets).sort()).toEqual([...ANALYSIS_PRESETS].sort());
    });

    it(`${locale}: dipnot aralığı yerleştirebiliyor`, () => {
      expect(String(analysis["windowNote"])).toContain("{range}");
    });

    it(`${locale}: hata mesajı hangi alanın sorunlu olduğunu söylüyor`, () => {
      // "Geçersiz aralık" tek başına kullanıcıya ne yapacağını söylemez.
      const message = String(analysis["invalidRange"]).toLowerCase();
      expect(message.length).toBeGreaterThan(20);
    });
  }

  it("iki dil aynı anahtar kümesini taşıyor", () => {
    expect(Object.keys(tr.analysis).sort()).toEqual(Object.keys(en.analysis).sort());
    expect(Object.keys(tr.analysis.preset).sort()).toEqual(
      Object.keys(en.analysis.preset).sort(),
    );
  });

  it("etiketler birbirinden ayırt edilebilir", () => {
    for (const messages of Object.values(dictionaries)) {
      const labels = Object.values(messages.analysis.preset);
      expect(new Set(labels).size).toBe(labels.length);
    }
  });
});
