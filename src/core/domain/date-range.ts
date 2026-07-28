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

const ISO_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Gün anahtarı gerçekten geçerli mi.
 *
 * Yalnızca biçim değil **takvim** de kontrol edilir: `"2026-02-31"` biçime
 * uyar ama var olmayan bir gündür ve `new Date` onu sessizce 3 Mart'a
 * kaydırır. Kullanıcının elle girdiği (ya da adres çubuğuna yapıştırdığı)
 * tarih bu kapıdan geçmeden aralık hesabına giremez.
 */
export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string" || !ISO_DATE_SHAPE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && toIsoDate(parsed) === value;
}

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

/**
 * Belirli bir saat dilimindeki takvim günü.
 *
 * `toIsoDate(new Date())` UTC verir ve bu, "bugün" hesabı için **yanlıştır**:
 * İstanbul'da 27 Temmuz gece 02:00'de UTC hâlâ 26 Temmuz'dur. Sunucu UTC'de
 * çalıştığı için bir iş sessizce yanlış güne düşer — "son karar: bugün"
 * yazması gereken kart "yarın" der.
 *
 * Mağazanın saat dilimi üzerinden hesaplamak hem doğru hem deterministik:
 * sunucu ve istemci aynı değeri görür, hidrasyon uyuşmazlığı çıkmaz.
 */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
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
 * Takvim ayının ilk günü.
 *
 * Ay aritmetiği `Date` ile değil metinle yapılıyor: `setMonth` taşmayı
 * kendince çözer (31 Ocak + 1 ay = 3 Mart) ve saat dilimi riskini geri
 * getirir. Ay anahtarını kesip yeniden kurmak her iki tuzağı da atlar.
 */
function monthStart(year: number, monthIndex: number): IsoDate {
  const shiftedYear = year + Math.floor(monthIndex / 12);
  const normalized = ((monthIndex % 12) + 12) % 12;
  return `${String(shiftedYear).padStart(4, "0")}-${String(normalized + 1).padStart(2, "0")}-01`;
}

/**
 * Verilen günün ayını kapsayan aralık. `monthsAgo = 1` bir önceki ayı verir.
 *
 * Ayın son günü "sonraki ayın ilk günü − 1" ile bulunuyor; böylece 28/29/30/31
 * ayrımı ve artık yıl kuralı hiçbir yerde elle yazılmıyor.
 */
export function monthRange(date: IsoDate, monthsAgo = 0): DateRange {
  const year = Number(date.slice(0, 4));
  const monthIndex = Number(date.slice(5, 7)) - 1 - monthsAgo;
  return {
    from: monthStart(year, monthIndex),
    to: addDays(monthStart(year, monthIndex + 1), -1),
  };
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
