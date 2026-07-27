import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { lira, type ProductCost } from "@/core/domain";
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
