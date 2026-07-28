import { describe, expect, it } from "vitest";

import { eachDay } from "@/core/domain";
import { buildProductPerformance } from "@/core/services/inventory-analyzer";
import {
  buildLeadTimeRisks,
  leadTimeRiskFor,
  type LeadTimeRisk,
} from "@/core/services/lead-time-risk";
import { DEFAULT_RULES } from "@/core/services/rules.config";
import {
  buildStockForecasts,
  type StockForecast,
} from "@/core/services/stock-forecast";

import {
  TODAY,
  costsFor,
  makeDataset,
  makeLine,
  makeOrder,
  makeProduct,
} from "./fixtures";

/**
 * TEDARİK SÜRESİ RİSKİ.
 *
 * `leadTimeRiskFor` `stock-forecast.ts`teki `StockForecast`i girdi olarak
 * alır ve yeniden üretmez — testler bu yüzden forecast'i elle kuruyor, kendi
 * tahminini üretmiyor. Katalog genelindeki `buildLeadTimeRisks` testleri ise
 * gerçek `buildStockForecasts` çıktısını kullanıyor.
 */

/** Ölçülebilir bir forecast — yalnızca kalan gün değişir. */
function forecast(daysRemaining: number, windowDays = 30): StockForecast {
  return { state: "low", daysRemaining, windowDays };
}

const UNMEASURABLE_FORECASTS: readonly StockForecast[] = [
  { state: "unknown", daysRemaining: null, windowDays: 30 },
  { state: "negative", daysRemaining: null, windowDays: 30 },
  { state: "noSales", daysRemaining: null, windowDays: 30 },
];

describe("leadTimeRiskFor — zaman çizelgesi durumları", () => {
  it("daysOfCover < leadTimeDays → late", () => {
    const result = leadTimeRiskFor({ forecast: forecast(4), leadTimeDays: 7 });
    expect(result.state).toBe("late");
  });

  it("eşitlik → dueToday", () => {
    const result = leadTimeRiskFor({ forecast: forecast(7), leadTimeDays: 7 });
    expect(result.state).toBe("dueToday");
    expect(result.orderDecisionDays).toBe(0);
  });

  it("[0,1) aralığı güvenli eşitlik sınırı içinde bugün sayılır", () => {
    // 7,5 gün kapsam, 7 gün tedarik → 0,5 gün fark, hâlâ "bugün".
    const result = leadTimeRiskFor({ forecast: forecast(7.5), leadTimeDays: 7 });
    expect(result.state).toBe("dueToday");
  });

  it("pozitif karar süresi karar penceresi içindeyse upcoming", () => {
    // decisionHorizonDays varsayılan 7; 10 - 7 = 3 gün kaldı.
    const result = leadTimeRiskFor({ forecast: forecast(10), leadTimeDays: 7 });
    expect(result.state).toBe("upcoming");
    expect(result.orderDecisionDays).toBe(3);
  });

  it("karar penceresinin tam sınırında hâlâ upcoming", () => {
    const horizon = DEFAULT_RULES.inventory.decisionHorizonDays;
    const result = leadTimeRiskFor({
      forecast: forecast(7 + horizon),
      leadTimeDays: 7,
    });
    expect(result.state).toBe("upcoming");
  });

  it("pozitif karar süresi karar penceresini aşarsa safe", () => {
    const result = leadTimeRiskFor({ forecast: forecast(30), leadTimeDays: 7 });
    expect(result.state).toBe("safe");
    expect(result.orderDecisionDays).toBe(23);
  });

  it("özel decisionHorizonDays ile upcoming/safe sınırı değişir", () => {
    const near = leadTimeRiskFor({
      forecast: forecast(10),
      leadTimeDays: 7,
      decisionHorizonDays: 2,
    });
    expect(near.state).toBe("safe"); // 3 gün kaldı, pencere 2 gün → safe

    const wide = leadTimeRiskFor({
      forecast: forecast(10),
      leadTimeDays: 7,
      decisionHorizonDays: 5,
    });
    expect(wide.state).toBe("upcoming"); // 3 gün kaldı, pencere 5 gün → upcoming
  });
});

describe("leadTimeRiskFor — dueToday güvenli eşitlik sınırı", () => {
  /**
   * `orderDecisionDays = daysOfCover - leadTimeDays` sınırı [0, 1) — bu
   * beş nokta sınırın tam olarak nerede kesildiğini gösteriyor: 0 ve 0,99
   * içeride (dueToday), 1,00 dışarıda (upcoming'e geçer), küçük bir negatif
   * değer late'e düşer, tam eşitlik (daysOfCover === leadTimeDays) de
   * dueToday'in kendisidir.
   */
  const leadTimeDays = 7;

  it("orderDecisionDays = 0 → dueToday", () => {
    const result = leadTimeRiskFor({ forecast: forecast(7), leadTimeDays });
    expect(result.orderDecisionDays).toBe(0);
    expect(result.state).toBe("dueToday");
  });

  it("orderDecisionDays = 0,99 → hâlâ dueToday (sınırın içinde)", () => {
    const result = leadTimeRiskFor({ forecast: forecast(7.99), leadTimeDays });
    expect(result.orderDecisionDays).toBeCloseTo(0.99, 5);
    expect(result.state).toBe("dueToday");
  });

  it("orderDecisionDays = 1,00 → artık upcoming (sınırın dışında)", () => {
    const result = leadTimeRiskFor({ forecast: forecast(8), leadTimeDays });
    expect(result.orderDecisionDays).toBe(1);
    expect(result.state).toBe("upcoming");
  });

  it("küçük bir negatif değer (orderDecisionDays = -0,01) → late", () => {
    const result = leadTimeRiskFor({ forecast: forecast(6.99), leadTimeDays });
    expect(result.orderDecisionDays).toBeCloseTo(-0.01, 5);
    expect(result.state).toBe("late");
    expect(result.shortageGapDays).toBeCloseTo(0.01, 5);
  });

  it("tam eşitlik (daysOfCover === leadTimeDays) → dueToday", () => {
    const result = leadTimeRiskFor({ forecast: forecast(leadTimeDays), leadTimeDays });
    expect(result.daysOfCover).toBe(result.leadTimeDays);
    expect(result.state).toBe("dueToday");
  });
});

describe("leadTimeRiskFor — eksik ve geçersiz tedarik süresi", () => {
  it("leadTimeDays verilmezse unknownLeadTime", () => {
    const result = leadTimeRiskFor({ forecast: forecast(10), leadTimeDays: undefined });
    expect(result.state).toBe("unknownLeadTime");
    expect(result.leadTimeDays).toBeNull();
    expect(result.orderDecisionDays).toBeNull();
    expect(result.shortageGapDays).toBeNull();
  });

  it("negatif leadTimeDays kabul edilmez — güvenli davranış unknownLeadTime'dır", () => {
    const result = leadTimeRiskFor({ forecast: forecast(10), leadTimeDays: -3 });
    expect(result.state).toBe("unknownLeadTime");
  });

  it("ondalıklı leadTimeDays kabul edilmez", () => {
    const result = leadTimeRiskFor({ forecast: forecast(10), leadTimeDays: 3.5 });
    expect(result.state).toBe("unknownLeadTime");
  });

  it("sıfır leadTimeDays kabul edilir — aynı gün tedarik anlamına gelir", () => {
    const dueToday = leadTimeRiskFor({ forecast: forecast(0), leadTimeDays: 0 });
    expect(dueToday.state).toBe("dueToday");

    const upcoming = leadTimeRiskFor({ forecast: forecast(5), leadTimeDays: 0 });
    expect(upcoming.state).toBe("upcoming");
    expect(upcoming.orderDecisionDays).toBe(5);
  });
});

describe("leadTimeRiskFor — ölçülemeyen forecast durumları", () => {
  it.each(UNMEASURABLE_FORECASTS)(
    "forecast.state=$state → unmeasurable, leadTimeDays bilinse bile",
    (unmeasurable) => {
      const result = leadTimeRiskFor({ forecast: unmeasurable, leadTimeDays: 7 });
      expect(result.state).toBe("unmeasurable");
      expect(result.leadTimeDays).toBeNull();
      expect(result.daysOfCover).toBeNull();
      expect(result.orderDecisionDays).toBeNull();
      expect(result.shortageGapDays).toBeNull();
    },
  );

  it("forecast ölçülemiyorsa lead time bilinmese de yine unmeasurable önce gelir", () => {
    const result = leadTimeRiskFor({
      forecast: UNMEASURABLE_FORECASTS[0]!,
      leadTimeDays: undefined,
    });
    expect(result.state).toBe("unmeasurable");
  });
});

describe("leadTimeRiskFor — formüller", () => {
  it("shortageGapDays = leadTimeDays - daysOfCover, yalnızca late'te dolu", () => {
    const late = leadTimeRiskFor({ forecast: forecast(4), leadTimeDays: 10 });
    expect(late.shortageGapDays).toBe(6);

    const safe = leadTimeRiskFor({ forecast: forecast(30), leadTimeDays: 7 });
    expect(safe.shortageGapDays).toBeNull();
  });

  it("shortageGapDays her zaman pozitiftir", () => {
    const late = leadTimeRiskFor({ forecast: forecast(1), leadTimeDays: 20 });
    expect(late.shortageGapDays).toBeGreaterThan(0);
  });

  it("orderDecisionDays = daysOfCover - leadTimeDays, işaretli", () => {
    const late = leadTimeRiskFor({ forecast: forecast(4), leadTimeDays: 10 });
    expect(late.orderDecisionDays).toBe(-6);

    const safe = leadTimeRiskFor({ forecast: forecast(15), leadTimeDays: 7 });
    expect(safe.orderDecisionDays).toBe(8);
  });

  it("ondalıklı daysOfCover ile de doğru hesaplar", () => {
    const result = leadTimeRiskFor({ forecast: forecast(6.5), leadTimeDays: 7 });
    expect(result.state).toBe("late");
    expect(result.shortageGapDays).toBeCloseTo(0.5, 5);
  });
});

describe("leadTimeRiskFor — Infinity ve NaN üretmez", () => {
  it("hiçbir alan Infinity ya da NaN değildir", () => {
    const scenarios: LeadTimeRisk[] = [
      leadTimeRiskFor({ forecast: forecast(4), leadTimeDays: 10 }),
      leadTimeRiskFor({ forecast: forecast(7), leadTimeDays: 7 }),
      leadTimeRiskFor({ forecast: forecast(10), leadTimeDays: 7 }),
      leadTimeRiskFor({ forecast: forecast(30), leadTimeDays: 7 }),
      leadTimeRiskFor({ forecast: forecast(10), leadTimeDays: undefined }),
      leadTimeRiskFor({ forecast: UNMEASURABLE_FORECASTS[0]!, leadTimeDays: 7 }),
    ];

    for (const risk of scenarios) {
      for (const value of [
        risk.leadTimeDays,
        risk.daysOfCover,
        risk.shortageGapDays,
        risk.orderDecisionDays,
      ]) {
        if (value !== null) expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("sonsuz kalan gün bile ölçülemez sayılır (savunma satırı)", () => {
    const result = leadTimeRiskFor({
      forecast: {
        state: "high",
        daysRemaining: Number.POSITIVE_INFINITY,
        windowDays: 30,
      },
      leadTimeDays: 7,
    });
    expect(result.state).toBe("unmeasurable");
  });

  it("negatif anlamsız gün göstermez — shortageGapDays hep >= 0", () => {
    const result = leadTimeRiskFor({ forecast: forecast(4), leadTimeDays: 10 });
    expect(result.shortageGapDays).not.toBeNull();
    expect(result.shortageGapDays!).toBeGreaterThanOrEqual(0);
  });
});

const WEEK = { from: "2026-07-21", to: TODAY };
const DAYS = eachDay(WEEK);

function dailyOrders(days: readonly string[], perDay: number, productId: string) {
  return days.map((date, index) =>
    makeOrder({
      id: `o-${productId}-${date}-${index}`,
      date,
      lines: [makeLine({ productId, quantity: perDay })],
    }),
  );
}

describe("buildLeadTimeRisks — tek geçiş, forecast yeniden hesaplanmaz", () => {
  it("katalogdaki her ürün için tek geçişte risk üretir", () => {
    const dataset = makeDataset({
      products: [
        makeProduct({ id: "gecikmis", stock: 2, leadTimeDays: 10 }),
        makeProduct({ id: "eksik-lead-time", stock: 20 }),
        makeProduct({ id: "olu", stock: 400, leadTimeDays: 7 }),
      ],
      orders: [
        ...dailyOrders(DAYS, 1, "gecikmis"),
        ...dailyOrders(DAYS, 1, "eksik-lead-time"),
      ],
    });
    const performance = buildProductPerformance(dataset, WEEK, costsFor(dataset));
    const forecasts = buildStockForecasts(performance, WEEK);
    const risks = buildLeadTimeRisks(performance, forecasts);

    expect(risks.byProduct.size).toBe(3);
    expect(risks.byProduct.get("gecikmis")?.state).toBe("late");
    expect(risks.byProduct.get("eksik-lead-time")?.state).toBe("unknownLeadTime");
    expect(risks.byProduct.get("olu")?.state).toBe("unmeasurable");
  });

  it("giriş sırasından bağımsız deterministik ürün eşleşmesi", () => {
    const products = [
      makeProduct({ id: "a", stock: 5, leadTimeDays: 7 }),
      makeProduct({ id: "b", stock: 40, leadTimeDays: 5 }),
      makeProduct({ id: "c", stock: 2, leadTimeDays: 20 }),
    ];
    const orders = [
      ...dailyOrders(DAYS, 1, "a"),
      ...dailyOrders(DAYS, 1, "b"),
      ...dailyOrders(DAYS, 1, "c"),
    ];

    const forward = makeDataset({ products, orders });
    const backward = makeDataset({ products: [...products].reverse(), orders });

    const perfForward = buildProductPerformance(forward, WEEK, costsFor(forward));
    const perfBackward = buildProductPerformance(backward, WEEK, costsFor(backward));

    const risksForward = buildLeadTimeRisks(
      perfForward,
      buildStockForecasts(perfForward, WEEK),
    );
    const risksBackward = buildLeadTimeRisks(
      perfBackward,
      buildStockForecasts(perfBackward, WEEK),
    );

    for (const id of ["a", "b", "c"]) {
      expect(risksBackward.byProduct.get(id)).toEqual(risksForward.byProduct.get(id));
    }
  });

  it("decisionHorizonDays verilmezse DEFAULT_RULES.inventory.decisionHorizonDays kullanılır", () => {
    const dataset = makeDataset({
      products: [makeProduct({ id: "p1", stock: 5 })],
    });
    const performance = buildProductPerformance(dataset, WEEK, costsFor(dataset));
    const forecasts = buildStockForecasts(performance, WEEK);
    const risks = buildLeadTimeRisks(performance, forecasts);

    expect(risks.decisionHorizonDays).toBe(DEFAULT_RULES.inventory.decisionHorizonDays);
  });

  it("forecast haritasında olmayan ürün için savunmalı unmeasurable döner", () => {
    const dataset = makeDataset({ products: [makeProduct({ id: "p1" })] });
    const performance = buildProductPerformance(dataset, WEEK, costsFor(dataset));
    const emptyForecasts = {
      windowDays: 7,
      byProduct: new Map<string, StockForecast>(),
    };

    const risks = buildLeadTimeRisks(performance, emptyForecasts);
    expect(risks.byProduct.get("p1")?.state).toBe("unmeasurable");
  });

  it("maliyeti eksik üründe de risk doğru üretilir — resolver/CostPort davranışı etkilenmez", () => {
    const dataset = makeDataset({
      products: [makeProduct({ id: "p1", stock: 2, leadTimeDays: 10 })],
      orders: dailyOrders(DAYS, 1, "p1"),
      unitCosts: { p1: null },
    });
    const performance = buildProductPerformance(dataset, WEEK, costsFor(dataset));
    const forecasts = buildStockForecasts(performance, WEEK);
    const risks = buildLeadTimeRisks(performance, forecasts);

    expect(performance[0]!.costStatus).toBe("missing");
    expect(risks.byProduct.get("p1")?.state).toBe("late");
  });
});
