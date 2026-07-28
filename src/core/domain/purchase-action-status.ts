import type { IsoDate } from "./date-range";

/**
 * SATIN ALMA EYLEMİ OPERASYON DURUMU.
 *
 * `purchase-action-plan.ts`in ürettiği öneri (`PurchaseActionKind`) ile bu
 * durum ayrı kavramlardır: öneri "bugün ne yapmalısın" sorusuna cevap verir,
 * bu durum ise "kullanıcı bu öneriyle ne yaptı" sorusuna. Öneri her analizde
 * yeniden hesaplanabilir; bu durum kullanıcının kararıdır ve kalıcıdır — tıpkı
 * `TaskState`in sinyal/görev ayrımındaki mantığın (bkz. `core/domain/task.ts`)
 * satın alma planı için tekrarı.
 *
 * Ayrı bir domain modeli: mevcut `TaskState`/`TaskStatus` sinyal kuyruğuna
 * ait (`signalId` anahtarlı, open/done/snoozed). Bu model ürün bazlı
 * (`productId` anahtarlı) ve dördüncü bir durumu (`ignored`) kapsar — ikisi
 * karıştırılmadan yan yana durur.
 */
export type PurchaseActionStatus = "pending" | "done" | "snoozed" | "ignored";

export interface PurchaseActionStatusRecord {
  readonly productId: string;
  readonly status: PurchaseActionStatus;
  readonly updatedAt: IsoDate;
}

/** Kayıt yoksa varsayılan durum — kullanıcı henüz bir karar vermemiş demektir. */
export const DEFAULT_PURCHASE_ACTION_STATUS: PurchaseActionStatus = "pending";

/**
 * Varsayılan görünümde satır görünsün mü.
 *
 * `pending` her zaman görünür (henüz işlem yapılmadı, gizlenirse kullanıcı
 * işi unutur). `snoozed` da görünür kalır — erteleme "bir daha gösterme"
 * değil, "şimdi değil" demektir. `done`/`ignored` varsayılan görünümde
 * gizlenir ama kayıt silinmez: `summary`de sayılmaya devam ederler.
 */
export function isVisibleByDefault(status: PurchaseActionStatus): boolean {
  return status === "pending" || status === "snoozed";
}
