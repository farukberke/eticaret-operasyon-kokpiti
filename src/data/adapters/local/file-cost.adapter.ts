import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  EMPTY_COST_TABLE,
  costKeyOf,
  defaultKeyOf,
  type CostDefault,
  type CostTable,
  type IsoDate,
  type ProductCost,
} from "@/core/domain";
import type { CostPort } from "@/core/ports";

/**
 * `CostPort`'un dosya tabanlı uygulaması.
 *
 * **Neden localStorage değil:** görev durumundan farklı olarak maliyet,
 * kâr hesabının girdisi ve o hesap sunucuda yapılıyor. Tarayıcıda duran bir
 * veriyi sunucu okuyamaz; okuyamazsa da kâr hesaplanamaz. Bu yüzden ilk
 * "local persistence" uygulaması sunucu tarafında bir JSON dosyası.
 *
 * Yerini `PostgresCostAdapter` alacağında değişecek tek dosya
 * `src/data/cost-container.ts` olacak.
 *
 * Eşzamanlılık notu: tek kullanıcılı geliştirme ortamı için oku-değiştir-yaz
 * yeterli. Çok kullanıcılı gerçek kullanımda bu adapter zaten veritabanına
 * bırakacak — orada satır bazlı yazma ve işlem güvencesi var.
 */

const DATA_DIR = join(process.cwd(), ".data");
const FILE_PATH = join(DATA_DIR, "costs.json");

const SCHEMA_VERSION = 1;

interface StoredShape {
  readonly version: number;
  readonly products: readonly ProductCost[];
  readonly defaults: readonly CostDefault[];
}

async function read(): Promise<StoredShape> {
  const empty: StoredShape = { version: SCHEMA_VERSION, products: [], defaults: [] };
  try {
    const raw = await readFile(FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredShape>;
    if (parsed.version !== SCHEMA_VERSION) return empty;
    return {
      version: SCHEMA_VERSION,
      products: parsed.products ?? [],
      defaults: parsed.defaults ?? [],
    };
  } catch {
    // Dosya yok ya da bozuk. Kullanıcı maliyeti henüz girmemiş olabilir;
    // panelin çökmesi için sebep değil.
    return empty;
  }
}

async function write(shape: StoredShape): Promise<void> {
  await mkdir(dirname(FILE_PATH), { recursive: true });
  await writeFile(FILE_PATH, JSON.stringify(shape, null, 2), "utf8");
}

export const fileCostAdapter: CostPort = {
  async load(): Promise<CostTable> {
    const { products, defaults } = await read();
    return { products, defaults };
  },

  /**
   * `productId + effectiveFrom` anahtarıyla **upsert**.
   *
   * Aynı ürün ve aynı geçerlilik tarihi için iki kayıt oluşamaz; olsaydı
   * hangisinin geçerli olduğu yazma sırasına bağlı kalır ve kâr hesabı
   * deterministik olmaktan çıkardı.
   */
  async saveProductCost(cost: ProductCost): Promise<void> {
    const shape = await read();
    const key = costKeyOf(cost);
    const products = shape.products.filter((entry) => costKeyOf(entry) !== key);
    await write({ ...shape, products: [...products, cost] });
  },

  async removeProductCost(productId: string, effectiveFrom: IsoDate): Promise<void> {
    const shape = await read();
    const key = costKeyOf({ productId, effectiveFrom });
    await write({
      ...shape,
      products: shape.products.filter((entry) => costKeyOf(entry) !== key),
    });
  },

  async saveDefault(entry: CostDefault): Promise<void> {
    const shape = await read();
    const key = defaultKeyOf(entry);
    const defaults = shape.defaults.filter((item) => defaultKeyOf(item) !== key);
    await write({ ...shape, defaults: [...defaults, entry] });
  },
};

/**
 * Tohumlanan maliyetlerin üzerine kullanıcının kayıtlarını bindirir.
 *
 * Aynı anahtara (`ürün@tarih`) sahip kayıtta kullanıcınınki kazanır —
 * demo verisi bir başlangıç noktasıdır, kullanıcının girdiği gerçektir.
 */
export function mergeCostTables(base: CostTable, override: CostTable): CostTable {
  const productKeys = new Set(override.products.map(costKeyOf));
  const defaultKeys = new Set(override.defaults.map(defaultKeyOf));

  return {
    products: [
      ...base.products.filter((entry) => !productKeys.has(costKeyOf(entry))),
      ...override.products,
    ],
    defaults: [
      ...base.defaults.filter((entry) => !defaultKeys.has(defaultKeyOf(entry))),
      ...override.defaults,
    ],
  };
}

export const EMPTY_COSTS = EMPTY_COST_TABLE;
