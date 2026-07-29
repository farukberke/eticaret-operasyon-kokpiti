import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * AKILLI İÇGÖRÜLER BİLEŞENİ — yalnızca render eder.
 *
 * `smart-insights.client.tsx` filtre/sıralama/toplama/severity/eşik hesabı
 * yapmamalı — sınıflandırma `buildSmartInsights`de (core), çeviri
 * `toSmartInsightsView`de (view-model) bitmiş olmalı. Bu test, business
 * hesabının component'e sızmadığını kaynak dosya üzerinden doğrular —
 * `task-timeline-component-source.test.ts`teki aynı desen.
 */
describe("SmartInsights bileşeni — component içinde business hesap yapılmaz", () => {
  it("kaynak dosya filter/sort/reduce çağırmaz, başka hesap fonksiyonu içe aktarmaz", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../src/features/cockpit/smart-insights.client.tsx",
          import.meta.url,
        ),
      ),
      "utf8",
    );

    expect(source).not.toMatch(/\.filter\(/);
    expect(source).not.toMatch(/\.sort\(/);
    expect(source).not.toMatch(/\.reduce\(/);
    expect(source).not.toMatch(
      /buildStockAlerts|buildPurchasePriorities|buildReorderRecommendations|buildLeadTimeRisks|buildPurchaseActionPlan\b|buildMorningBrief|buildTaskTimeline/,
    );
  });

  it("kaynak dosya yalnızca bir provider okur — ikinci bir status state'i kurmaz", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../src/features/cockpit/smart-insights.client.tsx",
          import.meta.url,
        ),
      ),
      "utf8",
    );

    expect(source).toMatch(/useActionStatus/);
    expect(source).not.toMatch(/useState/);
    expect(source).not.toMatch(/useEffect/);
    expect(source).not.toMatch(/createContext/);
  });
});
