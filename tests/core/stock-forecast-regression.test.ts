import { describe, expect, it } from "vitest";

import { eachDay } from "@/core/domain";
import {
  buildProductPerformance,
  daysOfCoverOf,
} from "@/core/services/inventory-analyzer";
import { createCostResolver } from "@/core/services/cost-resolver";
import { detectRisks } from "@/core/services/risk-detector";
import { createAnalysisContext } from "@/core/services/analysis-context";
import { DEFAULT_RULES } from "@/core/services/rules.config";
import { buildStockForecasts } from "@/core/services/stock-forecast";

import {
  COST_EPOCH,
  TODAY,
  costsFor,
  makeDataset,
  makeLine,
  makeOrder,
  makeProduct,
} from "./fixtures";

/**
 * MEVCUT DAVRANIŞ DEĞİŞMEDİ Mİ.
 *
 * Stok tahminleyicisi var olan hesabın **üstüne** bir sınıflandırma katmanı
 * ekliyor; altındaki hiçbir şeyi değiştirmemeli. Bu dosya tam olarak o
 * sınırın bekçisi: bir gün biri "negatif stok null dönsün" diye
 * `daysOfCoverOf`u düzeltmeye kalkarsa risk motoru sessizce sapar.
 */

const WEEK = { from: "2026-07-21", to: TODAY };

function dailyOrders(days: string[], perDay: number, productId = "p1") {
  return days.map((date, index) =>
    makeOrder({
      id: `o-${date}-${index}`,
      date,
      lines: [makeLine({ productId, quantity: perDay })],
    }),
  );
}

describe("çekirdek hesaplar dokunulmadan kaldı", () => {
  it("daysOfCoverOf ham sayıyı döndürmeye devam ediyor", () => {
    expect(daysOfCoverOf(30, 12)).toBe(2.5);
    expect(daysOfCoverOf(0, 5)).toBe(0);
    expect(daysOfCoverOf(500, 0)).toBeNull();
  });

  it("negatif stokta ham hesap hâlâ negatif sayı verir", () => {
    /**
     * Sınıflandırma katmanı bunu "negatif stok" olarak ayırıyor ama ham
     * fonksiyonu değiştirmiyor. Değiştirseydi `orderDeadlineOf` gibi bu
     * sayıya dayanan hesaplar da kayardı.
     */
    expect(daysOfCoverOf(-10, 5)).toBe(-2);
  });

  it("ProductPerformance.daysOfCover aynı değeri taşımaya devam ediyor", () => {
    const dataset = makeDataset({
      products: [makeProduct({ stock: 30 })],
      orders: dailyOrders(eachDay(WEEK), 12),
    });

    const [performance] = buildProductPerformance(dataset, WEEK, costsFor(dataset));

    expect(performance!.dailyVelocity).toBe(12);
    expect(performance!.daysOfCover).toBeCloseTo(2.5, 5);
  });

  it("tahmin üretmek ürün performansını değiştirmiyor", () => {
    // Servis saf: girdisini okur, hiçbir şeyini mutasyona uğratmaz.
    const dataset = makeDataset({
      products: [makeProduct({ stock: 30 })],
      orders: dailyOrders(eachDay(WEEK), 12),
    });
    const performance = buildProductPerformance(dataset, WEEK, costsFor(dataset));
    const snapshot = structuredClone(performance);

    buildStockForecasts(performance, WEEK);

    expect(performance).toEqual(snapshot);
  });
});

describe("maliyet çözümleyicisi değişmedi", () => {
  it("CostResolver aynı arayüzle aynı cevabı veriyor", () => {
    /**
     * `CostPort` ve çözümleyici bu adımda hiç açılmadı. Test yine de burada:
     * stok rozetinin maliyet verisine dokunmadığını kanıtlıyor.
     */
    const dataset = makeDataset({
      products: [makeProduct()],
      commissionPercent: 15,
    });
    const resolver = createCostResolver(
      dataset.costs,
      new Map(dataset.products.map((p) => [p.id, p.category] as const)),
    );

    const resolved = resolver.resolve("p1", TODAY);

    expect(resolved.unitCost).not.toBeNull();
    expect(resolver.latestFor("p1")?.effectiveFrom).toBe(COST_EPOCH);
  });

  it("stok tahmini maliyet durumunu etkilemiyor", () => {
    // Maliyeti eksik bir ürünün stok rozeti yine de hesaplanabilmeli:
    // ikisi bağımsız sorular.
    const dataset = makeDataset({
      products: [makeProduct({ stock: 30 })],
      orders: dailyOrders(eachDay(WEEK), 12),
      unitCosts: { p1: null },
    });
    const performance = buildProductPerformance(dataset, WEEK, costsFor(dataset));
    const batch = buildStockForecasts(performance, WEEK);

    expect(performance[0]!.costStatus).toBe("missing");
    expect(batch.byProduct.get("p1")?.state).toBe("critical");
  });
});

describe("karar eşikleri ve risk motoru", () => {
  it("DEFAULT_RULES sayıları değişmedi", () => {
    // Rozet bu iki sayıyı ödünç alıyor; ödünç almak değiştirmek değildir.
    expect(DEFAULT_RULES.risk.stockoutDaysOfCover).toBe(7);
    expect(DEFAULT_RULES.opportunity.restockDaysOfCover).toBe(21);
    expect(DEFAULT_RULES.inventory.supplyLeadTimeDays).toBe(7);
    expect(DEFAULT_RULES.inventory.forecastHorizonDays).toBe(30);
  });

  it("STOCKOUT_IMMINENT hâlâ aynı ürün için tetikleniyor", () => {
    /**
     * Tablodaki "Kritik" rozeti ile kuyruktaki tükenme sinyali aynı ürünü
     * göstermeli. Ayrışsalardı kullanıcı tabloda acil gördüğü ürünü
     * kuyrukta bulamazdı.
     */
    const dataset = makeDataset({
      products: [makeProduct({ stock: 24 })],
      orders: dailyOrders(eachDay(WEEK), 12),
    });
    const context = createAnalysisContext({ dataset, range: WEEK, today: TODAY });

    const risks = detectRisks(context);
    const batch = buildStockForecasts(context.performance, WEEK);

    expect(risks.some((signal) => signal.code === "STOCKOUT_IMMINENT")).toBe(true);
    expect(batch.byProduct.get("p1")?.state).toBe("critical");
  });
});
