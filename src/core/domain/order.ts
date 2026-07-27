import type { IsoDate } from "./date-range";
import type { Money } from "./money";

/**
 * Sipariş verisi — **pazaryerinin bildiği** her şey.
 *
 * Bilinçli olarak burada OLMAYANLAR:
 *
 * • `unitCost` — pazaryeri senin alış maliyetini bilmez. Maliyet, sipariş
 *   tarihinde geçerli olan kayıttan çözümlenir (`CostResolver`). Satıra
 *   dondurulmuş bir maliyet, kullanıcı maliyetini **sonradan** girdiğinde
 *   (ki normal akış budur: önce pazaryeri bağlanır, sonra maliyet girilir)
 *   geçmiş siparişlerin kârını hesaplanamaz kılardı.
 *
 * • `commission` / `shippingCost` — bunlar da maliyet modelinden gelir.
 *   Böylece kullanıcı komisyon oranını kategori bazında tanımlayabilir ve
 *   tek yerden yönetebilir.
 */
export interface OrderLine {
  readonly productId: string;
  readonly quantity: number;
  /** Satış anındaki birim fiyat — ürünün güncel fiyatı sonradan değişebilir. */
  readonly unitPrice: Money;
}

export interface Order {
  readonly id: string;
  readonly date: IsoDate;
  readonly lines: readonly OrderLine[];
  /** Kupon/indirim tutarı — pazaryeri bunu bildirir. */
  readonly discount: Money;
}

export interface ReturnRecord {
  readonly id: string;
  readonly orderId: string;
  readonly productId: string;
  readonly date: IsoDate;
  readonly quantity: number;
  /** Müşteriye geri ödenen tutar. */
  readonly refund: Money;
}

export interface AdSpendRecord {
  readonly date: IsoDate;
  readonly productId: string;
  readonly amount: Money;
}
