import {
  addDays,
  multiplyMoney,
  type DateRange,
  type Order,
  type ReturnRecord,
} from "@/core/domain";

import type { CatalogEntry } from "../catalog";
import { createRng, seedFrom } from "../prng";

/**
 * İade üreteci.
 *
 * İadeler siparişlerden türetilir; bağımsız üretilemezler çünkü var olmayan
 * bir satışın iadesi olamaz. Her iade, satıştan birkaç gün sonraya tarihlenir
 * — kargo ve karar süresi gerçekte de böyle işler.
 */

const MIN_DAYS_AFTER_SALE = 2;
const MAX_DAYS_AFTER_SALE = 12;

export function generateReturns(params: {
  catalog: readonly CatalogEntry[];
  orders: readonly Order[];
  range: DateRange;
  seed: number;
}): ReturnRecord[] {
  const { catalog, orders, range, seed } = params;

  const returnRateOf = new Map(
    catalog.map((entry) => [entry.product.id, entry.demand.returnRate] as const),
  );

  const records: ReturnRecord[] = [];

  for (const order of orders) {
    order.lines.forEach((line, lineIndex) => {
      const rate = returnRateOf.get(line.productId) ?? 0;
      if (rate <= 0) return;

      const rng = createRng(seed ^ seedFrom(`return:${order.id}:${lineIndex}`));

      // Her adet için ayrı ayrı karar ver — 3 adetlik siparişin tamamının
      // iade edilmesi de, hiçbirinin edilmemesi de mümkün olmalı.
      let returned = 0;
      for (let unit = 0; unit < line.quantity; unit += 1) {
        if (rng.chance(rate)) returned += 1;
      }
      if (returned === 0) return;

      const returnDate = addDays(
        order.date,
        rng.int(MIN_DAYS_AFTER_SALE, MAX_DAYS_AFTER_SALE),
      );
      // Geleceğe iade yazılamaz: veri kümesinin sonunu aşanlar düşer.
      if (returnDate > range.to) return;

      records.push({
        id: `ret-${order.id}-${lineIndex}`,
        orderId: order.id,
        productId: line.productId,
        date: returnDate,
        quantity: returned,
        refund: multiplyMoney(line.unitPrice, returned),
      });
    });
  }

  return records;
}
