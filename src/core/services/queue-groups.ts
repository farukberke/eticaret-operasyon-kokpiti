import { addDays, type IsoDate } from "../domain/date-range";

/**
 * ZAMAN GRUPLARI — kuyruğun asıl düzenleyicisi.
 *
 * Önceki düzen "Kritik / Yüksek / Orta" rozetleriyle çalışıyordu. Şiddet bir
 * **soyutlama**dır: kullanıcı "Kritik" görüp ne yapacağını yine düşünmek
 * zorunda kalır. Zaman ise bir **talimat**tır: "Bugün" başlığı altındaki her
 * şey bugün karar ister, tartışma biter.
 *
 * Gruplama yalnızca `deadline` okur — şiddete ya da aciliyet puanına bakmaz.
 * Bir sinyalin son karar tarihi, o kuralın kendi domain gerekçesinden gelir
 * (bkz. risk/fırsat dedektörleri).
 */
export type TimeGroup = "today" | "week" | "later";

/** Grupların ekrandaki sabit sırası. */
export const TIME_GROUPS: readonly TimeGroup[] = ["today", "week", "later"];

export function timeGroupOf(
  deadline: IsoDate | undefined,
  today: IsoDate,
  horizonDays: number,
): TimeGroup {
  // Tarihi olmayan iş takip listesine düşer: acil değil ama unutulmamalı.
  if (deadline === undefined) return "later";

  // Geçmiş tarihler de "bugün" grubunda kalır — gecikmiş bir işi ayrı bir
  // kutuya koymak, onu görmezden gelmeyi kolaylaştırırdı.
  if (deadline <= today) return "today";

  return deadline <= addDays(today, horizonDays) ? "week" : "later";
}

/** Kaç gün gecikildi. Gecikme yoksa `0`. */
export function overdueDaysOf(deadline: IsoDate | undefined, today: IsoDate): number {
  if (deadline === undefined || deadline >= today) return 0;

  let days = 0;
  // Aralık küçük olduğu için gün gün saymak yeterli ve saat dilimi tuzağı yok.
  for (let cursor = deadline; cursor < today; cursor = addDays(cursor, 1)) {
    days += 1;
  }
  return days;
}
