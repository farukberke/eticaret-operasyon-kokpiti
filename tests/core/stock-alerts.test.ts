import { describe, expect, it } from "vitest";

import { eachDay, type Product } from "@/core/domain";
import { createCostResolver } from "@/core/services/cost-resolver";
import { buildProductPerformance } from "@/core/services/inventory-analyzer";
import { buildStockAlerts } from "@/core/services/stock-alerts";
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
 * STOK UYARILARI.
 *
 * Servis hiçbir şeyi yeniden hesaplamıyor: girdisi `buildStockForecasts`in
 * çıktısı, çıktısı da o kararın **önceliklendirilmiş** hâli. Testler bu yüzden
 * iki şeyi ayrı ayrı kovalıyor: hangi durumlar listeye girer (kapsam) ve
 * hangi sırayla (öncelik).
 */

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

function alertsFor(
  products: readonly Product[],
  orders: ReturnType<typeof makeOrder>[],
) {
  const dataset = makeDataset({ products, orders });
  const performance = buildProductPerformance(dataset, WEEK, costsFor(dataset));
  const forecasts = buildStockForecasts(performance, WEEK);
  return { alerts: buildStockAlerts(performance, forecasts), performance, forecasts };
}

const DAYS = eachDay(WEEK);

describe("buildStockAlerts — kapsam", () => {
  it("normal ve yüksek stok için uyarı üretmez", () => {
    const { alerts } = alertsFor(
      [
        makeProduct({ id: "normal", stock: 40 }),
        makeProduct({ id: "yuksek", stock: 400 }),
      ],
      [...dailyOrders(DAYS, 1, "normal"), ...dailyOrders(DAYS, 1, "yuksek")],
    );

    expect(alerts).toEqual([]);
  });

  it("satış verisi olmayan (noSales) ürün için uyarı üretmez", () => {
    const { alerts } = alertsFor([makeProduct({ id: "olu", stock: 500 })], []);
    expect(alerts).toEqual([]);
  });

  it("critical/low/negative/unknown durumlarının hepsi için uyarı üretir", () => {
    const { alerts } = alertsFor(
      [
        makeProduct({ id: "kritik", stock: 5 }),
        makeProduct({ id: "dusuk", stock: 15 }),
        makeProduct({ id: "negatif", stock: -3 }),
        makeProduct({ id: "bilinmiyor", stock: Number.NaN }),
      ],
      [...dailyOrders(DAYS, 1, "kritik"), ...dailyOrders(DAYS, 1, "dusuk")],
    );

    const levels = new Map(alerts.map((a) => [a.productId, a.level]));
    expect(levels.get("kritik")).toBe("critical");
    expect(levels.get("dusuk")).toBe("low");
    expect(levels.get("negatif")).toBe("negative");
    expect(levels.get("bilinmiyor")).toBe("unknown");
  });
});

describe("buildStockAlerts — öncelik sırası", () => {
  it("negative en üstte durur", () => {
    const { alerts } = alertsFor(
      [
        makeProduct({ id: "kritik", stock: 5 }),
        makeProduct({ id: "negatif", stock: -5 }),
      ],
      dailyOrders(DAYS, 1, "kritik"),
    );

    expect(alerts[0]!.productId).toBe("negatif");
  });

  it("critical → unknown → low sırasını korur", () => {
    const { alerts } = alertsFor(
      [
        makeProduct({ id: "dusuk", stock: 15 }),
        makeProduct({ id: "kritik", stock: 5 }),
        makeProduct({ id: "bilinmiyor", stock: Number.NaN }),
      ],
      [...dailyOrders(DAYS, 1, "dusuk"), ...dailyOrders(DAYS, 1, "kritik")],
    );

    expect(alerts.map((a) => a.productId)).toEqual(["kritik", "bilinmiyor", "dusuk"]);
  });

  it("aynı grupta kalan günü az olan önce gelir", () => {
    const { alerts } = alertsFor(
      [
        makeProduct({ id: "az-gun", stock: 2 }),
        makeProduct({ id: "cok-gun", stock: 5 }),
      ],
      [...dailyOrders(DAYS, 1, "az-gun"), ...dailyOrders(DAYS, 1, "cok-gun")],
    );

    expect(alerts.map((a) => a.productId)).toEqual(["az-gun", "cok-gun"]);
    expect(alerts.every((a) => a.level === "critical")).toBe(true);
  });

  it("aynı grupta ve aynı günde satış hızı yüksek olan önce gelir", () => {
    // İkisi de 5 gün yeter (10/2 = 20/4); yalnızca hız farklı.
    const { alerts } = alertsFor(
      [
        makeProduct({ id: "yavas", stock: 10 }),
        makeProduct({ id: "hizli", stock: 20 }),
      ],
      [...dailyOrders(DAYS, 2, "yavas"), ...dailyOrders(DAYS, 4, "hizli")],
    );

    expect(alerts.map((a) => a.productId)).toEqual(["hizli", "yavas"]);
  });

  it("her ölçüt eşitken productId'ye göre kararlı sıralar", () => {
    const build = () =>
      alertsFor(
        [makeProduct({ id: "b", stock: 5 }), makeProduct({ id: "a", stock: 5 })],
        [...dailyOrders(DAYS, 1, "b"), ...dailyOrders(DAYS, 1, "a")],
      ).alerts.map((a) => a.productId);

    expect(build()).toEqual(["a", "b"]);
    expect(build()).toEqual(build());
  });
});

describe("buildStockAlerts — gösterim alanları", () => {
  it("mevcut stok ve kalan günü olduğu gibi taşır", () => {
    const { alerts } = alertsFor(
      [makeProduct({ id: "p1", stock: 5 })],
      dailyOrders(DAYS, 1, "p1"),
    );

    expect(alerts[0]).toMatchObject({
      productId: "p1",
      stock: 5,
      level: "critical",
      daysRemaining: 5,
    });
  });

  it("negatif ve bilinmeyen stok farklı seviyeler olarak kalır, tek bir 'bilinmiyor'a indirgenmez", () => {
    const { alerts } = alertsFor(
      [
        makeProduct({ id: "negatif", stock: -5 }),
        makeProduct({ id: "bilinmiyor", stock: Number.NaN }),
      ],
      [],
    );

    const levels = alerts.map((a) => a.level);
    expect(new Set(levels).size).toBe(2);
    expect(levels).toContain("negative");
    expect(levels).toContain("unknown");
    expect(alerts.every((a) => a.daysRemaining === null)).toBe(true);
  });
});

describe("buildStockAlerts — aynı tahmin servisine bağlılık", () => {
  it("her uyarının seviyesi ve kalan günü forecast servisinin çıktısıyla birebir aynı", () => {
    const { alerts, forecasts } = alertsFor(
      [makeProduct({ id: "p1", stock: 5 }), makeProduct({ id: "p2", stock: 15 })],
      [...dailyOrders(DAYS, 1, "p1"), ...dailyOrders(DAYS, 1, "p2")],
    );

    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) {
      const forecast = forecasts.byProduct.get(alert.productId);
      expect(alert.level).toBe(forecast?.state);
      expect(alert.daysRemaining).toBe(forecast?.daysRemaining);
    }
  });
});

describe("buildStockAlerts — resolver ve CostPort davranışı değişmedi", () => {
  it("maliyeti bilinmeyen üründe de uyarı doğru üretilir", () => {
    const dataset = makeDataset({
      products: [makeProduct({ id: "p1", stock: 5 })],
      orders: dailyOrders(DAYS, 1, "p1"),
      unitCosts: { p1: null },
    });
    const performance = buildProductPerformance(dataset, WEEK, costsFor(dataset));
    const forecasts = buildStockForecasts(performance, WEEK);
    const alerts = buildStockAlerts(performance, forecasts);

    expect(performance[0]!.costStatus).toBe("missing");
    expect(alerts[0]).toMatchObject({ productId: "p1", level: "critical" });
  });

  it("CostResolver aynı arayüzle aynı cevabı vermeye devam ediyor", () => {
    const dataset = makeDataset({ products: [makeProduct()], commissionPercent: 15 });
    const resolver = createCostResolver(
      dataset.costs,
      new Map(dataset.products.map((p) => [p.id, p.category] as const)),
    );

    const resolved = resolver.resolve("p1", TODAY);
    expect(resolved.unitCost).not.toBeNull();
  });
});
