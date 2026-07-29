"use client";

import { useMemo } from "react";

import { buildSmartInsights } from "@/core/services/smart-insights";
import type { PurchaseActionPlanBatch } from "@/core/services/purchase-action-plan";
import type { Locale } from "@/i18n/routing";
import { Badge } from "@/ui/primitives/badge";

import { useActionStatus } from "./purchase-action-status-provider.client";
import { toSmartInsightsView, type SmartInsightsTexts } from "./smart-insights-view";

/**
 * AKILLI İÇGÖRÜLER — hazır satın alma planındaki örüntülerin kısa semantic
 * özeti.
 *
 * `MorningBriefSummary`/`TaskTimeline` ile aynı gerekçeyle istemci
 * bileşeni: `buildSmartInsights` kullanıcının kararına (`useActionStatus`)
 * bağlıdır ve bu durum yalnızca tarayıcıda (`localStorage`) yaşar. Aynı
 * `<PurchaseActionStatusProvider>`i okur — ikinci bir durum kopyası
 * kurulmaz.
 *
 * Bileşen yalnızca render eder: sınıflandırma (`buildSmartInsights`, core)
 * ve çeviri (`toSmartInsightsView`, view-model) burada tekrarlanmaz;
 * component içinde filter/sort/reduce ya da severity/eşik hesabı yoktur.
 */
export function SmartInsights({
  actionPlan,
  locale,
  texts,
  productNames,
}: {
  actionPlan: PurchaseActionPlanBatch;
  locale: Locale;
  texts: SmartInsightsTexts;
  /** `StockAlertsCard`de zaten kurulan ürün adı haritası — ikinci bir çeviri üretilmez. */
  productNames: ReadonlyMap<string, string>;
}) {
  const { states } = useActionStatus();

  const batch = useMemo(
    () => buildSmartInsights(actionPlan, states),
    [actionPlan, states],
  );
  const view = useMemo(
    () => toSmartInsightsView(batch, locale, texts, productNames),
    [batch, locale, texts, productNames],
  );

  return (
    <div
      className="border-border bg-surface-muted rounded-lg border p-3"
      data-testid="smart-insights"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-fg text-xs font-semibold">{view.title}</h3>
        <span className="text-fg-subtle text-xs">{view.subtitle}</span>
      </div>

      {!view.hasInsights ? (
        <p className="text-fg-muted mt-1.5 text-xs">{view.emptyText}</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {view.rows.map((row) => (
            <li
              key={row.id}
              className="border-border bg-surface rounded-md border px-2 py-1.5 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={row.tone}>{row.severityLabel}</Badge>
                <span className="text-fg font-medium">{row.title}</span>
              </div>
              <p className="text-fg-muted mt-0.5">{row.description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
