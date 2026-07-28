"use client";

import { useMemo } from "react";

import { buildMorningBrief } from "@/core/services/ai-morning-brief";
import type { PurchaseActionPlanBatch } from "@/core/services/purchase-action-plan";
import type { Locale } from "@/i18n/routing";
import { Badge } from "@/ui/primitives/badge";

import { toMorningBriefView, type MorningBriefTexts } from "./morning-brief-view";
import type { PurchaseActionPlanRowView } from "./purchase-action-plan-view";
import { useActionStatus } from "./purchase-action-status-provider.client";

/**
 * SABAH ÖZETİ — satın alma planının 10-15 saniyelik özeti.
 *
 * `buildMorningBrief` hiçbir şey hesaplamaz; `actionPlan`i (zaten sunucuda
 * hesaplanmış) ve kullanıcının kararlarını (`useActionStatus`) okur, yalnızca
 * sayar. Bu yüzden istemci bileşeni: durum `localStorage`da yaşıyor, sunucu
 * bunu bilmiyor — `PurchaseActionStatusSummary`nin aynı gerekçesi.
 *
 * `<PurchaseActionStatusProvider>`in içine, `PurchaseActionStatusSummary` ile
 * aynı bağlama render edilmesi gerekir — aksi halde ayrı bir durum kopyası
 * kurulur ve ikisi birbirinden bağımsız kayar.
 */
export function MorningBriefSummary({
  actionPlan,
  locale,
  texts,
  actionPlanRowViews,
}: {
  actionPlan: PurchaseActionPlanBatch;
  locale: Locale;
  texts: MorningBriefTexts;
  /**
   * `StockAlertsCard`de zaten kurulan görünüm haritası — odak satırının
   * eylem/gerekçe metni buradan okunur, ikinci bir çeviri üretilmez.
   */
  actionPlanRowViews: ReadonlyMap<string, PurchaseActionPlanRowView>;
}) {
  const { states } = useActionStatus();

  const brief = useMemo(
    () => buildMorningBrief(actionPlan, states),
    [actionPlan, states],
  );
  const view = useMemo(
    () => toMorningBriefView(brief, locale, texts),
    [brief, locale, texts],
  );
  const focusRowView = brief.focus
    ? actionPlanRowViews.get(brief.focus.productId)
    : undefined;

  return (
    <div className="border-border bg-surface-muted rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-fg text-xs font-semibold">{view.title}</p>
        <span className="text-fg-subtle text-xs">{view.subtitle}</span>
        {view.hasActivity ? (
          <Badge tone={view.severityTone}>{view.severityLabel}</Badge>
        ) : null}
      </div>

      {!view.hasActivity ? (
        <p className="text-fg-muted mt-1 text-xs">{view.allClearText}</p>
      ) : (
        <>
          {focusRowView ? (
            <div className="mt-1.5">
              <p className="text-fg-subtle text-xs">{view.prioritiesTitle}</p>
              <p className="text-fg text-sm font-medium">{focusRowView.actionLabel}</p>
              <p className="text-fg-muted text-xs">{focusRowView.reasonText}</p>
            </div>
          ) : null}

          <div className="mt-1.5">
            <p className="text-fg-subtle text-xs">{view.todayTasksLabel}</p>
            <ul className="text-fg-muted mt-0.5 flex flex-col gap-0.5 text-xs">
              {view.lines.map((line) => (
                <li key={line.kind}>{line.text}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
