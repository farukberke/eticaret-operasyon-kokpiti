import { describe, expect, it } from "vitest";

import {
  basisPoints,
  lira,
  toMajor,
  toRatio,
  type CostDefault,
  type CostTable,
  type IsoDate,
  type ProductCost,
  type StoreDataset,
} from "@/core/domain";
import {
  createCostResolver,
  findEffectiveDefault,
} from "@/core/services/cost-resolver";
import { buildProductPerformance } from "@/core/services/inventory-analyzer";
import { getMissingCostImpacts } from "@/core/services/missing-cost";

import { makeLine, makeOrder, makeProduct } from "./fixtures";

/**
 * VARSAYILAN MALİYET AYARLARI.
 *
 * Bu dosyanın koruduğu tek söz şudur: **varsayılan, ürünün kendi kaydının
 * yerine geçmez.** Kullanıcı yüzlerce ürüne aynı komisyonu tek tek girmesin
 * diye açılan bir kolaylık, girdiği en değerli veriyi — ürüne özel maliyeti —
 * sessizce ezerse, kolaylık değil veri kaybı olur.
 *
 * İkinci söz: varsayılan **alış maliyeti taşımaz**. Bu yüzden varsayılan
 * değiştirmek eksik maliyet kuyruğunu ne kısaltır ne uzatır; aşağıda bu bir
 * değişmez olarak kilitleniyor.
 */

const TODAY: IsoDate = "2026-07-27";
const EPOCH: IsoDate = "2026-01-01";

const CATEGORIES = new Map([
  ["kendi-kaydi", "Elektronik"],
  ["kategoriden", "Elektronik"],
  ["magazadan", "Giyim"],
]);

/** Üç ürün, üç farklı zincir basamağı: ürün · kategori · mağaza. */
const PRODUCTS: readonly ProductCost[] = [
  {
    productId: "kendi-kaydi",
    effectiveFrom: EPOCH,
    unitCost: lira(100),
    commissionRate: basisPoints(5),
    shippingCost: lira(10),
    packagingPerUnit: lira(1),
    source: "manual",
  },
  {
    productId: "kategoriden",
    effectiveFrom: EPOCH,
    unitCost: lira(100),
    source: "manual",
  },
  {
    productId: "magazadan",
    effectiveFrom: EPOCH,
    unitCost: lira(100),
    source: "manual",
  },
];

const STORE_DEFAULT: CostDefault = {
  scope: { kind: "store" },
  effectiveFrom: EPOCH,
  commissionRate: basisPoints(15),
  shippingCost: lira(34.9),
  packagingPerUnit: lira(2.5),
};

const CATEGORY_DEFAULT: CostDefault = {
  scope: { kind: "category", category: "Elektronik" },
  effectiveFrom: EPOCH,
  commissionRate: basisPoints(11),
};

const table: CostTable = {
  products: PRODUCTS,
  defaults: [STORE_DEFAULT, CATEGORY_DEFAULT],
};

const resolve = (defaults: readonly CostDefault[]) =>
  createCostResolver({ products: PRODUCTS, defaults }, CATEGORIES);

describe("Varsayılan yalnızca boşluğu doldurur", () => {
  const resolver = resolve(table.defaults);

  it("ürünün kendi kaydı varsa varsayılan kullanılmaz", () => {
    const cost = resolver.resolve("kendi-kaydi", TODAY);

    // Üç alanın üçü de ürünün kendi kaydından; ne kategori ne mağaza konuşuyor.
    expect(toRatio(cost.commissionRate)).toBe(0.05);
    expect(toMajor(cost.shippingCost)).toBe(10);
    expect(toMajor(cost.packagingPerUnit)).toBe(1);
  });

  it("ürün kaydı yoksa kategori varsayılanı kullanılır", () => {
    expect(toRatio(resolver.resolve("kategoriden", TODAY).commissionRate)).toBe(0.11);
  });

  it("kategori varsayılanı da yoksa mağaza varsayılanına iner", () => {
    expect(toRatio(resolver.resolve("magazadan", TODAY).commissionRate)).toBe(0.15);
  });

  it("kategori yalnızca tanımladığı alanı ezer, gerisi mağazadan gelir", () => {
    // Elektronik yalnızca komisyon tanımlıyor; kargo ve paketleme mağazadan.
    const cost = resolver.resolve("kategoriden", TODAY);
    expect(toRatio(cost.commissionRate)).toBe(0.11);
    expect(toMajor(cost.shippingCost)).toBe(34.9);
    expect(toMajor(cost.packagingPerUnit)).toBe(2.5);
  });

  it("hiçbir varsayılan yoksa komisyon %0, kargo ve paketleme sıfır olur", () => {
    const bare = resolve([]);
    const cost = bare.resolve("magazadan", TODAY);

    expect(toRatio(cost.commissionRate)).toBe(0);
    expect(toMajor(cost.shippingCost)).toBe(0);
    expect(toMajor(cost.packagingPerUnit)).toBe(0);
  });

  it("mağaza varsayılanı değişse bile ürünün kendi kaydı yerinde kalır", () => {
    const changed = resolve([
      ...table.defaults,
      { ...STORE_DEFAULT, effectiveFrom: TODAY, commissionRate: basisPoints(40) },
    ]);

    expect(toRatio(changed.resolve("kendi-kaydi", TODAY).commissionRate)).toBe(0.05);
    expect(toRatio(changed.resolve("magazadan", TODAY).commissionRate)).toBe(0.4);
  });
});

/**
 * BOŞ ALAN İLE AÇIKÇA YAZILMIŞ SIFIRIN AYRIMI.
 *
 * İkisi ekranda aynı sayıyı üretebilir ama domain'de farklı şeylerdir:
 *
 *   alan boş  → `commissionRate` kayda hiç yazılmaz (`undefined`) → zincir iner
 *   alan "0"  → `commissionRate: 0` yazılır → zincir **burada durur**
 *
 * Ayrımı taşıyan tek şey `pick`'in `??` operatörü. Biri bunu `||` yapsa
 * kod derlenir, tipler geçer ve testlerin çoğu yeşil kalır — ama açıkça
 * "komisyonsuz" işaretlenmiş bir kategori sessizce mağazanın %15'ini yemeye
 * başlar ve kullanıcı kârının neden düştüğünü hiçbir ekranda göremez.
 * Aşağıdaki testlerin tek işi o operatörü yerinde tutmak.
 */
describe("Boş alan ile açık sıfır aynı şey değil", () => {
  const withCategory = (commissionRate: number | undefined) =>
    createCostResolver(
      {
        products: PRODUCTS,
        defaults: [
          STORE_DEFAULT,
          {
            scope: { kind: "category", category: "Elektronik" },
            effectiveFrom: EPOCH,
            ...(commissionRate !== undefined ? { commissionRate } : {}),
          },
        ],
      },
      CATEGORIES,
    );

  it("kategori komisyonu tanımsızsa mağazanınkine iner", () => {
    expect(
      toRatio(withCategory(undefined).resolve("kategoriden", TODAY).commissionRate),
    ).toBe(0.15);
  });

  it("kategori komisyonu açıkça 0 ise zincir durur, mağazaya inmez", () => {
    // "Bu kategoride komisyon yok" bir bilgidir, boşluk değil.
    expect(
      toRatio(
        withCategory(basisPoints(0)).resolve("kategoriden", TODAY).commissionRate,
      ),
    ).toBe(0);
  });

  it("ürünün açık 0 komisyonu kategoriyi ve mağazayı ezer", () => {
    const resolver = createCostResolver(
      {
        products: [
          {
            productId: "kategoriden",
            effectiveFrom: EPOCH,
            unitCost: lira(100),
            commissionRate: basisPoints(0),
            source: "manual",
          },
        ],
        defaults: [STORE_DEFAULT, CATEGORY_DEFAULT],
      },
      CATEGORIES,
    );

    expect(toRatio(resolver.resolve("kategoriden", TODAY).commissionRate)).toBe(0);
  });

  it("açıkça sıfırlanmış kargo, mağazanın kargosunu geri getirmez", () => {
    // Para alanında da aynı tuzak: `{ minor: 0 }` bir değerdir, yokluk değil.
    const resolver = createCostResolver(
      {
        products: PRODUCTS,
        defaults: [
          STORE_DEFAULT,
          {
            scope: { kind: "category", category: "Elektronik" },
            effectiveFrom: EPOCH,
            shippingCost: lira(0),
          },
        ],
      },
      CATEGORIES,
    );

    expect(toMajor(resolver.resolve("kategoriden", TODAY).shippingCost)).toBe(0);
  });
});

describe("Varsayılan değişince yeniden hesaplama", () => {
  const later: IsoDate = "2026-06-01";
  const withNewDefault = resolve([
    ...table.defaults,
    { ...STORE_DEFAULT, effectiveFrom: later, commissionRate: basisPoints(20) },
  ]);

  it("yeni varsayılan yürürlük tarihinden itibaren geçerlidir", () => {
    expect(
      toRatio(withNewDefault.resolve("magazadan", "2026-05-31").commissionRate),
    ).toBe(0.15);
    expect(toRatio(withNewDefault.resolve("magazadan", later).commissionRate)).toBe(
      0.2,
    );
  });

  it("geçmiş siparişlerin komisyonu geriye dönük değişmez", () => {
    // Dünkü siparişin kârı bugün yapılan bir ayarla oynamamalı.
    expect(
      toRatio(withNewDefault.resolve("magazadan", "2026-02-10").commissionRate),
    ).toBe(0.15);
  });

  /** Aynı `kapsam@tarih` iki kez yazılamaz; ayarı değiştirmek kaydı değiştirmektir. */
  const doubledCommission: readonly CostDefault[] = [
    { ...STORE_DEFAULT, commissionRate: basisPoints(30) },
    CATEGORY_DEFAULT,
  ];

  it("kâr rakamı yeni varsayılanla yeniden hesaplanır", () => {
    const before = profitOf(datasetWith(table.defaults), "magazadan");
    const after = profitOf(datasetWith(doubledCommission), "magazadan");

    // %15 → %30: ₺200'lük satışta komisyon ₺30 → ₺60, kâr ₺30 azalır.
    expect(toMajor(before!) - toMajor(after!)).toBe(30);
  });

  it("kendi komisyonu olan ürünün kârı varsayılan değişince oynamaz", () => {
    const before = profitOf(datasetWith(table.defaults), "kendi-kaydi");
    const after = profitOf(datasetWith(doubledCommission), "kendi-kaydi");

    expect(after).toEqual(before);
  });
});

describe("Eksik maliyet kuyruğu", () => {
  /**
   * Kuyruğun **üyeliği** varsayılanlardan etkilenmez ve etkilenmemeli.
   *
   * `CostDefault` bilinçli olarak `unitCost` taşımaz: bir ürünün alış
   * fiyatının kategori varsayılanı olamaz. Dolayısıyla varsayılan girmek
   * "maliyet eksik" durumunu kapatamaz — kapatabilseydi panel uydurma kârı
   * gerçek gibi gösterirdi. Kuyruk her kaydetmede yeniden hesaplanır, ama
   * yalnızca ürün bazlı kayıtla erir.
   */
  const missingProducts: readonly ProductCost[] = [
    {
      productId: "kendi-kaydi",
      effectiveFrom: EPOCH,
      unitCost: lira(100),
      source: "manual",
    },
    // "magazadan" bilinçli olarak yok.
  ];

  const queueFor = (costs: CostTable) =>
    getMissingCostImpacts({
      dataset: { ...datasetWith([]), costs },
      range: { from: "2026-07-01", to: TODAY },
      costs: createCostResolver(costs, CATEGORIES),
      today: TODAY,
    });

  it("varsayılan eklemek kuyruğu değiştirmez", () => {
    const bare = queueFor({ products: missingProducts, defaults: [] });
    const withDefaults = queueFor({
      products: missingProducts,
      defaults: [STORE_DEFAULT, CATEGORY_DEFAULT],
    });

    expect(bare.items.map((item) => item.productId)).toEqual(["magazadan"]);
    expect(withDefaults.items.map((item) => item.productId)).toEqual(["magazadan"]);
    expect(withDefaults.items[0]!.uncomputableRevenue).toEqual(
      bare.items[0]!.uncomputableRevenue,
    );
  });

  it("kuyruk yalnızca ürüne özel maliyet girilince kısalır", () => {
    const filled = queueFor({
      products: [
        ...missingProducts,
        {
          productId: "magazadan",
          effectiveFrom: EPOCH,
          unitCost: lira(80),
          source: "manual",
        },
      ],
      defaults: [STORE_DEFAULT],
    });

    expect(filled.items).toHaveLength(0);
  });
});

describe("Yürürlükteki varsayılan kaydı", () => {
  const history: readonly CostDefault[] = [
    STORE_DEFAULT,
    { ...STORE_DEFAULT, effectiveFrom: "2026-06-01", commissionRate: basisPoints(20) },
    CATEGORY_DEFAULT,
  ];

  it("tarihte geçerli olan kaydı seçer", () => {
    expect(
      findEffectiveDefault(history, { kind: "store" }, "2026-05-31")?.commissionRate,
    ).toBe(basisPoints(15));
    expect(
      findEffectiveDefault(history, { kind: "store" }, "2026-06-01")?.commissionRate,
    ).toBe(basisPoints(20));
  });

  it("ilk kayıttan önce hiçbir şey yürürlükte değildir", () => {
    expect(
      findEffectiveDefault(history, { kind: "store" }, "2025-12-31"),
    ).toBeUndefined();
  });

  it("kapsamları karıştırmaz", () => {
    expect(
      findEffectiveDefault(history, { kind: "category", category: "Elektronik" }, TODAY)
        ?.commissionRate,
    ).toBe(basisPoints(11));
    // Kaydı olmayan kategori mağazanınkini kendi kaydı gibi göstermez.
    expect(
      findEffectiveDefault(history, { kind: "category", category: "Giyim" }, TODAY),
    ).toBeUndefined();
  });

  it("kayıtların dizideki sırası sonucu değiştirmez", () => {
    const shuffled = [...history].reverse();
    expect(
      findEffectiveDefault(shuffled, { kind: "store" }, TODAY)?.commissionRate,
    ).toBe(basisPoints(20));
  });

  it("boş listede yürürlükte kayıt yoktur", () => {
    expect(findEffectiveDefault([], { kind: "store" }, TODAY)).toBeUndefined();
  });
});

/** Her ürünün tek satırlık bir siparişi olan küçük veri kümesi. */
function datasetWith(defaults: readonly CostDefault[]): StoreDataset {
  return {
    products: [
      makeProduct({ id: "kendi-kaydi", sku: "SKU-1", category: "Elektronik" }),
      makeProduct({ id: "kategoriden", sku: "SKU-2", category: "Elektronik" }),
      makeProduct({ id: "magazadan", sku: "SKU-3", category: "Giyim" }),
    ],
    orders: [
      makeOrder({
        id: "o1",
        date: "2026-07-10",
        lines: [
          makeLine({ productId: "kendi-kaydi", quantity: 2, unitPrice: lira(100) }),
          makeLine({ productId: "magazadan", quantity: 2, unitPrice: lira(100) }),
        ],
      }),
    ],
    returns: [],
    adSpend: [],
    costs: { products: PRODUCTS, defaults },
  };
}

function profitOf(dataset: StoreDataset, productId: string) {
  const performance = buildProductPerformance(
    dataset,
    { from: "2026-07-01", to: TODAY },
    createCostResolver(dataset.costs, CATEGORIES),
  );
  return performance.find((item) => item.product.id === productId)!.netProfit;
}
