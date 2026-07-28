import { describe, expect, it } from "vitest";

import type { TaskTimelineGroup } from "@/core/domain";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * GÜNLÜK ZAMAN AKIŞI SÖZLÜĞÜ.
 *
 * Dört grup başlığı (`taskTimeline.group`) ve iki boş durum metni iki dilde
 * de dolu ve ayırt edilebilir olmalı — `purchase-action-status.test.ts`teki
 * aynı desen.
 */
const GROUPS: Record<TaskTimelineGroup, true> = {
  now: true,
  today: true,
  later: true,
  completed: true,
};
const ALL_GROUPS = Object.keys(GROUPS) as TaskTimelineGroup[];

describe("günlük zaman akışı sözlüğü", () => {
  for (const [locale, messages] of Object.entries({ tr, en })) {
    const group = messages.taskTimeline.group as unknown as Record<string, string>;

    it(`${locale}: başlık ve yardımcı metin dolu`, () => {
      expect(messages.taskTimeline.title?.trim()).toBeTruthy();
      expect(messages.taskTimeline.helperText?.trim()).toBeTruthy();
    });

    it(`${locale}: dört grup başlığının metni dolu ve ayırt edilebilir`, () => {
      const labels = ALL_GROUPS.map((g) => {
        expect(group[g]?.trim(), `${locale}.taskTimeline.group.${g}`).toBeTruthy();
        return group[g];
      });
      expect(new Set(labels).size).toBe(labels.length);
    });

    it(`${locale}: iki boş durum metni dolu ve ayırt edilebilir`, () => {
      expect(messages.taskTimeline.emptyActive?.trim()).toBeTruthy();
      expect(messages.taskTimeline.emptyCompleted?.trim()).toBeTruthy();
      expect(messages.taskTimeline.emptyActive).not.toBe(
        messages.taskTimeline.emptyCompleted,
      );
    });
  }

  it("iki dil aynı anahtar kümesini taşıyor: taskTimeline", () => {
    expect(Object.keys(tr.taskTimeline).sort()).toEqual(
      Object.keys(en.taskTimeline).sort(),
    );
  });

  it("iki dil aynı anahtar kümesini taşıyor: taskTimeline.group", () => {
    expect(Object.keys(tr.taskTimeline.group).sort()).toEqual(
      Object.keys(en.taskTimeline.group).sort(),
    );
  });

  it("dört grup anahtarının tamamı sözlükte tanımlı", () => {
    expect(Object.keys(tr.taskTimeline.group).sort()).toEqual([...ALL_GROUPS].sort());
  });
});
