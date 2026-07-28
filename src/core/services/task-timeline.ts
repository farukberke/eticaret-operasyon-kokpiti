import type {
  PurchaseActionStatusRecord,
  TaskTimelineBatch,
  TaskTimelineGroup,
  TaskTimelineItem,
  TaskTimelineSummary,
} from "../domain";

import type { PurchaseActionPlanBatch } from "./purchase-action-plan";
import { statusOf } from "./purchase-action-status";
import { DEFAULT_RULES } from "./rules.config";

/**
 * GÜNLÜK ZAMAN AKIŞI (TASK TIMELINE) — hazır planı gruplara böler.
 *
 * Girdisi yalnızca `buildPurchaseActionPlan`in çıktısı (`PurchaseActionPlanBatch`,
 * zaten rütbeli) ve `purchase-action-status.ts`in tuttuğu karar haritasıdır.
 * Forecast/stok uyarısı/yeniden sipariş/tedarik süresi/satın alma önceliği/
 * satın alma planı/sabah özeti burada **hiç yeniden hesaplanmaz** — yalnızca
 * `PurchaseActionPlanItem.rank` sırası korunarak dört deterministik gruba
 * (`now`/`today`/`later`/`completed`) bölünür.
 *
 * Tek geçiş, O(n): `actionPlan.items` bir kez taranır, durum `statusOf` ile
 * O(1) okunur (bkz. `purchase-action-status.ts`). `Array.prototype.sort` hiç
 * çağrılmaz — girdi zaten rütbeye göre dizili gelir (`buildPurchaseActionPlan`in
 * sözleşmesi) ve bu sıra olduğu gibi korunur.
 */

/**
 * Karar tablosu: durum → grup.
 *
 * `done` ve `snoozed` rütbeden bağımsız sabit bir gruba düşer. `ignored`
 * burada hiç üretilmez (çağıran `continue` ile atlar). `pending` tek
 * belirsiz durumdur — sırası `pendingSeen` sayacıyla (bkz. `groupFor`)
 * `now`/`today`/`later` arasında bölünür.
 */
function groupFor(
  status: PurchaseActionStatusRecord["status"],
  pendingSeen: number,
): TaskTimelineGroup {
  if (status === "done") return "completed";
  if (status === "snoozed") return "later";

  // pending: rütbe sırasındaki konumu (`pendingSeen`) aktif gruplar arasında böler.
  if (pendingSeen <= DEFAULT_RULES.taskTimeline.nowLimit) return "now";
  if (
    pendingSeen <=
    DEFAULT_RULES.taskTimeline.nowLimit + DEFAULT_RULES.taskTimeline.todayLimit
  ) {
    return "today";
  }
  return "later";
}

const EMPTY_GROUP_COUNTS: Record<TaskTimelineGroup, number> = {
  now: 0,
  today: 0,
  later: 0,
  completed: 0,
};

export function buildTaskTimeline(
  actionPlan: PurchaseActionPlanBatch,
  statuses: ReadonlyMap<string, PurchaseActionStatusRecord>,
): TaskTimelineBatch {
  const groupCounts: Record<TaskTimelineGroup, number> = { ...EMPTY_GROUP_COUNTS };
  const items: TaskTimelineItem[] = [];
  let pendingSeen = 0;

  for (const planItem of actionPlan.items) {
    const status = statusOf(statuses, planItem.productId);
    if (status === "ignored") continue;

    if (status === "pending") pendingSeen += 1;
    const group = groupFor(status, pendingSeen);
    groupCounts[group] += 1;

    items.push({
      actionId: planItem.productId,
      productId: planItem.productId,
      rank: planItem.rank,
      status,
      group,
      estimatedOrder: groupCounts[group],
    });
  }

  const summary: TaskTimelineSummary = {
    totalItems: items.length,
    activeItems: groupCounts.now + groupCounts.today + groupCounts.later,
    nowItems: groupCounts.now,
    todayItems: groupCounts.today,
    laterItems: groupCounts.later,
    completedItems: groupCounts.completed,
  };

  return { items, summary };
}
