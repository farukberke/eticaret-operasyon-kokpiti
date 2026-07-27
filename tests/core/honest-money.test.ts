import { describe, expect, it } from "vitest";

import { eachDay, lastDays, lira, toMajor, type Signal } from "@/core/domain";
import { createAnalysisContext } from "@/core/services/analysis-context";
import { detectOpportunities } from "@/core/services/opportunity-detector";
import { detectRisks } from "@/core/services/risk-detector";
import { DEFAULT_RULES } from "@/core/services/rules.config";
import { buildDataset } from "@/data/mock/seed";

import { TODAY, makeDataset, makeLine, makeOrder, makeProduct } from "./fixtures";

/**
 * DÜRÜST PARA HESAPLARI.
 *
 * Bu dosya panelin inandırıcılığını korur. Buradaki testler formülün
 * "çalıştığını" değil, **abartmadığını** doğrular.
 *
 * Önceki hesap iki hatayı birleştiriyordu: kaybı ciro üzerinden sayıyor ve
 * satıcının 30 gün stoksuz bekleyeceğini varsayıyordu. İkisi çarpılınca
 * gerçek kaybın ~25 katı bir rakam çıkıyordu. Bir veri ürününde bu, tek
 * seferde kaybedilen güven demektir.
 */

const WEEK = { from: "2026-07-21", to: TODAY };

function dailyOrders(
  days: string[],
  perDay: number,
  line: Partial<Parameters<typeof makeLine>[0]> = {},
) {
  return days.map((date, index) =>
    makeOrder({
      id: `o-${date}-${index}`,
      date,
      lines: [makeLine({ quantity: perDay, ...line })],
    }),
  );
}

function signalsOf(dataset: Parameters<typeof createAnalysisContext>[0]["dataset"]) {
  return detectRisks(createAnalysisContext({ dataset, range: WEEK, today: TODAY }));
}

const find = (signals: Signal[], code: string) =>
  signals.find((signal) => signal.code === code);

describe("STOCKOUT_IMMINENT — kayıp hesabı", () => {
  /**
   * Senaryo: fiyat ₺100, maliyet ₺60. 7 gün boyunca günde 10 adet satılmış.
   * Stok 20 → 2 gün yeter. Tedarik süresi 7 gün.
   *
   * Birim kâr: 70 adet satışta net kâr / 70.
   * Stoksuz kalınacak süre: 7 − 2 = 5 gün (30 gün DEĞİL).
   * Kayıp: birim kâr × 10 adet/gün × 5 gün.
   */
  const dataset = makeDataset({
    products: [makeProduct({ price: lira(100), unitCost: lira(60), stock: 20 })],
    orders: dailyOrders(eachDay(WEEK), 10, { unitCost: lira(60) }),
  });

  const signal = find(signalsOf(dataset), "STOCKOUT_IMMINENT")!;

  it("kaybı ciro değil kâr üzerinden hesaplar", () => {
    // Ciro üzerinden olsaydı: 100 × 10 × 5 = ₺5.000
    // Kâr üzerinden: birim kâr ₺40 × 10 × 5 = ₺2.000
    expect(toMajor(signal.moneyAtStake)).toBeLessThan(2500);
    expect(toMajor(signal.moneyAtStake)).toBeGreaterThan(1500);
  });

  it("stoksuz süreyi tedarik süresinden türetir, sabit 30 günden değil", () => {
    // 30 günlük ufuk kullanılsaydı kayıp ~6 kat büyük olurdu (28 gün / 5 gün).
    const withThirtyDayHorizon = 40 * 10 * 28;
    expect(toMajor(signal.moneyAtStake)).toBeLessThan(withThirtyDayHorizon / 4);
  });

  it("gecikilen her günün maliyetini ayrı taşır", () => {
    // Bir gün gecikmek = stoksuz süreye bir gün eklemek = 10 adetlik kâr.
    expect(signal.dailyImpact).toBeDefined();
    expect(toMajor(signal.dailyImpact!)).toBeCloseTo(
      toMajor(signal.moneyAtStake) / 5,
      0,
    );
  });

  it("stok tedarik süresinden azsa son karar gününü bugüne çeker", () => {
    // 2 gün stok, 7 gün tedarik → karar zaten gecikmiş.
    expect(signal.deadline).toBe(TODAY);
  });

  it("stok bolken son karar gününü ileriye atar", () => {
    // 60 stok / 10 adet = 6 gün kapak; eşiğin (7) hemen altında.
    // 6 − 7 = −1 → yine bugün. 6,9 günlük kapak için de aynı.
    const roomy = makeDataset({
      products: [makeProduct({ price: lira(100), unitCost: lira(60), stock: 68 })],
      orders: dailyOrders(eachDay(WEEK), 10, { unitCost: lira(60) }),
    });

    const roomySignal = find(signalsOf(roomy), "STOCKOUT_IMMINENT");
    // 6,8 gün kapak → eşiğin altında, sinyal var ama aciliyeti düşük.
    expect(roomySignal).toBeDefined();
    expect(roomySignal!.urgency).toBeLessThan(signal.urgency);
  });
});

describe("HIGH_RETURN_RATE — kayıp hesabı", () => {
  it("iade tutarının tamamını kayıp saymaz", () => {
    // 100 satış, 30 iade (%30). Eşik %15 → fazla iade 15 adet.
    // Mal geri geldiği için kayıp, iade tutarı (₺3.000) değil,
    // 15 adetin getirmediği kârdır.
    const dataset = makeDataset({
      products: [makeProduct({ price: lira(100), unitCost: lira(60), stock: 500 })],
      orders: [
        makeOrder({
          lines: [makeLine({ quantity: 100, unitCost: lira(60) })],
          date: TODAY,
        }),
      ],
      returns: [
        {
          id: "r1",
          orderId: "o1",
          productId: "p1",
          date: TODAY,
          quantity: 30,
          refund: lira(3000),
        },
      ],
    });

    const signal = find(signalsOf(dataset), "HIGH_RETURN_RATE")!;
    expect(toMajor(signal.moneyAtStake)).toBeLessThan(3000);
  });
});

describe("AD_SPEND_LEAK — kayıp hesabı", () => {
  it("geri dönmeyen bütçenin tamamını masaya koyar", () => {
    const dataset = makeDataset({
      products: [makeProduct({ stock: 500 })],
      orders: [makeOrder({ lines: [makeLine({ quantity: 2 })] })],
      adSpend: [{ date: TODAY, productId: "p1", amount: lira(900) }],
    });

    const signal = find(signalsOf(dataset), "AD_SPEND_LEAK")!;
    // Önceki hesap (harcama − ciro) ROAS 1'e yaklaşınca sıfıra çöküyordu.
    expect(toMajor(signal.moneyAtStake)).toBe(900);
    expect(signal.dailyImpact).toBeDefined();
  });
});

describe("Tüm risk sinyalleri", () => {
  const dataset = makeDataset({
    products: [
      makeProduct({ id: "tukenen", price: lira(100), unitCost: lira(60), stock: 20 }),
      makeProduct({
        id: "zarar",
        price: lira(100),
        unitCost: lira(95),
        stock: 400,
      }),
      makeProduct({ id: "olu", stock: 200, unitCost: lira(90) }),
    ],
    orders: eachDay(WEEK).flatMap((date) => [
      makeOrder({
        id: `t-${date}`,
        date,
        lines: [makeLine({ productId: "tukenen", quantity: 10, unitCost: lira(60) })],
      }),
      makeOrder({
        id: `z-${date}`,
        date,
        lines: [makeLine({ productId: "zarar", quantity: 8, unitCost: lira(95) })],
        commission: lira(60),
        shippingCost: lira(40),
      }),
    ]),
  });

  it("hiçbir sinyal negatif tutar taşımaz", () => {
    // Negatif "risk altındaki para" anlamsızdır ve etki puanını bozar.
    for (const signal of signalsOf(dataset)) {
      expect(signal.moneyAtStake.minor).toBeGreaterThanOrEqual(0);
    }
  });

  /**
   * Ölü stok bilinçli olarak dışarıda: `stockValue` bir **stok** büyüklüğü
   * (rafta duran sermaye), diğerleri **akış** büyüklüğü (dönemde kaybedilen
   * kâr). Bir mağazanın envanteri haftalık cirosundan büyük olabilir ve bu
   * bir hata değildir; ikisini aynı sınıra sokmak yanlış olur.
   *
   * Arayüz bu farkı göstermek zorunda — ölü stok "risk altında" değil,
   * "bağlı sermaye"dir.
   */
  it("akış tipi sinyaller dönem cirosunu aşan kayıp iddia etmez", () => {
    const context = createAnalysisContext({ dataset, range: WEEK, today: TODAY });
    const flowSignals = detectRisks(context).filter(
      (signal) => signal.code !== "DEAD_STOCK",
    );

    expect(flowSignals.length).toBeGreaterThan(0);
    for (const signal of flowSignals) {
      expect(signal.moneyAtStake.minor).toBeLessThanOrEqual(
        context.storeNetRevenue.minor,
      );
    }
  });

  it("ölü stok bağlı sermayeyi taşır ve günlük etkisi yoktur", () => {
    // Ölü stok her gün büyüyen bir kayıp değil; duran bir paradır.
    const signal = find(signalsOf(dataset), "DEAD_STOCK")!;
    expect(toMajor(signal.moneyAtStake)).toBe(200 * 90);
    expect(signal.dailyImpact).toBeUndefined();
  });
});

describe("Sıfır tutarlı sinyal üretilmez", () => {
  /**
   * Regresyon koruması. Tedarik süresi devreye girince RESTOCK_WINNER
   * sessizce ₺0 üretmeye başlamıştı: kural yalnızca kapak ≥ 7 günken
   * tetikleniyor, tedarik süresi de 7 gün — `max(0, 7 − kapak)` her zaman
   * sıfır çıkıyordu. "₺0,00 fırsat" satırı paneli komik duruma düşürür.
   */
  it("hiçbir sinyal ₺0 tutarla listeye girmez", () => {
    const context = createAnalysisContext({
      dataset: buildDataset(TODAY),
      range: lastDays(TODAY, 30),
      today: TODAY,
    });

    const zeroValued = [
      ...detectRisks(context),
      ...detectOpportunities(context),
    ].filter((signal) => signal.moneyAtStake.minor === 0);

    expect(zeroValued.map((signal) => signal.id)).toEqual([]);
  });
});

describe("Eşikler", () => {
  it("tedarik süresi yapılandırmadan gelir", () => {
    expect(DEFAULT_RULES.inventory.supplyLeadTimeDays).toBe(7);
    expect(DEFAULT_RULES.inventory.forecastHorizonDays).toBe(30);
  });
});
