import type { getTranslations } from "next-intl/server";

import type {
  PurchaseActionKind,
  PurchaseActionPlanBatch,
  PurchaseActionPlanItem,
  PurchaseActionReasonCode,
} from "@/core/services/purchase-action-plan";
import type { Locale } from "@/i18n/routing";
import { formatNumber } from "@/lib/format";
import type { BadgeTone } from "@/ui/primitives/badge";

/**
 * GÜNLÜK SATIN ALMA EYLEM PLANI → GÖRÜNÜM.
 *
 * `core` sınıflandırmayı zaten yaptı (`buildPurchaseActionPlan`); burada
 * eklenen şey yalnızca **çeviri**: eylem etiketi/tonu, miktar metni, özet
 * satırları ve görünürlük kararları. Component burada üretilen metni
 * olduğu gibi basar — filtre, sıralama ya da reason-code karşılaştırması
 * component tarafında yapılmaz.
 *
 * Satır düzeyinde yalnızca kısa bir eylem rozeti (`actionLabel`/`tone`)
 * kart tarafından kullanılır: gerekçe ve miktar metinleri burada üretilir
 * ama satır zaten `view.reason`, `priorityView.impact` ve `leadTimeView`
 * aracılığıyla "neden" sorusunu cevaplıyor — burada ikinci bir "neden"
 * cümlesi tekrar basılmaz. `reasonText`/`quantityText` sözleşmenin bir
 * parçası olarak (ve test edilebilir biçimde) üretilir, tüketimi ekranın
 * ihtiyacına kalmıştır.
 */

const ACTION_ORDER: readonly PurchaseActionKind[] = [
  "actNow",
  "decideToday",
  "planSoon",
  "completeData",
];

const ACTION_TONE: Record<PurchaseActionKind, BadgeTone> = {
  actNow: "danger",
  decideToday: "warning",
  planSoon: "info",
  completeData: "neutral",
  review: "neutral",
};

export interface PurchaseActionPlanRowView {
  readonly productId: string;
  readonly rank: number;
  readonly actionLabel: string;
  readonly tone: BadgeTone;
  /** "Neden bu aksiyon?" cümlesi — sözleşmenin parçası, satırda tekrar basılmaz. */
  readonly reasonText: string;
  /** "24 adet sipariş değerlendirin" / "Önce stok bilgisini düzeltin" / `null`. */
  readonly quantityText: string | null;
}

export interface PurchaseActionPlanSummaryRow {
  readonly action: PurchaseActionKind;
  readonly label: string;
  readonly count: number;
  /** "Hemen ele al: 2" — zaten birleştirilmiş, component string kurmaz. */
  readonly line: string;
}

export interface PurchaseActionPlanSummaryView {
  /** Plan boş değilse `true` — `false` ise sakin boş durum metni gösterilir. */
  readonly hasActions: boolean;
  readonly title: string;
  /** Her zaman dört ana kategori — `review` yalnızca sayısı > 0 ise eklenir. */
  readonly rows: readonly PurchaseActionPlanSummaryRow[];
  readonly emptyText: string;
}

export interface PurchaseActionPlanTexts {
  readonly title: string;
  readonly empty: string;
  readonly action: Record<PurchaseActionKind, string>;
  readonly summaryLine: (label: string, count: string) => string;
  readonly reason: Record<PurchaseActionReasonCode, string>;
  readonly quantity: {
    readonly suggested: (count: string) => string;
    readonly correctStock: string;
    readonly needsStockData: string;
  };
}

/**
 * `stockAlerts` sözlüğünden kurulur — yeni bir ad alanı açılmadı, tıpkı
 * `lead-time-risk-view.ts`nin `stockAlerts.leadTime`i kullanması gibi bu da
 * `stockAlerts.actionPlan`i kullanır. Miktar metninin "suggested" hali için
 * ikinci bir anahtar icat edilmedi: mevcut `stockAlerts.reorder.quantity`
 * aynen kullanılır.
 */
export function buildPurchaseActionPlanTexts(
  stockAlerts: Awaited<ReturnType<typeof getTranslations<"stockAlerts">>>,
): PurchaseActionPlanTexts {
  return {
    title: stockAlerts("actionPlan.title"),
    empty: stockAlerts("actionPlan.empty"),
    action: {
      actNow: stockAlerts("actionPlan.action.actNow"),
      decideToday: stockAlerts("actionPlan.action.decideToday"),
      planSoon: stockAlerts("actionPlan.action.planSoon"),
      completeData: stockAlerts("actionPlan.action.completeData"),
      review: stockAlerts("actionPlan.action.review"),
    },
    summaryLine: (label, count) =>
      stockAlerts("actionPlan.summaryLine", { label, count }),
    reason: {
      stockAlreadyNegative: stockAlerts("actionPlan.reason.stockAlreadyNegative"),
      leadTimeAlreadyLate: stockAlerts("actionPlan.reason.leadTimeAlreadyLate"),
      orderDueToday: stockAlerts("actionPlan.reason.orderDueToday"),
      decisionWindowApproaching: stockAlerts(
        "actionPlan.reason.decisionWindowApproaching",
      ),
      leadTimeMissing: stockAlerts("actionPlan.reason.leadTimeMissing"),
      stockDataMissing: stockAlerts("actionPlan.reason.stockDataMissing"),
      criticalStock: stockAlerts("actionPlan.reason.criticalStock"),
      lowStock: stockAlerts("actionPlan.reason.lowStock"),
    },
    quantity: {
      suggested: (count) => stockAlerts("reorder.quantity", { count }),
      correctStock: stockAlerts("actionPlan.quantity.correctStock"),
      needsStockData: stockAlerts("actionPlan.quantity.needsStockData"),
    },
  };
}

/**
 * Miktar metni yalnızca `recommendedQuantity` doluysa sayıyı taşır —
 * `null` olduğunda **neden** null olduğu `reason`dan okunur: `negative`
 * grubu (`stockAlreadyNegative`) önce veri düzeltme ister, `stockDataMissing`
 * miktarın hiç hesaplanamadığını söyler. Diğer tüm durumlarda (öneri
 * gerçekten `none` döndüyse) miktar metni **yoktur** — uydurma bir cümle
 * kurulmaz.
 */
function quantityTextFor(
  item: PurchaseActionPlanItem,
  locale: Locale,
  texts: PurchaseActionPlanTexts,
): string | null {
  if (item.recommendedQuantity !== null) {
    return texts.quantity.suggested(formatNumber(item.recommendedQuantity, locale));
  }
  if (item.reason === "stockDataMissing") return texts.quantity.needsStockData;
  if (item.reason === "stockAlreadyNegative") return texts.quantity.correctStock;
  return null;
}

export function toPurchaseActionPlanRowView(
  item: PurchaseActionPlanItem,
  locale: Locale,
  texts: PurchaseActionPlanTexts,
): PurchaseActionPlanRowView {
  return {
    productId: item.productId,
    rank: item.rank,
    actionLabel: texts.action[item.action],
    tone: ACTION_TONE[item.action],
    reasonText: texts.reason[item.reason],
    quantityText: quantityTextFor(item, locale, texts),
  };
}

export function toPurchaseActionPlanRowViews(
  items: readonly PurchaseActionPlanItem[],
  locale: Locale,
  texts: PurchaseActionPlanTexts,
): ReadonlyMap<string, PurchaseActionPlanRowView> {
  return new Map(
    items.map((item) => [
      item.productId,
      toPurchaseActionPlanRowView(item, locale, texts),
    ]),
  );
}

/**
 * Kompakt özet — tek geçişte hazırlanan `PurchaseActionPlanSummary`den
 * kurulur, component'te `filter`/toplama yapılmaz.
 *
 * Dört ana kategori her zaman gösterilir (görev tanımındaki örnekle aynı
 * biçim); `review` yalnızca gerçekten oluştuysa (`reviewCount > 0`) eklenir
 * — bu durum "yalnızca gerçekten gerekiyorsa kullanılmalı" ilkesiyle aynı
 * ruhta, özet satırında da gereksiz bir sıfır satırı göstermez.
 */
export function toPurchaseActionPlanSummaryView(
  plan: PurchaseActionPlanBatch,
  locale: Locale,
  texts: PurchaseActionPlanTexts,
): PurchaseActionPlanSummaryView {
  const countOf: Record<PurchaseActionKind, number> = {
    actNow: plan.summary.actNowCount,
    decideToday: plan.summary.decideTodayCount,
    planSoon: plan.summary.planSoonCount,
    completeData: plan.summary.completeDataCount,
    review: plan.summary.reviewCount,
  };

  const hasActions = plan.summary.total > 0;
  const visibleActions = !hasActions
    ? []
    : plan.summary.reviewCount > 0
      ? [...ACTION_ORDER, "review" as const]
      : ACTION_ORDER;

  const rows: PurchaseActionPlanSummaryRow[] = visibleActions.map((action) => {
    const label = texts.action[action];
    const count = countOf[action];
    return {
      action,
      label,
      count,
      line: texts.summaryLine(label, formatNumber(count, locale)),
    };
  });

  return {
    hasActions,
    title: texts.title,
    rows,
    emptyText: texts.empty,
  };
}
