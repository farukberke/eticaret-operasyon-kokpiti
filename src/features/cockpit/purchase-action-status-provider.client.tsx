"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { IsoDate } from "@/core/domain";

import {
  usePurchaseActionStatus,
  type PurchaseActionStatusApi,
} from "./use-purchase-action-status";

/**
 * Satın alma eylemi durumunu paylaşan bağlam.
 *
 * Neden gerekli: özet satırı (kaç iş bekliyor/tamamlandı) ve satır rozetleri
 * aynı durum haritasını okur. Her satır kendi `usePurchaseActionStatus`
 * çağrısını yapsaydı özet, satırların yaptığı değişikliği görmezdi —
 * `task-state-provider.client.tsx`teki aynı gerekçe.
 *
 * `TaskStateProvider`dan bilinçli olarak ayrı: farklı domain (`productId`
 * anahtarlı, dört durumlu), farklı ömür. İkisini aynı bağlamda karıştırmak
 * görev kuyruğu ile satın alma planını birbirine bağlardı.
 */
const PurchaseActionStatusContext = createContext<PurchaseActionStatusApi | null>(null);

export function PurchaseActionStatusProvider({
  today,
  children,
}: {
  today: IsoDate;
  children: ReactNode;
}) {
  const api = usePurchaseActionStatus(today);
  return (
    <PurchaseActionStatusContext.Provider value={api}>
      {children}
    </PurchaseActionStatusContext.Provider>
  );
}

export function useActionStatus(): PurchaseActionStatusApi {
  const context = useContext(PurchaseActionStatusContext);
  if (!context) {
    throw new Error(
      "useActionStatus yalnızca <PurchaseActionStatusProvider> içinde kullanılabilir",
    );
  }
  return context;
}
