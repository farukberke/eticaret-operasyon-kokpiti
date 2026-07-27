/**
 * Takvim günü ve gün aralığı.
 *
 * Tarihler `Date` nesnesi olarak değil, `"YYYY-MM-DD"` metni olarak taşınır.
 * Sebebi: bir e-ticaret paneli gün bazında düşünür ("dün kaç sattım"), saat
 * bazında değil. `Date` kullanmak, sunucu UTC'de çalışırken kullanıcının
 * İstanbul'da olması nedeniyle "dünün" bir gün kayması riskini getirir.
 * Gün anahtarını metin tutmak bu sınıf hataları tamamen ortadan kaldırır.
 */

/** `"YYYY-MM-DD"` biçiminde takvim günü. */
export type IsoDate = string;

export interface DateRange {
  /** Dahil. */
  readonly from: IsoDate;
  /** Dahil. */
  readonly to: IsoDate;
}

const MS_PER_DAY = 86_400_000;

/** `Date` → gün anahtarı. UTC üzerinden okunur ki sunucu saat dilimi sonucu değiştirmesin. */
export function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** Gün anahtarını UTC gece yarısına sabitlenmiş `Date`e çevirir. */
export function fromIsoDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIsoDate(new Date(fromIsoDate(date).getTime() + days * MS_PER_DAY));
}

/** Kapsayıcı gün farkı: `daysBetween("2026-01-01", "2026-01-01")` → 1 */
export function daysInRange(range: DateRange): number {
  const diff = fromIsoDate(range.to).getTime() - fromIsoDate(range.from).getTime();
  return Math.floor(diff / MS_PER_DAY) + 1;
}

export function isWithin(date: IsoDate, range: DateRange): boolean {
  return date >= range.from && date <= range.to;
}

/** Aralıktaki tüm günleri sırayla üretir. Grafik ekseni ve boş gün doldurma için. */
export function eachDay(range: DateRange): IsoDate[] {
  const days: IsoDate[] = [];
  for (let cursor = range.from; cursor <= range.to; cursor = addDays(cursor, 1)) {
    days.push(cursor);
  }
  return days;
}

/** Son N günü kapsayan aralık (bugün dahil). */
export function lastDays(today: IsoDate, days: number): DateRange {
  return { from: addDays(today, -(days - 1)), to: today };
}

/**
 * Karşılaştırma için hemen önceki eşit uzunlukta aralık.
 * "Bu hafta geçen haftaya göre" hesabının tek kaynağı burasıdır.
 */
export function previousPeriod(range: DateRange): DateRange {
  const length = daysInRange(range);
  return {
    from: addDays(range.from, -length),
    to: addDays(range.from, -1),
  };
}

/** Haftanın günü (0 = Pazar). Sezonsallık üretiminde ve etiketlemede kullanılır. */
export function dayOfWeek(date: IsoDate): number {
  return fromIsoDate(date).getUTCDay();
}
