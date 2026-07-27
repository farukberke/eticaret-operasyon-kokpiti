/**
 * Sayı ve oran biçimlendirme.
 *
 * Ortak kural: hesaplanamayan değer `null` gelir ve "—" basılır.
 * Boş bırakmak "sıfır" sanılır; sıfır basmak yalan olur.
 */

export const EMPTY = "—";

/** 0,221 → "%22,1" (tr) / "22.1%" (en). */
export function formatPercent(
  ratio: number | null,
  locale: string,
  fractionDigits = 1,
): string {
  if (ratio === null || !Number.isFinite(ratio)) return EMPTY;
  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(ratio);
}

/**
 * Marj değişimi **puan** cinsinden gösterilir: %22 → %18 ise "−4,0 puan".
 * "%18 düştü" demek yanlış olurdu — yüzdenin yüzdesi başka bir sayıdır.
 */
export function formatPoints(
  delta: number | null,
  locale: string,
  labels: { point: string },
): string {
  if (delta === null || !Number.isFinite(delta)) return EMPTY;
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(delta * 100);
  return `${value} ${labels.point}`;
}

export function formatNumber(
  value: number | null,
  locale: string,
  fractionDigits = 0,
): string {
  if (value === null || !Number.isFinite(value)) return EMPTY;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/** 12.900 → "12,9 B" (tr) / "12.9K" (en). Dar sütunlar için. */
export function formatCompact(value: number | null, locale: string): string {
  if (value === null || !Number.isFinite(value)) return EMPTY;
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Oranı işaretli yüzde olarak: +%12,4 / −%4,1 */
export function formatDelta(
  ratio: number | null,
  locale: string,
  fractionDigits = 1,
): string {
  if (ratio === null || !Number.isFinite(ratio)) return EMPTY;
  return new Intl.NumberFormat(locale, {
    style: "percent",
    signDisplay: "exceptZero",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(ratio);
}
