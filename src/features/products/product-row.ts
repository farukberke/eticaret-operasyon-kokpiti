import type { ProductPerformance } from "@/core/domain";
import type { Locale } from "@/i18n/routing";
import { EMPTY, formatMoney, formatNumber, formatPercent } from "@/lib/format";

/**
 * Tablo satırı — **serileştirilebilir** görünüm modeli.
 *
 * Sunucu bileşeninden istemci bileşenine yalnızca veri geçebilir; fonksiyon
 * geçemez. Bu yüzden her hücrenin hem sıralama değeri (ham sayı) hem de
 * ekranda görünecek metni (locale'e göre biçimlenmiş) burada hazırlanır.
 *
 * Biçimlendirmenin sunucuda bitmesi ayrıca istemciye `Intl` iş yükü
 * inmemesi demek.
 */
export interface ProductRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;

  /** Sıralama için ham değerler. */
  readonly unitsSold: number;
  readonly netRevenueMinor: number;
  readonly netProfitMinor: number;
  readonly marginRatio: number | null;
  readonly returnRate: number | null;
  readonly stock: number;
  readonly daysOfCover: number | null;

  /** Ekranda görünen biçimlenmiş metinler. */
  readonly unitsSoldLabel: string;
  readonly netRevenueLabel: string;
  readonly netProfitLabel: string;
  readonly marginLabel: string;
  readonly returnRateLabel: string;
  readonly stockLabel: string;
  readonly daysOfCoverLabel: string;
}

export interface ProductTableLabels {
  readonly name: string;
  readonly category: string;
  readonly unitsSold: string;
  readonly netRevenue: string;
  readonly netProfit: string;
  readonly margin: string;
  readonly returnRate: string;
  readonly stock: string;
  readonly daysOfCover: string;
  readonly empty: string;
  readonly emptyDescription: string;
  readonly sortHint: string;
}

export function toProductRow(
  performance: ProductPerformance,
  locale: Locale,
  formatDays: (days: string) => string,
): ProductRow {
  return {
    id: performance.product.id,
    name: performance.product.name,
    category: performance.product.category,

    unitsSold: performance.unitsSold,
    netRevenueMinor: performance.netRevenue.minor,
    netProfitMinor: performance.netProfit.minor,
    marginRatio: performance.marginRatio,
    returnRate: performance.returnRate,
    stock: performance.product.stock,
    daysOfCover: performance.daysOfCover,

    unitsSoldLabel: formatNumber(performance.unitsSold, locale),
    netRevenueLabel: formatMoney(performance.netRevenue, locale),
    netProfitLabel: formatMoney(performance.netProfit, locale),
    marginLabel: formatPercent(performance.marginRatio, locale),
    returnRateLabel: formatPercent(performance.returnRate, locale),
    stockLabel: formatNumber(performance.product.stock, locale),
    daysOfCoverLabel:
      performance.daysOfCover === null
        ? EMPTY
        : formatDays(formatNumber(performance.daysOfCover, locale, 1)),
  };
}
