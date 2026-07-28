import {
  isVisibleByDefault,
  type MorningBrief,
  type MorningBriefItem,
  type MorningBriefItemKind,
  type PurchaseActionStatusRecord,
} from "../domain";

import type { LeadTimeRiskState } from "./lead-time-risk";
import type { PurchaseActionPlanBatch } from "./purchase-action-plan";
import { statusOf } from "./purchase-action-status";
import type { PurchasePriorityLevel } from "./purchase-priority";

/**
 * SABAH ÖZETİ (AI MORNING BRIEF) — "bugün ne durumdayım" sorusuna 10-15
 * saniyede cevap veren deterministik özet.
 *
 * Girdi tek bir şeydir: `buildPurchaseActionPlan`in çıktısı. O çıktı zaten
 * satın alma önceliğini (`alertState`), tedarik süresi riskini
 * (`leadTimeState`) ve rütbeyi (`rank`) birleştirmiş durumda — burada
 * hiçbiri yeniden hesaplanmaz, yalnızca **sayılır** ve **gruplanır**.
 * Kullanıcının verdiği karar (`PurchaseActionStatusRecord`) `statusOf` ile
 * O(1) okunur (bkz. `purchase-action-status.ts`) — ikinci bir durum
 * modeli icat edilmez, `isVisibleByDefault`teki görünürlük kuralı burada
 * tekrar yazılmaz.
 *
 * "Gerçek AI" değildir: template'ler `features/cockpit/morning-brief-view.ts`de,
 * sabit ve deterministiktir. Bu servis yalnızca ham semantik veriyi üretir —
 * presentation metni burada hiç kurulmaz.
 *
 * Tek geçiş, O(n): `actionPlan.items` bir kez taranır. `items` zaten `rank`e
 * göre sıralı geldiği için (`buildPurchaseActionPlan`in sözleşmesi) `focus`
 * (en yüksek öncelikli aktif aksiyon) ikinci bir sıralama gerektirmez — ilk
 * karşılaşılan aktif satır budur.
 */

const CRITICAL_STOCK_LEVELS: ReadonlySet<PurchasePriorityLevel> =
  new Set<PurchasePriorityLevel>(["negative", "critical"]);

const URGENT_LEAD_TIME_STATES: ReadonlySet<LeadTimeRiskState> =
  new Set<LeadTimeRiskState>(["late", "dueToday"]);

/** Görünüm sırası — `review` gibi burada da talimatın kendisi. */
const ITEM_ORDER: readonly MorningBriefItemKind[] = [
  "activeActions",
  "criticalStock",
  "leadTimeRisk",
  "completedActions",
  "snoozedActions",
];

export function buildMorningBrief(
  actionPlan: PurchaseActionPlanBatch,
  statuses: ReadonlyMap<string, PurchaseActionStatusRecord>,
): MorningBrief {
  let activeActions = 0;
  let completedActions = 0;
  let snoozedActions = 0;
  let ignoredActions = 0;
  let criticalStock = 0;
  let leadTimeRisk = 0;
  let criticalActions = 0;
  let focus: MorningBrief["focus"] = null;

  for (const item of actionPlan.items) {
    const status = statusOf(statuses, item.productId);

    if (!isVisibleByDefault(status)) {
      if (status === "done") completedActions += 1;
      else ignoredActions += 1;
      continue;
    }

    if (status === "snoozed") snoozedActions += 1;
    activeActions += 1;

    const isCriticalStock = CRITICAL_STOCK_LEVELS.has(item.alertState);
    const isUrgentLeadTime = URGENT_LEAD_TIME_STATES.has(item.leadTimeState);
    if (isCriticalStock) criticalStock += 1;
    if (isUrgentLeadTime) leadTimeRisk += 1;
    if (isCriticalStock || isUrgentLeadTime) criticalActions += 1;

    if (focus === null) {
      focus = { productId: item.productId, rank: item.rank };
    }
  }

  const counts: Record<MorningBriefItemKind, number> = {
    activeActions,
    criticalStock,
    leadTimeRisk,
    completedActions,
    snoozedActions,
  };

  const items: MorningBriefItem[] = ITEM_ORDER.filter((kind) => counts[kind] > 0).map(
    (kind) => ({ kind, count: counts[kind] }),
  );

  return {
    summary: {
      total: actionPlan.summary.total,
      activeActions,
      completedActions,
      snoozedActions,
      ignoredActions,
      criticalActions,
    },
    items,
    focus,
  };
}
