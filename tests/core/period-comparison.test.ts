import { describe, expect, it } from "vitest";

import {
  ZERO_MONEY,
  addDays,
  daysInRange,
  isWithin,
  lira,
  money,
  type DateRange,
  type Money,
  type ProfitSummary,
  type SalesSummary,
  type Signal,
} from "@/core/domain";
import {
  buildPeriodComparison,
  comparisonRangeOf,
  compareMoneyPeriods,
  compareRatioPeriods,
  signalsAtStake,
} from "@/core/services/period-comparison";
import {
  resolveAnalysisWindow,
  type AnalysisPreset,
} from "@/core/services/analysis-window";

/**
 * ÖNCEKİ DÖNEM KARŞILAŞTIRMASI.
 *
 * İki ayrı sözleşme test ediliyor:
 *
 * 1. **Pencere** — önceki dönem hangi günleri kapsar. Buradaki tek hata bile
 *    ("bir gün kaydı", "bir gün eksik") tüm yüzdeleri sessizce yanlış yapar.
 * 2. **Matematik** — yüzde değişimin ne zaman hesaplanamayacağı. Panel
 *    "%Infinity arttı" yazarsa kullanıcının bir daha hiçbir sayıya güvenmesi
 *    için sebebi kalmaz.
 */

const HAS_DATA = { previousHasData: true } as const;
const NO_DATA = { previousHasData: false } as const;

// ---------------------------------------------------------------------------
// Karşılaştırma penceresi
// ---------------------------------------------------------------------------

describe("Karşılaştırma penceresi", () => {
  it("tek günlük aralığın öncesi bir önceki gündür", () => {
    expect(comparisonRangeOf({ from: "2026-07-28", to: "2026-07-28" })).toEqual({
      from: "2026-07-27",
      to: "2026-07-27",
    });
  });

  it("7, 30 ve 90 günlük aralıklarda aynı gün sayısını korur", () => {
    const presets = ["last7", "last30", "last90"] satisfies AnalysisPreset[];

    for (const preset of presets) {
      const { range } = resolveAnalysisWindow({ preset }, "2026-07-28");
      const previous = comparisonRangeOf(range);

      expect(daysInRange(previous), preset).toBe(daysInRange(range));
      // Bitişik: araya boşluk girerse kıyaslanan günler kayar.
      expect(addDays(previous.to, 1), preset).toBe(range.from);
    }
  });

  it("ay sınırını geriye aşar", () => {
    // 1 – 28 Tem (28 gün) → 3 – 30 Haz
    expect(comparisonRangeOf({ from: "2026-07-01", to: "2026-07-28" })).toEqual({
      from: "2026-06-03",
      to: "2026-06-30",
    });
  });

  it("yıl sınırını geriye aşar", () => {
    // Ocak 31 gün; önceki dönem de 31 gün ve 31 Aralık'ta biter.
    expect(comparisonRangeOf({ from: "2026-01-01", to: "2026-01-31" })).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("artık yılın şubatını atlarken gün kaybetmez", () => {
    // 1 – 31 Mart 2028 (31 gün) → 30 Oca – 29 Şub 2028. Şubat 29 çekiyor.
    const range = { from: "2028-03-01", to: "2028-03-31" };
    const previous = comparisonRangeOf(range);

    expect(previous).toEqual({ from: "2028-01-30", to: "2028-02-29" });
    expect(daysInRange(previous)).toBe(daysInRange(range));
  });

  it("özel aralık da aynı sözleşmeye uyar — 10 günün öncesi 10 gündür", () => {
    const { range } = resolveAnalysisWindow(
      { preset: "custom", from: "2026-07-10", to: "2026-07-19" },
      "2026-07-28",
    );
    const previous = comparisonRangeOf(range);

    expect(daysInRange(range)).toBe(10);
    expect(previous).toEqual({ from: "2026-06-30", to: "2026-07-09" });
  });

  it("iki dönem hiçbir günü paylaşmaz", () => {
    // Çakışma olsaydı aynı sipariş her iki tarafta da sayılır ve değişim
    // olduğundan küçük görünürdü.
    for (const preset of [
      "last7",
      "last30",
      "last90",
      "thisMonth",
      "lastMonth",
    ] as const) {
      const { range } = resolveAnalysisWindow({ preset }, "2026-07-28");
      const previous = comparisonRangeOf(range);

      expect(isWithin(previous.to, range), preset).toBe(false);
      expect(isWithin(range.from, previous), preset).toBe(false);
      expect(previous.to < range.from, preset).toBe(true);
    }
  });

  it("her preset için gün sayısı birebir eşittir", () => {
    for (const preset of [
      "last7",
      "last30",
      "last90",
      "thisMonth",
      "lastMonth",
    ] as const) {
      const { range } = resolveAnalysisWindow({ preset }, "2026-07-28");
      expect(daysInRange(comparisonRangeOf(range)), preset).toBe(daysInRange(range));
    }
  });
});

// ---------------------------------------------------------------------------
// Para karşılaştırması
// ---------------------------------------------------------------------------

describe("Para karşılaştırması", () => {
  it("artışta yön yukarı, mutlak fark ve oran doğrudur", () => {
    const delta = compareMoneyPeriods(lira(1200), lira(1000), HAS_DATA);

    expect(delta.direction).toBe("up");
    expect(delta.absolute).toEqual(lira(200));
    expect(delta.deltaRatio).toBeCloseTo(0.2, 10);
    expect(delta.basis).toBe("comparable");
  });

  it("azalışta yön aşağı ve fark negatiftir", () => {
    const delta = compareMoneyPeriods(lira(800), lira(1000), HAS_DATA);

    expect(delta.direction).toBe("down");
    expect(delta.absolute).toEqual(lira(-200));
    expect(delta.deltaRatio).toBeCloseTo(-0.2, 10);
  });

  it("eşit tutarlarda 'değişim yok' der", () => {
    const delta = compareMoneyPeriods(lira(1000), lira(1000), HAS_DATA);

    expect(delta.direction).toBe("flat");
    expect(delta.absolute).toEqual(ZERO_MONEY);
    expect(delta.deltaRatio).toBe(0);
  });

  it("tek kuruşluk fark bile yuvarlanıp yok sayılmaz", () => {
    // Para tamsayı: eşitlik tam eşitliktir, 'yaklaşık aynı' diye bir şey yok.
    const delta = compareMoneyPeriods(money(100_001), money(100_000), HAS_DATA);

    expect(delta.direction).toBe("up");
    expect(delta.absolute.minor).toBe(1);
  });

  it("önceki dönem 0 iken yüzde uydurmaz", () => {
    const delta = compareMoneyPeriods(lira(500), ZERO_MONEY, HAS_DATA);

    expect(delta.deltaRatio).toBeNull();
    expect(delta.basis).toBe("zeroBaseline");
    // Mutlak fark hâlâ anlamlı: sıfırdan ₺500'e çıkmış.
    expect(delta.absolute).toEqual(lira(500));
    expect(delta.direction).toBe("up");
  });

  it("iki değer de 0 ise 'değişim yok' — 'hesaplanamaz' değil", () => {
    const delta = compareMoneyPeriods(ZERO_MONEY, ZERO_MONEY, HAS_DATA);

    expect(delta.basis).toBe("comparable");
    expect(delta.deltaRatio).toBe(0);
    expect(delta.direction).toBe("flat");
  });

  it("önceki dönemde veri yokken 'yeni' der, oran vermez", () => {
    const delta = compareMoneyPeriods(lira(500), ZERO_MONEY, NO_DATA);

    expect(delta.basis).toBe("newBaseline");
    expect(delta.deltaRatio).toBeNull();
  });

  it("iki dönemde de veri yoksa 'önceki dönemde veri yok' der", () => {
    const delta = compareMoneyPeriods(ZERO_MONEY, ZERO_MONEY, NO_DATA);

    expect(delta.basis).toBe("noPreviousData");
    expect(delta.deltaRatio).toBeNull();
    expect(delta.direction).toBe("flat");
  });

  it("negatif tabanda iyileşmeyi düşüş gibi göstermez", () => {
    /**
     * −₺10.000'den −₺5.000'e çıkmak iyileşmedir. Ham `(c − p) / p` burada
     * −%50 verir ve zararın yarıya inmesini "yarı yarıya kötüleşti" diye
     * okutur. Payda mutlak değer olduğu için işaret mutlak farkla aynı kalır.
     */
    const delta = compareMoneyPeriods(lira(-5000), lira(-10_000), HAS_DATA);

    expect(delta.direction).toBe("up");
    expect(delta.absolute).toEqual(lira(5000));
    expect(delta.deltaRatio).toBeCloseTo(0.5, 10);
  });

  it("kârdan zarara geçişte yön aşağıdır", () => {
    const delta = compareMoneyPeriods(lira(-2000), lira(3000), HAS_DATA);

    expect(delta.direction).toBe("down");
    expect(delta.absolute).toEqual(lira(-5000));
    expect(delta.deltaRatio).toBeCloseTo(-5 / 3, 10);
  });

  it("hiçbir girdi kombinasyonunda NaN ya da Infinity üretmez", () => {
    const values = [lira(-1000), ZERO_MONEY, lira(1), lira(1000), money(1)];

    for (const current of values) {
      for (const previous of values) {
        for (const options of [HAS_DATA, NO_DATA]) {
          const delta = compareMoneyPeriods(current, previous, options);
          const label = `${current.minor}/${previous.minor}/${options.previousHasData}`;

          expect(Number.isFinite(delta.absolute.minor), label).toBe(true);
          if (delta.deltaRatio !== null) {
            expect(Number.isFinite(delta.deltaRatio), label).toBe(true);
          } else {
            expect(delta.basis, label).not.toBe("comparable");
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Marj (oran) karşılaştırması
// ---------------------------------------------------------------------------

describe("Marj karşılaştırması", () => {
  it("farkı puan cinsinden verir, yüzdenin yüzdesini değil", () => {
    const delta = compareRatioPeriods(0.18, 0.22, HAS_DATA);

    expect(delta.absolute).toBeCloseTo(-0.04, 10);
    expect(delta.direction).toBe("down");
    // Oranın oranı bilinçli olarak yok: "%18 düştü" başka bir sayıdır.
    expect(delta.deltaRatio).toBeNull();
  });

  it("marj artışını yukarı sayar", () => {
    const delta = compareRatioPeriods(0.25, 0.2, HAS_DATA);

    expect(delta.direction).toBe("up");
    expect(delta.absolute).toBeCloseTo(0.05, 10);
  });

  it("ekranda görünmeyecek kadar küçük farkı 'değişmedi' sayar", () => {
    // 0,01 puan tek ondalıkla "+0,0 puan" yazılır; yanına ok koymak yanıltır.
    const delta = compareRatioPeriods(0.2201, 0.22, HAS_DATA);
    expect(delta.direction).toBe("flat");
  });

  it("marj hesaplanamıyorsa fark da hesaplanamaz", () => {
    // Ciro sıfırken marj `null`; "tanımsızdan tanımsıza kaç puan" sorusu yok.
    expect(compareRatioPeriods(null, 0.2, HAS_DATA).absolute).toBeNull();
    expect(compareRatioPeriods(0.2, null, HAS_DATA).absolute).toBeNull();
    expect(compareRatioPeriods(0.2, null, HAS_DATA).basis).toBe("zeroBaseline");
  });

  it("önceki dönemde veri yokken 'yeni' der", () => {
    expect(compareRatioPeriods(0.2, null, NO_DATA).basis).toBe("newBaseline");
    expect(compareRatioPeriods(null, null, NO_DATA).basis).toBe("noPreviousData");
  });

  it("negatif marjı da tutarlı okur", () => {
    const delta = compareRatioPeriods(-0.05, -0.15, HAS_DATA);

    expect(delta.direction).toBe("up");
    expect(delta.absolute).toBeCloseTo(0.1, 10);
  });

  it("sonsuz ya da NaN girdiyi hesaba almaz", () => {
    for (const value of [Infinity, -Infinity, NaN]) {
      expect(compareRatioPeriods(value, 0.2, HAS_DATA).absolute).toBeNull();
      expect(compareRatioPeriods(0.2, value, HAS_DATA).absolute).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Sinyal toplamı ve kokpit karşılaştırması
// ---------------------------------------------------------------------------

function makeSignal(minor: number, id = `s${minor}`): Signal {
  return {
    id,
    kind: "risk",
    code: "MARGIN_EROSION",
    severity: "medium",
    subject: { type: "store", label: "Mağaza" },
    moneyAtStake: money(minor),
    urgency: 5,
    impact: 5,
    evidence: [],
    detectedAt: "2026-07-28",
  };
}

function makeSales(spec: {
  netRevenue: Money;
  previousRevenue: Money;
  orderCount: number;
  previousOrders: number;
}): SalesSummary {
  return {
    range: { from: "2026-07-22", to: "2026-07-28" },
    grossRevenue: spec.netRevenue,
    netRevenue: spec.netRevenue,
    orderCount: spec.orderCount,
    unitsSold: spec.orderCount,
    averageOrderValue: ZERO_MONEY,
    revenueTrend: {
      current: spec.netRevenue,
      previous: spec.previousRevenue,
      deltaRatio: null,
      direction: "flat",
    },
    orderTrend: {
      current: spec.orderCount,
      previous: spec.previousOrders,
      deltaRatio: null,
      direction: "flat",
    },
    daily: [],
  };
}

function makeProfit(spec: {
  netProfit: Money;
  previousProfit: Money;
  marginRatio: number | null;
}): ProfitSummary {
  return {
    range: { from: "2026-07-22", to: "2026-07-28" },
    grossRevenue: ZERO_MONEY,
    discounts: ZERO_MONEY,
    refunds: ZERO_MONEY,
    netRevenue: ZERO_MONEY,
    cogs: ZERO_MONEY,
    commission: ZERO_MONEY,
    shipping: ZERO_MONEY,
    packaging: ZERO_MONEY,
    adSpend: ZERO_MONEY,
    netProfit: spec.netProfit,
    marginRatio: spec.marginRatio,
    coverage: { productsMeasured: 1, productsMissing: 0, revenueExcluded: ZERO_MONEY },
    profitTrend: {
      current: spec.netProfit,
      previous: spec.previousProfit,
      deltaRatio: null,
      direction: "flat",
    },
    marginDeltaPoints: null,
    daily: [],
  };
}

const RANGE: DateRange = { from: "2026-07-22", to: "2026-07-28" };

function comparisonFor(spec: {
  netProfit?: Money;
  previousProfit?: Money;
  netRevenue?: Money;
  previousRevenue?: Money;
  marginRatio?: number | null;
  orderCount?: number;
  previousOrders?: number;
  risks?: readonly Signal[];
  previousRisks?: readonly Signal[];
  opportunities?: readonly Signal[];
  previousOpportunities?: readonly Signal[];
}) {
  return buildPeriodComparison({
    range: RANGE,
    sales: makeSales({
      netRevenue: spec.netRevenue ?? lira(10_000),
      previousRevenue: spec.previousRevenue ?? lira(8000),
      orderCount: spec.orderCount ?? 40,
      previousOrders: spec.previousOrders ?? 30,
    }),
    profit: makeProfit({
      netProfit: spec.netProfit ?? lira(2000),
      previousProfit: spec.previousProfit ?? lira(1600),
      marginRatio: spec.marginRatio === undefined ? 0.2 : spec.marginRatio,
    }),
    risks: spec.risks ?? [],
    opportunities: spec.opportunities ?? [],
    previousRisks: spec.previousRisks ?? [],
    previousOpportunities: spec.previousOpportunities ?? [],
  });
}

describe("Sinyal toplamı", () => {
  it("boş listede sıfır döner", () => {
    expect(signalsAtStake([])).toEqual(ZERO_MONEY);
  });

  it("masadaki paraları toplar", () => {
    expect(signalsAtStake([makeSignal(1000), makeSignal(2500)])).toEqual(money(3500));
  });
});

describe("Kokpit karşılaştırması", () => {
  it("karşılaştırma penceresini seçili aralıktan türetir", () => {
    const comparison = comparisonFor({});

    expect(comparison.range).toEqual(RANGE);
    expect(comparison.previousRange).toEqual(comparisonRangeOf(RANGE));
    expect(daysInRange(comparison.previousRange)).toBe(daysInRange(RANGE));
  });

  it("net kâr artışını özetteki trend değerinden okur — yeniden hesaplamaz", () => {
    const comparison = comparisonFor({
      netProfit: lira(2000),
      previousProfit: lira(1600),
    });

    expect(comparison.netProfit.previous).toEqual(lira(1600));
    expect(comparison.netProfit.direction).toBe("up");
    expect(comparison.netProfit.absolute).toEqual(lira(400));
    expect(comparison.netProfit.deltaRatio).toBeCloseTo(0.25, 10);
  });

  it("önceki marjı önceki kâr ve cirodan kurar", () => {
    // Önceki dönem: ₺1.600 kâr / ₺8.000 ciro = %20. Mevcut marj %25 → +5 puan.
    const comparison = comparisonFor({
      marginRatio: 0.25,
      previousProfit: lira(1600),
      previousRevenue: lira(8000),
    });

    expect(comparison.margin.previous).toBeCloseTo(0.2, 10);
    expect(comparison.margin.absolute).toBeCloseTo(0.05, 10);
    expect(comparison.margin.direction).toBe("up");
  });

  it("risk toplamının artışı da azalışı da yön olarak doğru okunur", () => {
    // Yönün *anlamı* (kötü) görünüm katmanının işi; çekirdek yalnızca yönü söyler.
    const up = comparisonFor({
      risks: [makeSignal(5000)],
      previousRisks: [makeSignal(2000)],
    });
    expect(up.risk.direction).toBe("up");
    expect(up.risk.absolute).toEqual(money(3000));

    const down = comparisonFor({
      risks: [makeSignal(2000)],
      previousRisks: [makeSignal(5000)],
    });
    expect(down.risk.direction).toBe("down");
  });

  it("fırsat toplamını da aynı sözleşmeyle karşılaştırır", () => {
    const comparison = comparisonFor({
      opportunities: [makeSignal(4000), makeSignal(1000)],
      previousOpportunities: [makeSignal(5000)],
    });

    expect(comparison.opportunity.current).toEqual(money(5000));
    expect(comparison.opportunity.direction).toBe("flat");
  });

  it("yalnızca önceki dönemde veri yoksa mevcut değer yine taşınır", () => {
    const comparison = comparisonFor({
      previousOrders: 0,
      previousProfit: ZERO_MONEY,
      previousRevenue: ZERO_MONEY,
      netProfit: lira(2000),
      risks: [makeSignal(5000)],
    });

    expect(comparison.hasPreviousData).toBe(false);
    expect(comparison.hasCurrentData).toBe(true);
    // Değer duruyor; yalnızca karşılaştırma "yeni" diyor.
    expect(comparison.netProfit.current).toEqual(lira(2000));
    expect(comparison.netProfit.basis).toBe("newBaseline");
    expect(comparison.netProfit.deltaRatio).toBeNull();
    expect(comparison.risk.basis).toBe("newBaseline");
    expect(comparison.margin.basis).toBe("newBaseline");
  });

  it("yalnızca mevcut dönemde veri yoksa düşüş olarak okunur", () => {
    const comparison = comparisonFor({
      orderCount: 0,
      netProfit: ZERO_MONEY,
      netRevenue: ZERO_MONEY,
      marginRatio: null,
      previousProfit: lira(1600),
      previousRevenue: lira(8000),
      risks: [],
      previousRisks: [makeSignal(5000)],
    });

    expect(comparison.hasCurrentData).toBe(false);
    expect(comparison.netProfit.direction).toBe("down");
    expect(comparison.netProfit.deltaRatio).toBeCloseTo(-1, 10);
    expect(comparison.risk.direction).toBe("down");
    // Marj tanımsız: puan farkı uydurulmuyor.
    expect(comparison.margin.absolute).toBeNull();
    expect(comparison.margin.basis).toBe("zeroBaseline");
  });

  it("iki dönemde de sipariş yoksa hiçbir oran üretmez", () => {
    const comparison = comparisonFor({
      orderCount: 0,
      previousOrders: 0,
      netProfit: ZERO_MONEY,
      previousProfit: ZERO_MONEY,
      netRevenue: ZERO_MONEY,
      previousRevenue: ZERO_MONEY,
      marginRatio: null,
    });

    expect(comparison.hasCurrentData).toBe(false);
    expect(comparison.hasPreviousData).toBe(false);
    for (const delta of [
      comparison.netProfit,
      comparison.netRevenue,
      comparison.risk,
      comparison.opportunity,
      comparison.margin,
    ]) {
      expect(delta.deltaRatio).toBeNull();
      expect(delta.basis).toBe("noPreviousData");
    }
  });
});
