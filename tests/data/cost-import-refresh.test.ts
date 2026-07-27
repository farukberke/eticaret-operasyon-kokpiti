import { describe, expect, it } from "vitest";

import { lira, type StoreDataset } from "@/core/domain";
import { createAnalysisContext } from "@/core/services/analysis-context";
import {
  buildImportPreview,
  toProductCost,
  type ImportContext,
} from "@/core/services/cost-import";
import { detectRisks } from "@/core/services/risk-detector";
import { mergeCostTables } from "@/data/adapters/local/file-cost.adapter";

import {
  COST_EPOCH,
  TODAY,
  makeDataset,
  makeLine,
  makeOrder,
  makeProduct,
} from "../core/fixtures";

/**
 * İÇE AKTARMA SONRASI YENİLENME.
 *
 * Senaryo 12'nin test edilebilir çekirdeği: içe aktarılan maliyetler
 * kayıt tablosuna karıştığında kâr, kapsam ve `COST_MISSING` sinyali
 * yeniden hesaplanıyor mu.
 *
 * Sunucu tarafındaki tazeleme (`revalidatePath` + istek başına
 * `React.cache`) burada değil, tarayıcıda doğrulanır — ama tazelenen
 * hesabın **doğru sonucu ürettiği** burada garanti altına alınır. İkisinden
 * biri bozulsa ekran eski rakamda kalırdı; bu test ikincisini tutuyor.
 */

const RANGE = { from: "2026-07-01", to: TODAY };

/** İki ürün satıyor, ikincisinin maliyeti bilinmiyor. */
function datasetWithMissingCost(): StoreDataset {
  return makeDataset({
    products: [
      makeProduct({ id: "elbise", sku: "ELB-001", name: "Kırmızı Elbise" }),
      makeProduct({ id: "ceket", sku: "CKT-002", name: "Mavi Ceket" }),
    ],
    orders: [
      makeOrder({
        id: "o1",
        date: "2026-07-10",
        lines: [
          makeLine({ productId: "elbise", quantity: 2 }),
          makeLine({ productId: "ceket", quantity: 3 }),
        ],
      }),
    ],
    // `null` = maliyeti bilinçli olarak eksik.
    unitCosts: { elbise: lira(60), ceket: null },
  });
}

function contextOf(dataset: StoreDataset) {
  return createAnalysisContext({ dataset, range: RANGE, today: TODAY });
}

function importInto(dataset: StoreDataset, csv: string): StoreDataset {
  const importContext: ImportContext = {
    products: dataset.products.map((p) => ({
      id: p.id,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
    })),
    existing: dataset.costs.products,
    today: TODAY,
  };

  const preview = buildImportPreview(csv, importContext);
  expect(preview.invalid).toHaveLength(0);
  expect(preview.unmatched).toHaveLength(0);

  // Üretimdeki yol: yazılan kayıtlar mevcut tablonun üzerine biner.
  return {
    ...dataset,
    costs: mergeCostTables(dataset.costs, {
      products: preview.toWrite.map(toProductCost),
      defaults: [],
    }),
  };
}

describe("İçe aktarma sonrası analiz", () => {
  it("eksik maliyet girildiğinde COST_MISSING sinyali kaybolur", () => {
    const before = contextOf(datasetWithMissingCost());
    expect(before.coverage.productsMissing).toBe(1);
    expect(detectRisks(before).some((s) => s.code === "COST_MISSING")).toBe(true);

    const after = contextOf(
      importInto(
        datasetWithMissingCost(),
        ["sku,alis_maliyeti,gecerlilik_tarihi", `CKT-002,55,${COST_EPOCH}`].join("\n"),
      ),
    );

    expect(after.coverage.productsMissing).toBe(0);
    expect(detectRisks(after).some((s) => s.code === "COST_MISSING")).toBe(false);
  });

  it("kapsam dışı ciro içe aktarmadan sonra sıfırlanır", () => {
    const before = contextOf(datasetWithMissingCost());
    expect(before.coverage.revenueExcluded.minor).toBeGreaterThan(0);

    const after = contextOf(
      importInto(
        datasetWithMissingCost(),
        ["sku,alis_maliyeti,gecerlilik_tarihi", `CKT-002,55,${COST_EPOCH}`].join("\n"),
      ),
    );

    expect(after.coverage.revenueExcluded.minor).toBe(0);
  });

  it("mağaza net kârı yeni ürünü de kapsayacak şekilde yeniden hesaplanır", () => {
    // Maliyeti bilinmeyen ürün toplama hiç girmiyordu; girince rakam değişmeli.
    const before = contextOf(datasetWithMissingCost());

    const after = contextOf(
      importInto(
        datasetWithMissingCost(),
        ["sku,alis_maliyeti,gecerlilik_tarihi", `CKT-002,55,${COST_EPOCH}`].join("\n"),
      ),
    );

    // 3 adet × (100 satış − 55 maliyet) = 135 lira eklenir.
    expect(after.storeNetProfit.minor - before.storeNetProfit.minor).toBe(13500);
  });

  it("geçmiş tarihli maliyet yalnızca o tarihten sonrasını etkiler", () => {
    // İçe aktarma sipariş tarihinden SONRA başlıyorsa eski sipariş hâlâ
    // ölçülemez — geçmişin geriye dönük değişmemesi kuralı burada da geçerli.
    const after = contextOf(
      importInto(
        datasetWithMissingCost(),
        ["sku,alis_maliyeti,gecerlilik_tarihi", "CKT-002,55,2026-07-20"].join("\n"),
      ),
    );

    // Sipariş 10 Temmuz'da; 20 Temmuz'dan geçerli maliyet onu kapsamıyor.
    expect(after.coverage.productsMissing).toBe(1);
  });

  it("aynı dosyayı ikinci kez aktarmak hiçbir şey yazmaz", () => {
    // İdempotanlık: kullanıcı emin olmak için tekrar yüklerse kayıt çoğalmaz.
    const csv = [
      "sku,alis_maliyeti,gecerlilik_tarihi",
      `CKT-002,55,${COST_EPOCH}`,
    ].join("\n");
    const imported = importInto(datasetWithMissingCost(), csv);

    const second = buildImportPreview(csv, {
      products: imported.products.map((p) => ({ id: p.id, sku: p.sku, name: p.name })),
      existing: imported.costs.products,
      today: TODAY,
    });

    expect(second.toWrite).toHaveLength(0);
    expect(second.unchanged).toHaveLength(1);
  });
});
