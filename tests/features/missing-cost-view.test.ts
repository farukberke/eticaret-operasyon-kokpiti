import { describe, expect, it } from "vitest";

import type { MissingCostImpact } from "@/core/domain";
import { buildMissingCostRows, toneOf } from "@/features/costs/missing-cost-view";

/**
 * DOMAIN → GÖRÜNÜM.
 *
 * Bu çeviri sunucuda yapılır ve sonucu istemciye **hazır metin** olarak
 * geçer. İki şey korunuyor: kuruşun ekrana kadar bozulmadan gelmesi ve
 * `CostEditor`'ın beklediği sözleşmenin tutması — form ham değer taşır,
 * biçimlenmiş metin değil.
 */

function impact(overrides: Partial<MissingCostImpact> = {}): MissingCostImpact {
  return {
    productId: "p1",
    name: "Yazlık Elbise",
    sku: "SKU-1",
    affectedLines: 3,
    affectedOrders: 2,
    affectedUnits: 7,
    uncomputableRevenue: { minor: 4_260_055, currency: "TRY" },
    firstOrderDate: "2026-07-03",
    lastOrderDate: "2026-07-12",
    level: "critical",
    reason: "revenue",
    ...overrides,
  };
}

describe("eksik maliyet satır görünümü", () => {
  it("sayıları ve tarihleri locale'e göre biçimlendirir", () => {
    const [tr] = buildMissingCostRows([impact()], "tr");
    const [en] = buildMissingCostRows([impact()], "en");

    // Para birimi işareti locale'in kendi geleneğine göre yazılır: tr "₺",
    // en "TRY". İkisini de biçimlendirme katmanı bilir, bu dosya değil.
    expect(tr?.revenueLabel).toContain("₺");
    expect(en?.revenueLabel).toContain("TRY");
    // Aynı tutar iki dilde farklı yazılır; ham sayı değil, metin gider.
    expect(tr?.revenueLabel).not.toBe(en?.revenueLabel);
    expect(tr?.firstDateLabel).not.toBe(tr?.lastDateLabel);
  });

  it("kuruşu yuvarlamadan taşır", () => {
    // 42.600,55 ₺ — 100 ₺ üstünde varsayılan olarak kuruşsuz basılır ama
    // yuvarlama aşağı değil en yakına olmalı: 42.601.
    const [row] = buildMissingCostRows([impact()], "tr");
    expect(row?.revenueLabel).toContain("42.601");
  });

  it("barkod varsa tanımlayıcıya ekler, yoksa SKU ile yetinir", () => {
    const [withBarcode] = buildMissingCostRows(
      [impact({ barcode: "8690000000001" })],
      "tr",
    );
    const [withoutBarcode] = buildMissingCostRows([impact()], "tr");

    expect(withBarcode?.identifier).toBe("SKU-1 · 8690000000001");
    expect(withoutBarcode?.identifier).toBe("SKU-1");
  });

  it("seviyeyi rozet tonuna çevirir", () => {
    expect(toneOf("critical")).toBe("danger");
    expect(toneOf("high")).toBe("warning");
    expect(toneOf("normal")).toBe("neutral");
  });

  it("CostEditor sözleşmesini boş ve eksik olarak kurar", () => {
    const [row] = buildMissingCostRows([impact()], "tr");

    expect(row?.missing).toBe(true);
    // Maliyet eksik olduğu için form boş açılır.
    expect(row?.unitCostValue).toBe("");
    expect(row?.commissionValue).toBe("");
  });

  it("sıralamayı bozmaz — kuyruğun sırası servisin kararıdır", () => {
    const rows = buildMissingCostRows(
      [impact({ productId: "a" }), impact({ productId: "b" })],
      "tr",
    );

    expect(rows.map((row) => row.productId)).toEqual(["a", "b"]);
  });
});
