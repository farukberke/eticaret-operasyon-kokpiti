import { describe, expect, it } from "vitest";

import { isWithin, lastDays, toMajor, type SignalCode } from "@/core/domain";
import { createAnalysisContext } from "@/core/services/analysis-context";
import { detectOpportunities } from "@/core/services/opportunity-detector";
import { buildPriorities } from "@/core/services/priority-engine";
import { detectRisks } from "@/core/services/risk-detector";
import { buildProfitSummary, buildSalesSummary } from "@/core/services/summary-builder";
import { CATALOG } from "@/data/mock/catalog";
import { buildDataset, datasetRange, HISTORY_DAYS } from "@/data/mock/seed";

/**
 * Mock veri kümesinin "sağlık kontrolü".
 *
 * Bu testler formülleri değil, **demo verisinin kalitesini** korur:
 * her kural en az bir kez tetiklenmeli (yoksa ekranlar boş görünür) ama
 * ürünlerin çoğunluğu da sessiz kalmalı (yoksa panel gürültüye boğulur).
 * Katalog ayarları bozulursa burası kırılır.
 */

const TODAY = "2026-07-27";
const RANGE = lastDays(TODAY, 30);

const dataset = buildDataset(TODAY);
const context = createAnalysisContext({ dataset, range: RANGE, today: TODAY });

describe("Veri kümesi", () => {
  it("determinist: aynı gün için birebir aynı veriyi üretir", () => {
    // Panelin can damarı. Bozulursa sayfa her yenilendiğinde rakamlar oynar.
    const again = buildDataset(TODAY);
    expect(JSON.stringify(again)).toBe(JSON.stringify(dataset));
  });

  it("katalogdaki 40 ürünün tamamını taşır", () => {
    expect(dataset.products).toHaveLength(40);
    expect(CATALOG).toHaveLength(40);
  });

  it("90 günlük geçmiş üretir ve bugünde biter", () => {
    const range = datasetRange(TODAY);
    expect(range.to).toBe(TODAY);
    expect(HISTORY_DAYS).toBe(90);
    expect(dataset.orders.every((order) => isWithin(order.date, range))).toBe(true);
  });

  it("iadeler her zaman bir siparişten sonra gelir", () => {
    const orderDates = new Map(
      dataset.orders.map((order) => [order.id, order.date] as const),
    );
    for (const record of dataset.returns) {
      expect(record.date >= orderDates.get(record.orderId)!).toBe(true);
    }
  });

  it("geleceğe tarihli hareket içermez", () => {
    const future = [
      ...dataset.orders.map((o) => o.date),
      ...dataset.returns.map((r) => r.date),
      ...dataset.adSpend.map((a) => a.date),
    ].filter((date) => date > TODAY);

    expect(future).toEqual([]);
  });
});

describe("Sinyal kapsamı", () => {
  const riskCodes = new Set<SignalCode>(detectRisks(context).map((s) => s.code));
  const opportunityCodes = new Set<SignalCode>(
    detectOpportunities(context).map((s) => s.code),
  );

  it.each([
    "STOCKOUT_IMMINENT",
    "DEAD_STOCK",
    "SELLING_AT_LOSS",
    "HIGH_RETURN_RATE",
    "AD_SPEND_LEAK",
  ])("%s riski demo veride görünür", (code) => {
    expect([...riskCodes]).toContain(code);
  });

  it.each(["TRENDING_UP", "PRICE_TEST_CANDIDATE", "BUNDLE_CANDIDATE"])(
    "%s fırsatı demo veride görünür",
    (code) => {
      expect([...opportunityCodes]).toContain(code);
    },
  );

  it("sağlıklı ürünler hiç risk üretmez", () => {
    // Asıl değişmez bu: her ürünün bağırdığı panel, hiçbirinin bağırmadığı
    // panel kadar işe yaramaz. `steady` arketipi katalogdaki sessiz
    // çoğunluktur; buradan risk çıkıyorsa ya kural ya katalog bozulmuştur.
    const steadyIds = new Set(
      CATALOG.filter((entry) => entry.archetype === "steady").map(
        (entry) => entry.product.id,
      ),
    );

    const noisySteady = detectRisks(context)
      .filter((s) => s.subject.type === "product" && steadyIds.has(s.subject.id))
      .map((s) => `${s.code}:${s.subject.type === "product" ? s.subject.label : ""}`);

    expect(noisySteady).toEqual([]);
    expect(steadyIds.size).toBeGreaterThanOrEqual(dataset.products.length / 2);
  });

  it("toplam sinyal sayısı yönetilebilir kalır", () => {
    // 40 ürünlük bir mağazada 40'tan fazla sinyal, önceliklendirmenin
    // anlamını yitirdiği yerdir.
    const total = detectRisks(context).length + detectOpportunities(context).length;
    expect(total).toBeGreaterThan(10);
    expect(total).toBeLessThanOrEqual(dataset.products.length);
  });
});

describe("Öncelik listesi", () => {
  const priorities = buildPriorities(context);

  it("kokpiti dolduracak kadar madde üretir", () => {
    expect(priorities.length).toBeGreaterThanOrEqual(3);
  });

  it("skorlar azalan sırada gelir", () => {
    const scores = priorities.map((p) => p.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("her maddenin para değeri ve gerekçesi var", () => {
    for (const action of priorities) {
      expect(action.signal.evidence.length).toBeGreaterThan(0);
      expect(action.signal.moneyAtStake.minor).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("Özetler", () => {
  it("makul büyüklükte bir mağaza gösterir", () => {
    const sales = buildSalesSummary(dataset, RANGE, context.costs);

    expect(sales.orderCount).toBeGreaterThan(100);
    expect(toMajor(sales.netRevenue)).toBeGreaterThan(0);
    expect(sales.daily).toHaveLength(30);
  });

  it("kâr özeti gerçekçi bir marj verir", () => {
    const profit = buildProfitSummary(dataset, RANGE, context.costs);

    expect(toMajor(profit.netProfit)).toBeGreaterThan(0);
    // E-ticarette %5–%45 bandı dışı, katalog ayarının bozulduğunu gösterir.
    expect(profit.marginRatio).toBeGreaterThan(0.05);
    expect(profit.marginRatio).toBeLessThan(0.45);
  });

  it("grafikte boş gün bırakmaz", () => {
    const sales = buildSalesSummary(dataset, RANGE, context.costs);
    expect(sales.daily.every((point) => point.orders > 0)).toBe(true);
  });
});
