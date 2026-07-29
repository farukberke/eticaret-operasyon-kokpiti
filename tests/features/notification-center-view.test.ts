import { describe, expect, it } from "vitest";

import type { NotificationCenter, OperationalNotification } from "@/core/domain";
import {
  buildNotificationCenterTexts,
  toNotificationCenterView,
  type NotificationCenterTexts,
} from "@/features/cockpit/notification-center-view";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * UYARI MERKEZİ → GÖRÜNÜM.
 *
 * `core` sınıflandırmayı zaten yaptı (`buildNotificationCenter`); burada
 * eklenen yalnızca **çeviri**. Testler her bildirim türü için doğru şablonu,
 * şiddet rozeti dönüşümünü, ürün adı eşleştirmesini, boş durumu, limit
 * metnini ve domain'in presentation metni taşımadığını kovalıyor —
 * `smart-insights-view.test.ts`teki aynı desen.
 */

const MESSAGES = { tr, en };

function mockTranslator(messages: Record<string, unknown>) {
  return (key: string, values?: Record<string, string | number>): string => {
    let node: unknown = messages;
    for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
    let text = String(node);
    if (values) {
      for (const [name, value] of Object.entries(values)) {
        text = text.replace(`{${name}}`, String(value));
      }
    }
    return text;
  };
}

function textsFor(locale: "tr" | "en"): NotificationCenterTexts {
  return buildNotificationCenterTexts(
    mockTranslator(MESSAGES[locale].notificationCenter) as Parameters<
      typeof buildNotificationCenterTexts
    >[0],
    mockTranslator(MESSAGES[locale].smartInsights) as Parameters<
      typeof buildNotificationCenterTexts
    >[1],
  );
}

function notification(
  overrides: Partial<OperationalNotification> = {},
): OperationalNotification {
  return {
    id: "notification:criticalAction:p1",
    type: "criticalAction",
    severity: "critical",
    source: "purchaseActionPlan",
    productId: "p1",
    status: "pending",
    evidence: { count: 1, rank: 1 },
    ...overrides,
  };
}

function centerOf(
  notifications: readonly OperationalNotification[],
): NotificationCenter {
  const counts: Record<OperationalNotification["severity"], number> = {
    critical: 0,
    warning: 0,
    positive: 0,
    neutral: 0,
  };
  for (const item of notifications) counts[item.severity] += 1;

  return {
    notifications,
    summary: {
      totalNotifications: notifications.length,
      criticalNotifications: counts.critical,
      warningNotifications: counts.warning,
      positiveNotifications: counts.positive,
      neutralNotifications: counts.neutral,
      activeRelatedActions: notifications.length,
      hiddenByLimit: 0,
    },
  };
}

const NO_NAMES: ReadonlyMap<string, string> = new Map();

describe("toNotificationCenterView — TR şablonları", () => {
  const texts = textsFor("tr");

  it("criticalAction: ürün adı productNames haritasından okunur", () => {
    const view = toNotificationCenterView(
      centerOf([notification()]),
      "tr",
      texts,
      new Map([["p1", "Yazlık Elbise"]]),
    );
    expect(view.rows[0]?.description).toBe(
      "Yazlık Elbise ürünü için acil satın alma aksiyonu gerekiyor.",
    );
    expect(view.rows[0]?.title).toBe(tr.notificationCenter.item.criticalAction.title);
  });

  it("criticalAction: eşleşen ürün adı yoksa boş metinle güvenli davranır", () => {
    const view = toNotificationCenterView(
      centerOf([notification()]),
      "tr",
      texts,
      NO_NAMES,
    );
    expect(view.rows[0]?.description).toBe(
      " ürünü için acil satın alma aksiyonu gerekiyor.",
    );
  });

  it("leadTimeRisk: ürün adı cümleye taşınır", () => {
    const view = toNotificationCenterView(
      centerOf([
        notification({
          id: "notification:leadTimeRisk:p2",
          type: "leadTimeRisk",
          severity: "warning",
          productId: "p2",
        }),
      ]),
      "tr",
      texts,
      new Map([["p2", "Kışlık Mont"]]),
    );
    expect(view.rows[0]?.description).toBe(
      "Kışlık Mont ürünü tedarik süresi riski taşıyor.",
    );
  });

  it("snoozedAction: sayı cümleye taşınır, ürün adı gerektirmez", () => {
    const view = toNotificationCenterView(
      centerOf([
        notification({
          id: "notification:snoozedAction",
          type: "snoozedAction",
          severity: "warning",
          productId: null,
          status: "snoozed",
          evidence: { count: 3, rank: null },
        }),
      ]),
      "tr",
      texts,
      NO_NAMES,
    );
    expect(view.rows[0]?.description).toBe("3 görev ertelendi.");
  });

  it("completedAction: sayı cümleye taşınır", () => {
    const view = toNotificationCenterView(
      centerOf([
        notification({
          id: "notification:completedAction",
          type: "completedAction",
          severity: "positive",
          productId: null,
          status: "done",
          evidence: { count: 2, rank: null },
        }),
      ]),
      "tr",
      texts,
      NO_NAMES,
    );
    expect(view.rows[0]?.description).toBe("2 görev tamamlandı.");
  });

  it("operationsClear: sabit metin, sayı taşımaz", () => {
    const view = toNotificationCenterView(
      centerOf([
        notification({
          id: "notification:operationsClear",
          type: "operationsClear",
          severity: "neutral",
          productId: null,
          status: null,
          evidence: { count: 2, rank: null },
        }),
      ]),
      "tr",
      texts,
      NO_NAMES,
    );
    expect(view.rows[0]?.description).toBe(
      "Şu anda dikkat gerektiren aktif bildirim bulunmuyor.",
    );
    expect(view.rows[0]?.title).toBe("Tüm operasyonlar kontrol altında");
  });
});

describe("toNotificationCenterView — EN şablonları", () => {
  const texts = textsFor("en");

  it("criticalAction: İngilizce şablon ve ürün adı", () => {
    const view = toNotificationCenterView(
      centerOf([notification()]),
      "en",
      texts,
      new Map([["p1", "Summer Dress"]]),
    );
    expect(view.rows[0]?.description).toBe(
      "Summer Dress needs an urgent purchase action.",
    );
  });

  it("leadTimeRisk: İngilizce şablon", () => {
    const view = toNotificationCenterView(
      centerOf([
        notification({
          id: "notification:leadTimeRisk:p2",
          type: "leadTimeRisk",
          severity: "warning",
          productId: "p2",
        }),
      ]),
      "en",
      texts,
      new Map([["p2", "Winter Coat"]]),
    );
    expect(view.rows[0]?.description).toBe("Winter Coat is exposed to lead time risk.");
  });
});

describe("toNotificationCenterView — şiddet rozeti dönüşümü (smartInsights.severity'den okunur)", () => {
  const texts = textsFor("tr");
  const TONE_BY_SEVERITY: Record<OperationalNotification["severity"], string> = {
    critical: "danger",
    warning: "warning",
    positive: "success",
    neutral: "neutral",
  };

  for (const [severity, tone] of Object.entries(TONE_BY_SEVERITY)) {
    it(`${severity} şiddeti ${tone} rozetine çevrilir`, () => {
      const view = toNotificationCenterView(
        centerOf([
          notification({
            severity: severity as OperationalNotification["severity"],
            type:
              severity === "critical"
                ? "criticalAction"
                : severity === "warning"
                  ? "leadTimeRisk"
                  : severity === "positive"
                    ? "completedAction"
                    : "operationsClear",
          }),
        ]),
        "tr",
        texts,
        new Map([["p1", "Ürün"]]),
      );
      expect(view.rows[0]?.tone).toBe(tone);
      expect(view.rows[0]?.severityLabel).toBe(
        tr.smartInsights.severity[severity as keyof typeof tr.smartInsights.severity],
      );
    });
  }
});

describe("toNotificationCenterView — boş durum ve aktif sayaç", () => {
  const texts = textsFor("tr");

  it("bildirim yoksa boş durum metni gösterilir, hasNotifications false olur", () => {
    const view = toNotificationCenterView(centerOf([]), "tr", texts, NO_NAMES);
    expect(view.hasNotifications).toBe(false);
    expect(view.rows).toEqual([]);
    expect(view.emptyText).toBe(tr.notificationCenter.empty);
  });

  it("aktif sayaç metni 'unread' değil, salt sayısal bir etikettir", () => {
    const view = toNotificationCenterView(
      centerOf([
        notification(),
        notification({ id: "notification:criticalAction:p2", productId: "p2" }),
      ]),
      "tr",
      texts,
      NO_NAMES,
    );
    expect(view.activeCountText).toBe(`${tr.notificationCenter.activeCountLabel}: 2`);
    expect(view.activeCountText.toLowerCase()).not.toMatch(/unread|okunmadı|yeni/);
  });

  it("başlık ve alt başlık çeviridir", () => {
    const view = toNotificationCenterView(centerOf([]), "tr", texts, NO_NAMES);
    expect(view.title).toBe(tr.notificationCenter.title);
    expect(view.subtitle).toBe(tr.notificationCenter.subtitle);
  });
});

describe("toNotificationCenterView — daha fazla bildirim (limit) metni", () => {
  const texts = textsFor("tr");

  it("hiddenByLimit sıfırsa moreText null olur", () => {
    const view = toNotificationCenterView(
      centerOf([notification()]),
      "tr",
      texts,
      NO_NAMES,
    );
    expect(view.moreText).toBeNull();
  });

  it("hiddenByLimit > 0 ise moreText dolar", () => {
    const center: NotificationCenter = {
      ...centerOf([notification()]),
      summary: { ...centerOf([notification()]).summary, hiddenByLimit: 4 },
    };
    const view = toNotificationCenterView(center, "tr", texts, NO_NAMES);
    expect(view.moreText).toBe("+4 bildirim daha");
  });
});

describe("toNotificationCenterView — sunum sırasının korunması", () => {
  it("core'un ürettiği sıra view'da yeniden dizilmez", () => {
    const texts = textsFor("tr");
    const center = centerOf([
      notification({ id: "a", type: "criticalAction" }),
      notification({
        id: "b",
        type: "completedAction",
        severity: "positive",
        productId: null,
      }),
      notification({
        id: "c",
        type: "operationsClear",
        severity: "neutral",
        productId: null,
      }),
    ]);
    const view = toNotificationCenterView(center, "tr", texts, NO_NAMES);
    expect(view.rows.map((row) => row.type)).toEqual([
      "criticalAction",
      "completedAction",
      "operationsClear",
    ]);
  });
});

describe("toNotificationCenterView — timestamp/okunmadı metni üretilmemesi", () => {
  it("view alanları arasında sahte zaman damgası ya da unread alanı yoktur", () => {
    const texts = textsFor("tr");
    const view = toNotificationCenterView(
      centerOf([notification()]),
      "tr",
      texts,
      NO_NAMES,
    );
    expect(view).not.toHaveProperty("createdAt");
    expect(view).not.toHaveProperty("timestamp");
    expect(view).not.toHaveProperty("unreadCount");
    expect(view.rows[0]).not.toHaveProperty("createdAt");
    expect(view.rows[0]).not.toHaveProperty("timestamp");
  });
});

describe("toNotificationCenterView — domain metni taşımaz", () => {
  it("OperationalNotification tipi yalnızca semantic alanlar taşır, TR/EN metin alanı yok", () => {
    const sample = notification();
    expect(Object.keys(sample).sort()).toEqual(
      ["evidence", "id", "productId", "severity", "source", "status", "type"].sort(),
    );
  });
});
