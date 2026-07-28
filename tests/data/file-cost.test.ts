import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { basisPoints, lira, type CostDefault, type ProductCost } from "@/core/domain";
import type { CostPort } from "@/core/ports";

/**
 * DOSYA TABANLI MALİYET ADAPTER'I.
 *
 * Asıl sınanan davranış **toplu yazma**: içe aktarma yüzlerce kaydı tek
 * çağrıyla gönderiyor ve o çağrının mevcut kayıtları silmemesi gerekiyor.
 * Buradaki bir hata sessiz veri kaybı olurdu — kullanıcı maliyetlerinin
 * kaybolduğunu ancak kâr rakamı bozulunca fark ederdi.
 *
 * Adapter dosya yolunu `process.cwd()` üzerinden modül yüklenirken
 * hesapladığı için geçici dizine **import'tan önce** geçiliyor; testler
 * projenin gerçek `.data/costs.json` dosyasına dokunmaz.
 */

let adapter: CostPort;
let dir: string;
let originalCwd: string;

beforeAll(async () => {
  originalCwd = process.cwd();
  dir = await mkdtemp(join(tmpdir(), "cost-adapter-"));
  process.chdir(dir);

  ({ fileCostAdapter: adapter } =
    await import("@/data/adapters/local/file-cost.adapter"));
});

afterAll(async () => {
  process.chdir(originalCwd);
  await rm(dir, { recursive: true, force: true });
});

function cost(productId: string, effectiveFrom: string, major: number): ProductCost {
  return { productId, effectiveFrom, unitCost: lira(major), source: "import" };
}

describe("Dosya maliyet adapter'ı", () => {
  it("dosya yokken boş tablo döner", async () => {
    const table = await adapter.load();
    expect(table.products).toEqual([]);
  });

  it("tek kaydı yazar ve geri okur", async () => {
    await adapter.saveProductCost(cost("elbise", "2026-07-01", 500));
    const table = await adapter.load();
    expect(table.products).toHaveLength(1);
    expect(table.products[0]!.unitCost.minor).toBe(50_000);
  });

  it("toplu yazma mevcut kayıtları silmez", async () => {
    await adapter.saveProductCosts([
      cost("ceket", "2026-07-01", 750),
      cost("sneaker", "2026-07-01", 300),
    ]);

    const ids = (await adapter.load()).products.map((entry) => entry.productId).sort();
    expect(ids).toEqual(["ceket", "elbise", "sneaker"]);
  });

  it("aynı anahtarı toplu yazmada günceller, çoğaltmaz", async () => {
    await adapter.saveProductCosts([cost("elbise", "2026-07-01", 560)]);

    const table = await adapter.load();
    const elbise = table.products.filter((entry) => entry.productId === "elbise");
    expect(elbise).toHaveLength(1);
    expect(elbise[0]!.unitCost.minor).toBe(56_000);
  });

  it("aynı ürünün farklı tarihli kaydı ayrı satır olarak durur", async () => {
    await adapter.saveProductCosts([cost("elbise", "2026-08-01", 610)]);

    const elbise = (await adapter.load()).products.filter(
      (entry) => entry.productId === "elbise",
    );
    expect(elbise).toHaveLength(2);
  });

  it("boş listede dosyaya dokunmaz", async () => {
    const before = (await adapter.load()).products.length;
    await adapter.saveProductCosts([]);
    expect((await adapter.load()).products).toHaveLength(before);
  });

  it("kaydı siler", async () => {
    await adapter.removeProductCost("sneaker", "2026-07-01");
    const ids = (await adapter.load()).products.map((entry) => entry.productId);
    expect(ids).not.toContain("sneaker");
  });
});

/**
 * VARSAYILAN MALİYET AYARLARI — yazma tarafı.
 *
 * Korunan davranış: varsayılan yazmak **ürüne özel kayıtlara dokunmaz**.
 * Buradaki bir hata, kullanıcının tek tek girdiği alış maliyetlerini bir
 * komisyon ayarı yüzünden kaybetmesi olurdu.
 */
describe("Varsayılan kayıtları", () => {
  const storeDefault: CostDefault = {
    scope: { kind: "store" },
    effectiveFrom: "2026-07-01",
    commissionRate: basisPoints(15),
    shippingCost: lira(34.9),
  };

  it("mağaza varsayılanını yazar ve geri okur", async () => {
    await adapter.saveDefault(storeDefault);

    const { defaults } = await adapter.load();
    expect(defaults).toHaveLength(1);
    expect(defaults[0]!.scope).toEqual({ kind: "store" });
    expect(defaults[0]!.commissionRate).toBe(basisPoints(15));
  });

  it("aynı kapsam ve tarihi günceller, çoğaltmaz", async () => {
    await adapter.saveDefault({ ...storeDefault, commissionRate: basisPoints(18) });

    const { defaults } = await adapter.load();
    expect(defaults).toHaveLength(1);
    expect(defaults[0]!.commissionRate).toBe(basisPoints(18));
  });

  it("aynı kapsamın farklı tarihli kaydı ayrı satır olarak durur", async () => {
    // Tarihsel ayar: eski siparişler eski varsayılanla hesaplanmaya devam eder.
    await adapter.saveDefault({
      ...storeDefault,
      effectiveFrom: "2026-08-01",
      commissionRate: basisPoints(20),
    });

    const { defaults } = await adapter.load();
    expect(defaults).toHaveLength(2);
  });

  it("kategori varsayılanı mağazanınkinden ayrı yaşar", async () => {
    await adapter.saveDefault({
      scope: { kind: "category", category: "Elektronik" },
      effectiveFrom: "2026-07-01",
      commissionRate: basisPoints(11),
    });

    const { defaults } = await adapter.load();
    const store = defaults.filter((entry) => entry.scope.kind === "store");
    const category = defaults.filter((entry) => entry.scope.kind === "category");

    expect(store).toHaveLength(2);
    expect(category).toHaveLength(1);
  });

  it("varsayılan yazmak ürüne özel maliyetlere dokunmaz", async () => {
    const before = (await adapter.load()).products;

    await adapter.saveDefault({
      scope: { kind: "store" },
      effectiveFrom: "2026-09-01",
      commissionRate: basisPoints(12),
    });

    expect((await adapter.load()).products).toEqual(before);
  });

  it("boş alanlar 'tanımsız' olarak kalır, sıfıra dönmez", async () => {
    // Kargosu yazılmayan bir varsayılan, kargoyu sıfırlamaz — zincir aşağı akar.
    await adapter.saveDefault({
      scope: { kind: "category", category: "Giyim" },
      effectiveFrom: "2026-07-01",
      commissionRate: basisPoints(9),
    });

    const entry = (await adapter.load()).defaults.find(
      (item) => item.scope.kind === "category" && item.scope.category === "Giyim",
    );
    expect(entry?.shippingCost).toBeUndefined();
    expect(entry?.packagingPerUnit).toBeUndefined();
  });
});

describe("Tohumlanan ve kullanıcı varsayılanlarının birleşmesi", () => {
  it("aynı kapsam ve tarihte kullanıcının kaydı kazanır", async () => {
    const { mergeCostTables } = await import("@/data/adapters/local/file-cost.adapter");

    const seed = {
      products: [],
      defaults: [
        {
          scope: { kind: "store" } as const,
          effectiveFrom: "2026-01-01",
          commissionRate: basisPoints(15),
        },
      ],
    };
    const saved = {
      products: [],
      defaults: [
        {
          scope: { kind: "store" } as const,
          effectiveFrom: "2026-01-01",
          commissionRate: basisPoints(22),
        },
      ],
    };

    const merged = mergeCostTables(seed, saved);
    expect(merged.defaults).toHaveLength(1);
    expect(merged.defaults[0]!.commissionRate).toBe(basisPoints(22));
  });

  it("farklı tarihli tohum kaydı korunur — geçmiş kâr değişmez", async () => {
    const { mergeCostTables } = await import("@/data/adapters/local/file-cost.adapter");

    const merged = mergeCostTables(
      {
        products: [],
        defaults: [
          {
            scope: { kind: "store" },
            effectiveFrom: "2026-01-01",
            commissionRate: basisPoints(15),
          },
        ],
      },
      {
        products: [],
        defaults: [
          {
            scope: { kind: "store" },
            effectiveFrom: "2026-07-01",
            commissionRate: basisPoints(22),
          },
        ],
      },
    );

    expect(merged.defaults).toHaveLength(2);
  });
});
