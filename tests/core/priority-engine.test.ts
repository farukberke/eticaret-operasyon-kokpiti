import { describe, expect, it } from "vitest";

import { eachDay, lira, type Signal } from "@/core/domain";
import {
  createAnalysisContext,
  impactOf,
  severityOf,
} from "@/core/services/analysis-context";
import { buildPriorities, rankSignals, scoreOf } from "@/core/services/priority-engine";

import { TODAY, makeDataset, makeLine, makeOrder, makeProduct } from "./fixtures";

const WEEK = { from: "2026-07-21", to: TODAY };

function signal(overrides: Partial<Signal>): Signal {
  return {
    id: "S:1",
    kind: "risk",
    code: "SELLING_AT_LOSS",
    severity: "high",
    subject: { type: "store", label: "store" },
    moneyAtStake: lira(1000),
    urgency: 5,
    impact: 5,
    evidence: [],
    detectedAt: TODAY,
    ...overrides,
  };
}

describe("impactOf", () => {
  it("eşit oranlı büyümelere eşit puan verir", () => {
    // Logaritmik ölçeğin tanımlayıcı özelliği: her iki adım da "on katına
    // çıktı" demek olduğu için aynı miktarda puan eklemeli.
    const saturation = lira(100_000);
    const small = impactOf(lira(500), saturation);
    const medium = impactOf(lira(5_000), saturation);
    const large = impactOf(lira(50_000), saturation);

    expect(medium - small).toBeCloseTo(large - medium, 3);
  });

  it("tek bir büyük kalemin listeyi ele geçirmesini engeller", () => {
    // Asıl amaç bu: doğrusal ölçekte 100 kat büyük tutar 100 kat puan alırdı
    // ve acil ama küçük işler kokpitte hiç görünmezdi.
    const saturation = lira(100_000);
    const small = impactOf(lira(500), saturation);
    const hundredFold = impactOf(lira(50_000), saturation);

    expect(hundredFold / small).toBeLessThan(3);
  });

  it("tutar arttıkça puan da artar", () => {
    const saturation = lira(100_000);
    const values = [100, 1_000, 10_000, 100_000].map((amount) =>
      impactOf(lira(amount), saturation),
    );

    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]!).toBeGreaterThan(values[i - 1]!);
    }
  });

  it("doyum noktasında 10'a ulaşır ve aşmaz", () => {
    const saturation = lira(100_000);
    expect(impactOf(saturation, saturation)).toBeCloseTo(10, 5);
    expect(impactOf(lira(10_000_000), saturation)).toBe(10);
  });

  it("sıfır tutarda sıfır puan verir", () => {
    expect(impactOf(lira(0), lira(100_000))).toBe(0);
  });
});

describe("severityOf", () => {
  it("aciliyeti şiddet basamaklarına çevirir", () => {
    expect(severityOf(9)).toBe("critical");
    expect(severityOf(7)).toBe("high");
    expect(severityOf(5)).toBe("medium");
    expect(severityOf(2)).toBe("low");
  });
});

describe("rankSignals", () => {
  it("aciliyet × etki skoruna göre sıralar", () => {
    const ranked = rankSignals([
      signal({ id: "orta", urgency: 5, impact: 5 }), // 25
      signal({ id: "yuksek", urgency: 9, impact: 8 }), // 72
      signal({ id: "dusuk", urgency: 2, impact: 3 }), // 6
    ]);

    expect(ranked.map((a) => a.signal.id)).toEqual(["yuksek", "orta", "dusuk"]);
    expect(ranked.map((a) => a.rank)).toEqual([1, 2, 3]);
  });

  it("büyük para tek başına listeyi ele geçiremez", () => {
    // Yarın patlayacak küçük iş, üç ay sonraki büyük fırsatın altında kalmamalı.
    const ranked = rankSignals([
      signal({ id: "acil-kucuk", urgency: 10, impact: 4 }), // 40
      signal({ id: "yavas-buyuk", urgency: 2, impact: 10 }), // 20
    ]);

    expect(ranked[0]!.signal.id).toBe("acil-kucuk");
  });

  it("skor eşitken para tutarına göre ayırır", () => {
    const ranked = rankSignals([
      signal({ id: "az", urgency: 5, impact: 5, moneyAtStake: lira(100) }),
      signal({ id: "cok", urgency: 5, impact: 5, moneyAtStake: lira(9000) }),
    ]);

    expect(ranked[0]!.signal.id).toBe("cok");
  });

  it("her şey eşitken kimliğe göre kararlı sıralar", () => {
    const build = () =>
      rankSignals([
        signal({ id: "b", moneyAtStake: lira(100) }),
        signal({ id: "a", moneyAtStake: lira(100) }),
      ]).map((a) => a.signal.id);

    expect(build()).toEqual(["a", "b"]);
    expect(build()).toEqual(build());
  });

  it("girdi dizisini değiştirmez", () => {
    const input = [
      signal({ id: "x", urgency: 1, impact: 1 }),
      signal({ id: "y", urgency: 9, impact: 9 }),
    ];
    rankSignals(input);
    expect(input.map((s) => s.id)).toEqual(["x", "y"]);
  });

  it("skoru 0–100 aralığında tutar", () => {
    const ranked = rankSignals([signal({ urgency: 10, impact: 10 })]);
    expect(ranked[0]!.score).toBe(100);
    expect(scoreOf(signal({ urgency: 0, impact: 0 }))).toBe(0);
  });
});

describe("buildPriorities", () => {
  const dataset = makeDataset({
    products: [
      makeProduct({ id: "tukenen", name: "Tükenen", stock: 20 }),
      makeProduct({
        id: "zarar",
        name: "Zarar",
        price: lira(100),
        unitCost: lira(95),
        stock: 400,
      }),
      makeProduct({ id: "olu", name: "Ölü", stock: 200, unitCost: lira(90) }),
    ],
    orders: eachDay(WEEK).flatMap((date) => [
      makeOrder({
        id: `t-${date}`,
        date,
        lines: [makeLine({ productId: "tukenen", quantity: 10 })],
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

  const context = createAnalysisContext({ dataset, range: WEEK, today: TODAY });

  it("risk ve fırsatları tek listede birleştirir", () => {
    const priorities = buildPriorities(context);
    const kinds = new Set(priorities.map((p) => p.signal.kind));

    expect(priorities.length).toBeGreaterThan(0);
    expect(kinds.has("risk")).toBe(true);
  });

  it("sıra numaraları 1'den başlayıp kesintisiz gider", () => {
    const priorities = buildPriorities(context);
    expect(priorities.map((p) => p.rank)).toEqual(
      priorities.map((_, index) => index + 1),
    );
  });

  it("skorlar azalan sırada gelir", () => {
    const scores = buildPriorities(context).map((p) => p.score);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);
  });

  it("aynı veriden her zaman aynı listeyi üretir", () => {
    // Sayfa yenilendiğinde listenin karışması paneli oyuncağa çevirirdi.
    const first = buildPriorities(context).map((p) => `${p.rank}:${p.signal.id}`);
    const second = buildPriorities(
      createAnalysisContext({ dataset, range: WEEK, today: TODAY }),
    ).map((p) => `${p.rank}:${p.signal.id}`);

    expect(first).toEqual(second);
  });

  it("her önceliğin gerekçesi vardır", () => {
    // "Neden?" sorusuna cevap veremeyen bir öneri, güven kaybettirir.
    const priorities = buildPriorities(context);
    expect(priorities.every((p) => p.signal.evidence.length > 0)).toBe(true);
  });
});
