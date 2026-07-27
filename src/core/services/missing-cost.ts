import {
  ZERO_MONEY,
  addDays,
  addMoney,
  allocateMoney,
  isWithin,
  multiplyMoney,
  subtractMoney,
  type DateRange,
  type IsoDate,
  type MissingCostImpact,
  type MissingCostLevel,
  type MissingCostReason,
  type MissingCostReport,
  type Money,
  type Product,
  type StoreDataset,
} from "../domain";

import type { CostResolver } from "./cost-resolver";
import { DEFAULT_RULES, type RulesConfig } from "./rules.config";

/**
 * EKSİK MALİYETİ İŞE ÇEVİREN SERVİS.
 *
 * `aggregateCoverage` "şu kadar ürünün maliyeti eksik" der; kullanıcı ona
 * bakıp hangisinden başlayacağını bilemez. Burada üretilen rapor sırayı
 * kendisi kuruyor: **hangi eksik maliyet en çok siparişi ve en çok parayı
 * ölçülemez bırakıyorsa o baştadır.**
 *
 * Üç karar bu servisin omurgası:
 *
 * 1. **Eksiklik satır düzeyinde tespit edilir, ürün düzeyinde değil.**
 *    "Bu ürünün hiç maliyet kaydı var mı" yanlış soru: bugün maliyeti girilmiş
 *    bir ürünün üç ay önceki siparişinde maliyet yoktur ve o siparişin kârı
 *    hâlâ hesaplanamaz. Bu yüzden her satır kendi sipariş tarihiyle
 *    `CostResolver`'a sorulur.
 *
 * 2. **Uydurma kâr kaybı yok.** Maliyet bilinmiyorsa kaybedilen kâr da
 *    bilinemez; tahmin etmek panelin en değerli özelliğini — dürüstlüğünü —
 *    harcamak olurdu. Rapor yalnızca gerçekten ölçülebilen tutarı taşır:
 *    kârı hesaplanamayan **satış** tutarı.
 *
 * 3. **Yeni sipariş geçerlilik kuralı yok.** İskonto `profit-calculator` ile
 *    birebir aynı şekilde (`allocateMoney`) satırlara pay edilir, iade
 *    `orderId` üzerinden ilgili satıra düşülür. Bu servis kâr hesabından
 *    farklı bir ciro tanımı üretirse iki ekran birbirini yalanlar.
 */

interface Bucket {
  lines: number;
  units: number;
  gross: Money;
  discount: Money;
  refunds: Money;
  firstDate: IsoDate;
  lastDate: IsoDate;
  /** Aynı siparişte iki satır olabilir; sipariş sayısı adet sayısı değildir. */
  readonly orders: Set<string>;
}

/** İadeyi doğru satıra düşürmek için: hangi (sipariş, ürün) çifti etkilendi. */
function pairKey(orderId: string, productId: string): string {
  return `${orderId}|${productId}`;
}

export function getMissingCostImpacts(params: {
  dataset: StoreDataset;
  range: DateRange;
  costs: CostResolver;
  today: IsoDate;
  rules?: RulesConfig;
}): MissingCostReport {
  const rules = params.rules ?? DEFAULT_RULES;
  const { dataset, range, costs } = params;

  const catalog = new Map<string, Product>(dataset.products.map((p) => [p.id, p]));

  const buckets = new Map<string, Bucket>();
  /** Maliyeti **çözümlenen** satırlar — iadeyi yanlış kovaya yazmamak için. */
  const coveredPairs = new Set<string>();
  let ordersConsidered = 0;

  for (const order of dataset.orders) {
    if (!isWithin(order.date, range)) continue;
    ordersConsidered += 1;

    // İskonto payları kâr hesabıyla aynı ağırlıklardan çıkmalı: satır cirosu.
    const revenues = order.lines.map((line) =>
      multiplyMoney(line.unitPrice, line.quantity),
    );
    const discountShares = allocateMoney(
      order.discount,
      revenues.map((revenue) => revenue.minor),
    );

    order.lines.forEach((line, index) => {
      if (costs.resolve(line.productId, order.date).unitCost !== null) {
        coveredPairs.add(pairKey(order.id, line.productId));
        return;
      }

      // Katalogda olmayan ürüne maliyet girilemez; eylem önerilemeyecek bir
      // satırı kuyruğa koymak kullanıcıyı çıkmaza sokar.
      if (!catalog.has(line.productId)) return;

      const lineRevenue = revenues[index] ?? ZERO_MONEY;
      const existing = buckets.get(line.productId);

      const bucket: Bucket = existing ?? {
        lines: 0,
        units: 0,
        gross: ZERO_MONEY,
        discount: ZERO_MONEY,
        refunds: ZERO_MONEY,
        firstDate: order.date,
        lastDate: order.date,
        orders: new Set<string>(),
      };
      if (!existing) buckets.set(line.productId, bucket);

      bucket.lines += 1;
      bucket.units += line.quantity;
      bucket.gross = addMoney(bucket.gross, lineRevenue);
      bucket.discount = addMoney(bucket.discount, discountShares[index] ?? ZERO_MONEY);
      bucket.orders.add(order.id);
      if (order.date < bucket.firstDate) bucket.firstDate = order.date;
      if (order.date > bucket.lastDate) bucket.lastDate = order.date;
    });
  }

  /**
   * İade, ilgili satırın satışını geri alır.
   *
   * Aralık kuralı `profit-calculator` ile aynı: iade kaydının **kendi tarihi**
   * pencereye girer. Buradaki tek ek, iadeyi yanlış kovaya yazmamak —
   * maliyeti bilindiği için zaten hesaplanabilen bir siparişin iadesi, eksik
   * maliyetli satırın tutarını düşüremez.
   *
   * Dışlanan yalnızca **maliyeti çözümlendiğini bildiğimiz** satırlardır;
   * penceredeki bir iade pencere dışındaki bir siparişe aitse yine düşülür.
   * Aksi hâlde bu bölümün toplamı, hemen üstündeki kapsam özetinden büyük
   * çıkar ve iki rakam birbirini yalanlar.
   */
  for (const record of dataset.returns) {
    if (!isWithin(record.date, range)) continue;
    if (coveredPairs.has(pairKey(record.orderId, record.productId))) continue;

    const bucket = buckets.get(record.productId);
    if (!bucket) continue;
    bucket.refunds = addMoney(bucket.refunds, record.refund);
  }

  const items: MissingCostImpact[] = [];
  for (const [productId, bucket] of buckets) {
    const product = catalog.get(productId);
    if (!product) continue;

    const uncomputableRevenue = subtractMoney(
      subtractMoney(bucket.gross, bucket.discount),
      bucket.refunds,
    );
    const affectedOrders = bucket.orders.size;

    items.push({
      productId,
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      affectedLines: bucket.lines,
      affectedOrders,
      affectedUnits: bucket.units,
      uncomputableRevenue,
      firstOrderDate: bucket.firstDate,
      lastOrderDate: bucket.lastDate,
      level: levelOf(uncomputableRevenue, affectedOrders, rules),
      reason: reasonOf(
        uncomputableRevenue,
        affectedOrders,
        bucket.firstDate,
        params.today,
        rules,
      ),
    });
  }

  items.sort(byImpact);

  return {
    items,
    ordersConsidered,
    productsInCatalog: dataset.products.length,
  };
}

/**
 * Öncelik sırası.
 *
 * Para önce gelir çünkü kullanıcının kaybettiği görünürlük parayla ölçülür;
 * eşitlikte hacim, sonra eskilik konuşur. Son basamak `productId`:
 * karşılaştırıcı **hiçbir girdide** kararsız kalmamalı, yoksa aynı veri iki
 * render'da iki farklı sıra üretir ve liste kullanıcının gözünde oynar.
 */
function byImpact(a: MissingCostImpact, b: MissingCostImpact): number {
  if (a.uncomputableRevenue.minor !== b.uncomputableRevenue.minor) {
    return b.uncomputableRevenue.minor - a.uncomputableRevenue.minor;
  }
  if (a.affectedOrders !== b.affectedOrders) return b.affectedOrders - a.affectedOrders;
  if (a.affectedUnits !== b.affectedUnits) return b.affectedUnits - a.affectedUnits;
  if (a.firstOrderDate !== b.firstOrderDate) {
    return a.firstOrderDate.localeCompare(b.firstOrderDate);
  }
  return a.productId.localeCompare(b.productId);
}

function levelOf(revenue: Money, orders: number, rules: RulesConfig): MissingCostLevel {
  if (revenue.minor >= rules.cost.criticalRevenue.minor) return "critical";
  if (
    revenue.minor >= rules.cost.notableRevenue.minor ||
    orders >= rules.cost.notableOrderCount
  ) {
    return "high";
  }
  return "normal";
}

function reasonOf(
  revenue: Money,
  orders: number,
  firstOrderDate: IsoDate,
  today: IsoDate,
  rules: RulesConfig,
): MissingCostReason {
  if (revenue.minor >= rules.cost.notableRevenue.minor) return "revenue";
  if (orders >= rules.cost.notableOrderCount) return "volume";
  // Gün farkı yerine tarih karşılaştırması: metin sıralaması gün anahtarında
  // güvenli ve `Date` aritmetiğinin saat dilimi riskini hiç doğurmuyor.
  if (firstOrderDate <= addDays(today, -rules.cost.staleDays)) return "age";
  return "revenue";
}
