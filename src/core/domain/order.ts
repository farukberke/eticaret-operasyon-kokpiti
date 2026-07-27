import type { IsoDate } from "./date-range";
import type { Money } from "./money";

export interface OrderLine {
  readonly productId: string;
  readonly quantity: number;
  /** Satış anındaki birim fiyat — ürünün güncel fiyatı sonradan değişebilir. */
  readonly unitPrice: Money;
  /** Satış anındaki birim maliyet — geçmiş kâr hesabı doğru kalsın diye satırda donar. */
  readonly unitCost: Money;
}

export interface Order {
  readonly id: string;
  readonly date: IsoDate;
  readonly lines: readonly OrderLine[];
  /** Satıcının üstlendiği kargo bedeli. */
  readonly shippingCost: Money;
  /** Pazaryeri komisyonu. */
  readonly commission: Money;
  /** Kupon/indirim tutarı. */
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
