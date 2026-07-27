import type { IsoDate } from "./date-range";
import type { Money } from "./money";

/** Katalogdaki bir ürün. Pazaryeri bağlandığında bu tip değişmeden kalmalı. */
export interface Product {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly category: string;
  /** Liste satış fiyatı (KDV dahil). */
  readonly price: Money;
  /** Birim alış maliyeti (COGS). */
  readonly unitCost: Money;
  /** Elde kalan adet. */
  readonly stock: number;
  readonly listedAt: IsoDate;
}

/**
 * Bir ürünün belirli bir tarih aralığındaki performansı.
 *
 * Tüm ekranlar (kokpit özeti, ürün tablosu, risk/fırsat motoru) bu tek tipi
 * kullanır — "ürün metriği" hesabının ikinci bir kopyası yoktur.
 */
export interface ProductPerformance {
  readonly product: Product;

  readonly unitsSold: number;
  readonly unitsReturned: number;

  /** İskonto ve iade düşülmeden önceki satış tutarı. */
  readonly grossRevenue: Money;
  /** İade ve iskonto sonrası gerçekleşen ciro. */
  readonly netRevenue: Money;
  /** Müşterilere geri ödenen toplam tutar. */
  readonly refunds: Money;

  readonly cogs: Money;
  readonly commission: Money;
  readonly shipping: Money;
  readonly adSpend: Money;

  /** Tüm gider kalemleri düşülmüş net kâr. */
  readonly netProfit: Money;
  /**
   * Birim başına net kâr: `netProfit / (satılan − iade)`.
   *
   * Kaçan satışın maliyetini hesaplamanın tek dürüst yolu. Fiyatla çarpmak
   * ciroyu verir ve kaybı kat kat abartır — satıcı o ürünü satsa fiyatın
   * tamamını değil, yalnızca bunu kazanacaktı.
   */
  readonly unitProfit: Money;

  /** netProfit / netRevenue. Ciro sıfırsa `null`. */
  readonly marginRatio: number | null;
  /** unitsReturned / unitsSold. Satış yoksa `null`. */
  readonly returnRate: number | null;
  /** netRevenue / adSpend. Reklam harcaması yoksa `null`. */
  readonly roas: number | null;

  /** Günlük ortalama satış adedi (aralık uzunluğuna bölünmüş). */
  readonly dailyVelocity: number;
  /**
   * Mevcut stok kaç gün yeter. Satış hızı sıfırsa `null` —
   * "sonsuz gün yeter" demek yanıltıcı olur, ürün ölü stoktur.
   */
  readonly daysOfCover: number | null;

  /** Önceki eşit uzunlukta dönemdeki satış hızı — trend karşılaştırması için. */
  readonly previousDailyVelocity: number;
  /** Önceki dönemin marjı — marj erozyonunu tespit etmek için. */
  readonly previousMarginRatio: number | null;

  /** Elde kalan stoğun alış maliyeti cinsinden değeri (bağlı sermaye). */
  readonly stockValue: Money;
}
