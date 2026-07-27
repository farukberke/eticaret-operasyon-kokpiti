import type { IsoDate } from "./date-range";

/**
 * GÖREV YAŞAM DÖNGÜSÜ.
 *
 * Bir sinyal listede görünen bir gözlemdir; **görev** ise o gözlem hakkında
 * kullanıcının verdiği karardır. İkisi ayrı tutulur çünkü ömürleri farklı:
 * sinyal her analizde yeniden hesaplanır, görev kararı kalıcıdır.
 *
 * Bu ayrım paneli rapordan kuyruğa çeviren şeydir. Kapatılamayan bir liste,
 * üçüncü gün açılmayı bırakılan bir listedir.
 */
export type TaskStatus = "open" | "done" | "snoozed";

export interface TaskState {
  /** Sinyalin deterministik kimliği — `STOCKOUT_IMMINENT:beyaz-sneaker`. */
  readonly signalId: string;
  readonly status: TaskStatus;
  /**
   * Ertelenmiş görevin geri döneceği gün (o gün dahil).
   * Yalnızca `snoozed` durumunda anlamlıdır.
   */
  readonly snoozedUntil?: IsoDate | undefined;
  readonly updatedAt: IsoDate;
}

/** Kullanıcının bir sinyal üzerinde yapabilecekleri. */
export type TaskAction =
  | { readonly type: "complete" }
  | { readonly type: "snooze"; readonly days: number }
  | { readonly type: "reopen" };

/**
 * Görevin bugün kuyrukta görünüp görünmeyeceği.
 *
 * Erteleme süresinin dolması için ayrı bir zamanlanmış işe gerek yok:
 * görünürlük **okuma anında** hesaplanır. Süre dolmuş bir görev kendiliğinden
 * açık sayılır. Arka planda çalışan hiçbir şey olmadığı için de bozulacak
 * bir şey yok.
 */
export function isOpenOn(state: TaskState | undefined, today: IsoDate): boolean {
  if (!state) return true;
  if (state.status === "done") return false;
  if (state.status === "snoozed") {
    // Tarih metinleri sıralanabilir olduğu için karşılaştırma doğrudan çalışır.
    return state.snoozedUntil === undefined || state.snoozedUntil <= today;
  }
  return true;
}

/** Erteleme süresi henüz dolmamış mı. */
export function isSnoozedOn(state: TaskState | undefined, today: IsoDate): boolean {
  return (
    state?.status === "snoozed" &&
    state.snoozedUntil !== undefined &&
    state.snoozedUntil > today
  );
}

export function isDone(state: TaskState | undefined): boolean {
  return state?.status === "done";
}

/**
 * Görev kuyruktan çıkmış mı — arayüzün sorması gereken soru budur.
 *
 * `state.status !== "open"` diye bakmak sinsi bir hataya yol açar: süresi
 * dolmuş bir erteleme kaydı hâlâ `snoozed` yazar ama iş kuyruğa geri
 * dönmüştür. Ham duruma bakan bir kontrol o işe "Geri al" düğmesi gösterip
 * kullanıcıyı kilitler. (Tam olarak bu hata bir kez yapıldı.)
 *
 * Doğru kullanımı kolay hâle getirmek için tek fonksiyon.
 */
export function isClosedOn(state: TaskState | undefined, today: IsoDate): boolean {
  return !isOpenOn(state, today);
}

/** Kuyruk görünümleri. Varsayılan `open`. */
export type TaskFilter = "open" | "snoozed" | "done";

export function matchesFilter(
  state: TaskState | undefined,
  filter: TaskFilter,
  today: IsoDate,
): boolean {
  switch (filter) {
    case "open":
      return isOpenOn(state, today);
    case "snoozed":
      return isSnoozedOn(state, today);
    case "done":
      return isDone(state);
  }
}
