import {
  isVisibleByDefault,
  type PurchaseActionStatusRecord,
  type SmartInsight,
  type SmartInsightsBatch,
  type SmartInsightsSummary,
  type SmartInsightSeverity,
  type SmartInsightType,
} from "../domain";

import type { LeadTimeRiskState } from "./lead-time-risk";
import type {
  PurchaseActionPlanBatch,
  PurchaseActionPlanItem,
} from "./purchase-action-plan";
import { statusOf } from "./purchase-action-status";
import type { PurchasePriorityLevel } from "./purchase-priority";
import { DEFAULT_RULES } from "./rules.config";

/**
 * AKILLI İÇGÖRÜLER — hazır satın alma planından "neden dikkat etmelisin"
 * sorusuna cevap veren kısa, kural tabanlı ve deterministik özet.
 *
 * Gerçek AI değildir. Girdi tek bir kaynak zinciridir — tıpkı
 * `ai-morning-brief.ts` ve `task-timeline.ts` gibi:
 *
 *   Purchase Action Plan → Purchase Action Status → Smart Insights
 *
 * `buildPurchaseActionPlan`in çıktısı (rütbe, stok alarm grubu, tedarik
 * süresi durumu, aksiyon türü zaten hazır) ve kullanıcının durum kararı
 * (`statusOf` ile O(1)) burada **yeniden hesaplanmaz** — yalnızca sayılır ve
 * sınıflandırılır. Morning Brief ya da Task Timeline'ın çıktısı hiç
 * okunmaz: üçü kardeş sunum özellikleridir, biri diğerinin girdisi değildir.
 *
 * Tek geçiş, O(n): `actionPlan.items` bir kez taranır. Çıktı dizisi
 * `Array.prototype.sort` hiç çağırmadan, sabit önem sırasıyla (critical →
 * warning → positive → neutral) doğrudan kurulur — en fazla altı içgörü
 * türü olduğu için bu sabit sıralama, ek bir sıralama adımına gerek
 * bırakmaz.
 */

const CRITICAL_STOCK_LEVELS: ReadonlySet<PurchasePriorityLevel> =
  new Set<PurchasePriorityLevel>(["negative", "critical"]);

const URGENT_LEAD_TIME_STATES: ReadonlySet<LeadTimeRiskState> =
  new Set<LeadTimeRiskState>(["late", "dueToday"]);

const SEVERITY_BY_TYPE: Record<SmartInsightType, SmartInsightSeverity> = {
  criticalStockPressure: "critical",
  urgentPurchaseFocus: "critical",
  leadTimeExposure: "warning",
  snoozedActionBacklog: "warning",
  executionProgress: "positive",
  operationsClear: "neutral",
};

/** Deterministik kimlik — rastgele kimlik üretimi ya da `Date.now` hiç kullanılmaz. */
function insightId(type: SmartInsightType, productId?: string): string {
  return productId ? `smart-insight:${type}:${productId}` : `smart-insight:${type}`;
}

function insightOf(
  type: SmartInsightType,
  params: {
    readonly productId?: string;
    readonly relatedProductIds?: readonly string[];
    readonly count: number;
    readonly rank?: number;
  },
): SmartInsight {
  return {
    id: insightId(type, params.productId),
    type,
    severity: SEVERITY_BY_TYPE[type],
    productId: params.productId ?? null,
    relatedProductIds: params.relatedProductIds ?? [],
    evidence: { count: params.count, rank: params.rank ?? null },
  };
}

export function buildSmartInsights(
  actionPlan: PurchaseActionPlanBatch,
  statuses: ReadonlyMap<string, PurchaseActionStatusRecord>,
): SmartInsightsBatch {
  let activeCount = 0;
  let doneCount = 0;
  const criticalStockProductIds: string[] = [];
  const leadTimeProductIds: string[] = [];
  const snoozedProductIds: string[] = [];
  const doneProductIds: string[] = [];
  let focus: PurchaseActionPlanItem | null = null;

  for (const item of actionPlan.items) {
    const status = statusOf(statuses, item.productId);

    if (!isVisibleByDefault(status)) {
      if (status === "done") {
        doneCount += 1;
        doneProductIds.push(item.productId);
      }
      continue;
    }

    activeCount += 1;
    if (status === "snoozed") snoozedProductIds.push(item.productId);

    if (CRITICAL_STOCK_LEVELS.has(item.alertState)) {
      criticalStockProductIds.push(item.productId);
    }
    if (URGENT_LEAD_TIME_STATES.has(item.leadTimeState)) {
      leadTimeProductIds.push(item.productId);
    }

    if (focus === null) focus = item;
  }

  const insights: SmartInsight[] = [];
  const severityCounts: Record<SmartInsightSeverity, number> = {
    critical: 0,
    warning: 0,
    positive: 0,
    neutral: 0,
  };

  function push(insight: SmartInsight): void {
    insights.push(insight);
    severityCounts[insight.severity] += 1;
  }

  if (
    criticalStockProductIds.length >=
    DEFAULT_RULES.smartInsights.criticalStockPressureMinCount
  ) {
    push(
      insightOf("criticalStockPressure", {
        relatedProductIds: criticalStockProductIds,
        count: criticalStockProductIds.length,
      }),
    );
  }

  if (focus !== null && focus.action === "actNow") {
    push(
      insightOf("urgentPurchaseFocus", {
        productId: focus.productId,
        count: 1,
        rank: focus.rank,
      }),
    );
  }

  if (leadTimeProductIds.length > 0) {
    push(
      insightOf("leadTimeExposure", {
        relatedProductIds: leadTimeProductIds,
        count: leadTimeProductIds.length,
      }),
    );
  }

  if (snoozedProductIds.length > 0) {
    push(
      insightOf("snoozedActionBacklog", {
        relatedProductIds: snoozedProductIds,
        count: snoozedProductIds.length,
      }),
    );
  }

  if (doneCount > 0) {
    push(
      insightOf("executionProgress", {
        relatedProductIds: doneProductIds,
        count: doneCount,
      }),
    );
  }

  // Yalnızca gerçekten değerlendirilecek bir plan varsa ve kritik/uyarı
  // düzeyinde hiçbir içgörü oluşmadıysa, düşük aktif hacim "operasyon
  // kontrol altında" denir. Boş plan (`actionPlan.items.length === 0`) için
  // hiçbir iddia üretilmez — bu durumda `insights` boş kalır.
  const hasCriticalOrWarning =
    severityCounts.critical > 0 || severityCounts.warning > 0;
  if (
    actionPlan.items.length > 0 &&
    !hasCriticalOrWarning &&
    activeCount <= DEFAULT_RULES.taskTimeline.nowLimit
  ) {
    push(insightOf("operationsClear", { count: activeCount }));
  }

  const summary: SmartInsightsSummary = {
    totalInsights: insights.length,
    criticalInsights: severityCounts.critical,
    warningInsights: severityCounts.warning,
    positiveInsights: severityCounts.positive,
    neutralInsights: severityCounts.neutral,
    activeRelatedActions: activeCount,
  };

  return { insights, summary };
}
