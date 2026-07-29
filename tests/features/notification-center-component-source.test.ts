import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * UYARI MERKEZİ BİLEŞENİ — yalnızca render eder.
 *
 * `notification-center.client.tsx` filtre/sıralama/toplama/severity/eşik/
 * dedup hesabı yapmamalı — sınıflandırma `buildNotificationCenter`de (core),
 * çeviri `toNotificationCenterView`de (view-model) bitmiş olmalı. Bu test,
 * business hesabının component'e sızmadığını kaynak dosya üzerinden
 * doğrular — `smart-insights-component-source.test.ts`teki aynı desen.
 */
describe("NotificationCenter bileşeni — component içinde business hesap yapılmaz", () => {
  it("kaynak dosya filter/sort/reduce çağırmaz, başka hesap fonksiyonu içe aktarmaz", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../src/features/cockpit/notification-center.client.tsx",
          import.meta.url,
        ),
      ),
      "utf8",
    );

    expect(source).not.toMatch(/\.filter\(/);
    expect(source).not.toMatch(/\.sort\(/);
    expect(source).not.toMatch(/\.reduce\(/);
    expect(source).not.toMatch(
      /buildStockAlerts|buildPurchasePriorities|buildReorderRecommendations|buildLeadTimeRisks|buildPurchaseActionPlan\b|buildMorningBrief|buildTaskTimeline|buildSmartInsights/,
    );
  });

  it("kaynak dosya yalnızca bir provider okur — ikinci bir status state'i kurmaz", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../src/features/cockpit/notification-center.client.tsx",
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

  it("kaynak dosya localStorage'a yeni bir bildirim/okundu durumu yazmaz", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../src/features/cockpit/notification-center.client.tsx",
          import.meta.url,
        ),
      ),
      "utf8",
    );

    expect(source).not.toMatch(/localStorage\.(setItem|getItem|removeItem)/);
    expect(source).not.toMatch(/unreadCount|isUnread/);
  });

  it("kaynak dosya gerçek bildirim/push/bildirim izni API'lerini kullanmaz", () => {
    const source = readFileSync(
      fileURLToPath(
        new URL(
          "../../src/features/cockpit/notification-center.client.tsx",
          import.meta.url,
        ),
      ),
      "utf8",
    );

    expect(source).not.toMatch(/new Notification\(/);
    expect(source).not.toMatch(/Notification\.requestPermission/);
    expect(source).not.toMatch(/serviceWorker/i);
    expect(source).not.toMatch(/pushManager/i);
    expect(source).not.toMatch(/Date\.now\(\)/);
    expect(source).not.toMatch(/crypto\.randomUUID|uuid/i);
  });
});
