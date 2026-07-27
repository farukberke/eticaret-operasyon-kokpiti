/**
 * Tarih biçimlendirme.
 *
 * Girdi her zaman `"YYYY-MM-DD"` metnidir. UTC gece yarısına sabitlenerek
 * okunur; aksi hâlde sunucunun saat dilimi "27 Temmuz"u "26 Temmuz" yapabilir.
 */

function parse(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

const UTC = { timeZone: "UTC" } as const;

/** "27 Temmuz Pazartesi" / "Monday, 27 July" — kokpit başlığı için. */
export function formatFullDate(isoDate: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    ...UTC,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(parse(isoDate));
}

/** "27 Tem" — grafik ekseni ve tablo için kısa gösterim. */
export function formatShortDate(isoDate: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    ...UTC,
    day: "numeric",
    month: "short",
  }).format(parse(isoDate));
}

/** "1 – 30 Tem" biçiminde aralık etiketi. */
export function formatDateRange(
  range: { from: string; to: string },
  locale: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    ...UTC,
    day: "numeric",
    month: "short",
  }).formatRange(parse(range.from), parse(range.to));
}
