import { describe, expect, it } from "vitest";

import { ZERO_MONEY, lira, type DateRange } from "@/core/domain";
import {
  buildPeriodComparison,
  compareMoneyPeriods,
  compareRatioPeriods,
} from "@/core/services/period-comparison";
import {
  buildComparisonViews,
  moneyComparisonView,
  ratioComparisonView,
  type ComparisonTranslators,
} from "@/features/cockpit/comparison-view";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * KARŞILAŞTIRMA CÜMLESİ.
 *
 * Çekirdek "oran hesaplanamaz" der; kullanıcı ekranda **bir cümle** görür.
 * Buradaki testler o çevirinin iki dilde de tam olduğunu ve — daha önemlisi —
 * hiçbir durumda "%Infinity", "NaN" ya da boş bir kutu üretmediğini
 * doğruluyor.
 *
 * Yön anlamlandırması da burada: risk artışının kırmızı, fırsat artışının
 * nötr olması bir sunum kararıdır ve `core` bunu bilmez.
 */

const dictionaries = { tr, en } as const;

/** Sözlükten `{yer tutucu}` doldurarak metin üreten asgari `t`. */
function translatorFor(locale: keyof typeof dictionaries): ComparisonTranslators {
  const messages = dictionaries[locale] as unknown as Record<
    string,
    Record<string, string>
  >;

  const section =
    (name: string) =>
    (key: string, values: Record<string, string | number> = {}) => {
      const template = messages[name]?.[key];
      if (template === undefined) throw new Error(`eksik anahtar: ${name}.${key}`);
      return template.replace(/\{(\w+)\}/g, (match, token: string) =>
        token in values ? String(values[token]) : match,
      );
    };

  return { comparison: section("comparison"), common: section("common") };
}

const HAS_DATA = { previousHasData: true } as const;
const NO_DATA = { previousHasData: false } as const;

const RANGE: DateRange = { from: "2026-07-22", to: "2026-07-28" };

describe("Para karşılaştırma metni", () => {
  it("tr: artışı tutar ve önceki değerle birlikte yazar", () => {
    const view = moneyComparisonView(
      compareMoneyPeriods(lira(1424), lira(1300), HAS_DATA),
      "higherIsBetter",
      "tr",
      translatorFor("tr"),
    );

    expect(view.direction).toBe("up");
    expect(view.meaning).toBe(true);
    expect(view.caption).toContain("arttı");
    // Mutlak fark: ₺124. Yüzde rozette ayrı duruyor.
    expect(view.caption).toContain("124");
    expect(view.caption).toContain("1.300");
    expect(view.badge).toMatch(/^\+/);
  });

  it("en: aynı veriyi İngilizce ve yerel biçimde yazar", () => {
    const view = moneyComparisonView(
      compareMoneyPeriods(lira(1424), lira(1300), HAS_DATA),
      "higherIsBetter",
      "en",
      translatorFor("en"),
    );

    expect(view.caption).toContain("Up");
    expect(view.caption).toContain("previous period");
    // İngilizce binlik ayırıcı virgül: sayı biçimi de locale'e uyuyor.
    expect(view.caption).toContain("1,300");
  });

  it("değişim yokken 'Değişim yok' der", () => {
    const view = moneyComparisonView(
      compareMoneyPeriods(lira(1300), lira(1300), HAS_DATA),
      "higherIsBetter",
      "tr",
      translatorFor("tr"),
    );

    expect(view.direction).toBe("flat");
    expect(view.caption).toContain("Değişim yok");
  });

  it("önceki dönem 0 iken yüzde yerine durum yazar", () => {
    const view = moneyComparisonView(
      compareMoneyPeriods(lira(500), ZERO_MONEY, HAS_DATA),
      "higherIsBetter",
      "tr",
      translatorFor("tr"),
    );

    expect(view.caption).toBe("Karşılaştırılamıyor");
    expect(view.badge).toBe("—");
    expect(view.caption).not.toMatch(/%|∞|Infinity|NaN/);
  });

  it("önceki dönemde veri yokken 'Yeni' rozeti basar", () => {
    const view = moneyComparisonView(
      compareMoneyPeriods(lira(500), ZERO_MONEY, NO_DATA),
      "higherIsBetter",
      "tr",
      translatorFor("tr"),
    );

    expect(view.badge).toBe("Yeni");
    expect(view.caption).toBe("Yeni");
  });

  it("iki dönemde de veri yokken sebebini söyler", () => {
    const view = moneyComparisonView(
      compareMoneyPeriods(ZERO_MONEY, ZERO_MONEY, NO_DATA),
      "higherIsBetter",
      "tr",
      translatorFor("tr"),
    );

    expect(view.caption).toBe("Önceki dönemde veri yok");
    expect(view.badge).toBe("—");
  });

  it("hiçbir girdide Infinity ya da NaN sızdırmaz", () => {
    const values = [lira(-1000), ZERO_MONEY, lira(1), lira(9999)];

    for (const locale of ["tr", "en"] as const) {
      const t = translatorFor(locale);
      for (const current of values) {
        for (const previous of values) {
          for (const options of [HAS_DATA, NO_DATA]) {
            const view = moneyComparisonView(
              compareMoneyPeriods(current, previous, options),
              "higherIsBetter",
              locale,
              t,
            );

            for (const text of [view.badge, view.caption, view.srLabel]) {
              expect(text.trim(), text).not.toBe("");
              expect(text, text).not.toMatch(/NaN|Infinity|∞|undefined|null/);
            }
          }
        }
      }
    }
  });
});

describe("Marj karşılaştırma metni", () => {
  it("farkı puan olarak yazar, yüzde olarak değil", () => {
    const view = ratioComparisonView(
      compareRatioPeriods(0.18, 0.22, HAS_DATA),
      "higherIsBetter",
      "tr",
      translatorFor("tr"),
    );

    expect(view.badge).toContain("puan");
    expect(view.badge).toContain("-4,0");
    expect(view.caption).toContain("azaldı");
    // Önceki marj yüzde olarak görünür: "%22,0".
    expect(view.caption).toContain("22,0");
  });

  it("en: puan kısaltmasını sözlükten alır", () => {
    const view = ratioComparisonView(
      compareRatioPeriods(0.25, 0.2, HAS_DATA),
      "higherIsBetter",
      "en",
      translatorFor("en"),
    );

    expect(view.badge).toContain("pts");
    expect(view.caption).toContain("Up");
  });

  it("marj tanımsızken karşılaştırma uydurmaz", () => {
    const view = ratioComparisonView(
      compareRatioPeriods(null, 0.2, HAS_DATA),
      "higherIsBetter",
      "tr",
      translatorFor("tr"),
    );

    expect(view.caption).toBe("Karşılaştırılamıyor");
    expect(view.badge).toBe("—");
  });
});

describe("Yön anlamlandırması", () => {
  const comparison = buildPeriodComparison({
    range: RANGE,
    sales: {
      range: RANGE,
      grossRevenue: lira(10_000),
      netRevenue: lira(10_000),
      orderCount: 40,
      unitsSold: 40,
      averageOrderValue: ZERO_MONEY,
      revenueTrend: {
        current: lira(10_000),
        previous: lira(8000),
        deltaRatio: null,
        direction: "flat",
      },
      orderTrend: { current: 40, previous: 30, deltaRatio: null, direction: "flat" },
      daily: [],
    },
    profit: {
      range: RANGE,
      grossRevenue: ZERO_MONEY,
      discounts: ZERO_MONEY,
      refunds: ZERO_MONEY,
      netRevenue: ZERO_MONEY,
      cogs: ZERO_MONEY,
      commission: ZERO_MONEY,
      shipping: ZERO_MONEY,
      packaging: ZERO_MONEY,
      adSpend: ZERO_MONEY,
      netProfit: lira(2000),
      marginRatio: 0.2,
      coverage: {
        productsMeasured: 1,
        productsMissing: 0,
        revenueExcluded: ZERO_MONEY,
      },
      profitTrend: {
        current: lira(2000),
        previous: lira(1600),
        deltaRatio: null,
        direction: "flat",
      },
      marginDeltaPoints: null,
      daily: [],
    },
    risks: [],
    opportunities: [],
    previousRisks: [],
    previousOpportunities: [],
  });

  const views = buildComparisonViews(comparison, "tr", translatorFor("tr"));

  it("net kâr ve marj artışı olumludur", () => {
    expect(views.netProfit.meaning).toBe(true);
    expect(views.margin.meaning).toBe(true);
    expect(views.netRevenue.meaning).toBe(true);
  });

  it("risk artışı olumsuzdur — ters anlamlandırılır", () => {
    // `higherIsBetter: false`: yukarı ok kırmızı basılır.
    expect(views.risk.meaning).toBe(false);
  });

  it("fırsat artışı nötrdür — olmayan bir yargı satılmaz", () => {
    expect(views.opportunity.meaning).toBe("neutral");
  });

  it("hangi iki dönemin kıyaslandığını yazıyla söyler", () => {
    // "22 – 28 Tem · önceki 15 – 21 Tem"
    expect(views.windowLabel).toContain("28");
    expect(views.windowLabel).toContain("önceki");
    expect(views.windowLabel).toContain("15");
  });
});
