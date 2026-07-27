import {
  dayOfWeek,
  eachDay,
  multiplyMoney,
  sumMoney,
  ZERO_MONEY,
  type DateRange,
  type IsoDate,
  type Order,
  type OrderLine,
} from "@/core/domain";

import type { CatalogEntry } from "../catalog";
import { createRng, seedFrom, type Rng } from "../prng";

/**
 * Sipariş geçmişi üreteci.
 *
 * Gerçekçilik için üç katman: haftalık sezonsallık (hafta sonu satış artar),
 * arketipe bağlı yakın dönem çarpanı (trend/sönüş) ve normal dağılımlı gürültü.
 * Hepsi tohumlu üreteçten geldiği için sonuç deterministiktir.
 */

/** Siparişlerin bu oranı kupon kullanır. */
const COUPON_PROBABILITY = 0.12;
const COUPON_RATE = 0.1;

/** Bir siparişte aynı üründen en fazla kaç adet. */
const MAX_UNITS_PER_ORDER = 3;

/** Paket eşi olan bir ürün satıldığında eşinin de sepete girme olasılığı. */
const BUNDLE_ATTACH_PROBABILITY = 0.45;

/** Hafta sonu alışveriş artar; Cuma da hareketlenir. */
function weekdayFactor(date: IsoDate): number {
  const day = dayOfWeek(date);
  if (day === 0 || day === 6) return 1.3;
  if (day === 5) return 1.1;
  return 1;
}

/** Trend ve sönüş: son N günde talebe uygulanan çarpan. */
function recentFactor(
  entry: CatalogEntry,
  dayIndex: number,
  totalDays: number,
): number {
  const { recentDays, recentFactor: factor } = entry.demand;
  if (recentDays <= 0) return 1;
  return dayIndex >= totalDays - recentDays ? factor : 1;
}

function unitsForDay(
  entry: CatalogEntry,
  date: IsoDate,
  dayIndex: number,
  totalDays: number,
  rng: Rng,
): number {
  const { base, volatility } = entry.demand;
  if (base <= 0) return 0;

  const expected =
    base * weekdayFactor(date) * recentFactor(entry, dayIndex, totalDays);
  const sampled = Math.max(0, rng.normal(expected, expected * volatility));

  /**
   * Kesirli kısım olasılıkla tam sayıya çevrilir.
   *
   * `Math.round` kullanmak, günde 0,3 adet satan bir ürünü *hiç satmıyor*
   * gösterirdi — ayda ~9 satış yapan gerçek bir ürün veride yok olurdu.
   * Bu yaklaşım uzun vadede beklenen ortalamayı korur.
   */
  const whole = Math.floor(sampled);
  return whole + (rng.chance(sampled - whole) ? 1 : 0);
}

function makeLine(entry: CatalogEntry, quantity: number): OrderLine {
  return {
    productId: entry.product.id,
    quantity,
    // Satış anındaki fiyat satırda donar; maliyet burada YOK — o, sipariş
    // tarihine göre maliyet modelinden çözümlenir.
    unitPrice: entry.product.price,
  };
}

export function generateOrders(params: {
  catalog: readonly CatalogEntry[];
  range: DateRange;
  seed: number;
}): Order[] {
  const { catalog, range, seed } = params;

  const byId = new Map(catalog.map((entry) => [entry.product.id, entry] as const));
  const days = eachDay(range);
  const orders: Order[] = [];

  days.forEach((date, dayIndex) => {
    // Gün + ürün bazlı tohum: katalogdaki bir ürünü değiştirmek
    // diğer ürünlerin geçmişini bozmasın.
    const remaining = new Map<string, number>();

    for (const entry of catalog) {
      const rng = createRng(seed ^ seedFrom(`${date}:${entry.product.id}`));
      const units = unitsForDay(entry, date, dayIndex, days.length, rng);
      if (units > 0) remaining.set(entry.product.id, units);
    }

    const dayRng = createRng(seed ^ seedFrom(`orders:${date}`));
    let sequence = 0;

    // Sabit sıra: Map ekleme sırasını korur, katalog sırası da sabit.
    for (const [productId, total] of [...remaining.entries()]) {
      const entry = byId.get(productId);
      if (!entry) continue;

      let left = total;
      while (left > 0) {
        const quantity = Math.min(left, dayRng.int(1, MAX_UNITS_PER_ORDER));
        left -= quantity;

        const lines: OrderLine[] = [makeLine(entry, quantity)];

        // Paket eşi: birlikte alım ilişkisi buradan doğar.
        const partnerId = entry.demand.bundlePartnerId;
        const partnerLeft = partnerId ? (remaining.get(partnerId) ?? 0) : 0;
        if (partnerId && partnerLeft > 0 && dayRng.chance(BUNDLE_ATTACH_PROBABILITY)) {
          const partner = byId.get(partnerId);
          if (partner) {
            lines.push(makeLine(partner, 1));
            remaining.set(partnerId, partnerLeft - 1);
          }
        }

        const gross = sumMoney(
          lines.map((line) => multiplyMoney(line.unitPrice, line.quantity)),
        );

        sequence += 1;
        orders.push({
          id: `${date}-${sequence}`,
          date,
          lines,
          // Komisyon ve kargo artık siparişin üzerinde değil: ikisi de
          // maliyet modelinden gelir ve kullanıcı tarafından yönetilir.
          discount: dayRng.chance(COUPON_PROBABILITY)
            ? multiplyMoney(gross, COUPON_RATE)
            : ZERO_MONEY,
        });
      }
    }
  });

  return orders;
}
