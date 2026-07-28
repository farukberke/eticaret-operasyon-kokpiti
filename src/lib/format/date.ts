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

/**
 * "1 – 30 Tem" biçiminde aralık etiketi.
 *
 * Yıl yalnızca aralık yıl sınırını aştığında yazılır ("28 Ara 2025 – 26 Oca
 * 2026"): 90 günlük bir pencere aralıkta iki yıla yayılabiliyor ve "28 Ara –
 * 26 Oca" hangi Aralık olduğunu söylemiyor. Aynı yıl içindeki aralıkta ise yıl
 * gürültüdür.
 */
export function formatDateRange(
  range: { from: string; to: string },
  locale: string,
): string {
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4);

  return new Intl.DateTimeFormat(locale, {
    ...UTC,
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).formatRange(parse(range.from), parse(range.to));
}
