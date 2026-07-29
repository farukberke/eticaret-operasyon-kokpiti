import {
  type NotificationCenter,
  type NotificationCenterSummary,
  type OperationalNotification,
  type OperationalNotificationSeverity,
  type OperationalNotificationSource,
  type OperationalNotificationType,
  type PurchaseActionStatusRecord,
} from "../domain";

import type { LeadTimeRiskState } from "./lead-time-risk";
import type {
  PurchaseActionPlanBatch,
  PurchaseActionPlanItem,
} from "./purchase-action-plan";
import { statusOf } from "./purchase-action-status";
import { DEFAULT_RULES } from "./rules.config";

/**
 * UYARI MERKEZİ — hazır satın alma planından ve kullanıcı kararından "şu an
 * dikkat gerektiren ne var" sorusuna cevap veren kısa, kural tabanlı ve
 * deterministik bildirim listesi.
 *
 * Gerçek bir bildirim gönderim sistemi değildir. Girdi tek bir kaynak
 * zinciridir — tıpkı `ai-morning-brief.ts`, `task-timeline.ts` ve
 * `smart-insights.ts` gibi:
 *
 *   Purchase Action Plan → Purchase Action Status → Notification Center
 *
 * `buildPurchaseActionPlan`in çıktısı (rütbe, aksiyon türü, tedarik süresi
 * durumu zaten hazır) ve kullanıcının durum kararı (`statusOf` ile O(1))
 * burada **yeniden hesaplanmaz** — yalnızca sayılır ve sınıflandırılır.
 * Forecast/stok uyarısı/yeniden sipariş/satın alma önceliği/satın alma planı/
 * sabah özeti/günlük zaman akışı burada hiç import edilmez, hiç çağrılmaz.
 *
 * `smart-insights.ts` de burada import edilmez: `SmartInsightsBatch` bileşen
 * ağacında yalnızca `smart-insights.client.tsx`nin yerel `useMemo`si içinde
 * yaşıyor, hiçbir üst bileşene paylaşılan bir prop değil. Onu ikinci bir
 * `buildSmartInsights` çağrısıyla burada da hesaplamak duplicate bir hesap
 * olurdu; bu servisin kapsadığı dört tür zaten aynı iki kaynağı (plan +
 * durum) okuyarak aynı bilgiyi taşıyor, ikinci bir `smartInsight` türü yeni
 * bilgi eklemezdi.
 *
 * Tek geçiş, O(n): `actionPlan.items` bir kez taranır. Çıktı dizisi
 * `Array.prototype.sort` hiç çağrılmadan, sabit tür sırasıyla (criticalAction
 * → leadTimeRisk → snoozedAction → completedAction → operationsClear)
 * doğrudan kurulur.
 */

const URGENT_LEAD_TIME_STATES: ReadonlySet<LeadTimeRiskState> =
  new Set<LeadTimeRiskState>(["late", "dueToday"]);

const SEVERITY_BY_TYPE: Record<
  OperationalNotificationType,
  OperationalNotificationSeverity
> = {
  criticalAction: "critical",
  leadTimeRisk: "warning",
  snoozedAction: "warning",
  completedAction: "positive",
  operationsClear: "neutral",
};

const SOURCE_BY_TYPE: Record<
  OperationalNotificationType,
  OperationalNotificationSource
> = {
  criticalAction: "purchaseActionPlan",
  leadTimeRisk: "purchaseActionPlan",
  snoozedAction: "purchaseActionStatus",
  completedAction: "purchaseActionStatus",
  operationsClear: "purchaseActionPlan",
};

/** Deterministik kimlik — rastgele kimlik üretimi ya da `Date.now` hiç kullanılmaz. */
function notificationId(type: OperationalNotificationType, productId?: string): string {
  return productId ? `notification:${type}:${productId}` : `notification:${type}`;
}

function notificationOf(
  type: OperationalNotificationType,
  params: {
    readonly productId?: string;
    readonly status: OperationalNotification["status"];
    readonly count: number;
    readonly rank?: number;
  },
): OperationalNotification {
  return {
    id: notificationId(type, params.productId),
    type,
    severity: SEVERITY_BY_TYPE[type],
    source: SOURCE_BY_TYPE[type],
    productId: params.productId ?? null,
    status: params.status,
    evidence: { count: params.count, rank: params.rank ?? null },
  };
}

/**
 * `criticalAction`/`leadTimeRisk` adayları kaç tanesi gösterilsin.
 *
 * Yeni bir sayı DEĞİL: `DEFAULT_RULES.priority.cockpitLimit` — kokpitte zaten
 * "Öncelik #1-3" rozetiyle öne çıkan ürün sayısının aynısı
 * (`taskTimeline.nowLimit`in de aynı gerekçeyle bu sayıyı tekrar kullanması
 * gibi). İkinci bir "en önemli N bildirim" tanımı icat edilmez. İki tür de
 * **ayrı ayrı** bu sınırla kesilir — kritik bildirimler, uyarı düzeyindeki
 * tedarik süresi bildirimleri yüzünden asla kesilmez.
 */
const MAX_PER_TYPE = DEFAULT_RULES.priority.cockpitLimit;

/**
 * Günlük Uyarı Merkezi — **tek geçiş**, forecast/reorder/tedarik süresi/
 * satın alma önceliği/satın alma planı/sabah özeti/günlük zaman akışı/
 * akıllı içgörüler hiçbiri yeniden hesaplanmaz.
 *
 * `actionPlan.items` zaten `PurchaseActionPlanItem.rank`e göre dizili gelir
 * (bkz. `buildPurchaseActionPlan`) ve bu sıra **olduğu gibi** korunur —
 * `criticalAction`/`leadTimeRisk` adayları bu sırayla toplanır, burada
 * ikinci bir sıralama yapılmaz.
 */
export function buildNotificationCenter(
  actionPlan: PurchaseActionPlanBatch,
  statuses: ReadonlyMap<string, PurchaseActionStatusRecord>,
): NotificationCenter {
  const criticalCandidates: PurchaseActionPlanItem[] = [];
  const leadTimeCandidates: PurchaseActionPlanItem[] = [];
  let activeCount = 0;
  let snoozedCount = 0;
  let doneCount = 0;

  for (const item of actionPlan.items) {
    const status = statusOf(statuses, item.productId);

    if (status === "ignored") continue;

    if (status === "done") {
      doneCount += 1;
      continue;
    }

    // pending ya da snoozed: `isVisibleByDefault` ile aynı görünürlük kuralı.
    activeCount += 1;

    if (status === "snoozed") {
      // Ertelenmiş bir aksiyon kritik olsa bile burada ikinci kez
      // `criticalAction`/`leadTimeRisk` adayı yapılmaz — "tamamen
      // kaybolmama" garantisi `snoozedAction` bildirimiyle (aşağıda)
      // sağlanır, aynı ürün iki bildirimde birden görünmez.
      snoozedCount += 1;
      continue;
    }

    // status === "pending"
    if (item.action === "actNow") {
      criticalCandidates.push(item);
    } else if (URGENT_LEAD_TIME_STATES.has(item.leadTimeState)) {
      leadTimeCandidates.push(item);
    }
  }

  const notifications: OperationalNotification[] = [];
  const severityCounts: Record<OperationalNotificationSeverity, number> = {
    critical: 0,
    warning: 0,
    positive: 0,
    neutral: 0,
  };

  function push(notification: OperationalNotification): void {
    notifications.push(notification);
    severityCounts[notification.severity] += 1;
  }

  for (const item of criticalCandidates.slice(0, MAX_PER_TYPE)) {
    push(
      notificationOf("criticalAction", {
        productId: item.productId,
        status: "pending",
        count: 1,
        rank: item.rank,
      }),
    );
  }

  for (const item of leadTimeCandidates.slice(0, MAX_PER_TYPE)) {
    push(
      notificationOf("leadTimeRisk", {
        productId: item.productId,
        status: "pending",
        count: 1,
        rank: item.rank,
      }),
    );
  }

  const hiddenByLimit =
    Math.max(0, criticalCandidates.length - MAX_PER_TYPE) +
    Math.max(0, leadTimeCandidates.length - MAX_PER_TYPE);

  if (snoozedCount > 0) {
    push(notificationOf("snoozedAction", { status: "snoozed", count: snoozedCount }));
  }

  if (doneCount > 0) {
    push(notificationOf("completedAction", { status: "done", count: doneCount }));
  }

  // Yalnızca gerçekten değerlendirilecek bir plan varsa, kritik/uyarı
  // düzeyinde hiçbir bildirim oluşmadıysa ve aktif hacim düşükse "operasyon
  // kontrol altında" denir — `smart-insights.ts`teki `operationsClear`
  // kararının birebir aynısı. Boş plan için hiçbir iddia üretilmez.
  const hasCriticalOrWarning =
    severityCounts.critical > 0 || severityCounts.warning > 0;
  if (
    actionPlan.items.length > 0 &&
    !hasCriticalOrWarning &&
    activeCount <= DEFAULT_RULES.taskTimeline.nowLimit
  ) {
    push(notificationOf("operationsClear", { status: null, count: activeCount }));
  }

  const summary: NotificationCenterSummary = {
    totalNotifications: notifications.length,
    criticalNotifications: severityCounts.critical,
    warningNotifications: severityCounts.warning,
    positiveNotifications: severityCounts.positive,
    neutralNotifications: severityCounts.neutral,
    activeRelatedActions: activeCount,
    hiddenByLimit,
  };

  return { notifications, summary };
}
