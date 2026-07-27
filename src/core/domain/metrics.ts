import type { CostCoverage } from "./cost";
import type { DateRange, IsoDate } from "./date-range";
import type { Money } from "./money";

export type TrendDirection = "up" | "down" | "flat";

/**
 * Bir ölçünün önceki eşit uzunlukta döneme göre değişimi.
 *
 * `deltaRatio` önceki dönem sıfırsa `null` olur: "0'dan 100'e %sonsuz artış"
 * demek yerine "karşılaştırılamaz" demek dürüst olandır.
 */
export interface Trend {
  readonly deltaRatio: number | null;
  readonly direction: TrendDirection;
}

export interface MoneyTrend extends Trend {
  readonly current: Money;
  readonly previous: Money;
}

export interface CountTrend extends Trend {
  readonly current: number;
  readonly previous: number;
}

/** Grafik ekseni için tek gün. Satışsız günler de 0 değeriyle yer alır. */
export interface DailyPoint {
  readonly date: IsoDate;
  readonly revenue: Money;
  readonly profit: Money;
  readonly orders: number;
}

export interface SalesSummary {
  readonly range: DateRange;
  readonly grossRevenue: Money;
  readonly netRevenue: Money;
  readonly orderCount: number;
  readonly unitsSold: number;
  readonly averageOrderValue: Money;

  readonly revenueTrend: MoneyTrend;
  readonly orderTrend: CountTrend;

  readonly daily: readonly DailyPoint[];
}

/**
 * Kâr dökümü. Kalemler ekranda aynen bu sırayla gösterilir —
 * kullanıcı cirodan net kâra nasıl inildiğini satır satır görebilsin.
 */
export interface ProfitSummary {
  readonly range: DateRange;

  readonly grossRevenue: Money;
  readonly discounts: Money;
  readonly refunds: Money;
  readonly netRevenue: Money;

  readonly cogs: Money;
  readonly commission: Money;
  readonly shipping: Money;
  /** Paketleme / operasyon gideri — maliyet modelinden gelir. */
  readonly packaging: Money;
  readonly adSpend: Money;

  /** **Yalnızca maliyeti bilinen ürünlerin** net kârı. */
  readonly netProfit: Money;
  /** netProfit / netRevenue. Ciro sıfırsa `null`. */
  readonly marginRatio: number | null;

  /**
   * Maliyet kapsamı.
   *
   * Eksik maliyetli ürünleri toplamdan çıkarmak doğru ama yeterli değil:
   * kullanıcı eksik bir toplamı tam sanmamalı. Ekranda
   * "X üründe maliyet eksik · ₺Y ciro değerlendirilemiyor" olarak görünür.
   */
  readonly coverage: CostCoverage;

  readonly profitTrend: MoneyTrend;
  /**
   * Marjın önceki döneme göre **puan** farkı (%22 → %18 ise -0.04).
   * Yüzdenin yüzdesi kafa karıştırdığı için oran değil puan taşınır.
   */
  readonly marginDeltaPoints: number | null;

  readonly daily: readonly DailyPoint[];
}
