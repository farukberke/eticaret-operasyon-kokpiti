import { describe, expect, it } from "vitest";

import { eachDay, lira, type SignalCode, type StoreDataset } from "@/core/domain";
import { createAnalysisContext } from "@/core/services/analysis-context";
import { detectRisks } from "@/core/services/risk-detector";

import { TODAY, makeDataset, makeLine, makeOrder, makeProduct } from "./fixtures";

const WEEK = { from: "2026-07-21", to: TODAY };

function dailyOrders(
  days: string[],
  perDay: number,
  options: {
    order?: Partial<Parameters<typeof makeOrder>[0]>;
    /** Satır maliyeti/fiyatı ürününkinden bağımsız verilir — geçmiş satışta donar. */
    line?: Partial<Parameters<typeof makeLine>[0]>;
  } = {},
) {
  return days.map((date, index) =>
    makeOrder({
      id: `o-${date}-${index}`,
      date,
      lines: [makeLine({ quantity: perDay, ...options.line })],
      ...options.order,
    }),
  );
}

function codesOf(dataset: StoreDataset): SignalCode[] {
  const context = createAnalysisContext({ dataset, range: WEEK, today: TODAY });
  return detectRisks(context).map((signal) => signal.code);
}

describe("STOCKOUT_IMMINENT", () => {
  it("stok yeterlilik günü eşiğin altındayken tetiklenir", () => {
    // 7 gün × 12 adet = 84 satış → 12/gün. 30 stok → 2,5 gün.
    const dataset = makeDataset({
      products: [makeProduct({ stock: 30 })],
      orders: dailyOrders(eachDay(WEEK), 12),
    });

    expect(codesOf(dataset)).toContain("STOCKOUT_IMMINENT");
  });

  it("stok bol olduğunda tetiklenmez", () => {
    // 12/gün hızda 500 stok → 41 gün, eşiğin çok üstünde.
    const dataset = makeDataset({
      products: [makeProduct({ stock: 500 })],
      orders: dailyOrders(eachDay(WEEK), 12),
    });

    expect(codesOf(dataset)).not.toContain("STOCKOUT_IMMINENT");
  });

  it("hiç satmayan ürün için tetiklenmez", () => {
    // Satış hızı sıfırsa stok "tükenmiyor", ölü duruyor.
    const dataset = makeDataset({
      products: [makeProduct({ stock: 1 })],
      orders: [],
    });

    expect(codesOf(dataset)).not.toContain("STOCKOUT_IMMINENT");
  });

  it("stok azaldıkça aciliyet artar", () => {
    const build = (stock: number) => {
      const context = createAnalysisContext({
        dataset: makeDataset({
          products: [makeProduct({ stock })],
          orders: dailyOrders(eachDay(WEEK), 12),
        }),
        range: WEEK,
        today: TODAY,
      });
      return detectRisks(context).find((s) => s.code === "STOCKOUT_IMMINENT");
    };

    expect(build(6)!.urgency).toBeGreaterThan(build(60)!.urgency);
  });
});

describe("DEAD_STOCK", () => {
  it("satışsız ve değerli stokta tetiklenir", () => {
    const dataset = makeDataset({
      products: [makeProduct({ stock: 100, unitCost: lira(80) })], // ₺8.000 bağlı
      orders: [],
    });

    expect(codesOf(dataset)).toContain("DEAD_STOCK");
  });

  it("bağlı sermaye eşiğin altındaysa tetiklenmez", () => {
    // Gürültü olmasın: ₺400'lük ölü stok için satıcıyı uyandırmaya değmez.
    const dataset = makeDataset({
      products: [makeProduct({ stock: 5, unitCost: lira(80) })],
      orders: [],
    });

    expect(codesOf(dataset)).not.toContain("DEAD_STOCK");
  });

  it("satış varsa tetiklenmez", () => {
    const dataset = makeDataset({
      products: [makeProduct({ stock: 100, unitCost: lira(80) })],
      orders: dailyOrders(eachDay(WEEK), 1),
    });

    expect(codesOf(dataset)).not.toContain("DEAD_STOCK");
  });
});

describe("SELLING_AT_LOSS", () => {
  it("net kâr negatifken tetiklenir", () => {
    // Günlük: 500 ciro − 450 maliyet − 40 komisyon − 30 kargo = −20
    const dataset = makeDataset({
      products: [makeProduct({ price: lira(100), unitCost: lira(90), stock: 500 })],
      orders: dailyOrders(eachDay(WEEK), 5, {
        order: { commission: lira(40), shippingCost: lira(30) },
        line: { unitCost: lira(90) },
      }),
    });

    expect(codesOf(dataset)).toContain("SELLING_AT_LOSS");
  });

  it("kâr pozitifken tetiklenmez", () => {
    const dataset = makeDataset({
      products: [makeProduct({ price: lira(100), unitCost: lira(40), stock: 500 })],
      orders: dailyOrders(eachDay(WEEK), 5, { line: { unitCost: lira(40) } }),
    });

    expect(codesOf(dataset)).not.toContain("SELLING_AT_LOSS");
  });
});

describe("MARGIN_EROSION", () => {
  it("marj kritik seviyenin altına inince tetiklenir", () => {
    // 100 ciro − 92 maliyet → %8 marj, eşik %10.
    const dataset = makeDataset({
      products: [makeProduct({ price: lira(100), unitCost: lira(92), stock: 500 })],
      orders: dailyOrders(eachDay(WEEK), 5, { line: { unitCost: lira(92) } }),
    });

    expect(codesOf(dataset)).toContain("MARGIN_EROSION");
  });

  it("marj sağlıklıyken tetiklenmez", () => {
    const dataset = makeDataset({
      products: [makeProduct({ price: lira(100), unitCost: lira(60), stock: 500 })],
      orders: dailyOrders(eachDay(WEEK), 5, { line: { unitCost: lira(60) } }),
    });

    expect(codesOf(dataset)).not.toContain("MARGIN_EROSION");
  });

  it("marj hâlâ sağlıklı olsa bile sert düşüşte tetiklenir", () => {
    // Önceki dönem %40, bu dönem %25 → 15 puan düşüş.
    const previous = eachDay({ from: "2026-07-14", to: "2026-07-20" });
    const dataset = makeDataset({
      products: [makeProduct({ price: lira(100), unitCost: lira(75), stock: 500 })],
      orders: [
        ...dailyOrders(previous, 5, { line: { unitCost: lira(60) } }),
        ...dailyOrders(eachDay(WEEK), 5, { line: { unitCost: lira(75) } }),
      ],
    });

    expect(codesOf(dataset)).toContain("MARGIN_EROSION");
  });
});

describe("HIGH_RETURN_RATE", () => {
  const withReturns = (sold: number, returned: number) =>
    makeDataset({
      products: [makeProduct({ stock: 500 })],
      orders: [makeOrder({ lines: [makeLine({ quantity: sold })], date: TODAY })],
      returns: [
        {
          id: "r1",
          orderId: "o1",
          productId: "p1",
          date: TODAY,
          quantity: returned,
          refund: lira(100 * returned),
        },
      ],
    });

  it("oran eşiği aşınca tetiklenir", () => {
    // 100 satış, 20 iade → %20 > %15
    expect(codesOf(withReturns(100, 20))).toContain("HIGH_RETURN_RATE");
  });

  it("oran eşiğin altındayken tetiklenmez", () => {
    // 100 satış, 10 iade → %10
    expect(codesOf(withReturns(100, 10))).not.toContain("HIGH_RETURN_RATE");
  });

  it("az sayıda satışta tetiklenmez", () => {
    // 4 satış 2 iade %50 ama istatistiksel olarak anlamsız.
    expect(codesOf(withReturns(4, 2))).not.toContain("HIGH_RETURN_RATE");
  });
});

describe("AD_SPEND_LEAK", () => {
  it("ROAS 1'in altındayken tetiklenir", () => {
    const dataset = makeDataset({
      products: [makeProduct({ stock: 500 })],
      orders: [makeOrder({ lines: [makeLine({ quantity: 2 })] })],
      adSpend: [{ date: TODAY, productId: "p1", amount: lira(900) }],
    });

    expect(codesOf(dataset)).toContain("AD_SPEND_LEAK");
  });

  it("reklam kâr ediyorsa tetiklenmez", () => {
    const dataset = makeDataset({
      products: [makeProduct({ stock: 500 })],
      orders: [makeOrder({ lines: [makeLine({ quantity: 50 })] })],
      adSpend: [{ date: TODAY, productId: "p1", amount: lira(200) }],
    });

    expect(codesOf(dataset)).not.toContain("AD_SPEND_LEAK");
  });

  it("hiç reklam harcaması yoksa tetiklenmez", () => {
    const dataset = makeDataset({
      products: [makeProduct({ stock: 500 })],
      orders: [makeOrder()],
      adSpend: [],
    });

    expect(codesOf(dataset)).not.toContain("AD_SPEND_LEAK");
  });
});

describe("REVENUE_DROP", () => {
  it("ciro önceki döneme göre sert düşünce tetiklenir", () => {
    const previous = eachDay({ from: "2026-07-14", to: "2026-07-20" });
    const current = eachDay(WEEK);

    const dataset = makeDataset({
      products: [makeProduct({ stock: 5000 })],
      orders: [...dailyOrders(previous, 20), ...dailyOrders(current, 5)],
    });

    expect(codesOf(dataset)).toContain("REVENUE_DROP");
  });

  it("ciro sabitken tetiklenmez", () => {
    const previous = eachDay({ from: "2026-07-14", to: "2026-07-20" });
    const current = eachDay(WEEK);

    const dataset = makeDataset({
      products: [makeProduct({ stock: 5000 })],
      orders: [...dailyOrders(previous, 10), ...dailyOrders(current, 10)],
    });

    expect(codesOf(dataset)).not.toContain("REVENUE_DROP");
  });

  it("mağaza sinyali olarak üretilir, ürüne bağlanmaz", () => {
    const previous = eachDay({ from: "2026-07-14", to: "2026-07-20" });
    const dataset = makeDataset({
      products: [makeProduct({ stock: 5000 })],
      orders: dailyOrders(previous, 20),
    });

    const context = createAnalysisContext({ dataset, range: WEEK, today: TODAY });
    const signal = detectRisks(context).find((s) => s.code === "REVENUE_DROP");

    expect(signal?.subject.type).toBe("store");
  });
});

describe("Sinyal kimliği", () => {
  it("aynı veri için her zaman aynı kimliği üretir", () => {
    const dataset = makeDataset({
      products: [makeProduct({ stock: 30 })],
      orders: dailyOrders(eachDay(WEEK), 12),
    });

    const run = () =>
      detectRisks(createAnalysisContext({ dataset, range: WEEK, today: TODAY })).map(
        (s) => s.id,
      );

    expect(run()).toEqual(run());
  });
});
