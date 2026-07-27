import type { CostTable } from "./cost";
import type { AdSpendRecord, Order, ReturnRecord } from "./order";
import type { Product } from "./product";

/**
 * Bir mağazanın analiz girdisi.
 *
 * İki farklı kaynaktan gelen veriyi bir araya getirir ve bu ayrım ürünün
 * tezidir:
 *
 * • `products`, `orders`, `returns`, `adSpend` → **pazaryerinin bildiği**.
 *   İleride Trendyol adapter'ı bunları API'den çekecek.
 * • `costs` → **yalnızca satıcının bildiği**. Hiçbir pazaryeri alış
 *   maliyetini vermez; bu veri `CostPort` üzerinden kullanıcıdan gelir.
 *
 * İkisinin burada birleşmesi bilinçli: çekirdek servisler tek bir girdi
 * görür, kaynakların farklı olması adapter'ın sorunudur.
 */
export interface StoreDataset {
  readonly products: readonly Product[];
  readonly orders: readonly Order[];
  readonly returns: readonly ReturnRecord[];
  readonly adSpend: readonly AdSpendRecord[];
  readonly costs: CostTable;
}
