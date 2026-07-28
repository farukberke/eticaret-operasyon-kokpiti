import type { getTranslations } from "next-intl/server";

import type {
  TaskTimelineBatch,
  TaskTimelineGroup,
  TaskTimelineItem,
} from "@/core/domain";
import type { LeadTimeRiskView } from "@/features/products/lead-time-risk-view";
import type { Locale } from "@/i18n/routing";
import { formatNumber } from "@/lib/format";
import type { BadgeTone } from "@/ui/primitives/badge";

import type { PurchaseActionPlanRowView } from "./purchase-action-plan-view";
import {
  toPurchaseActionStatusRowView,
  type PurchaseActionStatusTexts,
} from "./purchase-action-status-view";
import type { PurchasePriorityRowView } from "./purchase-priority-view";

/**
 * GÜNLÜK ZAMAN AKIŞI (TASK TIMELINE) → GÖRÜNÜM.
 *
 * `core` (`buildTaskTimeline`) gruplamayı zaten yaptı; burada eklenen şey
 * yalnızca **çeviri ve birleştirme**: grup başlıkları, sıra göstergesi ve —
 * kokpitte zaten kurulu olan — ürün adı/aksiyon/rütbe/tedarik süresi/durum
 * görünüm haritalarının timeline satırına taşınması. Hiçbir alan burada
 * yeniden hesaplanmaz: `actionPlanRowViews`, `priorityViews`, `leadTimeViews`
 * ve `productNames` çağıranın (`StockAlertsCard`) zaten kurduğu haritalardır
 * — ikinci bir çeviri/hesap üretilmez, yalnızca `productId` ile okunur.
 *
 * Tek geçiş, O(n): `batch.items` bir kez taranır, her satır sabit sayıda
 * `Map.get` ile O(1) zenginleştirilir.
 */

export interface TaskTimelineRowView {
  readonly productId: string;
  /** Grubu içindeki 1 tabanlı sıra göstergesi — "1", "2"… */
  readonly marker: string;
  readonly productName: string;
  readonly rank: number;
  /** Yalnızca ilk `cockpitLimit` üründe dolu — `purchase-priority-view.ts` ile aynı kural. */
  readonly rankLabel: string | null;
  readonly actionLabel: string | null;
  readonly actionTone: BadgeTone | null;
  readonly quantityText: string | null;
  readonly leadTimeText: string | null;
  readonly statusLabel: string;
  readonly statusTone: BadgeTone;
}

export interface TaskTimelineGroupView {
  readonly group: TaskTimelineGroup;
  readonly title: string;
  readonly count: number;
  readonly rows: readonly TaskTimelineRowView[];
}

export interface TaskTimelineView {
  readonly title: string;
  readonly helperText: string;
  /** `now`/`today`/`later` toplamı > 0 ise `true`. */
  readonly hasActiveItems: boolean;
  /** Yalnızca dolu olan aktif gruplar (`now`/`today`/`later`) — boş grup burada hiç yer almaz. */
  readonly activeGroups: readonly TaskTimelineGroupView[];
  readonly emptyActiveText: string;
  readonly completedTitle: string;
  readonly completedRows: readonly TaskTimelineRowView[];
  readonly emptyCompletedText: string;
}

export interface TaskTimelineTexts {
  readonly title: string;
  readonly helperText: string;
  readonly group: Record<TaskTimelineGroup, string>;
  readonly emptyActive: string;
  readonly emptyCompleted: string;
}

export function buildTaskTimelineTexts(
  taskTimeline: Awaited<ReturnType<typeof getTranslations<"taskTimeline">>>,
): TaskTimelineTexts {
  return {
    title: taskTimeline("title"),
    helperText: taskTimeline("helperText"),
    group: {
      now: taskTimeline("group.now"),
      today: taskTimeline("group.today"),
      later: taskTimeline("group.later"),
      completed: taskTimeline("group.completed"),
    },
    emptyActive: taskTimeline("emptyActive"),
    emptyCompleted: taskTimeline("emptyCompleted"),
  };
}

export interface TaskTimelineRowLookups {
  readonly productNames: ReadonlyMap<string, string>;
  readonly actionPlanRowViews: ReadonlyMap<string, PurchaseActionPlanRowView>;
  readonly priorityViews: ReadonlyMap<string, PurchasePriorityRowView>;
  readonly leadTimeViews: ReadonlyMap<string, LeadTimeRiskView>;
}

function toTaskTimelineRowView(
  item: TaskTimelineItem,
  locale: Locale,
  lookups: TaskTimelineRowLookups,
  statusTexts: PurchaseActionStatusTexts,
): TaskTimelineRowView {
  const actionView = lookups.actionPlanRowViews.get(item.productId);
  const priorityView = lookups.priorityViews.get(item.productId);
  const leadTimeView = lookups.leadTimeViews.get(item.productId);
  const statusView = toPurchaseActionStatusRowView(item.status, statusTexts);

  return {
    productId: item.productId,
    marker: formatNumber(item.estimatedOrder, locale),
    productName: lookups.productNames.get(item.productId) ?? "",
    rank: item.rank,
    rankLabel: priorityView?.rankLabel ?? null,
    actionLabel: actionView?.actionLabel ?? null,
    actionTone: actionView?.tone ?? null,
    quantityText: actionView?.quantityText ?? null,
    leadTimeText: leadTimeView?.visible ? leadTimeView.message : null,
    statusLabel: statusView.label,
    statusTone: statusView.tone,
  };
}

const ACTIVE_GROUP_ORDER: readonly Exclude<TaskTimelineGroup, "completed">[] = [
  "now",
  "today",
  "later",
];

export function toTaskTimelineView(
  batch: TaskTimelineBatch,
  locale: Locale,
  lookups: TaskTimelineRowLookups,
  statusTexts: PurchaseActionStatusTexts,
  texts: TaskTimelineTexts,
): TaskTimelineView {
  const rowsByGroup: Record<TaskTimelineGroup, TaskTimelineRowView[]> = {
    now: [],
    today: [],
    later: [],
    completed: [],
  };

  for (const item of batch.items) {
    rowsByGroup[item.group].push(
      toTaskTimelineRowView(item, locale, lookups, statusTexts),
    );
  }

  const activeGroups: TaskTimelineGroupView[] = ACTIVE_GROUP_ORDER.filter(
    (group) => rowsByGroup[group].length > 0,
  ).map((group) => ({
    group,
    title: texts.group[group],
    count: rowsByGroup[group].length,
    rows: rowsByGroup[group],
  }));

  return {
    title: texts.title,
    helperText: texts.helperText,
    hasActiveItems: batch.summary.activeItems > 0,
    activeGroups,
    emptyActiveText: texts.emptyActive,
    completedTitle: texts.group.completed,
    completedRows: rowsByGroup.completed,
    emptyCompletedText: texts.emptyCompleted,
  };
}
