import type { getTranslations } from "next-intl/server";

import type {
  SmartInsight,
  SmartInsightsBatch,
  SmartInsightSeverity,
  SmartInsightType,
} from "@/core/domain";
import type { Locale } from "@/i18n/routing";
import { formatNumber } from "@/lib/format";
import type { BadgeTone } from "@/ui/primitives/badge";

/**
 * AKILLI İÇGÖRÜLER → GÖRÜNÜM.
 *
 * `core` (`buildSmartInsights`) sınıflandırmayı zaten yaptı; burada eklenen
 * şey yalnızca **çeviri**: başlık/açıklama şablonları, şiddet rozeti ve
 * (`urgentPurchaseFocus` için) ürün adı eşleştirmesi. Business hesabı
 * burada yapılmaz — filtre, sıralama ya da severity hesaplaması component
 * tarafında da burada da yoktur, `core`de bitmiş durumda.
 */

const SEVERITY_TONE: Record<SmartInsightSeverity, BadgeTone> = {
  critical: "danger",
  warning: "warning",
  positive: "success",
  neutral: "neutral",
};

export interface SmartInsightsTexts {
  readonly title: string;
  readonly subtitle: string;
  readonly empty: string;
  readonly severity: Record<SmartInsightSeverity, string>;
  readonly itemTitle: Record<SmartInsightType, string>;
  readonly description: {
    readonly criticalStockPressure: (count: string) => string;
    readonly leadTimeExposure: (count: string) => string;
    readonly urgentPurchaseFocus: (productName: string) => string;
    readonly snoozedActionBacklog: (count: string) => string;
    readonly executionProgress: (count: string) => string;
    readonly operationsClear: () => string;
  };
}

export function buildSmartInsightsTexts(
  smartInsights: Awaited<ReturnType<typeof getTranslations<"smartInsights">>>,
): SmartInsightsTexts {
  return {
    title: smartInsights("title"),
    subtitle: smartInsights("subtitle"),
    empty: smartInsights("empty"),
    severity: {
      critical: smartInsights("severity.critical"),
      warning: smartInsights("severity.warning"),
      positive: smartInsights("severity.positive"),
      neutral: smartInsights("severity.neutral"),
    },
    itemTitle: {
      criticalStockPressure: smartInsights("item.criticalStockPressure.title"),
      leadTimeExposure: smartInsights("item.leadTimeExposure.title"),
      urgentPurchaseFocus: smartInsights("item.urgentPurchaseFocus.title"),
      snoozedActionBacklog: smartInsights("item.snoozedActionBacklog.title"),
      executionProgress: smartInsights("item.executionProgress.title"),
      operationsClear: smartInsights("item.operationsClear.title"),
    },
    description: {
      criticalStockPressure: (count) =>
        smartInsights("item.criticalStockPressure.description", { count }),
      leadTimeExposure: (count) =>
        smartInsights("item.leadTimeExposure.description", { count }),
      urgentPurchaseFocus: (productName) =>
        smartInsights("item.urgentPurchaseFocus.description", { productName }),
      snoozedActionBacklog: (count) =>
        smartInsights("item.snoozedActionBacklog.description", { count }),
      executionProgress: (count) =>
        smartInsights("item.executionProgress.description", { count }),
      operationsClear: () => smartInsights("item.operationsClear.description"),
    },
  };
}

export interface SmartInsightRowView {
  readonly id: string;
  readonly type: SmartInsightType;
  readonly title: string;
  readonly description: string;
  readonly severityLabel: string;
  readonly tone: BadgeTone;
}

export interface SmartInsightsView {
  readonly title: string;
  readonly subtitle: string;
  /** Toplam içgörü sayısı — `summary.totalInsights`in olduğu gibi taşınması. */
  readonly totalInsights: number;
  readonly hasInsights: boolean;
  /** Sabit önem sırasıyla — `core`teki sıra burada yeniden dizilmez. */
  readonly rows: readonly SmartInsightRowView[];
  readonly emptyText: string;
}

/**
 * Yalnızca `urgentPurchaseFocus` bir ürün adı ister — diğer beş tür sayım
 * tabanlıdır ve `productNames` haritasına hiç bakmaz.
 */
function descriptionFor(
  insight: SmartInsight,
  locale: Locale,
  texts: SmartInsightsTexts,
  productNames: ReadonlyMap<string, string>,
): string {
  switch (insight.type) {
    case "criticalStockPressure":
      return texts.description.criticalStockPressure(
        formatNumber(insight.evidence.count, locale),
      );
    case "leadTimeExposure":
      return texts.description.leadTimeExposure(
        formatNumber(insight.evidence.count, locale),
      );
    case "snoozedActionBacklog":
      return texts.description.snoozedActionBacklog(
        formatNumber(insight.evidence.count, locale),
      );
    case "executionProgress":
      return texts.description.executionProgress(
        formatNumber(insight.evidence.count, locale),
      );
    case "operationsClear":
      return texts.description.operationsClear();
    case "urgentPurchaseFocus":
      return texts.description.urgentPurchaseFocus(
        (insight.productId ? productNames.get(insight.productId) : undefined) ?? "",
      );
  }
}

export function toSmartInsightRowView(
  insight: SmartInsight,
  locale: Locale,
  texts: SmartInsightsTexts,
  productNames: ReadonlyMap<string, string>,
): SmartInsightRowView {
  return {
    id: insight.id,
    type: insight.type,
    title: texts.itemTitle[insight.type],
    description: descriptionFor(insight, locale, texts, productNames),
    severityLabel: texts.severity[insight.severity],
    tone: SEVERITY_TONE[insight.severity],
  };
}

export function toSmartInsightsView(
  batch: SmartInsightsBatch,
  locale: Locale,
  texts: SmartInsightsTexts,
  productNames: ReadonlyMap<string, string>,
): SmartInsightsView {
  const rows = batch.insights.map((insight) =>
    toSmartInsightRowView(insight, locale, texts, productNames),
  );

  return {
    title: texts.title,
    subtitle: texts.subtitle,
    totalInsights: batch.summary.totalInsights,
    hasInsights: rows.length > 0,
    rows,
    emptyText: texts.empty,
  };
}
