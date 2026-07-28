import { describe, expect, it } from "vitest";

import type { StockAlert, StockAlertLevel } from "@/core/services/stock-alerts";
import {
  buildStockAlertTexts,
  toStockAlertView,
  type StockAlertTexts,
} from "@/features/products/stock-alert-view";
import type { StockCoverageTexts } from "@/features/products/stock-forecast-view";
import type { Locale } from "@/i18n/routing";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * STOK UYARISI → GÖRÜNÜM.
 *
 * Durum kelimesi ve tonu `stock-forecast-view.ts`teki karardan **ödünç
 * alınıyor** — burada yeniden yazılmadığını kanıtlamak testin bir parçası.
 * Asıl yeni olan `reason`/`action` metinleri gerçek sözlüklerden okunuyor.
 */

const DICTIONARIES = { tr, en } as const;

function coverageTextsFor(locale: keyof typeof DICTIONARIES): StockCoverageTexts {
  const coverage = DICTIONARIES[locale].products.coverage;
  const daysUnit = DICTIONARIES[locale].products.daysUnit;

  return {
    state: {
      critical: coverage.critical,
      low: coverage.low,
      normal: coverage.normal,
      high: coverage.high,
      unknown: coverage.unknown,
      noSales: coverage.noSales,
      negative: coverage.negative,
    },
    days: (days) => daysUnit.replace("{days}", days),
    hint: (windowDays) => coverage.hint.replace("{days}", String(windowDays)),
  };
}

/** Gerçek sözlükten okuyan, `next-intl`in çağrılabilir `t`sini taklit eden minik yardımcı. */
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

function textsFor(locale: keyof typeof DICTIONARIES): StockAlertTexts {
  const translate = mockTranslator(DICTIONARIES[locale].stockAlerts);
  return buildStockAlertTexts(
    translate as Parameters<typeof buildStockAlertTexts>[0],
    coverageTextsFor(locale),
  );
}

function alert(overrides: Partial<StockAlert> = {}): StockAlert {
  return {
    productId: "p1",
    productName: "Test Ürünü",
    stock: 5,
    level: "critical",
    daysRemaining: 5,
    ...overrides,
  };
}

function viewOf(
  locale: keyof typeof DICTIONARIES,
  overrides: Partial<StockAlert> = {},
) {
  return toStockAlertView(alert(overrides), locale as Locale, textsFor(locale), 30);
}

describe("stok uyarısı — durum ve ton stok tahmininden ödünç alınır", () => {
  it("tr: kritik durumun kelimesi ve tonu ürün tablosuyla aynı", () => {
    const view = viewOf("tr", { level: "critical", daysRemaining: 5 });
    expect(view.stateLabel).toBe(tr.products.coverage.critical);
    expect(view.tone).toBe("danger");
  });

  it("en: aynı durum aynı tonu taşır", () => {
    const view = viewOf("en", { level: "critical", daysRemaining: 5 });
    expect(view.stateLabel).toBe(en.products.coverage.critical);
  });

  it("negatif ve bilinmeyen durumlar farklı kelimelerle anlatılır", () => {
    const negative = viewOf("tr", { level: "negative", daysRemaining: null });
    const unknown = viewOf("tr", { level: "unknown", daysRemaining: null });

    expect(negative.stateLabel).not.toBe(unknown.stateLabel);
    expect(negative.daysLabel).toBeNull();
    expect(unknown.daysLabel).toBeNull();
  });
});

describe("stok uyarısı — gösterim alanları", () => {
  it("mevcut stok adedini biçimlenmiş metin olarak taşır", () => {
    const view = viewOf("tr", { stock: 12 });
    expect(view.stockLabel).toBe(tr.stockAlerts.stockLabel.replace("{count}", "12"));
  });

  it("kalan gün ölçülebilir durumda dolu, değilse null", () => {
    expect(
      viewOf("tr", { level: "critical", daysRemaining: 2 }).daysLabel,
    ).not.toBeNull();
    expect(
      viewOf("tr", { level: "unknown", daysRemaining: null }).daysLabel,
    ).toBeNull();
  });
});

describe("stok uyarısı — gerekçe ve aksiyon (TR/EN)", () => {
  const levels: readonly StockAlertLevel[] = ["negative", "critical", "unknown", "low"];
  const daysFor = (level: StockAlertLevel): number | null =>
    level === "low" ? 15 : level === "critical" ? 5 : null;

  for (const locale of ["tr", "en"] as const) {
    it.each(levels)(`${locale}: %s için gerekçe ve aksiyon dolu`, (level) => {
      const view = viewOf(locale, { level, daysRemaining: daysFor(level) });

      expect(view.reason.trim()).not.toBe("");
      expect(view.action.trim()).not.toBe("");
      expect(view.reason).toBe(DICTIONARIES[locale].stockAlerts.reason[level]);
      expect(view.action).toBe(DICTIONARIES[locale].stockAlerts.action[level]);
    });

    it(`${locale}: dört durumun gerekçesi birbirinden ayırt edilebilir`, () => {
      const reasons = levels.map(
        (level) => viewOf(locale, { level, daysRemaining: daysFor(level) }).reason,
      );
      expect(new Set(reasons).size).toBe(levels.length);
    });
  }
});
