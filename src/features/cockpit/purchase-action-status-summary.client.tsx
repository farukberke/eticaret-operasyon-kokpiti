"use client";

import { useMemo } from "react";

import { summarizePurchaseActionStatuses } from "@/core/services/purchase-action-status";

import { useActionStatus } from "./purchase-action-status-provider.client";
import {
  toPurchaseActionStatusSummaryLine,
  type PurchaseActionStatusTexts,
} from "./purchase-action-status-view";

/**
 * "Açık görevler / Tamamlandı / Ertelendi / Yoksayıldı" satırı.
 *
 * `buildPurchaseActionPlan`in ürettiği statik özetin (eylem türüne göre
 * dağılım) **yanına** eklenir, onun yerine geçmez — o özet hâlâ
 * `buildPurchaseActionPlan`in tek geçişte hazırladığı sayılardan, burada.
 * Bu satır ise kullanıcının verdiği kararların (`done`/`snoozed`/`ignored`)
 * dağılımı; yalnızca bu yüzden istemci bileşenidir, geri kalan özet değil.
 */
export function PurchaseActionStatusSummary({
  productIds,
  texts,
}: {
  productIds: readonly string[];
  texts: PurchaseActionStatusTexts;
}) {
  const { states } = useActionStatus();

  const summary = useMemo(
    () => summarizePurchaseActionStatuses(productIds, states),
    [productIds, states],
  );

  if (productIds.length === 0) return null;

  return (
    <p className="text-fg-muted mt-1 text-xs">
      {toPurchaseActionStatusSummaryLine(summary, texts)}
    </p>
  );
}
