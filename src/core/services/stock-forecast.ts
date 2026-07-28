import { daysInRange, type DateRange } from "../domain/date-range";
import type { ProductPerformance } from "../domain/product";

import { daysOfCoverOf } from "./inventory-analyzer";
import {
  STOCK_COVERAGE_THRESHOLDS,
  type StockCoverageThresholds,
} from "./rules.config";

/**
 * STOK TAHMİNLEYİCİ — "elimdeki bu kadar stok kaç gün daha yeter".
 *
 * `inventory-analyzer` sayıyı zaten üretiyor (`daysOfCover`). Burada eklenen
 * şey **karar**: 12,5 sayısı tek başına hiçbir şey söylemez; "Düşük" kelimesi
 * söyler. Bu yüzden servis yeni bir hesap değil, mevcut hesabın seviyeye
 * çevrilmesidir — ikinci bir "günlük satış hızı" tanımı üretmek, panelin iki
 * ekranda iki farklı sayı göstermesinin en kestirme yoluydu.
 *
 * Neden ayrı dosya: `inventory-analyzer` mağazanın **ölçümünü** yapıyor
 * (dedektörlerin girdisi). Buradaki sınıflandırma yalnızca ürün tablosunun
 * sunumuna hizmet eder ve hiçbir sinyali beslemez. İkisini aynı dosyada
 * tutmak, sunum kaygısını dedektör girdisinin yanına taşımak olurdu.
 *
 * Yeni domain modeli EKLENMEDİ. `StockForecast` bir varlık değil, servis
 * çıktısı — `analysis-window.ts` içindeki `AnalysisWindow` ile aynı statüde.
 * `src/core/domain/` bu adımda hiç değişmedi.
 */

/**
 * Stoğun durumu.
 *
 * Dört ölçülebilir seviye ve üç ölçülemezlik sebebi. Ölçülemezlik neden tek
 * bir "bilinmiyor"a indirgenmiyor: kullanıcının yapacağı iş her birinde
 * farklı. Stok bilinmiyorsa entegrasyonu, satış yoksa ölü stoğu, negatif
 * stokta ise envanter kaydının kendisini düzeltir.
 */
export type StockCoverageState =
  /** 0 – critical gün: sipariş çoktan verilmeliydi. */
  | "critical"
  /** critical – low gün: tedarik süresi düşünülmeli. */
  | "low"
  /** low – normal gün: karar gerektirmiyor. */
  | "normal"
  /** normal günün üstü: sermaye rafta bekliyor. */
  | "high"
  /** Stok adedi bilinmiyor — hesap kurulamaz. */
  | "unknown"
  /** Pencerede net satış yok — bölecek bir hız yok. */
  | "noSales"
  /** Stok negatif: envanter kaydı hatalı, tahmin anlamsız. */
  | "negative";

export interface StockForecast {
  readonly state: StockCoverageState;
  /**
   * Tahmini kalan gün. Yalnızca dört ölçülebilir durumda dolu; diğerlerinde
   * `null`.
   *
   * `Infinity` ve `NaN` buraya asla ulaşamaz — hızın sıfır ya da geçersiz
   * olduğu her yol `state` tarafında ayrı bir duruma çıkar. "Sonsuz gün
   * yeter" demek ölü stoğu sağlıklı göstermek olurdu.
   */
  readonly daysRemaining: number | null;
  /** Hızın hesaplandığı pencere: "son X günlük satışa göre" cümlesinin X'i. */
  readonly windowDays: number;
}

/** Seviyeye çevirir. Sınırlar dahil: 7 gün kritik, 7,5 gün düşüktür. */
function stateForDays(days: number, limits: StockCoverageThresholds) {
  if (days <= limits.critical) return "critical" as const;
  if (days <= limits.low) return "low" as const;
  if (days <= limits.normal) return "normal" as const;
  return "high" as const;
}

/**
 * Tek ürünün tahmini. Saf ve O(1) — tarih hesabı içermez, gün sayısını
 * dışarıdan alır ki liste render'ında ürün başına takvim işi yapılmasın.
 */
export function forecastStockCoverage(params: {
  /** Elde kalan adet. Bilinmiyorsa `null`. */
  readonly stock: number | null;
  /** Pencere içindeki günlük ortalama net satış adedi. */
  readonly dailyVelocity: number;
  readonly windowDays: number;
  readonly thresholds?: StockCoverageThresholds;
}): StockForecast {
  const windowDays = params.windowDays;
  const limits = params.thresholds ?? STOCK_COVERAGE_THRESHOLDS;

  const empty = (state: StockCoverageState): StockForecast => ({
    state,
    daysRemaining: null,
    windowDays,
  });

  // Sıra önemli: negatif stok da "satışsız" olabilir, ama kullanıcıya
  // söylenmesi gereken şey envanter kaydının bozuk olduğudur.
  if (params.stock === null || !Number.isFinite(params.stock)) return empty("unknown");
  if (params.stock < 0) return empty("negative");
  if (!Number.isFinite(params.dailyVelocity)) return empty("noSales");

  /**
   * Hız sıfır **ya da negatif** olduğunda "satış verisi yok" denir. Negatif
   * hız (iadenin satışı aşması) teknik olarak farklı bir durum ama
   * kullanıcının göreceği sonuç aynı: bu ürünün stoğunu eritecek bir talep
   * yok. Ayrı bir rozet, karşılığı olmayan bir ayrım öğretirdi.
   */
  const days = daysOfCoverOf(params.stock, params.dailyVelocity);
  if (days === null || !Number.isFinite(days)) return empty("noSales");

  return { state: stateForDays(days, limits), daysRemaining: days, windowDays };
}

/**
 * Katalogun tamamının tahmini.
 *
 * `windowDays` dışarıda duruyor çünkü tüm satırlar için aynı: tablo altındaki
 * "son X güne göre" dipnotu, katalog boş olduğunda bile yazılabilmeli. Tek
 * bir satırdan okunsaydı ürünsüz bir tabloda dipnot kaybolurdu.
 */
export interface StockForecastBatch {
  /** Hızın hesaplandığı pencere uzunluğu — tüm ürünler için ortak. */
  readonly windowDays: number;
  readonly byProduct: ReadonlyMap<string, StockForecast>;
}

/**
 * Tüm katalogun tahmini — **tek geçiş, tek takvim hesabı**.
 *
 * Pencere gün sayısı burada bir kez çözülür; 40 ürünlük bir tabloda ürün
 * başına `daysInRange` çağırmak aynı cevabı 40 kez üretmek olurdu. Kalan iş
 * ürün başına iki bölme.
 *
 * Girdi olarak `ProductPerformance` alıyor, veri kümesi değil: satış hızı
 * zaten orada hesaplanmış durumda ve onu yeniden toplamak, tabloyla
 * dedektörlerin farklı hızlara bakması riskini açardı.
 */
export function buildStockForecasts(
  performance: readonly ProductPerformance[],
  range: DateRange,
  thresholds?: StockCoverageThresholds,
): StockForecastBatch {
  const windowDays = daysInRange(range);

  return {
    windowDays,
    byProduct: new Map(
      performance.map((item) => [
        item.product.id,
        forecastStockCoverage({
          stock: item.product.stock,
          dailyVelocity: item.dailyVelocity,
          windowDays,
          ...(thresholds ? { thresholds } : {}),
        }),
      ]),
    ),
  };
}
