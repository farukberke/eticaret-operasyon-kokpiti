"use client";

import { useMemo } from "react";

import type { PurchaseActionPlanBatch } from "@/core/services/purchase-action-plan";
import { buildTaskTimeline } from "@/core/services/task-timeline";
import type { LeadTimeRiskView } from "@/features/products/lead-time-risk-view";
import type { Locale } from "@/i18n/routing";
import { Badge } from "@/ui/primitives/badge";

import type { PurchaseActionPlanRowView } from "./purchase-action-plan-view";
import { useActionStatus } from "./purchase-action-status-provider.client";
import type { PurchaseActionStatusTexts } from "./purchase-action-status-view";
import type { PurchasePriorityRowView } from "./purchase-priority-view";
import { toTaskTimelineView, type TaskTimelineTexts } from "./task-timeline-view";

/**
 * GÜNLÜK ZAMAN AKIŞI — satın alma planını gün içindeki ele alma sırasına
 * göre gruplayan sıralı görünüm.
 *
 * `MorningBriefSummary` ile aynı gerekçeyle istemci bileşeni: gruplama
 * (`buildTaskTimeline`) kullanıcının kararına (`useActionStatus`) bağlıdır ve
 * bu durum yalnızca tarayıcıda (`localStorage`) yaşar, sunucu bilmez.
 *
 * Bileşen yalnızca render eder — filtre/sıralama/gruplama/rütbe hesabı burada
 * YOK: `buildTaskTimeline` (core, gruplama) ve `toTaskTimelineView`
 * (view-model, çeviri) zaten bitirmiş durumda; satır/ürün verisi
 * `actionPlanRowViews`/`priorityViews`/`leadTimeViews`/`productNames`
 * haritalarından — `StockAlertsCard`de zaten kurulu — okunur, ikinci kez
 * hesaplanmaz.
 */
export function TaskTimeline({
  actionPlan,
  locale,
  texts,
  statusTexts,
  productNames,
  actionPlanRowViews,
  priorityViews,
  leadTimeViews,
}: {
  actionPlan: PurchaseActionPlanBatch;
  locale: Locale;
  texts: TaskTimelineTexts;
  statusTexts: PurchaseActionStatusTexts;
  productNames: ReadonlyMap<string, string>;
  actionPlanRowViews: ReadonlyMap<string, PurchaseActionPlanRowView>;
  priorityViews: ReadonlyMap<string, PurchasePriorityRowView>;
  leadTimeViews: ReadonlyMap<string, LeadTimeRiskView>;
}) {
  const { states } = useActionStatus();

  const batch = useMemo(
    () => buildTaskTimeline(actionPlan, states),
    [actionPlan, states],
  );

  const view = useMemo(
    () =>
      toTaskTimelineView(
        batch,
        locale,
        { productNames, actionPlanRowViews, priorityViews, leadTimeViews },
        statusTexts,
        texts,
      ),
    [
      batch,
      locale,
      productNames,
      actionPlanRowViews,
      priorityViews,
      leadTimeViews,
      statusTexts,
      texts,
    ],
  );

  return (
    <div
      className="border-border bg-surface-muted rounded-lg border p-3"
      data-testid="task-timeline"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-fg text-xs font-semibold">{view.title}</p>
        <span className="text-fg-subtle text-xs">{view.helperText}</span>
      </div>

      {!view.hasActiveItems ? (
        <p className="text-fg-muted mt-1.5 text-xs">{view.emptyActiveText}</p>
      ) : (
        <div className="mt-1.5 flex flex-col gap-2">
          {view.activeGroups.map((group) => (
            <div key={group.group}>
              <p className="text-fg-subtle text-xs font-medium">
                {group.title} <span className="tabular">({group.count})</span>
              </p>
              <ul className="mt-1 flex flex-col gap-1">
                {group.rows.map((row) => (
                  <TaskTimelineRow key={row.productId} row={row} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="border-border mt-2 border-t pt-2">
        <p className="text-fg-subtle text-xs font-medium">{view.completedTitle}</p>
        {view.completedRows.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-1">
            {view.completedRows.map((row) => (
              <TaskTimelineRow key={row.productId} row={row} />
            ))}
          </ul>
        ) : (
          <p className="text-fg-muted mt-1 text-xs">{view.emptyCompletedText}</p>
        )}
      </div>
    </div>
  );
}

function TaskTimelineRow({
  row,
}: {
  row: ReturnType<typeof toTaskTimelineView>["activeGroups"][number]["rows"][number];
}) {
  return (
    <li className="border-border bg-surface rounded-md border px-2 py-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-fg-subtle tabular shrink-0">{row.marker}.</span>
        <span className="text-fg min-w-0 flex-1 truncate font-medium">
          {row.productName}
        </span>
        {row.rankLabel ? <Badge tone="accent">{row.rankLabel}</Badge> : null}
        {row.actionLabel ? (
          <Badge tone={row.actionTone ?? "neutral"}>{row.actionLabel}</Badge>
        ) : null}
        <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
      </div>
      {row.quantityText || row.leadTimeText ? (
        <div className="text-fg-muted mt-0.5 flex flex-wrap gap-x-2 pl-4">
          {row.quantityText ? <span>{row.quantityText}</span> : null}
          {row.leadTimeText ? <span>{row.leadTimeText}</span> : null}
        </div>
      ) : null}
    </li>
  );
}
