import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * GÜNLÜK ZAMAN AKIŞI BİLEŞENİ — yalnızca render eder.
 *
 * `task-timeline.client.tsx` filtre/sıralama/toplama/rütbe ya da öncelik
 * hesabı yapmamalı — grup ataması `buildTaskTimeline`de (core), çeviri
 * `toTaskTimelineView`de (view-model) bitmiş olmalı. Bu test, business
 * hesabının component'e sızmadığını kaynak dosya üzerinden doğrular —
 * `purchase-action-plan.test.ts`teki "yeniden hesaplama yapılmaz" testiyle
 * aynı desen.
 */
describe("TaskTimeline bileşeni — component içinde business hesap yapılmaz", () => {
  it("kaynak dosya filter/sort/reduce çağırmaz, hesap fonksiyonu içe aktarmaz", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL("../../src/features/cockpit/task-timeline.client.tsx", import.meta.url),
      ),
      "utf8",
    );

    expect(source).not.toMatch(/\.filter\(/);
    expect(source).not.toMatch(/\.sort\(/);
    expect(source).not.toMatch(/\.reduce\(/);
    expect(source).not.toMatch(
      /buildStockAlerts|buildPurchasePriorities|buildReorderRecommendations|buildLeadTimeRisks|buildPurchaseActionPlan\b|buildMorningBrief/,
    );
  });
});
