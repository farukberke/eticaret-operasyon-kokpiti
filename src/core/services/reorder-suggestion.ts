import type { ProductPerformance } from "../domain/product";

import { STOCK_COVERAGE_THRESHOLDS } from "./rules.config";
import type { StockCoverageState, StockForecastBatch } from "./stock-forecast";

/**
 * YENİDEN SİPARİŞ ÖNERİSİ — "kaç adet sipariş vereyim" sorusuna tahmini cevap.
 *
 * `stock-forecast.ts` "kaç gün kaldı"yı, `stock-alerts.ts` "hangi ürünler
 * öncelikli"yi söylüyor. Bu üçüncü katman ikisinden birini de yeniden
 * hesaplamaz: `StockForecastBatch`teki `state`i olduğu gibi okur, kararı
 * yalnızca miktara çevirir. Aksiyon gerektirmeyen (`normal`/`high`/`noSales`)
 * ve veri sorunu olan (`negative`/`unknown`) durumlarda **adet üretilmez** —
 * bu bir kesin satın alma emri değil, tahmini bir öneridir ve yalnızca
 * ölçülebilir durumlarda (`critical`/`low`) anlamlıdır.
 *
 * Hedef stok günü yeni bir sabit DEĞİL: `STOCK_COVERAGE_THRESHOLDS.low`
 * (= `DEFAULT_RULES.opportunity.restockDaysOfCover`), yani "düşük" sayılmanın
 * üst sınırı. Bu bilinçli: öneri "düşük" eşiğinin tam üstüne kadar stok
 * tazeler, ürün tablosundaki rozetle aynı sayıya dayanır.
 */

export interface ReorderSuggestion {
  /** Önerilen sipariş adedi — tam sayı, yukarı yuvarlanmış, asla negatif. */
  readonly quantity: number;
  /** Hedef stok miktarı: `dailyVelocity * targetCoverageDays`. Ondalık olabilir. */
  readonly targetStockUnits: number;
  readonly dailyVelocity: number;
  readonly targetCoverageDays: number;
  readonly currentStock: number;
}

/**
 * Dört olası sonuç:
 * - `suggested`  → critical/low, adet hesaplanabildi.
 * - `correctStock` → negative: adet önermeden önce stok kaydı düzeltilmeli.
 * - `needsStockData` → unknown: adet üretmek için stok verisi gerekli.
 * - `none` → normal/high/noSales, ya da mevcut stok zaten hedefin üstünde.
 */
export type ReorderRecommendation =
  | ({ readonly kind: "suggested" } & ReorderSuggestion)
  | { readonly kind: "correctStock" }
  | { readonly kind: "needsStockData" }
  | { readonly kind: "none" };

/**
 * Tek ürünün önerisi. Saf ve O(1).
 *
 * `stock`/`dailyVelocity` üzerindeki `Number.isFinite` denetimleri normal
 * akışta hiç tetiklenmez (`state` zaten bu durumları `negative`/`unknown`/
 * `noSales`e ayırmış olur) — burada ikinci bir savunma satırı: bu fonksiyon
 * `state`e bakılmaksızın çağrılsa bile `Infinity`/`NaN`/negatif adet asla
 * dışarı sızmaz.
 */
export function reorderRecommendationFor(params: {
  readonly state: StockCoverageState;
  readonly stock: number | null;
  readonly dailyVelocity: number;
  readonly targetCoverageDays?: number;
}): ReorderRecommendation {
  if (params.state === "negative") return { kind: "correctStock" };
  if (params.state === "unknown") return { kind: "needsStockData" };
  if (params.state !== "critical" && params.state !== "low") return { kind: "none" };

  const targetCoverageDays = params.targetCoverageDays ?? STOCK_COVERAGE_THRESHOLDS.low;

  if (
    params.stock === null ||
    !Number.isFinite(params.stock) ||
    params.stock < 0 ||
    !Number.isFinite(params.dailyVelocity) ||
    params.dailyVelocity <= 0 ||
    !Number.isFinite(targetCoverageDays) ||
    targetCoverageDays <= 0
  ) {
    return { kind: "none" };
  }

  const targetStockUnits = params.dailyVelocity * targetCoverageDays;
  const rawQuantity = targetStockUnits - params.stock;
  // Mevcut stok zaten hedefte ya da üstündeyse önerecek bir şey yok.
  if (rawQuantity <= 0) return { kind: "none" };

  return {
    kind: "suggested",
    quantity: Math.ceil(rawQuantity),
    targetStockUnits,
    dailyVelocity: params.dailyVelocity,
    targetCoverageDays,
    currentStock: params.stock,
  };
}

/**
 * Katalogun tamamı için öneriler — **tek geçiş**, forecast yeniden hesaplanmaz.
 *
 * Girdi `buildStockForecasts`in çıktısıdır ve olduğu gibi okunur; maliyet
 * verisine hiç bakmaz (`CostPort` çağrılmaz) — sipariş adedi kararı stoğun ve
 * satış hızının fonksiyonu, maliyetin değil.
 */
export function buildReorderRecommendations(
  performance: readonly ProductPerformance[],
  forecasts: StockForecastBatch,
  targetCoverageDays?: number,
): ReadonlyMap<string, ReorderRecommendation> {
  return new Map(
    performance.map((item) => {
      const forecast = forecasts.byProduct.get(item.product.id);
      const recommendation: ReorderRecommendation = forecast
        ? reorderRecommendationFor({
            state: forecast.state,
            stock: item.product.stock,
            dailyVelocity: item.dailyVelocity,
            ...(targetCoverageDays !== undefined ? { targetCoverageDays } : {}),
          })
        : { kind: "none" };
      return [item.product.id, recommendation] as const;
    }),
  );
}
