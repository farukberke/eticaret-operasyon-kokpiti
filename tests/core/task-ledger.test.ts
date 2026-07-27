import { describe, expect, it } from "vitest";

import { lira, toMajor, type TaskState } from "@/core/domain";
import { buildTaskLedger } from "@/core/services/task-ledger";

const TODAY = "2026-07-27";
const YESTERDAY = "2026-07-26";

const done = (id: string, updatedAt: string, gain?: number): TaskState => ({
  signalId: id,
  status: "done",
  updatedAt,
  ...(gain !== undefined ? { expectedGain: lira(gain) } : {}),
});

describe("Görev defteri", () => {
  it("dün tamamlanan işleri ve korunan kârı toplar", () => {
    const ledger = buildTaskLedger(
      [done("a", YESTERDAY, 41_304), done("b", YESTERDAY, 20_000)],
      TODAY,
    );

    expect(ledger.yesterday.count).toBe(2);
    expect(toMajor(ledger.yesterday.gain)).toBe(61_304);
  });

  it("bugün kapatılan iş dünün defterine girmez", () => {
    // "Dün" kesin bir gün; bugünün işleri yarın deftere düşer.
    const ledger = buildTaskLedger([done("a", TODAY, 10_000)], TODAY);

    expect(ledger.yesterday.count).toBe(0);
    expect(toMajor(ledger.yesterday.gain)).toBe(0);
    expect(ledger.month.count).toBe(1);
  });

  it("ay toplamı bütün ayı kapsar, dünü de içerir", () => {
    const ledger = buildTaskLedger(
      [
        done("a", "2026-07-01", 5_000),
        done("b", YESTERDAY, 41_304),
        done("c", TODAY, 1_000),
      ],
      TODAY,
    );

    expect(ledger.month.count).toBe(3);
    expect(toMajor(ledger.month.gain)).toBe(47_304);
  });

  it("önceki ayın işleri bu aya sızmaz", () => {
    const ledger = buildTaskLedger(
      [done("eski", "2026-06-30", 900_000), done("yeni", TODAY, 1_000)],
      TODAY,
    );

    expect(ledger.month.count).toBe(1);
    expect(toMajor(ledger.month.gain)).toBe(1_000);
  });

  it("yıl sınırında ay karşılaştırması kaymaz", () => {
    const ledger = buildTaskLedger(
      [done("aralik", "2025-12-31", 50_000), done("ocak", "2026-01-05", 7_000)],
      "2026-01-10",
    );

    expect(ledger.month.count).toBe(1);
    expect(toMajor(ledger.month.gain)).toBe(7_000);
  });

  it("tamamlanmamış işler deftere girmez", () => {
    // Ertelemek bir kazanç değildir; yalnızca kapatılan iş sayılır.
    const ledger = buildTaskLedger(
      [
        {
          signalId: "a",
          status: "snoozed",
          snoozedUntil: "2026-07-30",
          updatedAt: YESTERDAY,
        },
        { signalId: "b", status: "open", updatedAt: YESTERDAY },
        done("c", YESTERDAY, 1_000),
      ],
      TODAY,
    );

    expect(ledger.yesterday.count).toBe(1);
    expect(toMajor(ledger.yesterday.gain)).toBe(1_000);
  });

  it("tutarsız eski kayıt sayıya girer, paraya girmez", () => {
    // Alan eklenmeden önce yazılmış kayıtlar. Sayıyı düşürmek yanlış olurdu:
    // iş gerçekten yapıldı, sadece tutarı bilinmiyor.
    const ledger = buildTaskLedger(
      [done("eski", YESTERDAY), done("yeni", YESTERDAY, 10_000)],
      TODAY,
    );

    expect(ledger.yesterday.count).toBe(2);
    expect(toMajor(ledger.yesterday.gain)).toBe(10_000);
  });

  it("hiç iş yokken sıfırlarla döner", () => {
    const ledger = buildTaskLedger([], TODAY);

    expect(ledger.yesterday.count).toBe(0);
    expect(ledger.month.count).toBe(0);
    expect(ledger.month.gain.minor).toBe(0);
  });
});
