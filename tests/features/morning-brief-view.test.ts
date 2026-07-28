import { describe, expect, it } from "vitest";

import type { MorningBrief } from "@/core/domain";
import {
  buildMorningBriefTexts,
  toMorningBriefView,
} from "@/features/cockpit/morning-brief-view";
import type { Locale } from "@/i18n/routing";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * SABAH ÖZETİ → GÖRÜNÜM.
 *
 * `core` sayıları zaten hazırladı (`buildMorningBrief`); burada yalnızca
 * çeviri doğrulanır: satır şablonları, şiddet rozeti ve boş durum metni.
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
  const translate = mockTranslator(DICTIONARIES[locale].morningBrief);
  return buildMorningBriefTexts(
    translate as Parameters<typeof buildMorningBriefTexts>[0],
  );
}

function brief(overrides: Partial<MorningBrief> = {}): MorningBrief {
  return {
    summary: {
      total: 0,
      activeActions: 0,
      completedActions: 0,
      snoozedActions: 0,
      ignoredActions: 0,
      criticalActions: 0,
    },
    items: [],
    focus: null,
    ...overrides,
  };
}

describe("toMorningBriefView — boş brief", () => {
  it("total 0 ise hasActivity false, satır yok, allClear metni dolu", () => {
    const view = toMorningBriefView(brief(), "tr" as Locale, textsFor("tr"));
    expect(view.hasActivity).toBe(false);
    expect(view.lines).toEqual([]);
    expect(view.allClearText).toBe(tr.morningBrief.allClear);
  });
});

describe("toMorningBriefView — badge dönüşümü", () => {
  it("criticalActions > 0 ise şiddet rozeti Kritik/danger olur", () => {
    const view = toMorningBriefView(
      brief({ summary: { ...brief().summary, total: 1, criticalActions: 1 } }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.severityLabel).toBe(tr.morningBrief.severity.critical);
    expect(view.severityTone).toBe("danger");
  });

  it("criticalActions 0 ise şiddet rozeti Normal/neutral olur", () => {
    const view = toMorningBriefView(
      brief({ summary: { ...brief().summary, total: 1, activeActions: 1 } }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.severityLabel).toBe(tr.morningBrief.severity.normal);
    expect(view.severityTone).toBe("neutral");
  });
});

describe("toMorningBriefView — section görünürlüğü", () => {
  it("yalnızca items'da bulunan satırlar üretilir (görünürlük kararı core'da verildi)", () => {
    const view = toMorningBriefView(
      brief({
        summary: { ...brief().summary, total: 2, activeActions: 2, criticalActions: 1 },
        items: [
          { kind: "activeActions", count: 2 },
          { kind: "criticalStock", count: 1 },
        ],
      }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.lines.map((l) => l.kind)).toEqual(["activeActions", "criticalStock"]);
    expect(view.lines.some((l) => l.kind === "leadTimeRisk")).toBe(false);
  });
});

describe("toMorningBriefView — summary alanları / satır metinleri", () => {
  it("beş satır türünün de metni dolu ve sayıyı taşır", () => {
    const view = toMorningBriefView(
      brief({
        summary: {
          total: 5,
          activeActions: 3,
          completedActions: 1,
          snoozedActions: 1,
          ignoredActions: 0,
          criticalActions: 2,
        },
        items: [
          { kind: "activeActions", count: 3 },
          { kind: "criticalStock", count: 2 },
          { kind: "leadTimeRisk", count: 1 },
          { kind: "completedActions", count: 1 },
          { kind: "snoozedActions", count: 1 },
        ],
      }),
      "tr" as Locale,
      textsFor("tr"),
    );
    for (const line of view.lines) {
      expect(line.text.trim(), line.kind).not.toBe("");
    }
    expect(view.lines[0]!.text).toContain("3");
    expect(view.lines[1]!.text).toContain("2");
  });
});

describe("TR/EN", () => {
  it("Türkçe: başlık ve alt başlık sözlükten gelir", () => {
    const view = toMorningBriefView(brief(), "tr" as Locale, textsFor("tr"));
    expect(view.title).toBe(tr.morningBrief.title);
    expect(view.subtitle).toBe(tr.morningBrief.subtitle);
  });

  it("İngilizce: başlık ve alt başlık çeviridir", () => {
    const view = toMorningBriefView(brief(), "en" as Locale, textsFor("en"));
    expect(view.title).toBe(en.morningBrief.title);
    expect(view.subtitle).toBe(en.morningBrief.subtitle);
  });

  it("İngilizce: satır metni sayıyı taşır", () => {
    const view = toMorningBriefView(
      brief({
        summary: { ...brief().summary, total: 1, activeActions: 1 },
        items: [{ kind: "activeActions", count: 1234 }],
      }),
      "en" as Locale,
      textsFor("en"),
    );
    expect(view.lines[0]!.text).toContain("1,234");
  });

  it("Türkçe: satır metni Türkçe sayı biçimlendirmesi kullanır", () => {
    const view = toMorningBriefView(
      brief({
        summary: { ...brief().summary, total: 1, activeActions: 1 },
        items: [{ kind: "activeActions", count: 1234 }],
      }),
      "tr" as Locale,
      textsFor("tr"),
    );
    expect(view.lines[0]!.text).toContain("1.234");
  });

  it("iki dil aynı anahtar kümesini taşıyor", () => {
    expect(Object.keys(tr.morningBrief).sort()).toEqual(
      Object.keys(en.morningBrief).sort(),
    );
    expect(Object.keys(tr.morningBrief.item).sort()).toEqual(
      Object.keys(en.morningBrief.item).sort(),
    );
    expect(Object.keys(tr.morningBrief.severity).sort()).toEqual(
      Object.keys(en.morningBrief.severity).sort(),
    );
  });
});
