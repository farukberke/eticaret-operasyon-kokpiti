import {
  lastDays,
  type DateRange,
  type IsoDate,
  type StoreDataset,
} from "@/core/domain";

import { CATALOG } from "./catalog";
import { generateAdSpend } from "./generators/adspend.gen";
import { generateOrders } from "./generators/orders.gen";
import { generateReturns } from "./generators/returns.gen";

/**
 * Demo veri kümesinin tek üretim noktası.
 *
 * **Tohum sabittir**: mağazanın "kişiliği" (hangi ürün patlar, hangisi zarar
 * ettirir) her açılışta aynı kalır.
 *
 * **Tarihler kayar**: veri her zaman "bugün"de biter. Sabit bir tarihe
 * demirlemek, paneli birkaç gün sonra bayat gösterirdi. Bir gün içinde
 * sonuç tamamen deterministiktir — sayfa yenilendiğinde hiçbir sayı oynamaz.
 */

const SEED = 20_260_727;

/** Üretilen geçmişin uzunluğu. 90 gün, çeyreklik trendleri görmeye yeter. */
export const HISTORY_DAYS = 90;

const cache = new Map<IsoDate, StoreDataset>();

export function buildDataset(today: IsoDate): StoreDataset {
  const cached = cache.get(today);
  if (cached) return cached;

  const range: DateRange = lastDays(today, HISTORY_DAYS);

  const orders = generateOrders({ catalog: CATALOG, range, seed: SEED });
  const returns = generateReturns({
    catalog: CATALOG,
    orders,
    range,
    seed: SEED,
  });
  const adSpend = generateAdSpend({ catalog: CATALOG, range, seed: SEED });

  const dataset: StoreDataset = {
    products: CATALOG.map((entry) => entry.product),
    orders,
    returns,
    adSpend,
  };

  // Aynı gün içindeki tüm istekler tek üretimi paylaşır.
  cache.set(today, dataset);
  return dataset;
}

/** Veri kümesinin kapsadığı tarih aralığı. */
export function datasetRange(today: IsoDate): DateRange {
  return lastDays(today, HISTORY_DAYS);
}
