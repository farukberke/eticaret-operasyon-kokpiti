import { describe, expect, it } from "vitest";

import type { SmartInsight, SmartInsightsBatch } from "@/core/domain";
import {
  buildSmartInsightsTexts,
  toSmartInsightsView,
  type SmartInsightsTexts,
} from "@/features/cockpit/smart-insights-view";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * AKILLI İÇGÖRÜLER → GÖRÜNÜM.
 *
 * `core` sınıflandırmayı zaten yaptı (`buildSmartInsights`); burada eklenen
 * yalnızca **çeviri**. Testler her içgörü türü için doğru şablonu, şiddet
 * rozeti dönüşümünü, ürün adı eşleştirmesini, boş durumu ve özet alanlarının
 * doğru taşındığını kovalıyor — domain'in presentation metni taşımadığının
 * dolaylı kanıtı da burada: `SmartInsight` yalnızca `type`/`severity`/sayı
 * taşır, metin `texts`ten gelir.
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

function textsFor(locale: "tr" | "en"): SmartInsightsTexts {
  return buildSmartInsightsTexts(
    mockTranslator(MESSAGES[locale].smartInsights) as Parameters<
      typeof buildSmartInsightsTexts
    >[0],
  );
}

function insight(overrides: Partial<SmartInsight> = {}): SmartInsight {
  return {
    id: "smart-insight:criticalStockPressure",
    type: "criticalStockPressure",
    severity: "critical",
    productId: null,
    relatedProductIds: [],
    evidence: { count: 3, rank: null },
    ...overrides,
  };
}

function batchOf(insights: readonly SmartInsight[]): SmartInsightsBatch {
  const counts: Record<SmartInsight["severity"], number> = {
    critical: 0,
    warning: 0,
    positive: 0,
    neutral: 0,
  };
  for (const item of insights) counts[item.severity] += 1;

  return {
    insights,
    summary: {
      totalInsights: insights.length,
      criticalInsights: counts.critical,
      warningInsights: counts.warning,
      positiveInsights: counts.positive,
      neutralInsights: counts.neutral,
      activeRelatedActions: insights.length,
    },
  };
}

const NO_NAMES: ReadonlyMap<string, string> = new Map();

describe("toSmartInsightsView — TR şablonları", () => {
  const texts = textsFor("tr");

  it("criticalStockPressure: sayı cümleye taşınır", () => {
    const view = toSmartInsightsView(
      batchOf([insight({ evidence: { count: 4, rank: null } })]),
      "tr",
      texts,
      NO_NAMES,
    );
    expect(view.rows[0]?.description).toBe(
      "4 kritik satın alma aksiyonu bugün dikkat gerektiriyor.",
    );
    expect(view.rows[0]?.title).toBe(tr.smartInsights.item.criticalStockPressure.title);
  });

  it("leadTimeExposure: sayı cümleye taşınır", () => {
    const view = toSmartInsightsView(
      batchOf([
        insight({
          type: "leadTimeExposure",
          severity: "warning",
          id: "smart-insight:leadTimeExposure",
          evidence: { count: 2, rank: null },
        }),
      ]),
      "tr",
      texts,
      NO_NAMES,
    );
    expect(view.rows[0]?.description).toBe(
      "2 ürün tedarik süresi riski nedeniyle acil sipariş kararı bekliyor.",
    );
  });

  it("urgentPurchaseFocus: ürün adı productNames haritasından okunur", () => {
    const view = toSmartInsightsView(
      batchOf([
        insight({
          type: "urgentPurchaseFocus",
          severity: "critical",
          id: "smart-insight:urgentPurchaseFocus:p1",
          productId: "p1",
          evidence: { count: 1, rank: 1 },
        }),
      ]),
      "tr",
      texts,
      new Map([["p1", "Yazlık Elbise"]]),
    );
    expect(view.rows[0]?.description).toBe(
      "En yüksek öncelikli aksiyon Yazlık Elbise ürününe ait.",
    );
  });

  it("urgentPurchaseFocus: eşleşen ürün adı yoksa boş metinle güvenli davranır", () => {
    const view = toSmartInsightsView(
      batchOf([
        insight({
          type: "urgentPurchaseFocus",
          severity: "critical",
          id: "smart-insight:urgentPurchaseFocus:p1",
          productId: "p1",
          evidence: { count: 1, rank: 1 },
        }),
      ]),
      "tr",
      texts,
      NO_NAMES,
    );
    expect(view.rows[0]?.description).toBe("En yüksek öncelikli aksiyon  ürününe ait.");
  });

  it("snoozedActionBacklog: sayı cümleye taşınır", () => {
    const view = toSmartInsightsView(
      batchOf([
        insight({
          type: "snoozedActionBacklog",
          severity: "warning",
          id: "smart-insight:snoozedActionBacklog",
          evidence: { count: 5, rank: null },
        }),
      ]),
      "tr",
      texts,
      NO_NAMES,
    );
    expect(view.rows[0]?.description).toBe(
      "5 ertelenmiş görev operasyon akışını bekletiyor.",
    );
  });

  it("executionProgress: sayı cümleye taşınır", () => {
    const view = toSmartInsightsView(
      batchOf([
        insight({
          type: "executionProgress",
          severity: "positive",
          id: "smart-insight:executionProgress",
          evidence: { count: 2, rank: null },
        }),
      ]),
      "tr",
      texts,
      NO_NAMES,
    );
    expect(view.rows[0]?.description).toBe(
      "2 görev tamamlandı; günlük plan ilerliyor.",
    );
  });

  it("operationsClear: sabit metin, sayı taşımaz", () => {
    const view = toSmartInsightsView(
      batchOf([
        insight({
          type: "operationsClear",
          severity: "neutral",
          id: "smart-insight:operationsClear",
          evidence: { count: 0, rank: null },
        }),
      ]),
      "tr",
      texts,
      NO_NAMES,
    );
    expect(view.rows[0]?.description).toBe(
      "Şu anda kritik operasyon riski görünmüyor.",
    );
  });
});

describe("toSmartInsightsView — EN şablonları", () => {
  const texts = textsFor("en");

  it("criticalStockPressure: İngilizce şablon", () => {
    const view = toSmartInsightsView(
      batchOf([insight({ evidence: { count: 4, rank: null } })]),
      "en",
      texts,
      NO_NAMES,
    );
    expect(view.rows[0]?.description).toBe(
      "4 critical purchase actions need attention today.",
    );
  });

  it("urgentPurchaseFocus: İngilizce şablon ve ürün adı", () => {
    const view = toSmartInsightsView(
      batchOf([
        insight({
          type: "urgentPurchaseFocus",
          severity: "critical",
          id: "smart-insight:urgentPurchaseFocus:p1",
          productId: "p1",
          evidence: { count: 1, rank: 1 },
        }),
      ]),
      "en",
      texts,
      new Map([["p1", "Summer Dress"]]),
    );
    expect(view.rows[0]?.description).toBe(
      "The highest-priority action belongs to Summer Dress.",
    );
  });
});

describe("toSmartInsightsView — şiddet rozeti dönüşümü", () => {
  const texts = textsFor("tr");
  const TONE_BY_SEVERITY: Record<SmartInsight["severity"], string> = {
    critical: "danger",
    warning: "warning",
    positive: "success",
    neutral: "neutral",
  };

  for (const [severity, tone] of Object.entries(TONE_BY_SEVERITY)) {
    it(`${severity} şiddeti ${tone} rozetine çevrilir`, () => {
      const view = toSmartInsightsView(
        batchOf([
          insight({
            severity: severity as SmartInsight["severity"],
            type:
              severity === "critical"
                ? "criticalStockPressure"
                : severity === "warning"
                  ? "leadTimeExposure"
                  : severity === "positive"
                    ? "executionProgress"
                    : "operationsClear",
          }),
        ]),
        "tr",
        texts,
        NO_NAMES,
      );
      expect(view.rows[0]?.tone).toBe(tone);
      expect(view.rows[0]?.severityLabel).toBe(
        tr.smartInsights.severity[severity as keyof typeof tr.smartInsights.severity],
      );
    });
  }
});

describe("toSmartInsightsView — boş durum ve özet", () => {
  const texts = textsFor("tr");

  it("içgörü yoksa boş durum metni gösterilir, hasInsights false olur", () => {
    const view = toSmartInsightsView(batchOf([]), "tr", texts, NO_NAMES);
    expect(view.hasInsights).toBe(false);
    expect(view.rows).toEqual([]);
    expect(view.emptyText).toBe(tr.smartInsights.empty);
  });

  it("summary alanları (totalInsights) doğru taşınır", () => {
    const view = toSmartInsightsView(
      batchOf([
        insight({ id: "a" }),
        insight({
          id: "b",
          type: "executionProgress",
          severity: "positive",
        }),
      ]),
      "tr",
      texts,
      NO_NAMES,
    );
    expect(view.totalInsights).toBe(2);
    expect(view.hasInsights).toBe(true);
  });

  it("başlık ve alt başlık çeviridir", () => {
    const view = toSmartInsightsView(batchOf([]), "tr", texts, NO_NAMES);
    expect(view.title).toBe(tr.smartInsights.title);
    expect(view.subtitle).toBe(tr.smartInsights.subtitle);
  });
});

describe("toSmartInsightsView — sunum sırasının korunması", () => {
  it("core'un ürettiği sıra view'da yeniden dizilmez", () => {
    const texts = textsFor("tr");
    const batch = batchOf([
      insight({ id: "a", type: "criticalStockPressure", severity: "critical" }),
      insight({ id: "b", type: "executionProgress", severity: "positive" }),
      insight({ id: "c", type: "operationsClear", severity: "neutral" }),
    ]);
    const view = toSmartInsightsView(batch, "tr", texts, NO_NAMES);
    expect(view.rows.map((row) => row.type)).toEqual([
      "criticalStockPressure",
      "executionProgress",
      "operationsClear",
    ]);
  });
});

describe("toSmartInsightsView — eksik/unknown evidence davranışı", () => {
  it("rank null olan urgentPurchaseFocus çökmez, yalnızca ürün adını kullanır", () => {
    const texts = textsFor("tr");
    const view = toSmartInsightsView(
      batchOf([
        insight({
          type: "urgentPurchaseFocus",
          severity: "critical",
          id: "smart-insight:urgentPurchaseFocus:p1",
          productId: "p1",
          evidence: { count: 1, rank: null },
        }),
      ]),
      "tr",
      texts,
      new Map([["p1", "Test Ürünü"]]),
    );
    expect(view.rows[0]?.description).toBe(
      "En yüksek öncelikli aksiyon Test Ürünü ürününe ait.",
    );
  });
});

describe("toSmartInsightsView — domain metni taşımaz", () => {
  it("SmartInsight tipi yalnızca semantic alanlar taşır, TR/EN metin alanı yok", () => {
    const sample = insight();
    expect(Object.keys(sample).sort()).toEqual(
      ["evidence", "id", "productId", "relatedProductIds", "severity", "type"].sort(),
    );
  });
});
