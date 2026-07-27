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
  makeDataset,
  makeLine,
  makeOrder,
  makeProduct,
  makeReturn,
} from "./fixtures";

const RANGE = { from: TODAY, to: TODAY };

describe("Kâr hesabı", () => {
  it("kâr zincirini uçtan uca doğru işler", () => {
    // 2 adet × ₺100 satış, birim maliyet ₺60, komisyon ₺15, kargo ₺10, indirim ₺5
    const dataset = makeDataset({
      orders: [
        makeOrder({
          lines: [makeLine({ quantity: 2 })],
          commission: lira(15),
          shippingCost: lira(10),
          discount: lira(5),
        }),
      ],
    });

    const store = aggregateStore(dataset, RANGE);

    expect(toMajor(store.grossRevenue)).toBe(200);
    // net ciro = 200 − 5 indirim − 0 iade
    expect(toMajor(netRevenueOf(store))).toBe(195);
    expect(toMajor(store.cogs)).toBe(120);
    // net kâr = 195 − 120 − 15 − 10
    expect(toMajor(netProfitOf(store))).toBe(50);
  });

  it("iade edilen ürünün maliyetini gider yazmaz", () => {
    // Mal fiziksel olarak rafa döndüğü için COGS'tan düşülmeli.
    const dataset = makeDataset({
      orders: [
        makeOrder({
          lines: [makeLine({ quantity: 2 })],
          commission: lira(15),
          shippingCost: lira(10),
          discount: lira(5),
        }),
      ],
      returns: [makeReturn({ quantity: 1, refund: lira(100) })],
    });

    const store = aggregateStore(dataset, RANGE);

    // net ciro = 200 − 5 − 100
    expect(toMajor(netRevenueOf(store))).toBe(95);
    // COGS = 2 birim × 60 − 1 iade × 60
    expect(toMajor(store.cogs)).toBe(60);
    // net kâr = 95 − 60 − 15 − 10
    expect(toMajor(netProfitOf(store))).toBe(10);
  });

  it("sipariş giderlerini satır cirosuna göre paylaştırır", () => {
    // ₺100'lük ve ₺300'lük iki satır → komisyon 1:3 oranında dağılmalı.
    const dataset = makeDataset({
      products: [
        makeProduct({ id: "ucuz", price: lira(100), unitCost: lira(40) }),
        makeProduct({ id: "pahali", price: lira(300), unitCost: lira(120) }),
      ],
      orders: [
        makeOrder({
          lines: [
            makeLine({ productId: "ucuz", unitPrice: lira(100), unitCost: lira(40) }),
            makeLine({
              productId: "pahali",
              unitPrice: lira(300),
              unitCost: lira(120),
            }),
          ],
          commission: lira(40),
        }),
      ],
    });

    const byProduct = aggregateByProduct(dataset, RANGE);

    expect(toMajor(byProduct.get("ucuz")!.commission)).toBe(10);
    expect(toMajor(byProduct.get("pahali")!.commission)).toBe(30);
  });

  it("dağıtımda kuruş kaybetmez", () => {
    // 3 eşit satıra ₺0,10 komisyon: 3'e tam bölünmez.
    const dataset = makeDataset({
      products: ["a", "b", "c"].map((id) => makeProduct({ id })),
      orders: [
        makeOrder({
          lines: ["a", "b", "c"].map((id) => makeLine({ productId: id })),
          commission: lira(0.1),
        }),
      ],
    });

    const shares = [...aggregateByProduct(dataset, RANGE).values()].map(
      (a) => a.commission,
    );

    expect(sumMoney(shares).minor).toBe(10);
  });

  it("aralık dışındaki hareketleri saymaz", () => {
    const dataset = makeDataset({
      orders: [
        makeOrder({ id: "bugun", date: TODAY }),
        makeOrder({ id: "gecen-ay", date: "2026-06-01" }),
      ],
    });

    expect(aggregateStore(dataset, RANGE).orderCount).toBe(1);
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
          commission: lira(7.77),
          shippingCost: lira(3.33),
          discount: lira(1.11),
        }),
      ]),
      returns: [makeReturn({ productId: "a", date: TODAY, quantity: 1 })],
    });

    const range = { from: days[0]!, to: TODAY };
    const store = aggregateStore(dataset, range);
    const daily = [...aggregateDaily(dataset, range).values()];

    expect(sumMoney(daily.map(netRevenueOf)).minor).toBe(netRevenueOf(store).minor);
    expect(sumMoney(daily.map(netProfitOf)).minor).toBe(netProfitOf(store).minor);
    expect(daily.reduce((acc, d) => acc + d.orderCount, 0)).toBe(store.orderCount);
  });

  it("satış yokken marjı null bırakır", () => {
    // "%0 marj" ile "marj hesaplanamaz" farklı şeylerdir.
    const store = aggregateStore(makeDataset({ orders: [] }), RANGE);
    expect(marginRatioOf(store)).toBeNull();
  });

  it("zararına satışta negatif kâr üretir", () => {
    const dataset = makeDataset({
      products: [makeProduct({ price: lira(100), unitCost: lira(90) })],
      orders: [
        makeOrder({
          lines: [makeLine({ unitPrice: lira(100), unitCost: lira(90) })],
          commission: lira(15),
          shippingCost: lira(10),
        }),
      ],
    });

    const store = aggregateStore(dataset, RANGE);
    // 100 − 90 − 15 − 10 = −15
    expect(toMajor(netProfitOf(store))).toBe(-15);
  });
});
