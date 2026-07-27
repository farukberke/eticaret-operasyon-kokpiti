import { describe, expect, it } from "vitest";

import type { ProductCost } from "@/core/domain";
import type { ImportPreview, PreviewRow } from "@/core/services/cost-import";
import { toPreviewView } from "@/features/costs/import-view";
import { formatMoney } from "@/lib/format";

/**
 * İÇE AKTARMA ÖNİZLEMESİ — para gösterimi.
 *
 * Buradaki tek soru şu: kullanıcı onayladığı rakamın yazılacak rakam olduğunu
 * ekrandan doğrulayabiliyor mu? `formatMoney` varsayılanı 100 ₺ üstünde kuruşu
 * atar; listelerde doğru, yazma öncesi son kontrol ekranında yanıltıcı.
 */

const TODAY = "2026-07-28";

function money(minor: number) {
  return { minor, currency: "TRY" as const };
}

function previewRow(overrides: Partial<PreviewRow> = {}): PreviewRow {
  return {
    line: 2,
    productId: "p1",
    productName: "Kablosuz Kulaklık",
    values: {
      unitCost: money(123456),
      commissionRate: undefined,
      shippingCost: undefined,
      packagingPerUnit: undefined,
      effectiveFrom: TODAY,
      effectiveFromAssumed: false,
    },
    current: undefined,
    ...overrides,
  };
}

function preview(rows: readonly PreviewRow[]): ImportPreview {
  return {
    toWrite: rows,
    unchanged: [],
    unmatched: [],
    invalid: [],
    repeatedProducts: [],
    totalRows: rows.length,
    unknownColumns: [],
  };
}

function view(rows: readonly PreviewRow[], locale: string) {
  return toPreviewView(preview(rows), {
    locale,
    today: TODAY,
    sample: { headers: [], rows: [] },
  });
}

function changeOf(rows: readonly PreviewRow[], locale: string, field: string) {
  const change = view(rows, locale).toWrite[0]?.changes.find((c) => c.field === field);
  if (!change) throw new Error(`beklenen değişiklik yok: ${field}`);
  return change;
}

/** en locale'inde para simgesinden sonra bölünemez boşluk gelir. */
const normalize = (text: string) => text.replace(/ /g, " ");

describe("içe aktarma önizlemesi para gösterimi", () => {
  it("100 ₺ üstündeki alış maliyetini kuruşuyla yazar (tr)", () => {
    expect(changeOf([previewRow()], "tr", "unitCost").after).toBe("₺1.234,56");
  });

  it("100 ₺ üstündeki alış maliyetini kuruşuyla yazar (en)", () => {
    const after = changeOf([previewRow()], "en", "unitCost").after;
    expect(normalize(after)).toBe("TRY 1,234.56");
  });

  it("kuruşu sıfır olsa bile iki hane gösterir — sütun hizası bozulmaz", () => {
    const rows = [
      previewRow({ values: { ...previewRow().values, unitCost: money(500000) } }),
    ];
    expect(changeOf(rows, "tr", "unitCost").after).toBe("₺5.000,00");
  });

  it("mevcut kayıttaki eski değer de kuruşuyla gösterilir", () => {
    const current: ProductCost = {
      productId: "p1",
      effectiveFrom: TODAY,
      unitCost: money(119999),
      source: "manual",
    };
    const change = changeOf([previewRow({ current })], "tr", "unitCost");

    expect(change.before).toBe("₺1.199,99");
    expect(change.after).toBe("₺1.234,56");
    expect(change.action).toBe("set");
  });

  it("opsiyonel alanlar (kargo, paketleme) da kuruş gösterir", () => {
    const rows = [
      previewRow({
        values: {
          ...previewRow().values,
          shippingCost: money(24999),
          packagingPerUnit: money(15075),
        },
      }),
    ];

    expect(changeOf(rows, "tr", "shipping").after).toBe("₺249,99");
    expect(changeOf(rows, "tr", "packaging").after).toBe("₺150,75");
  });

  it("100 ₺ altındaki değerlerin gösterimi zaten kuruşluydu — değişmedi", () => {
    const rows = [
      previewRow({ values: { ...previewRow().values, unitCost: money(8990) } }),
    ];
    expect(changeOf(rows, "tr", "unitCost").after).toBe("₺89,90");
  });

  it("aynı kuruş değeri iki kez geçse değişiklik sayılmaz", () => {
    const current: ProductCost = {
      productId: "p1",
      effectiveFrom: TODAY,
      unitCost: money(123456),
      source: "import",
    };
    // unitCost karşılaştırması metne değil `minor`'a bakar; biçim değişikliği
    // "değişmedi" kararını etkilemez.
    expect(view([previewRow({ current })], "tr").toWrite[0]?.changes).toHaveLength(0);
  });
});

describe("formatMoney varsayılanı", () => {
  it("diğer ekranlar için değişmedi: 100 ₺ üstünde kuruş atılır", () => {
    expect(formatMoney(money(123456), "tr")).toBe("₺1.235");
    expect(formatMoney(money(8990), "tr")).toBe("₺89,90");
  });

  it("kuruş yalnızca açıkça istenince gelir", () => {
    expect(formatMoney(money(123456), "tr", { decimals: 2 })).toBe("₺1.234,56");
  });
});
