import {
  DEFAULT_PURCHASE_ACTION_STATUS,
  type IsoDate,
  type PurchaseActionStatus,
  type PurchaseActionStatusRecord,
} from "../domain";

/**
 * SATIN ALMA EYLEMİ DURUMU — saf okuma/yazma/özetleme.
 *
 * `purchase-action-plan.ts`e (ya da başka hiçbir satın alma hesabına)
 * dokunmaz: burada üretilen tek şey kullanıcının verdiği kararın Map
 * üzerinde tutulması ve özetlenmesidir. React, `localStorage`, port hiçbiri
 * burada bilinmez — onlar `features`/`data` katmanının işi.
 */

/** Kayıt yoksa varsayılan durum döner — bilinmeyen/henüz kaydedilmemiş ürün güvenli biçimde `pending` sayılır. */
export function statusOf(
  states: ReadonlyMap<string, PurchaseActionStatusRecord>,
  productId: string,
): PurchaseActionStatus {
  return states.get(productId)?.status ?? DEFAULT_PURCHASE_ACTION_STATUS;
}

/**
 * Bir ürünün durumunu günceller — **saf**, mevcut haritayı değiştirmez, yenisini döner.
 * Ürün zaten bir kayda sahipse üzerine yazılır (overwrite); `productId` tek anahtardır,
 * bu yüzden aynı ürün için ikinci bir kayıt asla oluşmaz.
 */
export function withStatus(
  states: ReadonlyMap<string, PurchaseActionStatusRecord>,
  productId: string,
  status: PurchaseActionStatus,
  updatedAt: IsoDate,
): ReadonlyMap<string, PurchaseActionStatusRecord> {
  const next = new Map(states);
  next.set(productId, { productId, status, updatedAt });
  return next;
}

export interface PurchaseActionStatusSummary {
  readonly total: number;
  readonly pendingCount: number;
  readonly doneCount: number;
  readonly snoozedCount: number;
  readonly ignoredCount: number;
}

const EMPTY_COUNTS: Record<PurchaseActionStatus, number> = {
  pending: 0,
  done: 0,
  snoozed: 0,
  ignored: 0,
};

/**
 * Verilen ürün kimliklerinin durum dağılımı — **tek geçiş**, `productId`
 * başına `Map.get` ile O(1) okuma (bkz. `statusOf`), toplamda O(n).
 *
 * `productIds` çağıranın (`purchase-action-plan`in ürettiği liste) sırasını
 * ya da içeriğini hiç değiştirmez, yalnızca sayar.
 */
export function summarizePurchaseActionStatuses(
  productIds: readonly string[],
  states: ReadonlyMap<string, PurchaseActionStatusRecord>,
): PurchaseActionStatusSummary {
  const counts: Record<PurchaseActionStatus, number> = { ...EMPTY_COUNTS };

  for (const productId of productIds) {
    counts[statusOf(states, productId)] += 1;
  }

  return {
    total: productIds.length,
    pendingCount: counts.pending,
    doneCount: counts.done,
    snoozedCount: counts.snoozed,
    ignoredCount: counts.ignored,
  };
}
