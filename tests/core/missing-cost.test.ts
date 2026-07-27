import { describe, expect, it } from "vitest";

import { addDays, lira, type DateRange, type ProductCost } from "@/core/domain";
import { getMissingCostImpacts } from "@/core/services/missing-cost";
import { DEFAULT_RULES } from "@/core/services/rules.config";

import {
  COST_EPOCH,
  TODAY,
  costsFor,
  makeDataset,
  makeLine,
  makeOrder,
  makeProduct,
  makeReturn,
  type DatasetSpec,
} from "./fixtures";

/**
 * EKSİK MALİYETİ İŞE ÇEVİRME.
 *
 * Korunan iki şey:
 *
 * 1. **Sıra tesadüf değil.** Aynı veri her zaman aynı sırayı üretir ve sırayı
 *    ürün adı değil, ölçülemeyen paranın büyüklüğü belirler.
 * 2. **Eksiklik ürünün değil, sipariş tarihinin sorusudur.** Bugün maliyeti
 *    girilmiş bir ürün, üç ay önceki siparişinde hâlâ eksik olabilir.
 */

const RANGE: DateRange = { from: "2026-07-01", to: TODAY };

function report(spec: DatasetSpec, range: DateRange = RANGE) {
  const dataset = makeDataset(spec);
  return getMissingCostImpacts({
    dataset,
    range,
    costs: costsFor(dataset),
    today: TODAY,
  });
}

describe("eksik maliyet etkisi", () => {
  it("hiç maliyet kaydı olmayan ürünü etkisiyle birlikte listeler", () => {
    const result = report({
      products: [makeProduct({ id: "p1", sku: "SKU-1", name: "Yazlık Elbise" })],
      unitCosts: { p1: null },
      orders: [
        makeOrder({
          id: "o1",
          date: "2026-07-10",
          lines: [makeLine({ productId: "p1", quantity: 3, unitPrice: lira(200) })],
        }),
      ],
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      productId: "p1",
      name: "Yazlık Elbise",
      sku: "SKU-1",
      affectedLines: 1,
      affectedOrders: 1,
      affectedUnits: 3,
      firstOrderDate: "2026-07-10",
      lastOrderDate: "2026-07-10",
    });
    expect(result.items[0]?.uncomputableRevenue.minor).toBe(lira(600).minor);
  });

  it("bugün maliyeti olan ama sipariş tarihinde olmayan ürünü eksik sayar", () => {
    // Maliyet 15 Temmuz'da girildi; 5 Temmuz'daki siparişin kârı hesaplanamaz.
    const costRecords: ProductCost[] = [
      {
        productId: "p1",
        effectiveFrom: "2026-07-15",
        unitCost: lira(80),
        source: "manual",
      },
    ];

    const result = report({
      products: [makeProduct({ id: "p1" })],
      costRecords,
      orders: [
        makeOrder({
          id: "o-eski",
          date: "2026-07-05",
          lines: [makeLine({ productId: "p1", quantity: 2, unitPrice: lira(150) })],
        }),
        makeOrder({
          id: "o-yeni",
          date: "2026-07-20",
          lines: [makeLine({ productId: "p1", quantity: 5, unitPrice: lira(150) })],
        }),
      ],
    });

    expect(result.items).toHaveLength(1);
    // Yalnızca maliyeti çözümlenemeyen satır sayılır; 20 Temmuz siparişi değil.
    expect(result.items[0]).toMatchObject({
      affectedLines: 1,
      affectedOrders: 1,
      affectedUnits: 2,
      firstOrderDate: "2026-07-05",
      lastOrderDate: "2026-07-05",
    });
    expect(result.items[0]?.uncomputableRevenue.minor).toBe(lira(300).minor);
  });

  it("sipariş tarihinde geçerli maliyeti olan ürünü listelemez", () => {
    const result = report({
      products: [makeProduct({ id: "p1" })],
      // Varsayılan fixture maliyeti COST_EPOCH'tan beri geçerli.
      orders: [makeOrder({ id: "o1", date: "2026-07-10" })],
    });

    expect(result.items).toEqual([]);
    expect(result.ordersConsidered).toBe(1);
  });

  it("ürünleri ölçülemeyen satış tutarına göre sıralar", () => {
    const result = report({
      products: [
        makeProduct({ id: "kucuk", name: "Küçük" }),
        makeProduct({ id: "buyuk", name: "Büyük" }),
        makeProduct({ id: "orta", name: "Orta" }),
      ],
      unitCosts: { kucuk: null, buyuk: null, orta: null },
      orders: [
        makeOrder({
          id: "o1",
          date: "2026-07-10",
          lines: [
            makeLine({ productId: "kucuk", quantity: 1, unitPrice: lira(100) }),
            makeLine({ productId: "buyuk", quantity: 1, unitPrice: lira(9_000) }),
            makeLine({ productId: "orta", quantity: 1, unitPrice: lira(1_000) }),
          ],
        }),
      ],
    });

    expect(result.items.map((item) => item.productId)).toEqual([
      "buyuk",
      "orta",
      "kucuk",
    ]);
  });

  it("eşit tutarda sırayı deterministik olarak çözer", () => {
    const spec: DatasetSpec = {
      products: [
        makeProduct({ id: "b-urun", name: "B" }),
        makeProduct({ id: "a-urun", name: "A" }),
      ],
      unitCosts: { "a-urun": null, "b-urun": null },
      orders: [
        makeOrder({
          id: "o1",
          date: "2026-07-10",
          lines: [
            makeLine({ productId: "b-urun", quantity: 1, unitPrice: lira(500) }),
            makeLine({ productId: "a-urun", quantity: 1, unitPrice: lira(500) }),
          ],
        }),
      ],
    };

    const first = report(spec);
    const second = report(spec);

    // Tutar, sipariş, adet ve tarih eşit → productId karar verir.
    expect(first.items.map((item) => item.productId)).toEqual(["a-urun", "b-urun"]);
    expect(second.items.map((item) => item.productId)).toEqual(
      first.items.map((item) => item.productId),
    );
  });

  it("bir ürünün birden fazla sipariş ve satırını tek kayıtta toplar", () => {
    const result = report({
      products: [makeProduct({ id: "p1" })],
      unitCosts: { p1: null },
      orders: [
        makeOrder({
          id: "o1",
          date: "2026-07-12",
          // Aynı siparişte iki satır: sipariş sayısı 1 kalmalı.
          lines: [
            makeLine({ productId: "p1", quantity: 2, unitPrice: lira(100) }),
            makeLine({ productId: "p1", quantity: 1, unitPrice: lira(100) }),
          ],
        }),
        makeOrder({
          id: "o2",
          date: "2026-07-03",
          lines: [makeLine({ productId: "p1", quantity: 4, unitPrice: lira(100) })],
        }),
      ],
    });

    expect(result.items[0]).toMatchObject({
      affectedLines: 3,
      affectedOrders: 2,
      affectedUnits: 7,
      firstOrderDate: "2026-07-03",
      lastOrderDate: "2026-07-12",
    });
    expect(result.items[0]?.uncomputableRevenue.minor).toBe(lira(700).minor);
  });

  it("iadeyi mevcut domain kuralına göre tutardan düşer", () => {
    const result = report({
      products: [makeProduct({ id: "p1" })],
      unitCosts: { p1: null },
      orders: [
        makeOrder({
          id: "o1",
          date: "2026-07-10",
          lines: [makeLine({ productId: "p1", quantity: 3, unitPrice: lira(200) })],
        }),
      ],
      returns: [
        makeReturn({
          id: "r1",
          orderId: "o1",
          productId: "p1",
          date: "2026-07-14",
          quantity: 1,
          refund: lira(200),
        }),
      ],
    });

    // 600 satış − 200 iade. Adet sayısı satılan adettir; iade ayrı kayıttır.
    expect(result.items[0]?.uncomputableRevenue.minor).toBe(lira(400).minor);
    expect(result.items[0]?.affectedUnits).toBe(3);
  });

  it("başka bir siparişe ait iadeyi eksik maliyetli satıra yazmaz", () => {
    const costRecords: ProductCost[] = [
      {
        productId: "p1",
        effectiveFrom: "2026-07-15",
        unitCost: lira(80),
        source: "manual",
      },
    ];

    const result = report({
      products: [makeProduct({ id: "p1" })],
      costRecords,
      orders: [
        makeOrder({
          id: "o-eski",
          date: "2026-07-05",
          lines: [makeLine({ productId: "p1", quantity: 1, unitPrice: lira(300) })],
        }),
        makeOrder({
          id: "o-yeni",
          date: "2026-07-20",
          lines: [makeLine({ productId: "p1", quantity: 1, unitPrice: lira(300) })],
        }),
      ],
      returns: [
        // Maliyeti bilinen siparişin iadesi: eksik maliyetli satırı etkilemez.
        makeReturn({
          id: "r1",
          orderId: "o-yeni",
          productId: "p1",
          date: "2026-07-22",
          quantity: 1,
          refund: lira(300),
        }),
      ],
    });

    expect(result.items[0]?.uncomputableRevenue.minor).toBe(lira(300).minor);
  });

  it("pencere dışındaki siparişin iadesini kapsam özetiyle aynı şekilde düşer", () => {
    /**
     * `aggregateCoverage` penceredeki her iadeyi düşer; siparişin tarihine
     * bakmaz. Bu servis daha katı davransaydı bölüm toplamı ekranın hemen
     * üstündeki "değerlendirilemiyor" rakamını aşardı.
     */
    const result = report({
      products: [makeProduct({ id: "p1" })],
      unitCosts: { p1: null },
      orders: [
        makeOrder({
          id: "o-icerde",
          date: "2026-07-10",
          lines: [makeLine({ productId: "p1", quantity: 2, unitPrice: lira(200) })],
        }),
      ],
      returns: [
        makeReturn({
          id: "r1",
          // Sipariş pencereden önce verildi, iade pencerenin içinde geldi.
          orderId: "o-disarda",
          productId: "p1",
          date: "2026-07-14",
          quantity: 1,
          refund: lira(150),
        }),
      ],
    });

    expect(result.items[0]?.uncomputableRevenue.minor).toBe(lira(250).minor);
  });

  it("iskontoyu kâr hesabıyla aynı şekilde pay eder ve kuruş kaybetmez", () => {
    const result = report({
      products: [
        makeProduct({ id: "p1" }),
        makeProduct({ id: "p2" }),
        makeProduct({ id: "p3" }),
      ],
      unitCosts: { p1: null, p2: null, p3: null },
      orders: [
        makeOrder({
          id: "o1",
          date: "2026-07-10",
          // Üçe bölünemeyen iskonto: kuruş artığı bir yere düşmeli.
          discount: { minor: 10, currency: "TRY" },
          lines: [
            makeLine({ productId: "p1", quantity: 1, unitPrice: lira(100) }),
            makeLine({ productId: "p2", quantity: 1, unitPrice: lira(100) }),
            makeLine({ productId: "p3", quantity: 1, unitPrice: lira(100) }),
          ],
        }),
      ],
    });

    const total = result.items.reduce(
      (acc, item) => acc + item.uncomputableRevenue.minor,
      0,
    );
    // 30.000 kuruş satış − 10 kuruş iskonto, tamsayı olarak.
    expect(total).toBe(29_990);
    for (const item of result.items) {
      expect(Number.isInteger(item.uncomputableRevenue.minor)).toBe(true);
    }
  });

  it("aralık dışındaki siparişleri hesaba katmaz", () => {
    const result = report({
      products: [makeProduct({ id: "p1" })],
      unitCosts: { p1: null },
      orders: [
        makeOrder({
          id: "eski",
          date: "2026-05-01",
          lines: [makeLine({ productId: "p1", quantity: 1, unitPrice: lira(100) })],
        }),
      ],
    });

    expect(result.items).toEqual([]);
    expect(result.ordersConsidered).toBe(0);
  });
});

describe("öncelik seviyesi ve gerekçesi", () => {
  const { criticalRevenue, notableOrderCount, staleDays } = DEFAULT_RULES.cost;

  it("büyük tutarı kritik ve gerekçesini tutar olarak işaretler", () => {
    const result = report({
      products: [makeProduct({ id: "p1" })],
      unitCosts: { p1: null },
      orders: [
        makeOrder({
          id: "o1",
          date: "2026-07-10",
          lines: [
            makeLine({
              productId: "p1",
              quantity: 1,
              unitPrice: { minor: criticalRevenue.minor + 100, currency: "TRY" },
            }),
          ],
        }),
      ],
    });

    expect(result.items[0]?.level).toBe("critical");
    expect(result.items[0]?.reason).toBe("revenue");
  });

  it("tutarı küçük ama çok siparişe yayılan eksiği hacim gerekçesiyle öne alır", () => {
    const orders = Array.from({ length: notableOrderCount }, (_, index) =>
      makeOrder({
        id: `o${index}`,
        date: "2026-07-10",
        lines: [makeLine({ productId: "p1", quantity: 1, unitPrice: lira(1) })],
      }),
    );

    const result = report({
      products: [makeProduct({ id: "p1" })],
      unitCosts: { p1: null },
      orders,
    });

    expect(result.items[0]?.affectedOrders).toBe(notableOrderCount);
    expect(result.items[0]?.level).toBe("high");
    expect(result.items[0]?.reason).toBe("volume");
  });

  it("küçük ve seyrek ama uzun süredir açık eksiği eskilik gerekçesiyle anlatır", () => {
    // Analiz penceresi bu senaryoda daha geniş: eskilik ancak o zaman görünür.
    const result = report(
      {
        products: [makeProduct({ id: "p1" })],
        unitCosts: { p1: null },
        orders: [
          makeOrder({
            id: "o1",
            date: "2026-06-01",
            lines: [makeLine({ productId: "p1", quantity: 1, unitPrice: lira(5) })],
          }),
        ],
      },
      { from: COST_EPOCH, to: TODAY },
    );

    expect(result.items[0]?.level).toBe("normal");
    expect(result.items[0]?.reason).toBe("age");
    expect(result.items[0]?.firstOrderDate).toBe("2026-06-01");
    // Gerekçe tesadüf değil: sipariş eşiği gerçekten aşacak kadar geride.
    expect("2026-06-01" <= addDays(TODAY, -staleDays)).toBe(true);
  });
});

describe("boş durumlar", () => {
  it("hiç sipariş yokken bunu başarı gibi göstermez", () => {
    const result = report({
      products: [makeProduct({ id: "p1" })],
      unitCosts: { p1: null },
      orders: [],
    });

    expect(result.items).toEqual([]);
    // Ekran bu iki sayaca bakarak "veri yok" ile "hepsi tamam"ı ayırır.
    expect(result.ordersConsidered).toBe(0);
    expect(result.productsInCatalog).toBe(1);
  });

  it("ürün de sipariş de yokken katalog boş raporlanır", () => {
    const result = report({ products: [], orders: [] });

    expect(result.items).toEqual([]);
    expect(result.ordersConsidered).toBe(0);
    expect(result.productsInCatalog).toBe(0);
  });

  it("sipariş varken eksik kalmadıysa tamamlanmış durumu üretir", () => {
    const result = report({
      products: [makeProduct({ id: "p1" }), makeProduct({ id: "p2" })],
      orders: [
        makeOrder({
          id: "o1",
          date: "2026-07-10",
          lines: [
            makeLine({ productId: "p1", quantity: 1, unitPrice: lira(100) }),
            makeLine({ productId: "p2", quantity: 1, unitPrice: lira(100) }),
          ],
        }),
      ],
    });

    expect(result.items).toEqual([]);
    expect(result.ordersConsidered).toBe(1);
    expect(result.productsInCatalog).toBe(2);
  });
});

describe("maliyet girildikten sonra", () => {
  /**
   * Kaydetme akışının sonucu: `router.refresh()` sunucu bileşenini yeniden
   * çalıştırır, rapor yeni maliyet tablosuyla baştan hesaplanır. Test bunu
   * tabloya kayıt ekleyerek taklit ediyor.
   */
  const orders = [
    makeOrder({
      id: "o1",
      date: "2026-07-10",
      lines: [
        makeLine({ productId: "p1", quantity: 2, unitPrice: lira(200) }),
        makeLine({ productId: "p2", quantity: 1, unitPrice: lira(400) }),
      ],
    }),
  ];
  const products = [makeProduct({ id: "p1" }), makeProduct({ id: "p2" })];

  it("tamamlanan ürün kuyruktan düşer, diğerinin etkisi korunur", () => {
    const before = report({ products, orders, unitCosts: { p1: null, p2: null } });
    expect(before.items.map((item) => item.productId)).toEqual(["p1", "p2"]);

    // Kullanıcı p1'in maliyetini geçmişi kapsayacak şekilde girdi.
    const after = report({
      products,
      orders,
      costRecords: [
        {
          productId: "p1",
          effectiveFrom: COST_EPOCH,
          unitCost: lira(60),
          source: "manual",
        },
      ],
    });

    expect(after.items.map((item) => item.productId)).toEqual(["p2"]);
    expect(after.items[0]?.uncomputableRevenue.minor).toBe(lira(400).minor);
  });

  it("maliyet bugünden geçerli girilirse geçmiş sipariş kuyrukta kalır", () => {
    const after = report({
      products,
      orders,
      costRecords: [
        {
          productId: "p1",
          effectiveFrom: TODAY,
          unitCost: lira(60),
          source: "manual",
        },
      ],
    });

    // Tarihsel çözümleyici atlanmıyor: 10 Temmuz'da hâlâ maliyet yok.
    expect(after.items.map((item) => item.productId)).toEqual(["p1", "p2"]);
  });
});
