import {
  ZERO_MONEY,
  basisPoints,
  type BasisPoints,
  type CostDefault,
  type CostTable,
  type IsoDate,
  type Money,
  type ProductCost,
  type ResolvedCost,
} from "../domain";

/**
 * MALİYET ÇÖZÜMLEYİCİ.
 *
 * İki iş yapar:
 *
 * 1. **Tarihsel çözümleme.** Bir siparişin kârı, o siparişin tarihinde
 *    geçerli olan maliyetle hesaplanır. Bugün maliyet güncellenirse dünkü
 *    siparişlerin kârı değişmez.
 *
 * 2. **Geri çekilme zinciri.** Her alan için ayrı ayrı:
 *    `ürün → kategori → mağaza`. Komisyon ve kargo her zaman bir değere
 *    ulaşır; **alış maliyeti ulaşamayabilir** ve o zaman kâr hesaplanamaz.
 *
 * Performans: analiz başına bir kez kurulur. Ürün başına sıralı dizi +
 * ikili arama, üstüne `ürün|tarih` bellekleme. 10 binden fazla sipariş
 * satırı için gereksiz her arama görünür maliyet demek.
 */

/** Mağaza varsayılanı bile yoksa kullanılan son çare. */
const FALLBACK_COMMISSION = basisPoints(0);

export interface CostResolver {
  /** Bir ürünün belirtilen tarihteki maliyet modeli. */
  resolve(productId: string, date: IsoDate): ResolvedCost;
  /** Ürünün maliyeti bu tarihte biliniyor mu. */
  hasCost(productId: string, date: IsoDate): boolean;
  /** Ürünün en güncel kaydı — düzenleme ekranı için. */
  latestFor(productId: string): ProductCost | undefined;
}

/** Kayıtları `effectiveFrom` azalan sırada tutar: ilk eşleşen doğru kayıttır. */
function byEffectiveFromDesc<T extends { effectiveFrom: IsoDate }>(a: T, b: T): number {
  return b.effectiveFrom.localeCompare(a.effectiveFrom);
}

function findEffective<T extends { effectiveFrom: IsoDate }>(
  sorted: readonly T[],
  date: IsoDate,
): T | undefined {
  // Azalan sırada ikili arama: `effectiveFrom <= date` olan ilk kayıt.
  let low = 0;
  let high = sorted.length - 1;
  let found: T | undefined;

  while (low <= high) {
    const mid = (low + high) >> 1;
    const entry = sorted[mid]!;
    if (entry.effectiveFrom <= date) {
      found = entry;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return found;
}

export function createCostResolver(
  table: CostTable,
  /** Ürün → kategori eşlemesi; kategori varsayılanlarına inebilmek için. */
  categoryOf: ReadonlyMap<string, string>,
): CostResolver {
  const byProduct = new Map<string, ProductCost[]>();
  for (const cost of table.products) {
    const list = byProduct.get(cost.productId);
    if (list) list.push(cost);
    else byProduct.set(cost.productId, [cost]);
  }
  for (const list of byProduct.values()) list.sort(byEffectiveFromDesc);

  const byCategory = new Map<string, CostDefault[]>();
  const storeDefaults: CostDefault[] = [];
  for (const entry of table.defaults) {
    if (entry.scope.kind === "store") {
      storeDefaults.push(entry);
      continue;
    }
    const list = byCategory.get(entry.scope.category);
    if (list) list.push(entry);
    else byCategory.set(entry.scope.category, [entry]);
  }
  for (const list of byCategory.values()) list.sort(byEffectiveFromDesc);
  storeDefaults.sort(byEffectiveFromDesc);

  const memo = new Map<string, ResolvedCost>();

  const resolve = (productId: string, date: IsoDate): ResolvedCost => {
    const key = `${productId}|${date}`;
    const cached = memo.get(key);
    if (cached) return cached;

    const product = findEffective(byProduct.get(productId) ?? [], date);
    const category = categoryOf.get(productId);
    const categoryDefault = category
      ? findEffective(byCategory.get(category) ?? [], date)
      : undefined;
    const storeDefault = findEffective(storeDefaults, date);

    /** Her alan bağımsız iner: ürün komisyonu yoksa kargosu da düşmez. */
    const pick = <T>(
      fromProduct: T | undefined,
      fromCategory: T | undefined,
      fromStore: T | undefined,
      fallback: T,
    ): T => fromProduct ?? fromCategory ?? fromStore ?? fallback;

    const resolved: ResolvedCost = {
      unitCost: product?.unitCost ?? null,
      commissionRate: pick<BasisPoints>(
        product?.commissionRate,
        categoryDefault?.commissionRate,
        storeDefault?.commissionRate,
        FALLBACK_COMMISSION,
      ),
      shippingCost: pick<Money>(
        product?.shippingCost,
        categoryDefault?.shippingCost,
        storeDefault?.shippingCost,
        ZERO_MONEY,
      ),
      packagingPerUnit: pick<Money>(
        product?.packagingPerUnit,
        categoryDefault?.packagingPerUnit,
        storeDefault?.packagingPerUnit,
        ZERO_MONEY,
      ),
    };

    memo.set(key, resolved);
    return resolved;
  };

  return {
    resolve,
    hasCost: (productId, date) => resolve(productId, date).unitCost !== null,
    latestFor: (productId) => byProduct.get(productId)?.[0],
  };
}
