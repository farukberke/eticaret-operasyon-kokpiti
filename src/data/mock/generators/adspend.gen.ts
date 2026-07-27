import { eachDay, lira, type AdSpendRecord, type DateRange } from "@/core/domain";

import type { CatalogEntry } from "../catalog";
import { createRng, seedFrom } from "../prng";

/**
 * Reklam harcaması üreteci.
 *
 * Günlük bütçe sabit değildir; platform harcamayı talebe göre oynatır.
 * Bu dalgalanma ROAS'ı gerçekçi kılar — sabit harcama, reklam sızıntısı
 * tespitini yapay şekilde kolaylaştırırdı.
 */

const DAILY_VOLATILITY = 0.25;

export function generateAdSpend(params: {
  catalog: readonly CatalogEntry[];
  range: DateRange;
  seed: number;
}): AdSpendRecord[] {
  const { catalog, range, seed } = params;
  const records: AdSpendRecord[] = [];

  for (const date of eachDay(range)) {
    for (const entry of catalog) {
      const budget = entry.demand.adSpendPerDay;
      if (budget <= 0) continue;

      const rng = createRng(seed ^ seedFrom(`ad:${date}:${entry.product.id}`));
      const amount = Math.max(0, rng.normal(budget, budget * DAILY_VOLATILITY));
      if (amount < 1) continue;

      records.push({
        date,
        productId: entry.product.id,
        amount: lira(amount),
      });
    }
  }

  return records;
}
