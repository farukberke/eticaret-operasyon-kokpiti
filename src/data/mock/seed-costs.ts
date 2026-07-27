import {
  basisPoints,
  lira,
  type CostDefault,
  type CostTable,
  type ProductCost,
} from "@/core/domain";

import { CATALOG, CATALOG_LISTED_AT, PRODUCTS_WITHOUT_COST } from "./catalog";

/**
 * DEMO MALİYET VERİSİ.
 *
 * Eski katalogda `Product.unitCost` olarak duran maliyetler buraya taşındı.
 * Geçişin amacı sadece alan taşımak değil: artık bu veri, kullanıcının
 * maliyet ekranından gireceğiyle **birebir aynı biçimde** duruyor. Yani
 * demo, gerçek kullanımın provası.
 *
 * Üç şeyi bilinçli olarak gösteriyor:
 *
 * 1. **Tarihsel maliyet.** Bir ürünün maliyeti dönem ortasında arttı;
 *    o tarihten önceki siparişlerin kârı eski maliyetle hesaplanıyor.
 * 2. **Eksik maliyet.** Üç üründe kayıt yok — "Maliyet eksik" davranışı
 *    ekranlarda gerçekten görünüyor.
 * 3. **Geri çekilme zinciri.** Komisyon mağaza varsayılanından, elektronik
 *    kategorisi kendi oranıyla, bir ürün de kendi override'ıyla geliyor.
 */

/** Pazaryeri komisyonu — mağaza geneli varsayılan. */
const STORE_COMMISSION_PERCENT = 15;

/** Satıcının her siparişte üstlendiği kargo bedeli (paket başına). */
const STORE_SHIPPING = lira(34.9);

/** Paketleme/operasyon — adet başına. */
const STORE_PACKAGING = lira(2.5);

/**
 * Elektronik kategorisinde komisyon daha düşük — gerçek pazaryerlerinde
 * kategori bazlı oran farkı standarttır ve zincirin çalıştığını gösterir.
 */
const ELECTRONICS_COMMISSION_PERCENT = 11;

/** Tarihsel maliyet örneği: bu ürünün alışı dönem ortasında zamlandı. */
const COST_INCREASE = {
  productId: "kirmizi-elbise",
  effectiveFrom: "2026-06-15",
  /** Eski maliyetin üzerine yaklaşık %12 zam. */
  multiplier: 1.12,
} as const;

export function seedCostTable(): CostTable {
  const missing = new Set(PRODUCTS_WITHOUT_COST);
  const products: ProductCost[] = [];

  for (const entry of CATALOG) {
    if (missing.has(entry.product.id)) continue;

    products.push({
      productId: entry.product.id,
      effectiveFrom: CATALOG_LISTED_AT,
      unitCost: entry.unitCost,
      source: "seed",
    });

    if (entry.product.id === COST_INCREASE.productId) {
      products.push({
        productId: entry.product.id,
        effectiveFrom: COST_INCREASE.effectiveFrom,
        unitCost: {
          minor: Math.round(entry.unitCost.minor * COST_INCREASE.multiplier),
          currency: entry.unitCost.currency,
        },
        source: "seed",
      });
    }
  }

  const defaults: CostDefault[] = [
    {
      scope: { kind: "store" },
      effectiveFrom: CATALOG_LISTED_AT,
      commissionRate: basisPoints(STORE_COMMISSION_PERCENT),
      shippingCost: STORE_SHIPPING,
      packagingPerUnit: STORE_PACKAGING,
    },
    {
      scope: { kind: "category", category: "Elektronik" },
      effectiveFrom: CATALOG_LISTED_AT,
      commissionRate: basisPoints(ELECTRONICS_COMMISSION_PERCENT),
    },
  ];

  return { products, defaults };
}
