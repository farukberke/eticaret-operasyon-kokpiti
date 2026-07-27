import { describe, expect, it } from "vitest";

import {
  isClosedOn,
  isDone,
  isOpenOn,
  isSnoozedOn,
  matchesFilter,
  type TaskState,
} from "@/core/domain";

const TODAY = "2026-07-27";

const task = (overrides: Partial<TaskState> = {}): TaskState => ({
  signalId: "STOCKOUT_IMMINENT:p1",
  status: "open",
  updatedAt: TODAY,
  ...overrides,
});

describe("Görev görünürlüğü", () => {
  it("hiç dokunulmamış sinyal kuyrukta görünür", () => {
    // Kayıt yoksa görev açıktır — her yeni sinyal kendiliğinden kuyruğa girer.
    expect(isOpenOn(undefined, TODAY)).toBe(true);
  });

  it("tamamlanan iş kuyruktan çıkar", () => {
    const done = task({ status: "done" });
    expect(isOpenOn(done, TODAY)).toBe(false);
    expect(isDone(done)).toBe(true);
  });

  it("ertelenen iş süresi dolana kadar görünmez", () => {
    const snoozed = task({ status: "snoozed", snoozedUntil: "2026-07-30" });
    expect(isOpenOn(snoozed, TODAY)).toBe(false);
    expect(isSnoozedOn(snoozed, TODAY)).toBe(true);
  });

  it("erteleme günü gelince kuyruğa geri döner", () => {
    // Süre dolması için zamanlanmış bir işe gerek yok: görünürlük okuma
    // anında hesaplanır, tarih geçince görev kendiliğinden açılır.
    const snoozed = task({ status: "snoozed", snoozedUntil: TODAY });

    expect(isOpenOn(snoozed, TODAY)).toBe(true);
    expect(isSnoozedOn(snoozed, TODAY)).toBe(false);
  });

  it("erteleme günü geçmişse de kuyrukta olur", () => {
    const stale = task({ status: "snoozed", snoozedUntil: "2026-07-20" });
    expect(isOpenOn(stale, TODAY)).toBe(true);
  });

  it("ay sınırını aşan ertelemede doğru karşılaştırır", () => {
    // Tarih metinleri sıralanabilir; "2026-08-01" > "2026-07-27".
    const nextMonth = task({ status: "snoozed", snoozedUntil: "2026-08-01" });
    expect(isOpenOn(nextMonth, TODAY)).toBe(false);
    expect(isOpenOn(nextMonth, "2026-08-01")).toBe(true);
  });
});

describe("isClosedOn", () => {
  /**
   * Regresyon koruması. Arayüz bir kez `status !== "open"` diye kontrol etti
   * ve süresi dolmuş ertelemeyi "kapalı" sandı: iş kuyruğa dönmüştü ama
   * kartta yalnızca "Geri al" düğmesi vardı, kullanıcı işi kapatamıyordu.
   */
  it("süresi dolmuş ertelemeyi kapalı saymaz", () => {
    const expired = task({ status: "snoozed", snoozedUntil: "2026-07-26" });
    expect(isClosedOn(expired, TODAY)).toBe(false);
  });

  it("süresi dolmamış erteleme ve tamamlananlar kapalıdır", () => {
    expect(
      isClosedOn(task({ status: "snoozed", snoozedUntil: "2026-07-30" }), TODAY),
    ).toBe(true);
    expect(isClosedOn(task({ status: "done" }), TODAY)).toBe(true);
  });

  it("kaydı olmayan sinyal kapalı değildir", () => {
    expect(isClosedOn(undefined, TODAY)).toBe(false);
  });
});

describe("Filtreler", () => {
  const open = task();
  const done = task({ status: "done" });
  const snoozed = task({ status: "snoozed", snoozedUntil: "2026-07-30" });
  const expired = task({ status: "snoozed", snoozedUntil: "2026-07-25" });

  it("açık filtresi tamamlanan ve süresi dolmamış ertelenenleri gizler", () => {
    expect(matchesFilter(open, "open", TODAY)).toBe(true);
    expect(matchesFilter(undefined, "open", TODAY)).toBe(true);
    expect(matchesFilter(expired, "open", TODAY)).toBe(true);

    expect(matchesFilter(done, "open", TODAY)).toBe(false);
    expect(matchesFilter(snoozed, "open", TODAY)).toBe(false);
  });

  it("ertelenen filtresi yalnızca süresi dolmamışları gösterir", () => {
    expect(matchesFilter(snoozed, "snoozed", TODAY)).toBe(true);
    expect(matchesFilter(expired, "snoozed", TODAY)).toBe(false);
    expect(matchesFilter(done, "snoozed", TODAY)).toBe(false);
  });

  it("tamamlanan filtresi yalnızca yapılanları gösterir", () => {
    expect(matchesFilter(done, "done", TODAY)).toBe(true);
    expect(matchesFilter(open, "done", TODAY)).toBe(false);
    expect(matchesFilter(snoozed, "done", TODAY)).toBe(false);
  });

  it("her görev tam olarak bir filtreye düşer", () => {
    // Bir işin iki sekmede birden görünmesi ya da hiçbirinde görünmemesi,
    // kullanıcının kuyruğa olan güvenini bitirir.
    for (const state of [undefined, open, done, snoozed, expired]) {
      const matches = (["open", "snoozed", "done"] as const).filter((filter) =>
        matchesFilter(state, filter, TODAY),
      );
      expect(matches).toHaveLength(1);
    }
  });
});
