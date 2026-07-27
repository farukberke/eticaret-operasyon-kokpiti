/**
 * Para biçimlendirme.
 *
 * `lib` katmanı `core`'u göremez (ESLint kuralı). Bunun etrafından dolaşmak
 * yerine **yapısal tip** kullanılıyor: `MoneyLike`, core'daki `Money` ile
 * birebir uyumludur, TypeScript ikisini import olmadan eşleştirir.
 * Böylece design system katmanı domain'e bağlanmadan para basabiliyor.
 */

export interface MoneyLike {
  readonly minor: number;
  readonly currency: string;
}

export interface MoneyFormatOptions {
  /** ₺1,2 Mn gibi kısaltılmış gösterim — dar kartlar için. */
  readonly compact?: boolean;
  /** Kuruş gösterilsin mi. Varsayılan: 100 ₺ altında evet, üstünde hayır. */
  readonly decimals?: number;
  /** Pozitif değerlerin başına + koyar — değişim tutarlarında kullanılır. */
  readonly signed?: boolean;
}

/**
 * Varsayılan hassasiyet kararı: büyük tutarlarda kuruş gürültüdür.
 * "₺142.300" okunur, "₺142.300,00" okuyucuyu yorar.
 */
function defaultDecimals(major: number): number {
  return Math.abs(major) < 100 ? 2 : 0;
}

export function formatMoney(
  value: MoneyLike,
  locale: string,
  options: MoneyFormatOptions = {},
): string {
  const major = value.minor / 100;
  const decimals = options.decimals ?? defaultDecimals(major);

  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: value.currency,
    minimumFractionDigits: options.compact ? 0 : decimals,
    maximumFractionDigits: options.compact ? 1 : decimals,
    ...(options.compact ? { notation: "compact" as const } : {}),
  }).format(major);

  if (options.signed && value.minor > 0) return `+${formatted}`;
  return formatted;
}
