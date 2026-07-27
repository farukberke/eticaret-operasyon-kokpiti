import { describe, expect, it } from "vitest";

import { todayIn } from "@/core/domain";
import { overdueDaysOf, timeGroupOf } from "@/core/services/queue-groups";
import { DEFAULT_RULES } from "@/core/services/rules.config";

const TODAY = "2026-07-27";
const HORIZON = DEFAULT_RULES.inventory.decisionHorizonDays;

const groupOf = (deadline: string | undefined) => timeGroupOf(deadline, TODAY, HORIZON);

describe("Zaman grupları", () => {
  it("son karar tarihi bugün olan iş → Bugün", () => {
    expect(groupOf(TODAY)).toBe("today");
  });

  it("son karar tarihi geçmiş iş → Bugün (gizlenmez)", () => {
    // Gecikmiş bir işi ayrı bir kutuya koymak, görmezden gelmeyi kolaylaştırırdı.
    expect(groupOf("2026-07-24")).toBe("today");
    expect(groupOf("2026-06-01")).toBe("today");
  });

  it("3 gün sonrası → Bu hafta", () => {
    expect(groupOf("2026-07-30")).toBe("week");
  });

  it("10 gün sonrası → Takipte", () => {
    expect(groupOf("2026-08-06")).toBe("later");
  });

  it("son karar tarihi olmayan iş → Takipte", () => {
    expect(groupOf(undefined)).toBe("later");
  });

  it("ufkun tam sınırı Bu hafta'ya dahildir", () => {
    // 7 gün sonrası dahil, 8 gün sonrası hariç.
    expect(groupOf("2026-08-03")).toBe("week");
    expect(groupOf("2026-08-04")).toBe("later");
  });

  it("ay sınırını aşan tarihlerde doğru karar verir", () => {
    // Metin karşılaştırması "2026-08-01" > "2026-07-27" olarak çalışır.
    expect(timeGroupOf("2026-08-01", "2026-07-30", 7)).toBe("week");
    expect(timeGroupOf("2026-07-30", "2026-08-01", 7)).toBe("today");
  });
});

describe("Gecikme süresi", () => {
  it("gecikme yoksa sıfır döner", () => {
    expect(overdueDaysOf(TODAY, TODAY)).toBe(0);
    expect(overdueDaysOf("2026-07-30", TODAY)).toBe(0);
    expect(overdueDaysOf(undefined, TODAY)).toBe(0);
  });

  it("geçen gün sayısını verir", () => {
    expect(overdueDaysOf("2026-07-26", TODAY)).toBe(1);
    expect(overdueDaysOf("2026-07-20", TODAY)).toBe(7);
  });

  it("ay sınırını aşan gecikmeyi doğru sayar", () => {
    expect(overdueDaysOf("2026-06-28", "2026-07-01")).toBe(3);
  });
});

describe("Saat dilimi", () => {
  /**
   * Sunucu UTC'de çalışıyor. Bu testler olmadan, İstanbul'da gece yarısıyla
   * 03:00 arasındaki her istekte "bugün" bir gün geri kayar ve son karar
   * tarihi bugün olan bir iş "yarın" grubuna düşerdi.
   */
  it("UTC'de gün henüz dönmemişken İstanbul'da dönmüş olabilir", () => {
    // 26 Temmuz 22:30 UTC = 27 Temmuz 01:30 İstanbul
    const instant = new Date("2026-07-26T22:30:00.000Z");

    expect(todayIn("Europe/Istanbul", instant)).toBe("2026-07-27");
    expect(todayIn("UTC", instant)).toBe("2026-07-26");
  });

  it("gün ortasında iki saat dilimi de aynı günü verir", () => {
    const instant = new Date("2026-07-27T12:00:00.000Z");

    expect(todayIn("Europe/Istanbul", instant)).toBe("2026-07-27");
    expect(todayIn("UTC", instant)).toBe("2026-07-27");
  });

  it("ay sınırında da doğru çalışır", () => {
    // 31 Temmuz 21:30 UTC = 1 Ağustos 00:30 İstanbul
    const instant = new Date("2026-07-31T21:30:00.000Z");
    expect(todayIn("Europe/Istanbul", instant)).toBe("2026-08-01");
  });

  it("her zaman YYYY-MM-DD biçiminde döner", () => {
    const instant = new Date("2026-01-05T09:00:00.000Z");
    expect(todayIn("Europe/Istanbul", instant)).toBe("2026-01-05");
  });
});
