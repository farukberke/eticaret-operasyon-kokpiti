import type { getTranslations } from "next-intl/server";

import { isVisibleByDefault, type PurchaseActionStatus } from "@/core/domain";
import type { PurchaseActionStatusSummary } from "@/core/services/purchase-action-status";
import type { BadgeTone } from "@/ui/primitives/badge";

/**
 * SATIN ALMA EYLEMİ DURUMU → GÖRÜNÜM.
 *
 * `core` durumu zaten tutuyor/özetliyor (`purchase-action-status.ts`); burada
 * eklenen yalnızca **çeviri**: rozet etiketi/tonu, görünürlük, üç aksiyon
 * düğmesinin metni ve özet satırı. Core servis çeviri metni üretmez —
 * `toPurchaseActionPlanRowView`in yaptığı ayrımın burada tekrarı.
 */

const STATUS_TONE: Record<PurchaseActionStatus, BadgeTone> = {
  pending: "neutral",
  done: "success",
  snoozed: "warning",
  ignored: "neutral",
};

export interface PurchaseActionStatusTexts {
  readonly badge: Record<PurchaseActionStatus, string>;
  readonly actions: {
    readonly done: string;
    readonly snooze: string;
    readonly ignore: string;
  };
  readonly summary: {
    readonly open: string;
    readonly done: string;
    readonly snoozed: string;
    readonly ignored: string;
  };
}

export function buildPurchaseActionStatusTexts(
  stockAlerts: Awaited<ReturnType<typeof getTranslations<"stockAlerts">>>,
): PurchaseActionStatusTexts {
  return {
    badge: {
      pending: stockAlerts("actionPlan.status.pending"),
      done: stockAlerts("actionPlan.status.done"),
      snoozed: stockAlerts("actionPlan.status.snoozed"),
      ignored: stockAlerts("actionPlan.status.ignored"),
    },
    actions: {
      done: stockAlerts("actionPlan.statusActions.done"),
      snooze: stockAlerts("actionPlan.statusActions.snooze"),
      ignore: stockAlerts("actionPlan.statusActions.ignore"),
    },
    summary: {
      open: stockAlerts("actionPlan.statusSummary.open"),
      done: stockAlerts("actionPlan.statusSummary.done"),
      snoozed: stockAlerts("actionPlan.statusSummary.snoozed"),
      ignored: stockAlerts("actionPlan.statusSummary.ignored"),
    },
  };
}

export interface PurchaseActionStatusRowView {
  readonly label: string;
  readonly tone: BadgeTone;
  /** Varsayılan görünümde bu satır gösterilsin mi — `core`teki kuralın olduğu gibi taşınması. */
  readonly visible: boolean;
}

export function toPurchaseActionStatusRowView(
  status: PurchaseActionStatus,
  texts: PurchaseActionStatusTexts,
): PurchaseActionStatusRowView {
  return {
    label: texts.badge[status],
    tone: STATUS_TONE[status],
    visible: isVisibleByDefault(status),
  };
}

/** "Açık görevler: 3 · Tamamlandı: 2 · Ertelendi: 1 · Yoksayıldı: 0" — zaten birleştirilmiş, component string kurmaz. */
export function toPurchaseActionStatusSummaryLine(
  summary: PurchaseActionStatusSummary,
  texts: PurchaseActionStatusTexts,
): string {
  const openCount = summary.pendingCount + summary.snoozedCount;
  return [
    `${texts.summary.open}: ${openCount}`,
    `${texts.summary.done}: ${summary.doneCount}`,
    `${texts.summary.snoozed}: ${summary.snoozedCount}`,
    `${texts.summary.ignored}: ${summary.ignoredCount}`,
  ].join(" · ");
}
