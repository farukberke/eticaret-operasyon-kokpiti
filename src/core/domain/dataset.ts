import type { AdSpendRecord, Order, ReturnRecord } from "./order";
import type { Product } from "./product";

/**
 * Bir mağazanın ham verisi.
 *
 * Portların döndürdüğü özetler bu veriden **çekirdek servisler** tarafından
 * hesaplanır. v1'de mock üretici, v2'de pazaryeri adapter'ı bu şekli doldurur;
 * arada kalan hesap mantığı ikisinde de aynıdır.
 */
export interface StoreDataset {
  readonly products: readonly Product[];
  readonly orders: readonly Order[];
  readonly returns: readonly ReturnRecord[];
  readonly adSpend: readonly AdSpendRecord[];
}
