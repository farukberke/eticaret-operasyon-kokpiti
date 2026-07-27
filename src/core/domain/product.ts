import type { BasisPoints, CostStatus } from "./cost";
import type { IsoDate } from "./date-range";
import type { Money } from "./money";

/**
 * Katalogdaki bir ürün — **pazaryerinin bildiği** her şey.
 *
 * `unitCost` burada YOK ve olmamalı: hiçbir pazaryeri API'si satıcının alış
 * maliyetini vermez. Maliyet ayrı bir kaynaktan (`CostPort`) gelir ve
 * tarihseldir. İkisini aynı tipte tutmak, veriyi olduğundan farklı
 * modellemek olurdu.
 */
export interface Product {
  readonly id: string;
  readonly sku: string;
  /** Toplu içe aktarmada ikincil eşleştirme anahtarı. */
  readonly barcode?: string | undefined;
  readonly name: string;
  readonly category: string;
  /** Liste satış fiyatı (KDV dahil). */
  readonly price: Money;
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

  /**
   * Maliyet verisi bu ürün için biliniyor mu.
   *
   * `missing` ise kâr alanlarının tamamı `null`'dur. Sıfır göstermek sahte
   * kâr üretmek olurdu; kullanıcı "bu ürün hiç kazandırmıyor" sanırdı.
   */
  readonly costStatus: CostStatus;
  /**
   * Dönem sonundaki geçerli alış maliyeti — maliyet ekranında ve ürün
   * tablosunda gösterilir. Kayıt yoksa `null`.
   */
  readonly unitCost: Money | null;
  /** Çözümlenmiş komisyon oranı (baz puan) — hangi kaynaktan geldiği fark etmez. */
  readonly commissionRate: BasisPoints;
  /** Geçerli maliyet kaydının başlangıç tarihi. Kayıt yoksa `null`. */
  readonly costEffectiveFrom: IsoDate | null;

  /**
   * Tüm gider kalemleri düşülmüş net kâr.
   * Maliyet eksikse `null` — hesaplanamaz.
   */
  readonly netProfit: Money | null;
  /**
   * Birim başına net kâr: `netProfit / (satılan − iade)`.
   *
   * Kaçan satışın maliyetini hesaplamanın tek dürüst yolu. Fiyatla çarpmak
   * ciroyu verir ve kaybı kat kat abartır — satıcı o ürünü satsa fiyatın
   * tamamını değil, yalnızca bunu kazanacaktı.
   */
  readonly unitProfit: Money | null;

  /** netProfit / netRevenue. Ciro sıfırsa ya da maliyet eksikse `null`. */
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

  /**
   * Elde kalan stoğun alış maliyeti cinsinden değeri (bağlı sermaye).
   * Maliyet eksikse `null` — ne kadar sermayenin bağlı olduğu bilinemez.
   */
  readonly stockValue: Money | null;
}

/**
 * Maliyeti bilinen ürün performansı — kâr alanları garanti dolu.
 *
 * Dedektör kuralları bu tiple çalışır. Maliyeti eksik ürünler kural
 * döngüsüne hiç girmez: hesaplanamayan bir kârdan risk ya da fırsat
 * üretmek, uydurmanın kibarcası olurdu. O ürünler mağaza düzeyindeki
 * tek `COST_MISSING` sinyaliyle raporlanır.
 */
export type MeasuredPerformance = ProductPerformance & {
  readonly netProfit: Money;
  readonly unitProfit: Money;
  readonly stockValue: Money;
};

export function isMeasured(
  performance: ProductPerformance,
): performance is MeasuredPerformance {
  return (
    performance.costStatus === "complete" &&
    performance.netProfit !== null &&
    performance.unitProfit !== null &&
    performance.stockValue !== null
  );
}
