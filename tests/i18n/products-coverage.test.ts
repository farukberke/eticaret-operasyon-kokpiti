import { describe, expect, it } from "vitest";

import type { StockCoverageState } from "@/core/services/stock-forecast";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * STOK DURUMU SÖZLÜĞÜ.
 *
 * Eksik bir anahtar derlemeyi kırmaz — `next-intl` kullanıcıya ham anahtar
 * adını basar ve rozetin içinde "coverage.noSales" yazar. Domain'deki her
 * durumun iki dilde de karşılığı olduğu bu yüzden burada doğrulanıyor.
 */

/**
 * Domain'deki durumların tam listesi.
 *
 * Elle yazılmış ama derleyici bekçi: `StockCoverageState`e yeni bir durum
 * eklenip buraya eklenmezse `Record` tip hatası verir.
 */
const STATES: Record<StockCoverageState, true> = {
  critical: true,
  low: true,
  normal: true,
  high: true,
  unknown: true,
  noSales: true,
  negative: true,
};

const ALL_STATES = Object.keys(STATES) as StockCoverageState[];

const dictionaries = { tr, en };

describe("ürün stok durumu sözlüğü", () => {
  for (const [locale, messages] of Object.entries(dictionaries)) {
    const coverage = messages.products.coverage as unknown as Record<string, string>;

    it(`${locale}: her durum karşılığını buluyor`, () => {
      for (const state of ALL_STATES) {
        expect(
          coverage[state]?.trim(),
          `${locale}.products.coverage.${state}`,
        ).toBeTruthy();
      }
    });

    it(`${locale}: fazladan anahtar yok`, () => {
      // Karşılığı olmayan bir etiket ekranda hiç görünmez ve sessizce ölü
      // metin olarak kalır.
      expect(Object.keys(coverage).sort()).toEqual([...ALL_STATES, "hint"].sort());
    });

    it(`${locale}: durum etiketleri birbirinden ayırt edilebilir`, () => {
      const labels = ALL_STATES.map((state) => coverage[state]);
      expect(new Set(labels).size).toBe(labels.length);
    });

    it(`${locale}: dipnot pencere uzunluğunu yerleştirebiliyor`, () => {
      // "Son X günlük satış hızına göre" cümlesinin X'i olmadan tahmin
      // dayanaksız kalır.
      expect(coverage["hint"]).toContain("{days}");
    });

    it(`${locale}: gün birimi hâlâ sayı yerleştiriyor`, () => {
      expect(messages.products.daysUnit).toContain("{days}");
    });

    it(`${locale}: sütun başlığı dolu`, () => {
      expect(messages.products.daysOfCover.trim()).not.toBe("");
    });
  }

  it("iki dil aynı anahtar kümesini taşıyor", () => {
    expect(Object.keys(tr.products.coverage).sort()).toEqual(
      Object.keys(en.products.coverage).sort(),
    );
    expect(Object.keys(tr.products).sort()).toEqual(Object.keys(en.products).sort());
  });

  it("sayfa açıklaması artık sabit gün sayısı iddia etmiyor", () => {
    /**
     * Açıklama "Son 30 günün…" derken tablo 7 günlük pencereyi gösterirse
     * kullanıcı hangisine güveneceğini bilemez. Dönem bilgisi artık
     * `analysisWindowNote` ile ekleniyor.
     */
    for (const messages of Object.values(dictionaries)) {
      expect(messages.products.description).not.toContain("{days}");
    }
  });
});
