import type { ProductPerformance } from "../domain/product";

import type { StockCoverageState, StockForecastBatch } from "./stock-forecast";

/**
 * STOK UYARILARI — tahminin "ürün tablosunda gösterilen bilgi" olmaktan
 * çıkıp bir operasyon kuyruğuna dönüştüğü yer.
 *
 * `stock-forecast.ts` zaten "kaç gün kaldı"nın kararını veriyor
 * (`StockCoverageState`). Burada eklenen şey **ikinci bir hesap değil,
 * önceliklendirme**: aynı yedi durumdan hangi dördünün aksiyon gerektirdiğini
 * seçer ve deterministik bir sıraya dizer. `forecastStockCoverage`,
 * `daysOfCoverOf` ya da eşikler burada yeniden yazılmaz — `StockForecastBatch`
 * girdi olarak alınır ve olduğu gibi okunur.
 *
 * Yeni domain modeli eklenmedi. `StockAlert`, `PriorityAction` ile aynı
 * statüde bir **servis çıktısı**: sinyal değil, çünkü masada `Money` yok —
 * `negative`/`unknown` durumlarının ölçülebilir bir tutarı olmadığı gibi,
 * bu servis de maliyet verisine hiç bakmaz (bilinçli: stok kararı maliyet
 * bilgisine muhtaç değil). Bir `Signal` üretmek `moneyAtStake` için uydurma
 * bir tutar icat etmeyi gerektirirdi.
 */

/**
 * Aksiyon gerektiren dört durum. `normal`, `high` ve `noSales` bilinçli
 * olarak dışarıda: ilk ikisi zaten sağlıklı, üçüncüsü satış hızı olmayan bir
 * ürünü "tükeniyor" gibi göstermek yalan olurdu — o ürünün sorunu stok değil,
 * talep yokluğu (`DEAD_STOCK` bunu zaten risk tarafında karşılıyor).
 */
export type StockAlertLevel = Extract<
  StockCoverageState,
  "critical" | "low" | "negative" | "unknown"
>;

const ALERT_LEVELS: ReadonlySet<StockCoverageState> = new Set<StockCoverageState>([
  "negative",
  "critical",
  "unknown",
  "low",
]);

function isAlertLevel(state: StockCoverageState): state is StockAlertLevel {
  return ALERT_LEVELS.has(state);
}

export interface StockAlert {
  readonly productId: string;
  readonly productName: string;
  readonly stock: number;
  readonly level: StockAlertLevel;
  /** Yalnızca `critical`/`low` durumunda dolu; `negative`/`unknown`da `null`. */
  readonly daysRemaining: number | null;
}

/**
 * Grup sırası — talimatın kendisi. `negative` en önde: stok tükenmesi değil,
 * envanter kaydının kendisi bozuk, ki bu her türlü tahmini geçersiz kılar.
 * `unknown` `low`dan önde: veri eksikliği, "yakında sipariş ver" uyarısından
 * daha temel bir engel.
 */
const GROUP_RANK: Record<StockAlertLevel, number> = {
  negative: 0,
  critical: 1,
  unknown: 2,
  low: 3,
};

/** `null` sona düşer — aynı grupta ikisi de `null` olduğunda eşitlik korunur. */
function compareRemainingDays(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

interface Candidate extends StockAlert {
  readonly dailyVelocity: number;
}

/**
 * Sıralama: grup → kalan gün (az önce) → satış hızı (çok önce) →
 * stok adedi (az önce) → ürün kimliği (kararlı bağ bozucu).
 *
 * Aynı ölçüt seti `priority-engine.ts`teki mantıkla aynı ruhta: birden fazla
 * boyut, son çare olarak kimliğe düşen deterministik bir sıra.
 */
function compareCandidates(a: Candidate, b: Candidate): number {
  const byGroup = GROUP_RANK[a.level] - GROUP_RANK[b.level];
  if (byGroup !== 0) return byGroup;

  const byDays = compareRemainingDays(a.daysRemaining, b.daysRemaining);
  if (byDays !== 0) return byDays;

  const byVelocity = b.dailyVelocity - a.dailyVelocity;
  if (byVelocity !== 0) return byVelocity;

  const byStock = a.stock - b.stock;
  if (byStock !== 0) return byStock;

  return a.productId.localeCompare(b.productId);
}

/**
 * Katalogun stok uyarıları — tek geçiş, tahmin yeniden hesaplanmaz.
 *
 * `forecasts`, `buildStockForecasts`in çıktısıdır ve **aynen** kullanılır:
 * ürün tablosundaki "Kritik" rozetiyle buradaki uyarı aynı kaynaktan gelir,
 * ikisi ayrışamaz.
 */
export function buildStockAlerts(
  performance: readonly ProductPerformance[],
  forecasts: StockForecastBatch,
): StockAlert[] {
  const candidates: Candidate[] = [];

  for (const item of performance) {
    const forecast = forecasts.byProduct.get(item.product.id);
    if (!forecast || !isAlertLevel(forecast.state)) continue;

    candidates.push({
      productId: item.product.id,
      productName: item.product.name,
      stock: item.product.stock,
      level: forecast.state,
      daysRemaining: forecast.daysRemaining,
      dailyVelocity: item.dailyVelocity,
    });
  }

  return candidates.sort(compareCandidates).map((candidate): StockAlert => ({
    productId: candidate.productId,
    productName: candidate.productName,
    stock: candidate.stock,
    level: candidate.level,
    daysRemaining: candidate.daysRemaining,
  }));
}
