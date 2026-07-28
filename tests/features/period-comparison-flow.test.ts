import { describe, expect, it } from "vitest";

import { daysInRange, isWithin, lira, type StoreDataset } from "@/core/domain";
import { createAnalysisContext } from "@/core/services/analysis-context";
import {
  ANALYSIS_PRESETS,
  resolveAnalysisWindow,
  selectionOf,
} from "@/core/services/analysis-window";
import { getMissingCostImpacts } from "@/core/services/missing-cost";
import {
  buildPeriodComparison,
  comparisonRangeOf,
} from "@/core/services/period-comparison";
import { detectRisks } from "@/core/services/risk-detector";
import { buildProfitSummary, buildSalesSummary } from "@/core/services/summary-builder";
import {
  ANALYSIS_FROM_PARAM,
  ANALYSIS_PARAM,
  ANALYSIS_TO_PARAM,
  analysisQuery,
  readAnalysisWindow,
  withAnalysisQuery,
} from "@/features/analysis/analysis-params";

import { makeDataset, makeLine, makeOrder, makeProduct } from "../core/fixtures";

/**
 * KARŞILAŞTIRMA GERÇEKTEN SEÇİLİ PENCEREDEN TÜRÜYOR MU.
 *
 * En büyük risk burada bir hesap hatası değil, **ikinci bir gerçeğin ortaya
 * çıkması**: önceki dönemin ayrı bir yerden (adres çubuğu, ayrı bir state,
 * kendi tarih hesabı) gelmesi. O an panel iki farklı "önceki dönem"den konuşur
 * ve hangi yüzdenin doğru olduğu bilinemez.
 *
 * Bu yüzden testler ürünün sözleşmesine bakıyor: adres değişmedi mi, pencere
 * tek kaynaktan mı türedi, maliyet çözümleyicisi ve rapor davranışı aynı mı
 * kaldı.
 */

const TODAY = "2026-07-28";

/**
 * İki pencereye de düşen siparişler: "yakın" son 7 güne, "önceki" ondan bir
 * önceki 7 güne. Karşılaştırmanın gerçekten iki farklı toplam görmesi gerekiyor.
 */
function dataset(): StoreDataset {
  return makeDataset({
    products: [makeProduct({ id: "p1", sku: "SKU-1", name: "Ürün" })],
    orders: [
      makeOrder({
        id: "o-yakin",
        date: "2026-07-25",
        lines: [makeLine({ productId: "p1", quantity: 4 })],
      }),
      makeOrder({
        id: "o-onceki",
        date: "2026-07-18",
        lines: [makeLine({ productId: "p1", quantity: 1 })],
      }),
    ],
    unitCosts: { p1: lira(60) },
  });
}

describe("adres çubuğu", () => {
  it("karşılaştırma için ikinci bir tarih aralığı yazmaz", () => {
    // Adreste yalnızca seçili pencere yaşar; önceki dönem ondan türer.
    const allowed = new Set([ANALYSIS_PARAM, ANALYSIS_FROM_PARAM, ANALYSIS_TO_PARAM]);

    for (const preset of ANALYSIS_PRESETS) {
      const window = resolveAnalysisWindow(
        preset === "custom"
          ? { preset, from: "2026-07-10", to: "2026-07-19" }
          : { preset },
        TODAY,
      );
      const query = analysisQuery(selectionOf(window));
      if (query === "") continue;

      for (const pair of query.split("&")) {
        expect(allowed.has(pair.split("=")[0] ?? ""), `${preset}: ${pair}`).toBe(true);
      }
    }
  });

  it("mevcut analiz bağlantıları birebir aynı kalır", () => {
    // Kokpitten detay sayfalarına giden bağlantılar değişmedi.
    const selection = selectionOf(resolveAnalysisWindow({ preset: "last90" }, TODAY));

    expect(withAnalysisQuery("/risks", selection)).toBe("/risks?period=last90");
    expect(withAnalysisQuery("/costs#cost-p2", selection)).toBe(
      "/costs?period=last90#cost-p2",
    );
    // Varsayılan pencere hâlâ adresi kirletmiyor.
    expect(withAnalysisQuery("/risks", { preset: "last30" })).toBe("/risks");
  });
});

describe("karşılaştırma penceresi tek kaynaktan türer", () => {
  it("adresten okunan pencere ile önceki dönem aynı zincirden gelir", () => {
    const window = readAnalysisWindow({ [ANALYSIS_PARAM]: "last7" }, TODAY);
    const previous = comparisonRangeOf(window.range);

    expect(window.range).toEqual({ from: "2026-07-22", to: TODAY });
    expect(previous).toEqual({ from: "2026-07-15", to: "2026-07-21" });
    expect(daysInRange(previous)).toBe(daysInRange(window.range));
  });

  it("geçersiz özel aralıkta önceki dönem de varsayılan pencereden türer", () => {
    // Analiz varsayılana düştüyse karşılaştırma da oraya düşmeli; aksi hâlde
    // ekrandaki iki sayı iki farklı dönemden konuşurdu.
    const broken = readAnalysisWindow(
      {
        [ANALYSIS_PARAM]: "custom",
        [ANALYSIS_FROM_PARAM]: "2026-07-25",
        [ANALYSIS_TO_PARAM]: "2026-07-01",
      },
      TODAY,
    );
    const fallback = readAnalysisWindow({}, TODAY);

    expect(broken.invalid).toBe(true);
    expect(comparisonRangeOf(broken.range)).toEqual(comparisonRangeOf(fallback.range));
  });

  it("her preset için önceki dönem seçili pencereyle çakışmaz", () => {
    for (const preset of ANALYSIS_PRESETS) {
      const { range } = resolveAnalysisWindow({ preset }, TODAY);
      const previous = comparisonRangeOf(range);

      expect(isWithin(previous.to, range), preset).toBe(false);
    }
  });
});

describe("üretimdeki yol: pencere → iki bağlam → karşılaştırma", () => {
  const data = dataset();
  const window = readAnalysisWindow({ [ANALYSIS_PARAM]: "last7" }, TODAY);
  const range = window.range;
  const previousRange = comparisonRangeOf(range);

  const context = createAnalysisContext({ dataset: data, range, today: TODAY });
  const previousContext = createAnalysisContext({
    dataset: data,
    range: previousRange,
    today: TODAY,
  });

  const comparison = buildPeriodComparison({
    range,
    sales: buildSalesSummary(data, range, context.costs),
    profit: buildProfitSummary(data, range, context.costs),
    risks: detectRisks(context),
    opportunities: [],
    previousRisks: detectRisks(previousContext),
    previousOpportunities: [],
  });

  it("iki dönem farklı siparişleri görür", () => {
    // 4 adet bu pencerede, 1 adet öncekinde: karşılaştırma boş çıkmamalı.
    expect(comparison.hasCurrentData).toBe(true);
    expect(comparison.hasPreviousData).toBe(true);
    expect(comparison.netRevenue.current).toEqual(lira(400));
    expect(comparison.netRevenue.previous).toEqual(lira(100));
    expect(comparison.netRevenue.direction).toBe("up");
    expect(comparison.netRevenue.deltaRatio).toBeCloseTo(3, 10);
  });

  it("net kâr karşılaştırması özetin trend alanıyla birebir aynıdır", () => {
    // Aynı sayı iki yerde hesaplanmıyor: karşılaştırma özetin taşıdığı
    // önceki dönem toplamını kullanıyor.
    const profit = buildProfitSummary(data, range, context.costs);
    expect(comparison.netProfit.previous).toEqual(profit.profitTrend.previous);
    expect(comparison.netProfit.current).toEqual(profit.netProfit);
  });

  it("önceki dönem bağlamı maliyet çözümleyicisinin davranışını değiştirmez", () => {
    // Çözümleyici tarih bazlı; hangi pencerede olduğumuz onu ilgilendirmiyor.
    expect(previousContext.costs.resolve("p1", "2026-07-18").unitCost).toEqual(
      lira(60),
    );
    expect(context.costs.resolve("p1", "2026-07-18").unitCost).toEqual(lira(60));
    expect(context.costs.resolve("p1", "2026-07-25").unitCost).toEqual(lira(60));
  });

  it("eksik maliyet raporu yalnızca seçili pencereden konuşmaya devam eder", () => {
    // Karşılaştırma eklendi diye rapor önceki dönemin siparişlerini saymamalı.
    const report = getMissingCostImpacts({
      dataset: data,
      range,
      costs: context.costs,
      today: TODAY,
    });

    expect(report.ordersConsidered).toBe(1);
  });
});
