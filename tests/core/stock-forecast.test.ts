import { describe, expect, it } from "vitest";

import { eachDay } from "@/core/domain";
import { buildProductPerformance } from "@/core/services/inventory-analyzer";
import { DEFAULT_RULES, STOCK_COVERAGE_THRESHOLDS } from "@/core/services/rules.config";
import {
  buildStockForecasts,
  forecastStockCoverage,
  type StockCoverageState,
} from "@/core/services/stock-forecast";

import {
  TODAY,
  costsFor,
  makeDataset,
  makeLine,
  makeOrder,
  makeProduct,
} from "./fixtures";

/**
 * STOK TAHMİNLEYİCİ.
 *
 * İki soru ayrı ayrı test ediliyor: sayı doğru mu (kaç gün) ve **karar** doğru
 * mu (hangi seviye). İkincisi asıl iş — 12,5 sayısı kullanıcıya bir şey
 * söylemez, "Düşük" söyler.
 */

/** Kısayol: yalnızca stok ve hız değiştiren senaryolar için. */
function forecast(stock: number | null, dailyVelocity: number, windowDays = 30) {
  return forecastStockCoverage({ stock, dailyVelocity, windowDays });
}

function stateOf(stock: number | null, dailyVelocity: number): StockCoverageState {
  return forecast(stock, dailyVelocity).state;
}

describe("forecastStockCoverage — günlük satış hesabı", () => {
  it("stoğu günlük hıza böler", () => {
    expect(forecast(100, 4).daysRemaining).toBe(25);
  });

  it("ondalıklı günlük satışta ondalık gün üretir", () => {
    // 10 adet / 30 gün = 0,333…/gün → 50 adet ≈ 150 gün.
    expect(forecast(50, 10 / 30).daysRemaining).toBeCloseTo(150, 5);
  });

  it("stok bittiğinde sıfır gün kalır — 'hesaplanamıyor' değil", () => {
    const result = forecast(0, 5);
    expect(result.daysRemaining).toBe(0);
    expect(result.state).toBe("critical");
  });

  it("pencere uzunluğunu sonuca taşır", () => {
    // Dipnottaki "son X güne göre" cümlesinin X'i buradan geliyor.
    expect(forecast(100, 4, 7).windowDays).toBe(7);
    expect(forecast(100, 4, 90).windowDays).toBe(90);
  });
});

describe("forecastStockCoverage — ölçülemeyen durumlar", () => {
  it("stok bilinmiyorsa hesaplanamıyor der", () => {
    expect(stateOf(null, 5)).toBe("unknown");
    expect(forecast(null, 5).daysRemaining).toBeNull();
  });

  it("stok sayı değilse de hesaplanamıyor der", () => {
    // Gerçek bir pazaryeri adapter'ından bozuk değer gelebilir; sessizce
    // NaN gün göstermektense durumu adıyla söylemek gerekir.
    expect(stateOf(Number.NaN, 5)).toBe("unknown");
  });

  it("satış yoksa 'satış verisi yok' der", () => {
    expect(stateOf(500, 0)).toBe("noSales");
    expect(forecast(500, 0).daysRemaining).toBeNull();
  });

  it("negatif stok ayrı bir durumdur", () => {
    // Satış hızı olsa bile: -5 stoğu 5'e bölüp "-1 gün kaldı" demek,
    // envanter kaydındaki hatayı bir tahmin gibi göstermek olurdu.
    expect(stateOf(-5, 5)).toBe("negative");
    expect(forecast(-5, 5).daysRemaining).toBeNull();
  });

  it("negatif stok, satış yokluğundan önce gelir", () => {
    expect(stateOf(-5, 0)).toBe("negative");
  });

  it("iade satışı aşınca satış verisi yok sayılır", () => {
    // Net hız negatif: stoğu eritecek bir talep yok.
    expect(stateOf(100, -3)).toBe("noSales");
  });
});

describe("forecastStockCoverage — Infinity ve NaN üretmez", () => {
  /**
   * Panelin en kolay itibar kaybı: bir hücrede "Infinity gün" ya da "NaN"
   * görmek. Aşağıdaki her giriş bir şekilde bölme hatasına açık.
   */
  const hostile: readonly (readonly [number | null, number])[] = [
    [100, 0],
    [0, 0],
    [-1, 0],
    [100, Number.NaN],
    [100, Number.POSITIVE_INFINITY],
    [Number.POSITIVE_INFINITY, 5],
    [Number.NaN, Number.NaN],
    [null, 0],
  ];

  it.each(hostile)("stok=%s hız=%s → sonlu sayı ya da null", (stock, velocity) => {
    const { daysRemaining } = forecast(stock, velocity);

    expect(daysRemaining === null || Number.isFinite(daysRemaining)).toBe(true);
    expect(Number.isNaN(daysRemaining ?? 0)).toBe(false);
  });

  it("sonsuz hızda bile bir durum üretir", () => {
    expect(stateOf(100, Number.POSITIVE_INFINITY)).toBe("noSales");
  });
});

describe("forecastStockCoverage — seviyeler", () => {
  /** 1 adet/gün: kalan gün doğrudan stok adedine eşit, sınırlar okunur olur. */
  const at = (days: number) => stateOf(days, 1);

  it("0–7 gün kritik", () => {
    expect(at(0)).toBe("critical");
    expect(at(1)).toBe("critical");
    expect(at(7)).toBe("critical");
  });

  it("8–21 gün düşük", () => {
    expect(at(8)).toBe("low");
    expect(at(21)).toBe("low");
  });

  it("22–60 gün normal", () => {
    expect(at(22)).toBe("normal");
    expect(at(60)).toBe("normal");
  });

  it("60 günün üstü yüksek stok", () => {
    expect(at(61)).toBe("high");
    expect(at(400)).toBe("high");
  });

  it("sınırlar dahil: 7,5 gün artık kritik değil", () => {
    // Ondalık sınırda kalanlar bir üst seviyeye geçer.
    expect(stateOf(15, 2)).toBe("low");
  });

  it("eşikler karar motorunun eşikleriyle aynı sayıdır", () => {
    /**
     * Bu testin varlık sebebi: tablo "Kritik" derken kuyruk
     * `STOCKOUT_IMMINENT` üretmiyorsa panel kendi kendini yalanlar. İki
     * sayının elle senkronda tutulması değil, aynı kaynaktan gelmesi
     * gerekiyor.
     */
    expect(STOCK_COVERAGE_THRESHOLDS.critical).toBe(
      DEFAULT_RULES.risk.stockoutDaysOfCover,
    );
    expect(STOCK_COVERAGE_THRESHOLDS.low).toBe(
      DEFAULT_RULES.opportunity.restockDaysOfCover,
    );
  });

  it("özel eşiklerle çalışır", () => {
    // Tedarik süresi 30 gün olan bir mağazada "kritik" başka bir yerdedir.
    const result = forecastStockCoverage({
      stock: 100,
      dailyVelocity: 4,
      windowDays: 30,
      thresholds: { critical: 30, low: 45, normal: 90 },
    });

    expect(result.daysRemaining).toBe(25);
    expect(result.state).toBe("critical");
  });
});

/** Verilen günlerde her gün `perDay` adet satan siparişler. */
function dailyOrders(days: string[], perDay: number, productId = "p1") {
  return days.map((date, index) =>
    makeOrder({
      id: `o-${date}-${index}`,
      date,
      lines: [makeLine({ productId, quantity: perDay })],
    }),
  );
}

describe("buildStockForecasts — analiz penceresine bağlılık", () => {
  /**
   * Son 7 günde günde 10, ondan önceki 83 günde günde 1 adet satan bir ürün.
   * Aynı stok, seçilen pencereye göre bambaşka bir karar doğurmalı.
   */
  function dataset(stock: number) {
    const hot = eachDay({ from: "2026-07-21", to: TODAY });
    const cold = eachDay({ from: "2026-04-29", to: "2026-07-20" });

    return makeDataset({
      products: [makeProduct({ stock })],
      orders: [...dailyOrders(cold, 1), ...dailyOrders(hot, 10)],
    });
  }

  function forecastFor(from: string, stock = 140) {
    const data = dataset(stock);
    const range = { from, to: TODAY };
    const performance = buildProductPerformance(data, range, costsFor(data));

    return buildStockForecasts(performance, range);
  }

  it("7 günlük pencere son haftanın hızını kullanır", () => {
    const batch = forecastFor("2026-07-21");

    expect(batch.windowDays).toBe(7);
    // 140 stok / 10 adet gün → 14 gün.
    expect(batch.byProduct.get("p1")?.daysRemaining).toBeCloseTo(14, 5);
    expect(batch.byProduct.get("p1")?.state).toBe("low");
  });

  it("30 günlük pencere aynı stoğu farklı hızla ölçer", () => {
    const batch = forecastFor("2026-06-28");

    expect(batch.windowDays).toBe(30);
    // 7 gün × 10 + 23 gün × 1 = 93 adet / 30 gün = 3,1/gün → ~45 gün.
    expect(batch.byProduct.get("p1")?.daysRemaining).toBeCloseTo(140 / 3.1, 5);
    expect(batch.byProduct.get("p1")?.state).toBe("normal");
  });

  it("90 günlük pencere en yavaş hızı görür ve seviyeyi yükseltir", () => {
    const batch = forecastFor("2026-04-29");

    expect(batch.windowDays).toBe(90);
    // Aynı 140 adet stok, geniş pencerede "yüksek stok" olur.
    expect(batch.byProduct.get("p1")?.state).toBe("high");
  });

  it("pencere değişince aynı ürün farklı karar üretir", () => {
    /**
     * Özelliğin bütün iddiası bu: seçici oynadığında rozet de oynamalı.
     * Üç pencerenin üçü de aynı sonucu verseydi Analysis Window bu ekranda
     * hiçbir işe yaramıyor demekti.
     */
    const states = ["2026-07-21", "2026-06-28", "2026-04-29"].map(
      (from) => forecastFor(from).byProduct.get("p1")?.state,
    );

    expect(states).toEqual(["low", "normal", "high"]);
  });

  it("özel tarih aralığı da tam olarak seçilen günleri ölçer", () => {
    const data = dataset(140);
    // Yalnızca soğuk dönemden 10 gün: günde 1 adet → 140 gün yeter.
    const range = { from: "2026-07-01", to: "2026-07-10" };
    const performance = buildProductPerformance(data, range, costsFor(data));
    const batch = buildStockForecasts(performance, range);

    expect(batch.windowDays).toBe(10);
    expect(batch.byProduct.get("p1")?.daysRemaining).toBeCloseTo(140, 5);
    expect(batch.byProduct.get("p1")?.state).toBe("high");
  });

  it("katalogdaki her ürün için tek geçişte tahmin üretir", () => {
    const data = makeDataset({
      products: [
        makeProduct({ id: "hizli", stock: 10 }),
        makeProduct({ id: "olu", stock: 400 }),
        makeProduct({ id: "hatali", stock: -3 }),
      ],
      orders: dailyOrders(eachDay({ from: "2026-07-21", to: TODAY }), 5, "hizli"),
    });
    const range = { from: "2026-07-21", to: TODAY };
    const performance = buildProductPerformance(data, range, costsFor(data));

    const batch = buildStockForecasts(performance, range);

    expect(batch.byProduct.size).toBe(3);
    expect(batch.byProduct.get("hizli")?.state).toBe("critical");
    expect(batch.byProduct.get("olu")?.state).toBe("noSales");
    expect(batch.byProduct.get("hatali")?.state).toBe("negative");
  });

  it("boş katalogda bile pencere uzunluğunu bildirir", () => {
    // Dipnot ("son X güne göre") ürün olmadan da yazılabilmeli.
    const batch = buildStockForecasts([], { from: "2026-07-21", to: TODAY });

    expect(batch.windowDays).toBe(7);
    expect(batch.byProduct.size).toBe(0);
  });
});
