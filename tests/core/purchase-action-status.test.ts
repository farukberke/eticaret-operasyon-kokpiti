import { describe, expect, it } from "vitest";

import { isVisibleByDefault, type PurchaseActionStatusRecord } from "@/core/domain";
import {
  statusOf,
  summarizePurchaseActionStatuses,
  withStatus,
} from "@/core/services/purchase-action-status";

/**
 * SATIN ALMA EYLEMİ DURUMU — saf okuma/yazma/özetleme.
 *
 * `withStatus` her zaman **yeni** bir harita döner; `states` parametresi
 * hiçbir testte mutasyona uğramamalı. `statusOf` bilinmeyen/kayıtsız ürünler
 * için her zaman `pending`e düşmeli — bu, satın alma planındaki hiçbir
 * satırın "durumu okunamadı" diye kaybolmamasının garantisi.
 */

const EMPTY: ReadonlyMap<string, PurchaseActionStatusRecord> = new Map();
const TODAY = "2026-07-29";

describe("statusOf", () => {
  it("kayıt yoksa varsayılan pending döner", () => {
    expect(statusOf(EMPTY, "p1")).toBe("pending");
  });

  it("bilinmeyen ürün için de pending döner (güvenli fallback)", () => {
    const states = withStatus(EMPTY, "p1", "done", TODAY);
    expect(statusOf(states, "hic-tanimadigim-urun")).toBe("pending");
  });
});

describe("withStatus", () => {
  it("done güncellemesi", () => {
    const states = withStatus(EMPTY, "p1", "done", TODAY);
    expect(statusOf(states, "p1")).toBe("done");
  });

  it("snoozed güncellemesi", () => {
    const states = withStatus(EMPTY, "p1", "snoozed", TODAY);
    expect(statusOf(states, "p1")).toBe("snoozed");
  });

  it("ignored güncellemesi", () => {
    const states = withStatus(EMPTY, "p1", "ignored", TODAY);
    expect(statusOf(states, "p1")).toBe("ignored");
  });

  it("tekrar güncelleme: son yazılan durum kazanır (overwrite)", () => {
    const first = withStatus(EMPTY, "p1", "snoozed", TODAY);
    const second = withStatus(first, "p1", "done", "2026-07-30");
    expect(statusOf(second, "p1")).toBe("done");
  });

  it("duplicate product: aynı ürün için ikinci kayıt oluşmaz, harita tek satır tutar", () => {
    const first = withStatus(EMPTY, "p1", "snoozed", TODAY);
    const second = withStatus(first, "p1", "done", "2026-07-30");
    expect(second.size).toBe(1);
  });

  it("Map davranışı: saf — girdi haritası mutasyona uğramaz", () => {
    const original = withStatus(EMPTY, "p1", "pending", TODAY);
    withStatus(original, "p1", "done", TODAY);
    expect(statusOf(original, "p1")).toBe("pending");
  });

  it("Map davranışı: farklı ürünler ayrı anahtarlarda durur", () => {
    let states = withStatus(EMPTY, "p1", "done", TODAY);
    states = withStatus(states, "p2", "ignored", TODAY);
    expect(statusOf(states, "p1")).toBe("done");
    expect(statusOf(states, "p2")).toBe("ignored");
    expect(states.size).toBe(2);
  });

  it("kayıt updatedAt'i doğru taşır", () => {
    const states = withStatus(EMPTY, "p1", "done", TODAY);
    expect(states.get("p1")?.updatedAt).toBe(TODAY);
  });
});

describe("isVisibleByDefault — görünürlük kuralı", () => {
  it("pending görünürlüğü: true", () => {
    expect(isVisibleByDefault("pending")).toBe(true);
  });

  it("snoozed görünürlüğü: true", () => {
    expect(isVisibleByDefault("snoozed")).toBe(true);
  });

  it("done gizlenmesi: false", () => {
    expect(isVisibleByDefault("done")).toBe(false);
  });

  it("ignored gizlenmesi: false", () => {
    expect(isVisibleByDefault("ignored")).toBe(false);
  });
});

describe("summarizePurchaseActionStatuses", () => {
  it("kayıt yoksa hepsi pending sayılır, toplam korunur", () => {
    const summary = summarizePurchaseActionStatuses(["p1", "p2", "p3"], EMPTY);
    expect(summary).toEqual({
      total: 3,
      pendingCount: 3,
      doneCount: 0,
      snoozedCount: 0,
      ignoredCount: 0,
    });
  });

  it("summary sayaçları: karışık durumları doğru sayar", () => {
    let states = withStatus(EMPTY, "p1", "done", TODAY);
    states = withStatus(states, "p2", "snoozed", TODAY);
    states = withStatus(states, "p3", "ignored", TODAY);
    // p4 hiç kayıt yok — pending sayılır.
    const summary = summarizePurchaseActionStatuses(["p1", "p2", "p3", "p4"], states);

    expect(summary).toEqual({
      total: 4,
      pendingCount: 1,
      doneCount: 1,
      snoozedCount: 1,
      ignoredCount: 1,
    });
  });

  it("boş liste: toplam 0, tüm sayaçlar 0", () => {
    const summary = summarizePurchaseActionStatuses([], EMPTY);
    expect(summary).toEqual({
      total: 0,
      pendingCount: 0,
      doneCount: 0,
      snoozedCount: 0,
      ignoredCount: 0,
    });
  });

  it("görünür liste (pending+snoozed) sayısı doneCount/ignoredCount hariç tutularak hesaplanabilir", () => {
    let states = withStatus(EMPTY, "p1", "done", TODAY);
    states = withStatus(states, "p2", "snoozed", TODAY);
    const summary = summarizePurchaseActionStatuses(["p1", "p2", "p3"], states);
    const visibleCount = summary.pendingCount + summary.snoozedCount;
    expect(visibleCount).toBe(2); // p2 (snoozed) + p3 (pending, kayıtsız)
  });
});
