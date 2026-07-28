// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { localPurchaseActionStatusAdapter } from "@/data/adapters/local/local-purchase-action-status.adapter";

import { installMemoryStorage } from "./memory-storage";

const STORAGE_KEY = "kokpit.purchaseActionStatus";

describe("localStorage satın alma eylemi durum adapteri", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it("boş depodan boş liste döner", async () => {
    expect(await localPurchaseActionStatusAdapter.list()).toEqual([]);
  });

  it("yazdığını geri okur", async () => {
    await localPurchaseActionStatusAdapter.save({
      productId: "p1",
      status: "done",
      updatedAt: "2026-07-27",
    });

    expect(await localPurchaseActionStatusAdapter.list()).toEqual([
      { productId: "p1", status: "done", updatedAt: "2026-07-27" },
    ]);
  });

  it("aynı ürünün durumunu üzerine yazar, kopyalamaz", async () => {
    await localPurchaseActionStatusAdapter.save({
      productId: "p1",
      status: "snoozed",
      updatedAt: "2026-07-27",
    });
    await localPurchaseActionStatusAdapter.save({
      productId: "p1",
      status: "done",
      updatedAt: "2026-07-28",
    });

    const list = await localPurchaseActionStatusAdapter.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe("done");
  });

  it("birden fazla ürünün durumunu ayrı ayrı tutar", async () => {
    await localPurchaseActionStatusAdapter.save({
      productId: "p1",
      status: "done",
      updatedAt: "2026-07-27",
    });
    await localPurchaseActionStatusAdapter.save({
      productId: "p2",
      status: "ignored",
      updatedAt: "2026-07-27",
    });

    const list = await localPurchaseActionStatusAdapter.list();
    expect(list.map((record) => record.productId).sort()).toEqual(["p1", "p2"]);
  });

  it("reset davranışı: tüm kayıtları temizler", async () => {
    await localPurchaseActionStatusAdapter.save({
      productId: "p1",
      status: "done",
      updatedAt: "2026-07-27",
    });
    await localPurchaseActionStatusAdapter.save({
      productId: "p2",
      status: "ignored",
      updatedAt: "2026-07-27",
    });

    await localPurchaseActionStatusAdapter.reset();

    expect(await localPurchaseActionStatusAdapter.list()).toEqual([]);
  });

  it("bozuk JSON'da çökmez", async () => {
    window.localStorage.setItem(STORAGE_KEY, "{ bu json değil");
    expect(await localPurchaseActionStatusAdapter.list()).toEqual([]);
  });

  it("tanınmayan şema sürümünü yok sayar", async () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 99, statuses: { p1: { status: "done" } } }),
    );
    expect(await localPurchaseActionStatusAdapter.list()).toEqual([]);
  });

  it("sürümlü şema ile yazar", async () => {
    await localPurchaseActionStatusAdapter.save({
      productId: "p1",
      status: "done",
      updatedAt: "2026-07-27",
    });

    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(raw.version).toBe(1);
  });
});
