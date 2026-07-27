import { describe, expect, it } from "vitest";

import {
  applyBasisPoints,
  basisPoints,
  lira,
  toMajor,
  toRatio,
  type CostTable,
} from "@/core/domain";
import { createCostResolver } from "@/core/services/cost-resolver";

/**
 * MALİYET ÇÖZÜMLEME.
 *
 * İki şeyi korur: geçmiş kârın geriye dönük değişmemesi ve maliyeti
 * bilinmeyen ürünün sahte kâr üretmemesi.
 */

const CATEGORIES = new Map([
  ["elbise", "Giyim"],
  ["kulaklik", "Elektronik"],
  ["yeni-urun", "Giyim"],
]);

const table: CostTable = {
  products: [
    // Elbisenin maliyeti 15 Haziran'da zamlandı.
    {
      productId: "elbise",
      effectiveFrom: "2026-01-01",
      unitCost: lira(500),
      source: "seed",
    },
    {
      productId: "elbise",
      effectiveFrom: "2026-06-15",
      unitCost: lira(560),
      source: "manual",
    },
    // Kulaklığın kendi komisyon override'ı var.
    {
      productId: "kulaklik",
      effectiveFrom: "2026-01-01",
      unitCost: lira(800),
      commissionRate: basisPoints(8),
      source: "manual",
    },
    // "yeni-urun" bilinçli olarak yok → maliyet eksik.
  ],
  defaults: [
    {
      scope: { kind: "store" },
      effectiveFrom: "2026-01-01",
      commissionRate: basisPoints(15),
      shippingCost: lira(34.9),
      packagingPerUnit: lira(2.5),
    },
    {
      scope: { kind: "category", category: "Elektronik" },
      effectiveFrom: "2026-01-01",
      commissionRate: basisPoints(11),
    },
  ],
};

const resolver = createCostResolver(table, CATEGORIES);

describe("Tarihsel maliyet", () => {
  it("sipariş tarihindeki geçerli maliyeti seçer", () => {
    expect(toMajor(resolver.resolve("elbise", "2026-06-14").unitCost!)).toBe(500);
    expect(toMajor(resolver.resolve("elbise", "2026-06-15").unitCost!)).toBe(560);
    expect(toMajor(resolver.resolve("elbise", "2026-12-31").unitCost!)).toBe(560);
  });

  it("geçerlilik tarihi kaydın kendi gününü de kapsar", () => {
    // "15 Haziran'dan itibaren" 15 Haziran'ı içerir.
    expect(toMajor(resolver.resolve("elbise", "2026-06-15").unitCost!)).toBe(560);
  });

  it("ilk kayıttan önceki tarihlerde maliyet bilinmez", () => {
    // Ürün henüz maliyetlendirilmemişken satılmışsa uydurma yapmayız.
    expect(resolver.resolve("elbise", "2025-12-31").unitCost).toBeNull();
  });

  it("yeni maliyet eklemek geçmiş dönemi etkilemez", () => {
    const withNewCost = createCostResolver(
      {
        ...table,
        products: [
          ...table.products,
          {
            productId: "elbise",
            effectiveFrom: "2026-07-01",
            unitCost: lira(700),
            source: "manual",
          },
        ],
      },
      CATEGORIES,
    );

    // Haziran siparişleri hâlâ eski maliyetle hesaplanır.
    expect(toMajor(withNewCost.resolve("elbise", "2026-06-20").unitCost!)).toBe(560);
    expect(toMajor(withNewCost.resolve("elbise", "2026-07-05").unitCost!)).toBe(700);
  });
});

describe("Geri çekilme zinciri", () => {
  it("ürün override'ı kategoriyi ve mağazayı ezer", () => {
    expect(toRatio(resolver.resolve("kulaklik", "2026-07-01").commissionRate)).toBe(
      0.08,
    );
  });

  it("ürün override'ı yoksa kategoriye düşer", () => {
    const noOverride = createCostResolver(
      {
        ...table,
        products: table.products.filter((p) => p.productId !== "kulaklik"),
      },
      CATEGORIES,
    );
    // Elektronik kategorisi %11.
    expect(toRatio(noOverride.resolve("kulaklik", "2026-07-01").commissionRate)).toBe(
      0.11,
    );
  });

  it("kategori de yoksa mağaza varsayılanına düşer", () => {
    expect(toRatio(resolver.resolve("elbise", "2026-07-01").commissionRate)).toBe(0.15);
  });

  it("her alan bağımsız iner", () => {
    // Kulaklığın komisyonu kendine ait ama kargosu mağaza varsayılanından.
    const cost = resolver.resolve("kulaklik", "2026-07-01");
    expect(toRatio(cost.commissionRate)).toBe(0.08);
    expect(toMajor(cost.shippingCost)).toBe(34.9);
    expect(toMajor(cost.packagingPerUnit)).toBe(2.5);
  });
});

describe("Eksik maliyet", () => {
  it("kaydı olmayan ürünün maliyeti null döner", () => {
    expect(resolver.resolve("yeni-urun", "2026-07-01").unitCost).toBeNull();
    expect(resolver.hasCost("yeni-urun", "2026-07-01")).toBe(false);
  });

  it("maliyeti eksik olsa da komisyon ve kargo çözülür", () => {
    // Bunların varsayılanı var; eksik olan yalnızca alış maliyeti.
    const cost = resolver.resolve("yeni-urun", "2026-07-01");
    expect(toRatio(cost.commissionRate)).toBe(0.15);
    expect(toMajor(cost.shippingCost)).toBe(34.9);
  });
});

describe("Komisyon baz puanı", () => {
  it("yüzdeyi tamsayıya çevirir", () => {
    expect(basisPoints(15)).toBe(1500);
    expect(basisPoints(8.5)).toBe(850);
    expect(basisPoints(0)).toBe(0);
  });

  it("geçersiz oranı reddeder", () => {
    expect(() => basisPoints(-1)).toThrow();
    expect(() => basisPoints(101)).toThrow();
    expect(() => basisPoints(Number.NaN)).toThrow();
  });

  it("kayan nokta hatası üretmeden uygular", () => {
    // 0,15 ile çarpma klasik float tuzağıdır; baz puan tamsayı matematiği kullanır.
    expect(applyBasisPoints(lira(1234.56), basisPoints(15)).minor).toBe(18518);
    expect(applyBasisPoints(lira(0.1), basisPoints(15)).minor).toBe(2);
  });

  it("büyük tutarlarda güvenli tamsayı sınırını aşmaz", () => {
    // 10 milyon lira × %100 → 10^11, güvenli sınırın (9×10^15) çok altında.
    const huge = lira(10_000_000);
    expect(applyBasisPoints(huge, basisPoints(100)).minor).toBe(huge.minor);
  });
});

describe("En güncel kayıt", () => {
  it("düzenleme ekranı için son kaydı verir", () => {
    expect(toMajor(resolver.latestFor("elbise")!.unitCost)).toBe(560);
    expect(resolver.latestFor("yeni-urun")).toBeUndefined();
  });
});
