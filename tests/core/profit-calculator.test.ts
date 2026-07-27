import { describe, expect, it } from "vitest";

import { lira, sumMoney, toMajor } from "@/core/domain";
import {
  aggregateByProduct,
  aggregateDaily,
  aggregateStore,
  marginRatioOf,
  netProfitOf,
  netRevenueOf,
} from "@/core/services/profit-calculator";

import {
  TODAY,
  costsFor,
  makeDataset,
  makeLine,
  makeOrder,
  makeProduct,
  makeReturn,
} from "./fixtures";

const RANGE = { from: TODAY, to: TODAY };

describe("Kâr hesabı", () => {
  it("kâr zincirini uçtan uca doğru işler", () => {
    // 2 adet × ₺100 satış, birim maliyet ₺60, komisyon %7,5 (₺15),
    // kargo ₺10 (paket başına), indirim ₺5
    const dataset = makeDataset({
      orders: [
        makeOrder({
          lines: [makeLine({ quantity: 2 })],
          discount: lira(5),
        }),
      ],
      commissionPercent: 7.5,
      shippingCost: lira(10),
    });

    const store = aggregateStore(dataset, RANGE, costsFor(dataset));

    expect(toMajor(store.grossRevenue)).toBe(200);
    // net ciro = 200 − 5 indirim − 0 iade
    expect(toMajor(netRevenueOf(store))).toBe(195);
    expect(toMajor(store.cogs)).toBe(120);
    // net kâr = 195 − 120 − 15 − 10
    expect(toMajor(netProfitOf(store)!)).toBe(50);
  });

  it("iade edilen ürünün maliyetini gider yazmaz", () => {
    // Mal fiziksel olarak rafa döndüğü için COGS'tan düşülmeli.
    const dataset = makeDataset({
      orders: [
        makeOrder({
          lines: [makeLine({ quantity: 2 })],
          discount: lira(5),
        }),
      ],
      returns: [makeReturn({ quantity: 1, refund: lira(100) })],
      commissionPercent: 7.5,
      shippingCost: lira(10),
    });

    const store = aggregateStore(dataset, RANGE, costsFor(dataset));

    // net ciro = 200 − 5 − 100
    expect(toMajor(netRevenueOf(store))).toBe(95);
    // COGS = 2 birim × 60 − 1 iade × 60
    expect(toMajor(store.cogs)).toBe(60);
    // net kâr = 95 − 60 − 15 − 10
    expect(toMajor(netProfitOf(store)!)).toBe(10);
  });

  it("komisyonu her satırın kendi cirosundan hesaplar", () => {
    // ₺100'lük ve ₺300'lük iki satır, %10 komisyon → ₺10 ve ₺30.
    // Komisyon artık sipariş toplamından pay edilmiyor; her satır kendi
    // oranıyla hesaplanıyor (oran ürün ya da kategori bazında değişebilir).
    const dataset = makeDataset({
      products: [
        makeProduct({ id: "ucuz", price: lira(100) }),
        makeProduct({ id: "pahali", price: lira(300) }),
      ],
      orders: [
        makeOrder({
          lines: [
            makeLine({ productId: "ucuz", unitPrice: lira(100) }),
            makeLine({ productId: "pahali", unitPrice: lira(300) }),
          ],
        }),
      ],
      commissionPercent: 10,
    });

    const byProduct = aggregateByProduct(dataset, RANGE, costsFor(dataset));

    expect(toMajor(byProduct.get("ucuz")!.commission)).toBe(10);
    expect(toMajor(byProduct.get("pahali")!.commission)).toBe(30);
  });

  it("iskonto dağıtımında kuruş kaybetmez", () => {
    // 3 eşit satıra ₺0,10 iskonto: 3'e tam bölünmez.
    const dataset = makeDataset({
      products: ["a", "b", "c"].map((id) => makeProduct({ id })),
      orders: [
        makeOrder({
          lines: ["a", "b", "c"].map((id) => makeLine({ productId: id })),
          discount: lira(0.1),
        }),
      ],
    });

    const shares = [
      ...aggregateByProduct(dataset, RANGE, costsFor(dataset)).values(),
    ].map((a) => a.discount);

    expect(sumMoney(shares).minor).toBe(10);
  });

  it("aralık dışındaki hareketleri saymaz", () => {
    const dataset = makeDataset({
      orders: [
        makeOrder({ id: "bugun", date: TODAY }),
        makeOrder({ id: "gecen-ay", date: "2026-06-01" }),
      ],
    });

    expect(aggregateStore(dataset, RANGE, costsFor(dataset)).orderCount).toBe(1);
  });

  it("günlük toplamlar dönem toplamıyla birebir tutar", () => {
    // İki farklı yol: aggregateStore giderleri ürünlere pay ederek toplar,
    // aggregateDaily sipariş düzeyinde. Sonuç aynı çıkmazsa kokpitteki
    // grafik ile üstündeki KPI birbirini yalanlar.
    const days = ["2026-07-25", "2026-07-26", TODAY];
    const dataset = makeDataset({
      products: [makeProduct({ id: "a" }), makeProduct({ id: "b" })],
      orders: days.flatMap((date) => [
        makeOrder({
          id: `o-${date}`,
          date,
          lines: [
            makeLine({ productId: "a", quantity: 3 }),
            makeLine({ productId: "b", quantity: 1 }),
          ],
          discount: lira(1.11),
        }),
      ]),
      returns: [makeReturn({ productId: "a", date: TODAY, quantity: 1 })],
    });

    const range = { from: days[0]!, to: TODAY };
    const store = aggregateStore(dataset, range, costsFor(dataset));
    const daily = [...aggregateDaily(dataset, range, costsFor(dataset)).values()];

    expect(sumMoney(daily.map(netRevenueOf)).minor).toBe(netRevenueOf(store).minor);
    expect(sumMoney(daily.map((d) => netProfitOf(d)!)).minor).toBe(
      netProfitOf(store)!.minor,
    );
    expect(daily.reduce((acc, d) => acc + d.orderCount, 0)).toBe(store.orderCount);
  });

  it("satış yokken marjı null bırakır", () => {
    // "%0 marj" ile "marj hesaplanamaz" farklı şeylerdir.
    const empty = makeDataset({ orders: [] });
    const store = aggregateStore(empty, RANGE, costsFor(empty));
    expect(marginRatioOf(store)).toBeNull();
  });

  it("zararına satışta negatif kâr üretir", () => {
    const dataset = makeDataset({
      products: [makeProduct({ price: lira(100) })],
      orders: [makeOrder({ lines: [makeLine({ unitPrice: lira(100) })] })],
      unitCosts: { p1: lira(90) },
      commissionPercent: 15,
      shippingCost: lira(10),
    });

    const store = aggregateStore(dataset, RANGE, costsFor(dataset));
    // 100 − 90 − 15 komisyon − 10 kargo = −15
    expect(toMajor(netProfitOf(store)!)).toBe(-15);
  });
});
