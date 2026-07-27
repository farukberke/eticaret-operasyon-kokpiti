"use client";

import { useCallback, useEffect, useState } from "react";

import { addDays, type IsoDate, type TaskState } from "@/core/domain";
import { taskContainer } from "@/data/task-container";

/**
 * Görev durumlarını okuyan ve yazan React kancası.
 *
 * Tasarım kararı: **port async kalır, tepkisellik React'te yaşar.**
 * Porta bir abonelik mekanizması eklemek onu veritabanı sözleşmesi olmaktan
 * çıkarırdı; oysa ileride bu portu bir SQL adapter uygulayacak ve SQL'in
 * "değişiklikleri dinle" diye bir kavramı yok. Bu yüzden port sade CRUD,
 * yeniden render işini React state hallediyor.
 *
 * Yazma stratejisi **iyimser**: ekran hemen güncellenir, kalıcılık arkada
 * yürür. localStorage için bu fark görünmez ama ileride ağ üzerinden yazan
 * bir adapter geldiğinde arayüzün beklememesi doğru davranış olacak.
 *
 * Bilinen sınır: `localStorage` sunucuda okunamadığı için ilk boyamada kuyruk
 * sunucunun bildiği hâliyle (tüm sinyaller açık) görünür, hidrasyondan hemen
 * sonra kullanıcının kararları uygulanır. Durum sunucuya taşındığında
 * (oturum + veritabanı) bu tamamen ortadan kalkacak.
 */
export interface TaskStateApi {
  readonly states: ReadonlyMap<string, TaskState>;
  /** İlk okuma tamamlandı mı — kısa süreli boş durumu ayırt etmek için. */
  readonly loaded: boolean;
  complete: (signalId: string) => void;
  snooze: (signalId: string, days: number) => void;
  reopen: (signalId: string) => void;
}

export function useTaskState(today: IsoDate): TaskStateApi {
  const [states, setStates] = useState<ReadonlyMap<string, TaskState>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void taskContainer.tasks.list().then((list) => {
      if (cancelled) return;
      setStates(new Map(list.map((state) => [state.signalId, state])));
      setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  /** Ekranı hemen günceller, kalıcılığı arkaya bırakır. */
  const apply = useCallback((state: TaskState) => {
    setStates((current) => new Map(current).set(state.signalId, state));
    void taskContainer.tasks.save(state);
  }, []);

  const complete = useCallback(
    (signalId: string) => {
      apply({ signalId, status: "done", updatedAt: today });
    },
    [apply, today],
  );

  const snooze = useCallback(
    (signalId: string, days: number) => {
      apply({
        signalId,
        status: "snoozed",
        // Bugünden `days` gün sonra geri döner; o gün kuyrukta olur.
        snoozedUntil: addDays(today, days),
        updatedAt: today,
      });
    },
    [apply, today],
  );

  const reopen = useCallback((signalId: string) => {
    setStates((current) => {
      const next = new Map(current);
      next.delete(signalId);
      return next;
    });
    void taskContainer.tasks.clear(signalId);
  }, []);

  return { states, loaded, complete, snooze, reopen };
}
