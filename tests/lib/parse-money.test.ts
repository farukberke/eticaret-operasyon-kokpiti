import { describe, expect, it } from "vitest";

import { parseMoneyToMinor, parsePercent } from "@/lib/format";

/**
 * Para ayrıştırma — kayan nokta kullanılmadan.
 *
 * `parseFloat("1234.56") * 100` bazı girdilerde 123455.99999999999 verir.
 * Buradaki testler sonucun her zaman tam tamsayı olduğunu garanti eder.
 */
describe("parseMoneyToMinor", () => {
  it("Türkçe biçimi okur", () => {
    expect(parseMoneyToMinor("1.234,56").minor).toBe(123456);
    expect(parseMoneyToMinor("0,05").minor).toBe(5);
    expect(parseMoneyToMinor("12,5").minor).toBe(1250);
  });

  it("İngilizce biçimi okur", () => {
    expect(parseMoneyToMinor("1,234.56").minor).toBe(123456);
    expect(parseMoneyToMinor("1234.56").minor).toBe(123456);
  });

  it("ondalıksız girdiyi okur", () => {
    expect(parseMoneyToMinor("1234").minor).toBe(123400);
    expect(parseMoneyToMinor("0").minor).toBe(0);
  });

  it("binlik ayracını ondalık sanmaz", () => {
    // Bu ayrım olmadan ₺1.234 girişi ₺1,23 olarak kaydedilirdi.
    expect(parseMoneyToMinor("1.234").minor).toBe(123400);
    expect(parseMoneyToMinor("1,234").minor).toBe(123400);
  });

  it("para simgesini ve boşlukları yok sayar", () => {
    expect(parseMoneyToMinor(" ₺1.234,56 ").minor).toBe(123456);
  });

  it("klasik float tuzaklarında tam sonuç verir", () => {
    // parseFloat tabanlı bir uygulama burada 1 kuruş kaydırabilir.
    const cases: readonly (readonly [string, number | null])[] = [
      ["0,1", 10],
      ["0,07", 7],
      /**
       * Belirsiz görünen ama deterministik olan durum: ayraçtan sonra üç
       * basamak varsa binlik ayracıdır. "1,005" = 1005 ₺, 1,005 ₺ değil —
       * zaten üç ondalıklı bir para tutarı yoktur.
       */
      ["1,005", 100500],
      ["8,29", 829],
      ["19,99", 1999],
      ["1234567,89", 123456789],
    ];

    for (const [input, expected] of cases) {
      const result = parseMoneyToMinor(input);
      if (expected === null) {
        expect(result.ok).toBe(false);
      } else {
        expect(result.minor).toBe(expected);
        expect(Number.isInteger(result.minor)).toBe(true);
      }
    }
  });

  it("geçersiz girdiyi reddeder", () => {
    expect(parseMoneyToMinor("").error).toBe("empty");
    expect(parseMoneyToMinor("abc").ok).toBe(false);
    expect(parseMoneyToMinor("-5").error).toBe("negative");
    expect(parseMoneyToMinor("1,2345").ok).toBe(false);
  });
});

describe("parsePercent", () => {
  it("yüzde işaretiyle ve işaretsiz okur", () => {
    expect(parsePercent("%15").value).toBe(15);
    expect(parsePercent("15").value).toBe(15);
    expect(parsePercent("15,5").value).toBe(15.5);
  });

  it("aralık dışını reddeder", () => {
    expect(parsePercent("-1").ok).toBe(false);
    expect(parsePercent("101").ok).toBe(false);
    expect(parsePercent("").ok).toBe(false);
  });
});
