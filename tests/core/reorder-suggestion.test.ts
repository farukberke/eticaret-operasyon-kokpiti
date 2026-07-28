import { describe, expect, it } from "vitest";

import { eachDay } from "@/core/domain";
import { buildProductPerformance } from "@/core/services/inventory-analyzer";
import {
  buildReorderRecommendations,
  reorderRecommendationFor,
  type ReorderRecommendation,
} from "@/core/services/reorder-suggestion";
import { STOCK_COVERAGE_THRESHOLDS } from "@/core/services/rules.config";
import { buildStockForecasts } from "@/core/services/stock-forecast";

import {
  TODAY,
  costsFor,
  makeDataset,
  makeLine,
  makeOrder,
  makeProduct,
} from "./fixtures";

/**
 * YENİDEN SİPARİŞ ÖNERİSİ.
 *
 * `reorderRecommendationFor` `stock-forecast.ts`teki `state`i girdi olarak
 * alır ve yeniden üretmez — testler bu yüzden state'i elle veriyor, kendi
 * tahminini kurmuyor. Katalog genelindeki `buildReorderRecommendations`
 * testleri ise gerçek `buildStockForecasts` çıktısını kullanıyor (analiz
 * penceresi değişince önerinin de değişmesini kanıtlamak için).
 */

function suggestionOf(recommendation: ReorderRecommendation) {
  if (recommendation.kind !== "suggested") {
    throw new Error(`beklenen "suggested", gelen "${recommendation.kind}"`);
  }
  return recommendation;
}

describe("reorderRecommendationFor — critical/low için öneri", () => {
  it("örnekteki hesabı birebir üretir: 2,4 hız · 21 gün hedef · 12 stok → 39 adet", () => {
    const result = reorderRecommendationFor({
      state: "critical",
      stock: 12,
      dailyVelocity: 2.4,
      targetCoverageDays: 21,
    });

    const suggestion = suggestionOf(result);
    expect(suggestion.targetStockUnits).toBeCloseTo(50.4, 5);
    expect(suggestion.quantity).toBe(39);
  });

  it("critical için öneri üretir", () => {
    const result = reorderRecommendationFor({
      state: "critical",
      stock: 5,
      dailyVelocity: 3,
      targetCoverageDays: 21,
    });
    expect(suggestionOf(result).quantity).toBe(58); // ceil(63 - 5)
  });

  it("low için öneri üretir", () => {
    const result = reorderRecommendationFor({
      state: "low",
      stock: 15,
      dailyVelocity: 1,
      targetCoverageDays: 21,
    });
    expect(suggestionOf(result).quantity).toBe(6); // ceil(21 - 15)
  });

  it("kesirli sonuç yukarı yuvarlanır", () => {
    const result = reorderRecommendationFor({
      state: "low",
      stock: 10,
      dailyVelocity: 0.5,
      targetCoverageDays: 21,
    });
    // hedef 10.5, fark 0.5 → yukarı yuvarlanınca 1
    expect(suggestionOf(result).quantity).toBe(1);
  });

  it("mevcut stok hedefin üstündeyse öneri üretmez", () => {
    const result = reorderRecommendationFor({
      state: "low",
      stock: 100,
      dailyVelocity: 1,
      targetCoverageDays: 21,
    });
    expect(result.kind).toBe("none");
  });

  it("mevcut stok hedefe eşitse öneri üretmez", () => {
    const result = reorderRecommendationFor({
      state: "low",
      stock: 21,
      dailyVelocity: 1,
      targetCoverageDays: 21,
    });
    expect(result.kind).toBe("none");
  });
});

describe("reorderRecommendationFor — veri sorunlu durumlar", () => {
  it("negative: adet önermeden önce düzeltme durumunu bildirir", () => {
    const result = reorderRecommendationFor({
      state: "negative",
      stock: -5,
      dailyVelocity: 2,
    });
    expect(result).toEqual({ kind: "correctStock" });
  });

  it("unknown: adet üretmez, stok verisi gerektiğini bildirir", () => {
    const result = reorderRecommendationFor({
      state: "unknown",
      stock: null,
      dailyVelocity: 2,
    });
    expect(result).toEqual({ kind: "needsStockData" });
  });
});

describe("reorderRecommendationFor — aksiyon gerektirmeyen durumlar", () => {
  it("noSales için öneri üretmez", () => {
    const result = reorderRecommendationFor({
      state: "noSales",
      stock: 500,
      dailyVelocity: 0,
    });
    expect(result.kind).toBe("none");
  });

  it("normal için öneri üretmez", () => {
    const result = reorderRecommendationFor({
      state: "normal",
      stock: 40,
      dailyVelocity: 1,
    });
    expect(result.kind).toBe("none");
  });

  it("high için öneri üretmez", () => {
    const result = reorderRecommendationFor({
      state: "high",
      stock: 400,
      dailyVelocity: 1,
    });
    expect(result.kind).toBe("none");
  });
});

describe("reorderRecommendationFor — güvenlik ve dürüstlük", () => {
  it("sıfır hızda adet uydurmaz (critical ile bile çağrılsa)", () => {
    const result = reorderRecommendationFor({
      state: "critical",
      stock: 5,
      dailyVelocity: 0,
    });
    expect(result.kind).toBe("none");
  });

  it("negatif hızda adet uydurmaz", () => {
    const result = reorderRecommendationFor({
      state: "low",
      stock: 5,
      dailyVelocity: -2,
    });
    expect(result.kind).toBe("none");
  });

  it("Infinity hızda Infinity/NaN sızdırmaz", () => {
    const result = reorderRecommendationFor({
      state: "critical",
      stock: 5,
      dailyVelocity: Number.POSITIVE_INFINITY,
    });
    expect(result.kind).toBe("none");
  });

  it("NaN stokta NaN sızdırmaz", () => {
    const result = reorderRecommendationFor({
      state: "critical",
      stock: Number.NaN,
      dailyVelocity: 2,
    });
    expect(result.kind).toBe("none");
  });

  it("negatif stokta (state critical/low ile tutarsız veri gelse bile) adet üretmez", () => {
    const result = reorderRecommendationFor({
      state: "critical",
      stock: -3,
      dailyVelocity: 2,
    });
    expect(result.kind).toBe("none");
  });

  it("üretilen adet hiçbir zaman negatif olmaz", () => {
    const scenarios = [
      { stock: 0, dailyVelocity: 5 },
      { stock: 1000, dailyVelocity: 0.001 },
      { stock: 20, dailyVelocity: 1 },
    ];
    for (const scenario of scenarios) {
      const result = reorderRecommendationFor({
        state: "critical",
        targetCoverageDays: 21,
        ...scenario,
      });
      if (result.kind === "suggested") {
        expect(result.quantity).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("reorderRecommendationFor — hedef gün merkezi eşikten gelir", () => {
  it("targetCoverageDays verilmezse STOCK_COVERAGE_THRESHOLDS.low kullanılır", () => {
    const result = reorderRecommendationFor({
      state: "low",
      stock: 0,
      dailyVelocity: 1,
    });
    const suggestion = suggestionOf(result);
    expect(suggestion.targetCoverageDays).toBe(STOCK_COVERAGE_THRESHOLDS.low);
  });
});

const WEEK = { from: "2026-07-21", to: TODAY };

function dailyOrders(days: readonly string[], perDay: number, productId: string) {
  return days.map((date, index) =>
    makeOrder({
      id: `o-${productId}-${date}-${index}`,
      date,
      lines: [makeLine({ productId, quantity: perDay })],
    }),
  );
}

const DAYS = eachDay(WEEK);

describe("buildReorderRecommendations — tek geçiş, forecast yeniden hesaplanmaz", () => {
  it("kritik ve düşük ürünler için öneri, normal/yüksek için öneri yok", () => {
    const dataset = makeDataset({
      products: [
        makeProduct({ id: "kritik", stock: 5 }),
        makeProduct({ id: "dusuk", stock: 15 }),
        makeProduct({ id: "normal", stock: 40 }),
        makeProduct({ id: "negatif", stock: -3 }),
      ],
      orders: [
        ...dailyOrders(DAYS, 1, "kritik"),
        ...dailyOrders(DAYS, 1, "dusuk"),
        ...dailyOrders(DAYS, 1, "normal"),
      ],
    });
    const performance = buildProductPerformance(dataset, WEEK, costsFor(dataset));
    const forecasts = buildStockForecasts(performance, WEEK);
    const recommendations = buildReorderRecommendations(performance, forecasts);

    expect(recommendations.get("kritik")?.kind).toBe("suggested");
    expect(recommendations.get("dusuk")?.kind).toBe("suggested");
    expect(recommendations.get("normal")?.kind).toBe("none");
    expect(recommendations.get("negatif")?.kind).toBe("correctStock");
  });

  it("önerinin durumu forecast servisinin ürettiği state ile birebir aynı kaynaktan gelir", () => {
    const dataset = makeDataset({
      products: [makeProduct({ id: "p1", stock: 5 })],
      orders: dailyOrders(DAYS, 1, "p1"),
    });
    const performance = buildProductPerformance(dataset, WEEK, costsFor(dataset));
    const forecasts = buildStockForecasts(performance, WEEK);
    const recommendations = buildReorderRecommendations(performance, forecasts);

    const forecastState = forecasts.byProduct.get("p1")?.state;
    const recommendation = recommendations.get("p1");
    expect(forecastState).toBe("critical");
    expect(recommendation?.kind).toBe("suggested");
  });

  it("analiz penceresi değişince günlük hız ve öneri de değişir", () => {
    // Satış dağılımı düzensiz: son gün (bugün) yoğun, diğer günler az —
    // pencere kısaldıkça ortalama hız değişsin diye.
    const orders = DAYS.map((date, index) =>
      makeOrder({
        id: `o-p1-${date}-${index}`,
        date,
        lines: [makeLine({ productId: "p1", quantity: date === TODAY ? 5 : 1 })],
      }),
    );
    const dataset = makeDataset({
      products: [makeProduct({ id: "p1", stock: 20 })],
      orders,
    });

    const shortWindow = { from: TODAY, to: TODAY };
    const performanceShort = buildProductPerformance(
      dataset,
      shortWindow,
      costsFor(dataset),
    );
    const forecastsShort = buildStockForecasts(performanceShort, shortWindow);
    const recommendationsShort = buildReorderRecommendations(
      performanceShort,
      forecastsShort,
    );

    const performanceWeek = buildProductPerformance(dataset, WEEK, costsFor(dataset));
    const forecastsWeek = buildStockForecasts(performanceWeek, WEEK);
    const recommendationsWeek = buildReorderRecommendations(
      performanceWeek,
      forecastsWeek,
    );

    const shortVelocity = performanceShort.find(
      (p) => p.product.id === "p1",
    )?.dailyVelocity;
    const weekVelocity = performanceWeek.find(
      (p) => p.product.id === "p1",
    )?.dailyVelocity;
    expect(shortVelocity).not.toBe(weekVelocity);

    const shortRec = recommendationsShort.get("p1");
    const weekRec = recommendationsWeek.get("p1");
    if (shortRec?.kind === "suggested" && weekRec?.kind === "suggested") {
      expect(shortRec.dailyVelocity).not.toBe(weekRec.dailyVelocity);
    }
  });

  it("maliyeti eksik üründe de öneri doğru üretilir — resolver/CostPort davranışı etkilenmez", () => {
    const dataset = makeDataset({
      products: [makeProduct({ id: "p1", stock: 5 })],
      orders: dailyOrders(DAYS, 1, "p1"),
      unitCosts: { p1: null },
    });
    const performance = buildProductPerformance(dataset, WEEK, costsFor(dataset));
    const forecasts = buildStockForecasts(performance, WEEK);
    const recommendations = buildReorderRecommendations(performance, forecasts);

    expect(performance[0]!.costStatus).toBe("missing");
    expect(recommendations.get("p1")?.kind).toBe("suggested");
  });
});
