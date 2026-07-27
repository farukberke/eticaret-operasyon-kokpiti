// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { localTaskAdapter } from "@/data/adapters/local/local-task.adapter";

import { installMemoryStorage } from "./memory-storage";

const STORAGE_KEY = "kokpit.tasks";

describe("localStorage görev adapteri", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it("boş depodan boş liste döner", async () => {
    expect(await localTaskAdapter.list()).toEqual([]);
  });

  it("yazdığını geri okur", async () => {
    await localTaskAdapter.save({
      signalId: "STOCKOUT_IMMINENT:p1",
      status: "done",
      updatedAt: "2026-07-27",
    });

    expect(await localTaskAdapter.list()).toEqual([
      {
        signalId: "STOCKOUT_IMMINENT:p1",
        status: "done",
        snoozedUntil: undefined,
        updatedAt: "2026-07-27",
      },
    ]);
  });

  it("erteleme tarihini korur", async () => {
    await localTaskAdapter.save({
      signalId: "DEAD_STOCK:p2",
      status: "snoozed",
      snoozedUntil: "2026-07-30",
      updatedAt: "2026-07-27",
    });

    const [state] = await localTaskAdapter.list();
    expect(state?.snoozedUntil).toBe("2026-07-30");
  });

  it("aynı sinyalin durumunu üzerine yazar, kopyalamaz", async () => {
    const base = { signalId: "S:1", updatedAt: "2026-07-27" } as const;
    await localTaskAdapter.save({
      ...base,
      status: "snoozed",
      snoozedUntil: "2026-07-30",
    });
    await localTaskAdapter.save({ ...base, status: "done" });

    const list = await localTaskAdapter.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe("done");
    // Erteleme tarihi tamamlandığında geride kalmamalı.
    expect(list[0]?.snoozedUntil).toBeUndefined();
  });

  it("temizlenen görev listeden çıkar, diğerleri kalır", async () => {
    await localTaskAdapter.save({
      signalId: "S:1",
      status: "done",
      updatedAt: "2026-07-27",
    });
    await localTaskAdapter.save({
      signalId: "S:2",
      status: "done",
      updatedAt: "2026-07-27",
    });

    await localTaskAdapter.clear("S:1");

    const list = await localTaskAdapter.list();
    expect(list.map((s) => s.signalId)).toEqual(["S:2"]);
  });

  it("bozuk JSON'da çökmez", async () => {
    window.localStorage.setItem(STORAGE_KEY, "{ bu json değil");
    expect(await localTaskAdapter.list()).toEqual([]);
  });

  it("tanınmayan şema sürümünü yok sayar", async () => {
    // Eski sürüm bozuk veriyle çalışmaktansa temiz başlamak daha güvenli.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 99, tasks: { "S:1": { status: "done" } } }),
    );
    expect(await localTaskAdapter.list()).toEqual([]);
  });

  it("sürümlü şema ile yazar", async () => {
    await localTaskAdapter.save({
      signalId: "S:1",
      status: "done",
      updatedAt: "2026-07-27",
    });

    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(raw.version).toBe(1);
  });
});
