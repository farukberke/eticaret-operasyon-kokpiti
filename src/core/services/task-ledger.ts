import { addDays, type IsoDate } from "../domain/date-range";
import { ZERO_MONEY, sumMoney, type Money } from "../domain/money";
import { isDone, type TaskState } from "../domain/task";

/**
 * DÜNÜN DEFTERİ — ürünün kendi faturasını savunduğu yer.
 *
 * Panel bugüne kadar yalnızca yapılacak işleri gösteriyordu. Kullanıcı işleri
 * yapıyor ama panelin işe yarayıp yaramadığını asla öğrenmiyordu — sadece
 * umuyordu. Defter bu boşluğu kapatır: yenileme zamanı geldiğinde ₺1.499'luk
 * faturanın yanında "bu ay korunan ₺340.000" satırı duruyorsa karar
 * tartışılmaz hâle gelir.
 *
 * Tutarlar tamamlanma anında dondurulmuş `expectedGain` değerlerinden gelir;
 * yeniden hesaplanmaz. Bkz. `TaskState.expectedGain`.
 */
export interface LedgerEntry {
  readonly count: number;
  readonly gain: Money;
}

export interface TaskLedger {
  readonly yesterday: LedgerEntry;
  readonly month: LedgerEntry;
}

/** `"2026-07-27"` → `"2026-07"`. Takvim ayı karşılaştırması metin üzerinden. */
function monthOf(date: IsoDate): string {
  return date.slice(0, 7);
}

function summarise(states: readonly TaskState[]): LedgerEntry {
  return {
    count: states.length,
    // Eski kayıtlarda (alan eklenmeden önce yazılanlar) tutar yoktur;
    // sayıya girer, paraya girmezler.
    gain: sumMoney(states.map((state) => state.expectedGain ?? ZERO_MONEY)),
  };
}

export function buildTaskLedger(
  states: Iterable<TaskState>,
  today: IsoDate,
): TaskLedger {
  const completed = [...states].filter(isDone);
  const yesterday = addDays(today, -1);
  const thisMonth = monthOf(today);

  return {
    yesterday: summarise(completed.filter((state) => state.updatedAt === yesterday)),
    month: summarise(
      completed.filter((state) => monthOf(state.updatedAt) === thisMonth),
    ),
  };
}
