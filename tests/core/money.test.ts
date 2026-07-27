import { describe, expect, it } from "vitest";

import {
  addMoney,
  allocateMoney,
  lira,
  money,
  moneyRatio,
  multiplyMoney,
  sumMoney,
  toMajor,
} from "@/core/domain";

describe("Money", () => {
  it("lira ile kuruşa çevirir", () => {
    expect(lira(12.5).minor).toBe(1250);
    expect(toMajor(money(1250))).toBe(12.5);
  });

  it("float birikimi yaşamaz", () => {
    // Klasik tuzak: 0.1 + 0.2 !== 0.3
    const total = sumMoney([lira(0.1), lira(0.2)]);
    expect(total.minor).toBe(30);
    expect(toMajor(total)).toBe(0.3);
  });

  it("farklı para birimlerini toplamayı reddeder", () => {
    const tl = money(100, "TRY");
    const foreign = { minor: 100, currency: "USD" } as unknown as typeof tl;
    expect(() => addMoney(tl, foreign)).toThrow(/para birimleri/i);
  });

  it("çarpımı en yakın kuruşa yuvarlar", () => {
    expect(multiplyMoney(money(333), 1 / 3).minor).toBe(111);
    expect(multiplyMoney(money(100), 0.335).minor).toBe(34);
  });

  it("payda sıfırken oran yerine null döner", () => {
    // "0 ciroda %0 marj" yanıltıcı olurdu; hesaplanamaz demek doğrusu.
    expect(moneyRatio(lira(50), lira(0))).toBeNull();
    expect(moneyRatio(lira(50), lira(200))).toBe(0.25);
  });
});

describe("allocateMoney", () => {
  it("dağıtılan payların toplamı her zaman orijinal tutarı verir", () => {
    const total = lira(10);
    const parts = allocateMoney(total, [10000, 20000]);

    expect(parts.map((p) => p.minor)).toEqual([333, 667]);
    expect(sumMoney(parts).minor).toBe(total.minor);
  });

  it("bölünemeyen tutarlarda bile kuruş kaybetmez", () => {
    // 1 kuruşu 3'e bölmek: naif yaklaşım 0+0+0 verir ve 1 kuruş buharlaşır.
    const parts = allocateMoney(money(1), [1, 1, 1]);
    expect(sumMoney(parts).minor).toBe(1);
  });

  it("çok sayıda eşit ağırlıkta artığı dengeli dağıtır", () => {
    const total = money(1000);
    const parts = allocateMoney(
      total,
      Array.from({ length: 7 }, () => 1),
    );
    expect(sumMoney(parts).minor).toBe(1000);
    // 1000/7 = 142.857 → altı tane 143, bir tane 142 beklenir.
    expect(parts.filter((p) => p.minor === 143)).toHaveLength(6);
    expect(parts.filter((p) => p.minor === 142)).toHaveLength(1);
  });

  it("ağırlık toplamı sıfırken sıfır paylar döner", () => {
    const parts = allocateMoney(lira(5), [0, 0]);
    expect(parts.every((p) => p.minor === 0)).toBe(true);
  });

  it("aynı girdi için her zaman aynı çıktıyı verir", () => {
    const weights = [7, 11, 13, 17];
    const first = allocateMoney(money(997), weights);
    const second = allocateMoney(money(997), weights);
    expect(first).toEqual(second);
  });
});
