import { describe, expect, it } from "vitest";

import type { LeadTimeRisk } from "@/core/services/lead-time-risk";
import {
  buildLeadTimeRiskTexts,
  toLeadTimeRiskView,
  toLeadTimeRiskViews,
} from "@/features/products/lead-time-risk-view";
import type { Locale } from "@/i18n/routing";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * TEDARİK SÜRESİ RİSKİ → GÖRÜNÜM.
 *
 * `safe`/`unmeasurable` bilinçli olarak `visible: false` üretir — kart bu
 * durumlarda hiçbir şey basmaz. Diğer dört durumda metin `stockAlerts.leadTime`
 * sözlüğünden gelir, koda gömülü değildir.
 */

const DICTIONARIES = { tr, en } as const;

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

function textsFor(locale: keyof typeof DICTIONARIES) {
  const translate = mockTranslator(DICTIONARIES[locale].stockAlerts);
  return buildLeadTimeRiskTexts(
    translate as Parameters<typeof buildLeadTimeRiskTexts>[0],
  );
}

function risk(overrides: Partial<LeadTimeRisk> = {}): LeadTimeRisk {
  return {
    state: "upcoming",
    leadTimeDays: 7,
    daysOfCover: 10,
    shortageGapDays: null,
    orderDecisionDays: 3,
    ...overrides,
  };
}

describe("tedarik süresi riski — görünüm görünürlüğü", () => {
  it("safe durumunda görünmez — kart kalabalıklaşmaz", () => {
    const view = toLeadTimeRiskView(
      risk({ state: "safe", orderDecisionDays: 30, shortageGapDays: null }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.visible).toBe(false);
    expect(view.message).toBe("");
    expect(view.detail).toBeNull();
  });

  it("unmeasurable durumunda görünmez — ikinci bir 'ölçülemedi' cümlesi kurulmaz", () => {
    const view = toLeadTimeRiskView(
      risk({
        state: "unmeasurable",
        leadTimeDays: null,
        daysOfCover: null,
        orderDecisionDays: null,
      }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.visible).toBe(false);
  });

  for (const state of ["late", "dueToday", "upcoming", "unknownLeadTime"] as const) {
    it(`${state} durumunda görünür`, () => {
      const view = toLeadTimeRiskView(
        risk({
          state,
          shortageGapDays: state === "late" ? 3 : null,
          leadTimeDays: state === "unknownLeadTime" ? null : 7,
        }),
        "tr" as Locale,
        textsFor("tr"),
      );
      expect(view.visible).toBe(true);
      expect(view.message.trim()).not.toBe("");
    });
  }
});

describe("tedarik süresi riski — metinler", () => {
  it("late: kesinlik iddia etmeden stok boşluğu gün sayısını taşır", () => {
    const view = toLeadTimeRiskView(
      risk({ state: "late", shortageGapDays: 3, orderDecisionDays: -3 }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.message).toContain("3");
    expect(view.message).not.toMatch(/kesin|garanti/i);
    expect(view.tone).toBe("danger");
  });

  it("dueToday: bugün değerlendirme mesajı sabit metindir", () => {
    const view = toLeadTimeRiskView(
      risk({ state: "dueToday", orderDecisionDays: 0 }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.message).toBe(tr.stockAlerts.leadTime.dueToday);
    expect(view.tone).toBe("danger");
  });

  it("upcoming: kalan gün sayısını taşır", () => {
    const view = toLeadTimeRiskView(
      risk({ state: "upcoming", orderDecisionDays: 5 }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.message).toContain("5");
    expect(view.tone).toBe("warning");
  });

  it("unknownLeadTime: kısa veri tamamlama mesajı, detay yok", () => {
    const view = toLeadTimeRiskView(
      risk({
        state: "unknownLeadTime",
        leadTimeDays: null,
        orderDecisionDays: null,
        shortageGapDays: null,
      }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.message).toBe(tr.stockAlerts.leadTime.unknownLeadTime);
    expect(view.detail).toBeNull();
    expect(view.tone).toBe("neutral");
  });

  it("detail yalnızca leadTimeDays ve daysOfCover ikisi de biliniyorsa dolu", () => {
    const view = toLeadTimeRiskView(
      risk({
        state: "upcoming",
        leadTimeDays: 7,
        daysOfCover: 10,
        orderDecisionDays: 3,
      }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.detail).toContain("7");
    expect(view.detail).toContain("10");
  });

  it("İngilizce: metinler çeviridir", () => {
    const view = toLeadTimeRiskView(
      risk({ state: "dueToday", orderDecisionDays: 0 }),
      "en" as Locale,
      textsFor("en"),
    );
    expect(view.message).toBe(en.stockAlerts.leadTime.dueToday);
  });

  it("negatif gün asla görünmez metne sızmaz", () => {
    const view = toLeadTimeRiskView(
      risk({ state: "late", shortageGapDays: 4, orderDecisionDays: -4 }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.message).not.toContain("-");
    expect(view.detail ?? "").not.toContain("-");
  });
});

describe("toLeadTimeRiskViews — ürün kimliğine göre toplu görünüm", () => {
  it("her ürün için haritadaki riski görünüme çevirir", () => {
    const risks = new Map<string, LeadTimeRisk>([
      ["p1", risk({ state: "late", shortageGapDays: 2, orderDecisionDays: -2 })],
      ["p2", risk({ state: "safe", orderDecisionDays: 40 })],
    ]);

    const views = toLeadTimeRiskViews(risks, "tr" as Locale, textsFor("tr"));

    expect(views.get("p1")?.visible).toBe(true);
    expect(views.get("p2")?.visible).toBe(false);
  });
});
