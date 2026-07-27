import { describe, expect, it } from "vitest";

import { eachDay, lira, toMajor } from "@/core/domain";
import {
  buildProductPerformance,
  daysOfCoverOf,
  velocityChangeOf,
} from "@/core/services/inventory-analyzer";

import {
  TODAY,
  costsFor,
  makeDataset,
  makeLine,
  makeOrder,
  makeProduct,
} from "./fixtures";

/** Verilen günlerde her gün `perDay` adet satan siparişler üretir. */
function dailyOrders(days: string[], perDay: number, productId = "p1") {
  return days.map((date, index) =>
    makeOrder({
      id: `o-${date}-${index}`,
      date,
      lines: [makeLine({ productId, quantity: perDay })],
    }),
  );
}

const WEEK = { from: "2026-07-21", to: TODAY };

describe("daysOfCoverOf", () => {
  it("satış hızı sıfırken null döner", () => {
    // "Sonsuz gün yeter" demek ölü stoğu gizlerdi.
    expect(daysOfCoverOf(500, 0)).toBeNull();
  });

  it("stoğu günlük hıza böler", () => {
    expect(daysOfCoverOf(30, 12)).toBe(2.5);
  });

  it("stok bittiğinde sıfır döner", () => {
    expect(daysOfCoverOf(0, 5)).toBe(0);
  });
});

describe("buildProductPerformance", () => {
  it("günlük satış hızını aralık uzunluğuna böler", () => {
    const dataset = makeDataset({
      products: [makeProduct({ stock: 30 })],
      orders: dailyOrders(eachDay(WEEK), 12),
    });

    const [performance] = buildProductPerformance(dataset, WEEK, costsFor(dataset));

    expect(performance!.unitsSold).toBe(84); // 7 gün × 12
    expect(performance!.dailyVelocity).toBe(12);
    expect(performance!.daysOfCover).toBeCloseTo(2.5, 5);
  });

  it("hiç satmayan ürünü listede tutar", () => {
    // Ölü stok tespiti tam olarak "listede olup satmayanı" bulmak demek.
    const dataset = makeDataset({
      products: [makeProduct({ id: "olu", stock: 40 })],
      unitCosts: { olu: lira(75) },
      orders: [],
    });

    const [performance] = buildProductPerformance(dataset, WEEK, costsFor(dataset));

    expect(performance!.unitsSold).toBe(0);
    expect(performance!.daysOfCover).toBeNull();
    expect(toMajor(performance!.stockValue!)).toBe(3000); // 40 × 75
  });

  it("iade edilen adetleri satış hızından düşer", () => {
    const days = eachDay(WEEK);
    const dataset = makeDataset({
      products: [makeProduct({ stock: 100 })],
      orders: dailyOrders(days, 10),
      returns: [
        {
          id: "r1",
          orderId: "o1",
          productId: "p1",
          date: TODAY,
          quantity: 7,
          refund: lira(700),
        },
      ],
    });

    const [performance] = buildProductPerformance(dataset, WEEK, costsFor(dataset));

    expect(performance!.unitsSold).toBe(70);
    expect(performance!.unitsReturned).toBe(7);
    // Net 63 adet / 7 gün
    expect(performance!.dailyVelocity).toBe(9);
  });

  it("önceki dönemle karşılaştırarak trend üretir", () => {
    const current = eachDay(WEEK);
    const previous = eachDay({ from: "2026-07-14", to: "2026-07-20" });

    const dataset = makeDataset({
      products: [makeProduct({ stock: 500 })],
      orders: [...dailyOrders(previous, 10), ...dailyOrders(current, 15)],
    });

    const [performance] = buildProductPerformance(dataset, WEEK, costsFor(dataset));

    expect(performance!.previousDailyVelocity).toBe(10);
    expect(performance!.dailyVelocity).toBe(15);
    expect(velocityChangeOf(performance!)).toBeCloseTo(0.5, 5);
  });

  it("önceki dönemde satış yoksa trend oranı null olur", () => {
    const dataset = makeDataset({
      products: [makeProduct({ stock: 500 })],
      orders: dailyOrders(eachDay(WEEK), 5),
    });

    const [performance] = buildProductPerformance(dataset, WEEK, costsFor(dataset));
    expect(velocityChangeOf(performance!)).toBeNull();
  });
});
