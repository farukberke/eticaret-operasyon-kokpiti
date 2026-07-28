import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * KARŞILAŞTIRMA SÖZLÜĞÜ.
 *
 * Bu bölümdeki metinler `t("increased", { amount })` gibi **yer tutuculu**
 * kuruluyor. Eksik bir anahtar derlemeyi kırmaz, ekrana ham anahtar adı basar;
 * yanlış yazılmış bir yer tutucu ise sayıyı tamamen yutar ve kullanıcı
 * "Önceki döneme göre {amount} arttı" cümlesini olduğu gibi görür.
 */

const PLACEHOLDERS = {
  increased: "{amount}",
  decreased: "{amount}",
  previousValue: "{value}",
  previousWindow: "{range}",
} as const;

const FLAT_KEYS = ["unchanged", "new", "noPreviousData", "notComparable"] as const;

const dictionaries = { tr, en };

describe("comparison sözlüğü", () => {
  for (const [locale, messages] of Object.entries(dictionaries)) {
    const comparison = messages.comparison as unknown as Record<string, string>;

    it(`${locale}: yer tutucular yerinde`, () => {
      for (const [key, token] of Object.entries(PLACEHOLDERS)) {
        expect(comparison[key], `${locale}.comparison.${key}`).toContain(token);
      }
    });

    it(`${locale}: hesaplanamayan durumların üçü de dolu`, () => {
      // Üçü ayrı cümle olmalı: "Yeni" ile "Karşılaştırılamıyor" aynı şey değil.
      const labels = FLAT_KEYS.map((key) => {
        const value = comparison[key];
        expect(typeof value, `${locale}.comparison.${key}`).toBe("string");
        expect(String(value).trim()).not.toBe("");
        return value;
      });

      expect(new Set(labels).size).toBe(labels.length);
    });

    it(`${locale}: ayırıcı boşlukla sarılı`, () => {
      // "arttı· önceki" gibi bitişik bir metin çıkmasın.
      const separator = comparison["separator"] ?? "";
      expect(separator.startsWith(" ")).toBe(true);
      expect(separator.endsWith(" ")).toBe(true);
    });

    it(`${locale}: artış ve azalış cümleleri birbirinden ayırt edilebilir`, () => {
      expect(comparison["increased"]).not.toBe(comparison["decreased"]);
    });
  }

  it("iki dil aynı anahtar kümesini taşıyor", () => {
    expect(Object.keys(tr.comparison).sort()).toEqual(
      Object.keys(en.comparison).sort(),
    );
  });

  it("kokpit risk ve fırsat toplamlarını adlandırıyor", () => {
    for (const [locale, messages] of Object.entries(dictionaries)) {
      for (const key of ["riskTotal", "opportunityTotal"] as const) {
        expect(messages.cockpit[key]?.trim(), `${locale}.cockpit.${key}`).toBeTruthy();
      }
    }
  });
});
