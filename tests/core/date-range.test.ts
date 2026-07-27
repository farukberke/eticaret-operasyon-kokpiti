import { describe, expect, it } from "vitest";

import {
  addDays,
  daysInRange,
  eachDay,
  isWithin,
  lastDays,
  previousPeriod,
  toIsoDate,
} from "@/core/domain";

describe("Tarih aralığı", () => {
  it("gün anahtarını saat diliminden bağımsız üretir", () => {
    // Sunucu hangi saat diliminde olursa olsun aynı gün anahtarı çıkmalı.
    expect(toIsoDate(new Date("2026-07-27T23:30:00.000Z"))).toBe("2026-07-27");
    expect(toIsoDate(new Date("2026-07-27T00:00:00.000Z"))).toBe("2026-07-27");
  });

  it("ay ve yıl sınırlarını doğru aşar", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("artık yılı bilir", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("gün sayısını kapsayıcı hesaplar", () => {
    // Tek günlük aralık 1 gündür, 0 değil.
    expect(daysInRange({ from: "2026-07-27", to: "2026-07-27" })).toBe(1);
    expect(daysInRange({ from: "2026-07-01", to: "2026-07-07" })).toBe(7);
  });

  it("lastDays bugünü dahil eder", () => {
    expect(lastDays("2026-07-27", 7)).toEqual({
      from: "2026-07-21",
      to: "2026-07-27",
    });
  });

  it("önceki dönem aynı uzunlukta ve bitişiktir", () => {
    const range = { from: "2026-07-21", to: "2026-07-27" };
    const previous = previousPeriod(range);

    expect(previous).toEqual({ from: "2026-07-14", to: "2026-07-20" });
    expect(daysInRange(previous)).toBe(daysInRange(range));
    // Araya boşluk girmemeli: karşılaştırma kayarsa trendler yalan söyler.
    expect(addDays(previous.to, 1)).toBe(range.from);
  });

  it("eachDay tüm günleri sırayla üretir", () => {
    const days = eachDay({ from: "2026-02-27", to: "2026-03-02" });
    expect(days).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
  });

  it("isWithin sınırları dahil eder", () => {
    const range = { from: "2026-07-01", to: "2026-07-31" };
    expect(isWithin("2026-07-01", range)).toBe(true);
    expect(isWithin("2026-07-31", range)).toBe(true);
    expect(isWithin("2026-06-30", range)).toBe(false);
    expect(isWithin("2026-08-01", range)).toBe(false);
  });
});
