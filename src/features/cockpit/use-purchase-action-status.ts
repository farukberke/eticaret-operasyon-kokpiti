"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  IsoDate,
  PurchaseActionStatus,
  PurchaseActionStatusRecord,
} from "@/core/domain";
import { withStatus } from "@/core/services/purchase-action-status";
import { purchaseActionStatusContainer } from "@/data/purchase-action-status-container";

/**
 * Satın alma eylemi durumlarını okuyan/yazan React kancası.
 *
 * `use-task-state.ts` ile aynı tasarım: port async kalır, tepkisellik
 * React'te yaşar; yazma **iyimser** (ekran hemen güncellenir, kalıcılık
 * arkada yürür). Aynı bilinen sınır da geçerli: ilk boyamada durum haritası
 * boştur (sunucu `localStorage`ı okuyamaz), hidrasyondan hemen sonra
 * kullanıcının önceki kararları uygulanır. Boş harita güvenli varsayılana
 * (`pending`) düştüğü için bu, hiçbir satırı yanlışlıkla gizlemez.
 */
export interface PurchaseActionStatusApi {
  readonly states: ReadonlyMap<string, PurchaseActionStatusRecord>;
  /** İlk okuma tamamlandı mı. */
  readonly loaded: boolean;
  markDone(productId: string): void;
  snooze(productId: string): void;
  ignore(productId: string): void;
  /** Yalnızca test/geliştirme amaçlı — tüm kararları sıfırlar. */
  reset(): void;
}

export function usePurchaseActionStatus(today: IsoDate): PurchaseActionStatusApi {
  const [states, setStates] = useState<ReadonlyMap<string, PurchaseActionStatusRecord>>(
    new Map(),
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void purchaseActionStatusContainer.statuses.list().then((list) => {
      if (cancelled) return;
      setStates(new Map(list.map((record) => [record.productId, record])));
      setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const applyStatus = useCallback(
    (productId: string, status: PurchaseActionStatus) => {
      setStates((current) => withStatus(current, productId, status, today));
      void purchaseActionStatusContainer.statuses.save({
        productId,
        status,
        updatedAt: today,
      });
    },
    [today],
  );

  const markDone = useCallback(
    (productId: string) => applyStatus(productId, "done"),
    [applyStatus],
  );
  const snooze = useCallback(
    (productId: string) => applyStatus(productId, "snoozed"),
    [applyStatus],
  );
  const ignore = useCallback(
    (productId: string) => applyStatus(productId, "ignored"),
    [applyStatus],
  );

  const reset = useCallback(() => {
    setStates(new Map());
    void purchaseActionStatusContainer.statuses.reset();
  }, []);

  return { states, loaded, markDone, snooze, ignore, reset };
}
