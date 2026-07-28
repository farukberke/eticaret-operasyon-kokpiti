import { describe, expect, it } from "vitest";

import {
  forecastStockCoverage,
  type StockCoverageState,
} from "@/core/services/stock-forecast";
import {
  toStockCoverageView,
  type StockCoverageTexts,
} from "@/features/products/stock-forecast-view";
import type { Locale } from "@/i18n/routing";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * TAHMİN → ROZET.
 *
 * Metinler **gerçek sözlüklerden** okunuyor, testin içinde uydurulmuyor:
 * amaç eşlemenin doğruluğu kadar, iki dilin de her durumu karşılayabildiğini
 * doğrulamak. Sözlükten bir anahtar düşerse burada `undefined` olarak yakalanır.
 */

const DICTIONARIES = { tr, en } as const;

function textsFor(locale: keyof typeof DICTIONARIES): StockCoverageTexts {
  const coverage = DICTIONARIES[locale].products.coverage;
  const daysUnit = DICTIONARIES[locale].products.daysUnit;

  return {
    state: {
      critical: coverage.critical,
      low: coverage.low,
      normal: coverage.normal,
      high: coverage.high,
      unknown: coverage.unknown,
      noSales: coverage.noSales,
      negative: coverage.negative,
    },
    days: (days) => daysUnit.replace("{days}", days),
    hint: (windowDays) => coverage.hint.replace("{days}", String(windowDays)),
  };
}

function viewOf(
  locale: keyof typeof DICTIONARIES,
  stock: number | null,
  dailyVelocity: number,
  windowDays = 30,
) {
  return toStockCoverageView(
    forecastStockCoverage({ stock, dailyVelocity, windowDays }),
    locale as Locale,
    textsFor(locale),
  );
}

describe("stok rozeti — biçimlendirme", () => {
  it("tr: kalan günü ondalıkla ve birimiyle yazar", () => {
    // 2,5 gün ile 2 gün farklı kararlar doğurur; ondalık atılamaz.
    expect(viewOf("tr", 30, 12).daysLabel).toBe("2,5 gün");
  });

  it("en: aynı sayıyı kendi ayracıyla yazar", () => {
    expect(viewOf("en", 30, 12).daysLabel).toBe("2.5 days");
  });

  it("tr: dipnot pencere uzunluğunu taşır", () => {
    expect(viewOf("tr", 100, 4, 7).hint).toBe(
      "Son 7 günlük satış hızına göre tahmini.",
    );
    expect(viewOf("tr", 100, 4, 90).hint).toContain("90");
  });

  it("en: dipnot da çevrilidir", () => {
    expect(viewOf("en", 100, 4, 7).hint).toBe(
      "Estimated from the last 7 days of sales velocity.",
    );
  });

  it("ölçülemeyen durumlarda gün etiketi null — sıfır yazılmaz", () => {
    // "0 gün" ile "bilmiyoruz" aynı şey değil: ilki tükendi demek.
    expect(viewOf("tr", null, 5).daysLabel).toBeNull();
    expect(viewOf("tr", 500, 0).daysLabel).toBeNull();
    expect(viewOf("tr", -5, 5).daysLabel).toBeNull();
  });
});

describe("stok rozeti — durum metinleri", () => {
  const cases: readonly (readonly [StockCoverageState, number | null, number])[] = [
    ["critical", 5, 1],
    ["low", 15, 1],
    ["normal", 40, 1],
    ["high", 400, 1],
    ["unknown", null, 5],
    ["noSales", 500, 0],
    ["negative", -5, 5],
  ];

  for (const locale of ["tr", "en"] as const) {
    it.each(cases)(
      `${locale}: %s durumu boş olmayan bir kelimeyle anlatılır`,
      (state, stock, velocity) => {
        const view = viewOf(locale, stock, velocity);

        expect(view.state).toBe(state);
        expect(view.stateLabel).toBe(textsFor(locale).state[state]);
        expect(view.stateLabel.trim()).not.toBe("");
      },
    );
  }

  it("tr: kritik ve düşük birbirinden ayırt edilebilir", () => {
    expect(viewOf("tr", 5, 1).stateLabel).toBe("Kritik");
    expect(viewOf("tr", 15, 1).stateLabel).toBe("Düşük");
  });

  it("tr: ölçülemezlik sebepleri tek bir 'bilinmiyor'a indirgenmez", () => {
    /**
     * Üçünde de kullanıcının yapacağı iş farklı: entegrasyon, ölü stok,
     * envanter düzeltmesi. Aynı kelimeyi görselerdi hangisi olduğunu
     * anlayamazlardı.
     */
    const labels = [
      viewOf("tr", null, 5).stateLabel,
      viewOf("tr", 500, 0).stateLabel,
      viewOf("tr", -5, 5).stateLabel,
    ];

    expect(new Set(labels).size).toBe(3);
  });
});

describe("stok rozeti — ton", () => {
  it("renk tek başına anlam taşımaz: her tonun yanında kelime var", () => {
    for (const [, stock, velocity] of [
      ["critical", 5, 1],
      ["high", 400, 1],
      ["noSales", 500, 0],
    ] as const) {
      const view = viewOf("tr", stock, velocity);
      expect(view.tone).toBeTruthy();
      expect(view.stateLabel.trim()).not.toBe("");
    }
  });

  it("kritik ve negatif stok tehlike tonunda", () => {
    expect(viewOf("tr", 5, 1).tone).toBe("danger");
    expect(viewOf("tr", -5, 5).tone).toBe("danger");
  });

  it("yüksek stok uyarı değil bilgi tonunda", () => {
    // Aşırı stok bir hata değil, bağlı sermaye bağlamı.
    expect(viewOf("tr", 400, 1).tone).toBe("info");
    expect(viewOf("tr", 40, 1).tone).toBe("success");
  });

  it("bilinmeyen durumlar nötr kalır", () => {
    expect(viewOf("tr", null, 5).tone).toBe("neutral");
    expect(viewOf("tr", 500, 0).tone).toBe("neutral");
  });
});

describe("stok rozeti — tahmin yokluğu", () => {
  it("tahmini üretilmemiş ürün boş hücre değil 'hesaplanamıyor' gösterir", () => {
    // Katalogda olup tahmini olmayan ürün bir hata belirtisi; görünmez olmamalı.
    const view = toStockCoverageView(undefined, "tr" as Locale, textsFor("tr"));

    expect(view.state).toBe("unknown");
    expect(view.daysLabel).toBeNull();
    expect(view.stateLabel).toBe(tr.products.coverage.unknown);
  });
});
