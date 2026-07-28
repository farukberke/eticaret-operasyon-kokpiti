import type { PurchaseActionStatus } from "./purchase-action-status";

/**
 * GÜNLÜK ZAMAN AKIŞI (TASK TIMELINE) — hazır satın alma eylem planını
 * (`purchase-action-plan.ts`) ve kullanıcının verdiği kararı
 * (`purchase-action-status.ts`) gün içindeki ele alma sırasına göre
 * gruplayan **sunum** modeli.
 *
 * Yeni bir öncelik/aciliyet/rütbe hesabı DEĞİL: `PurchaseActionPlanItem.rank`
 * zaten kurulmuş sırayı temsil eder, bu model yalnızca o sırayı dört
 * deterministik gruba (`now`/`today`/`later`/`completed`) böler. Gerçek saat
 * ya da takvim bilgisi taşımaz — `morning-brief.ts`in `PurchaseActionPlanBatch`
 * ve `PurchaseActionStatusRecord`i özetlemesiyle aynı ilkede, kardeş bir
 * presentation özelliği (bkz. `core/services/ai-morning-brief.ts`).
 */
export type TaskTimelineGroup = "now" | "today" | "later" | "completed";

export interface TaskTimelineItem {
  /**
   * Deterministik kimlik — mevcut satın alma planı/durumu `productId`
   * anahtarlı olduğu için ikisi burada aynı değeri taşır. İkinci bir kimlik
   * şeması icat edilmez.
   */
  readonly actionId: string;
  readonly productId: string;
  /** `PurchaseActionPlanItem.rank`in olduğu gibi taşınması — burada yeniden hesaplanmaz. */
  readonly rank: number;
  /** Kullanıcının kararı — `purchase-action-status.ts`in tek doğruluk kaynağı. */
  readonly status: PurchaseActionStatus;
  readonly group: TaskTimelineGroup;
  /** Kendi grubu içindeki 1 tabanlı sıra — plan sırası korunarak üretilir. */
  readonly estimatedOrder: number;
}

export interface TaskTimelineSummary {
  readonly totalItems: number;
  /** `now` + `today` + `later` — `ignored` ve `completed` hariç. */
  readonly activeItems: number;
  readonly nowItems: number;
  readonly todayItems: number;
  readonly laterItems: number;
  readonly completedItems: number;
}

export interface TaskTimelineBatch {
  /** `PurchaseActionPlanBatch.items` ile aynı sırada — rütbe burada da yeniden sıralanmaz. */
  readonly items: readonly TaskTimelineItem[];
  readonly summary: TaskTimelineSummary;
}
