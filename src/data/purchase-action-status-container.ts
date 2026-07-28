import type { PurchaseActionStatusPort } from "@/core/ports";

import { localPurchaseActionStatusAdapter } from "./adapters/local/local-purchase-action-status.adapter";

/**
 * SATIN ALMA EYLEMİ DURUM KONTEYNERİ — `task-container.ts` ile aynı ayrım
 * gerekçesi: bu port istemci bileşenlerinden okunur, `container.ts`in 90
 * günlük veri üreteciyle aynı dosyada olmamalı.
 *
 * Oturum sistemi geldiğinde:
 *   statuses: localPurchaseActionStatusAdapter  →  statuses: postgresPurchaseActionStatusAdapter
 */
export interface PurchaseActionStatusContainer {
  readonly statuses: PurchaseActionStatusPort;
}

export const purchaseActionStatusContainer: PurchaseActionStatusContainer = {
  statuses: localPurchaseActionStatusAdapter,
};
