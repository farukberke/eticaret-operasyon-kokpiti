import type { PurchaseActionStatus } from "./purchase-action-status";

/**
 * UYARI MERKEZİ (NOTIFICATION CENTER) — hazır satın alma planı ve durum
 * kararlarındaki dikkat gerektiren operasyon durumlarının tek bir merkezde
 * toplanmış semantic görünümü.
 *
 * Yeni bir hesap değil: `purchase-action-plan.ts`in ürettiği plan ve
 * `purchase-action-status.ts`in tuttuğu kullanıcı kararı zaten "ne yapılmalı"
 * ve "kullanıcı ne yaptı" sorularını cevaplıyor. Buradaki tipler bu iki
 * kaynaktaki sinyalleri **sınıflandırıp adlandırır** — `morning-brief.ts`/
 * `task-timeline.ts`/`smart-insights.ts` ile aynı statüde bir sunum modeli:
 * kardeş bir aggregation, hiçbirinin girdisi ya da çıktısı değil.
 *
 * Bilinçli olarak `smartInsight` bir tür DEĞİL: `SmartInsightsBatch` bu
 * bileşen ağacında (bkz. `smart-insights.client.tsx`) yalnızca yerel
 * `useMemo` içinde hesaplanıyor, hiçbir üst bileşene paylaşılmış bir prop
 * olarak taşınmıyor. Onu buraya da girdi yapmak ya ikinci bir
 * `buildSmartInsights` çağrısı (gereksiz yeniden hesap) ya da mevcut, çalışan
 * `SmartInsights` bileşenini yeniden kurmak (gereksiz risk) gerektirirdi.
 * Bu servisin zaten kapsadığı dört tür (`criticalAction`/`leadTimeRisk`/
 * `snoozedAction`/`completedAction`) Smart Insights'ın kapsadığı sinyalin
 * aynısını tek kaynaktan (`purchase-action-plan.ts` → `purchase-action-status.ts`)
 * okuduğu için ikinci bir tür eklemek yeni bilgi taşımaz.
 */

/** Beş bildirim türü — repository verisinin desteklediği en küçük anlamlı küme. */
export type OperationalNotificationType =
  /** Aktif (`pending`) plan satırı `actNow` ise — en yüksek `priority.cockpitLimit` kadarı. */
  | "criticalAction"
  /** Aktif (`pending`) plan satırı `actNow` değil ama tedarik süresi late/dueToday ise. */
  | "leadTimeRisk"
  /** En az bir aksiyon kullanıcı tarafından ertelenmiş. */
  | "snoozedAction"
  /** En az bir aksiyon kullanıcı tarafından tamamlanmış işaretlenmiş. */
  | "completedAction"
  /** Kritik/uyarı düzeyinde bildirim yok ve aktif aksiyon sayısı düşük. */
  | "operationsClear";

/** Presentation rengi değil — semantic önem sırası. Rozet/renk çevirisi view-model'de yapılır. */
export type OperationalNotificationSeverity =
  "critical" | "warning" | "positive" | "neutral";

/**
 * Bildirimin dayandığı birincil kaynak — hangi hazır çıktının okunduğunu
 * söyler. Yeni bir hesap kaynağı değildir, yalnızca izlenebilirlik/test
 * amaçlı bir etikettir.
 */
export type OperationalNotificationSource =
  "purchaseActionPlan" | "purchaseActionStatus";

/**
 * Bir bildirimin dayandığı ham kanıt. Her alan her zaman dolu (uygun değilse
 * `null`) — `SmartInsightEvidence` ile aynı şekil.
 */
export interface OperationalNotificationEvidence {
  /** Yalnızca `criticalAction`/`leadTimeRisk`de 1; aggregate türlerde toplam sayı. */
  readonly count: number;
  /** Yalnızca `criticalAction`/`leadTimeRisk`de dolu: plan satırının rütbesi. */
  readonly rank: number | null;
}

export interface OperationalNotification {
  /**
   * Deterministik kimlik — `notification:{type}` ya da (ürüne bağlıysa)
   * `notification:{type}:{productId}`. Rastgele UUID ya da `Date.now`
   * burada hiç kullanılmaz.
   */
  readonly id: string;
  readonly type: OperationalNotificationType;
  readonly severity: OperationalNotificationSeverity;
  readonly source: OperationalNotificationSource;
  /** Yalnızca `criticalAction`/`leadTimeRisk`de dolu; aggregate türlerde `null`. */
  readonly productId: string | null;
  /** Bildirimin dayandığı durum kararı — aggregate türlerde o türü tetikleyen durum. */
  readonly status: PurchaseActionStatus | null;
  readonly evidence: OperationalNotificationEvidence;
}

export interface NotificationCenterSummary {
  readonly totalNotifications: number;
  readonly criticalNotifications: number;
  readonly warningNotifications: number;
  readonly positiveNotifications: number;
  readonly neutralNotifications: number;
  /** Değerlendirmeye alınan aktif (pending/snoozed) aksiyon sayısı — `SmartInsightsSummary.activeRelatedActions` ile aynı kavram. */
  readonly activeRelatedActions: number;
  /** `criticalAction`/`leadTimeRisk` limiti aşıldığı için gösterilmeyen aday sayısı. */
  readonly hiddenByLimit: number;
}

export interface NotificationCenter {
  /** Sabit tür sırasıyla (criticalAction → leadTimeRisk → snoozedAction → completedAction → operationsClear) dizili. */
  readonly notifications: readonly OperationalNotification[];
  readonly summary: NotificationCenterSummary;
}
