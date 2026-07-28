import type { ProductPerformance } from "../domain/product";

import { DEFAULT_RULES } from "./rules.config";
import type { StockForecast, StockForecastBatch } from "./stock-forecast";

/**
 * TEDARİK SÜRESİ RİSKİ — "kaç gün stoğum var" sorusunu "ürün zamanında
 * yetişir mi" sorusuna çevirir.
 *
 * `stock-forecast.ts` zaten "kaç gün kaldı"yı biliyor (`daysRemaining`).
 * Burada eklenen şey **ikinci bir tahmin değil, karşılaştırma**: o gün
 * sayısı ürünün tedarik süresine (`Product.leadTimeDays`) yetişiyor mu?
 * `daysOfCoverOf` bu dosyada hiç çağrılmaz — `StockForecastBatch` girdi
 * olarak alınır ve olduğu gibi okunur, tıpkı `stock-alerts.ts` ve
 * `reorder-suggestion.ts`nin yaptığı gibi.
 *
 * Yeni domain modeli eklenmedi. `LeadTimeRisk`, `StockForecast` ile aynı
 * statüde bir **servis çıktısı**.
 *
 * Kasıtlı olarak burada OLMAYAN: tedarikçi, satın alma emri, depo, sipariş
 * miktarı. Bu servis yalnızca "ne kadar acil?" sorusuna cevap verir —
 * "kaç adet?" sorusu `reorder-suggestion.ts`nin sorumluluğunda kalır.
 */

/**
 * Altı durum: dördü zaman çizelgesi (late → safe), ikisi hesaplanamazlık
 * sebebi. İkisi ayrı tutuluyor çünkü kullanıcının yapacağı iş farklı:
 * `unknownLeadTime`de eksik olan tedarik süresi bilgisi, `unmeasurable`de
 * ise stoğun/satışın kendisi (`stock-forecast.ts`nin zaten ayırt ettiği
 * `unknown`/`noSales`/`negative` durumları).
 */
export type LeadTimeRiskState =
  /** Stok, ürün tedarik süresi dolmadan önce tükeniyor. */
  | "late"
  /** Sipariş kararı bugün ele alınmalı — güvenli eşitlik sınırı içinde. */
  | "dueToday"
  /** Henüz geç değil ama karar penceresi içine girdi. */
  | "upcoming"
  /** Tedarik süresine göre şu an acil bir aksiyon yok. */
  | "safe"
  /** Ürünün tedarik süresi bilgisi yok ya da geçersiz. */
  | "unknownLeadTime"
  /** Forecast ölçülemiyor (bilinmeyen/negatif stok ya da satış verisi yok). */
  | "unmeasurable";

export interface LeadTimeRisk {
  readonly state: LeadTimeRiskState;
  /** Ürünün geçerli tedarik süresi. `unknownLeadTime`de her zaman `null`. */
  readonly leadTimeDays: number | null;
  /** `StockForecast.daysRemaining`nin aynısı — `unmeasurable`de `null`. */
  readonly daysOfCover: number | null;
  /**
   * `leadTimeDays - daysOfCover`. Yalnızca `late` durumunda dolu ve pozitif;
   * diğer durumlarda `null` — negatif ya da anlamsız bir sayı asla dışarı
   * sızmaz.
   */
  readonly shortageGapDays: number | null;
  /**
   * `daysOfCover - leadTimeDays`. İşaretli: negatifse karar gecikmiş,
   * sıfırsa bugün, pozitifse kalan gündür. Yalnızca dört ölçülebilir
   * zaman-çizelgesi durumunda (`late`/`dueToday`/`upcoming`/`safe`) dolu.
   */
  readonly orderDecisionDays: number | null;
}

/**
 * Tam sayı, negatif olmayan bir tedarik süresi mi?
 *
 * Sıfır kabul edilir: "sipariş verildiği gün stoğa girer" anlamına gelir
 * (ör. yerel bir tedarikçiden aynı gün teslim). Negatif ya da ondalık bir
 * değer veri hatasıdır; varsayılan bir sayı uydurmak yerine `unknownLeadTime`e
 * düşülür — tıpkı bozuk stok adedinin `unknown`a düşmesi gibi.
 */
function isValidLeadTimeDays(value: number | undefined): value is number {
  return (
    value !== undefined &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= 0
  );
}

const EMPTY: Pick<LeadTimeRisk, "shortageGapDays" | "orderDecisionDays"> = {
  shortageGapDays: null,
  orderDecisionDays: null,
};

/**
 * Tek ürünün tedarik süresi riski. Saf ve O(1).
 *
 * `forecast`, `buildStockForecasts`in ürettiği tek bir `StockForecast` —
 * burada yeniden hesaplanmaz, yalnızca `daysRemaining`i okunur.
 */
export function leadTimeRiskFor(params: {
  readonly forecast: StockForecast;
  /** `Product.leadTimeDays` — eksikse `undefined`. */
  readonly leadTimeDays: number | undefined;
  /**
   * Sipariş kararına "yaklaştı" sayılmak için kalan gün üst sınırı.
   *
   * Yeni bir eşik DEĞİL: `DEFAULT_RULES.inventory.decisionHorizonDays` —
   * "bugün patlamayan ama sürüncemede bırakılmaması gereken işlere" verilen
   * süre. Tedarik süresi geldiğinde sipariş kararı da tam olarak bu tanıma
   * giriyor, bu yüzden ikinci bir "3 gün" ya da "5 gün" icat edilmedi.
   */
  readonly decisionHorizonDays?: number;
}): LeadTimeRisk {
  const horizon =
    params.decisionHorizonDays ?? DEFAULT_RULES.inventory.decisionHorizonDays;
  const daysOfCover = params.forecast.daysRemaining;

  // Stoğun kendisi ölçülemiyorsa (bilinmeyen/negatif stok, satış verisi
  // yok) tedarik süresiyle karşılaştıracak bir sayı yok — dürüstçe
  // `unmeasurable` denir, `stock-forecast.ts`nin ayrımı burada tekrar
  // yazılmaz.
  if (daysOfCover === null || !Number.isFinite(daysOfCover)) {
    return { state: "unmeasurable", leadTimeDays: null, daysOfCover: null, ...EMPTY };
  }

  if (!isValidLeadTimeDays(params.leadTimeDays)) {
    return { state: "unknownLeadTime", leadTimeDays: null, daysOfCover, ...EMPTY };
  }

  const leadTimeDays = params.leadTimeDays;
  const orderDecisionDays = daysOfCover - leadTimeDays;

  // Karar tarihi geçmişte: stok, tedarik süresi dolmadan tükenecek.
  if (orderDecisionDays < 0) {
    return {
      state: "late",
      leadTimeDays,
      daysOfCover,
      shortageGapDays: leadTimeDays - daysOfCover,
      orderDecisionDays,
    };
  }

  // [0, 1) aralığı "bugün" sayılır — `orderDeadlineOf`teki gün taşırma
  // (`Math.floor`) mantığıyla aynı ruhta: bir günün kesri hâlâ o gündür.
  if (orderDecisionDays < 1) {
    return {
      state: "dueToday",
      leadTimeDays,
      daysOfCover,
      ...EMPTY,
      orderDecisionDays,
    };
  }

  if (orderDecisionDays <= horizon) {
    return {
      state: "upcoming",
      leadTimeDays,
      daysOfCover,
      ...EMPTY,
      orderDecisionDays,
    };
  }

  return { state: "safe", leadTimeDays, daysOfCover, ...EMPTY, orderDecisionDays };
}

/** Ürün başına bağımsız — girdi sırası sonucu etkilemez. */
export interface LeadTimeRiskBatch {
  /** Kullanılan karar penceresi — dipnot/görünüm katmanı için taşınır. */
  readonly decisionHorizonDays: number;
  readonly byProduct: ReadonlyMap<string, LeadTimeRisk>;
}

/**
 * Katalogun tamamının tedarik süresi riski — **tek geçiş**, forecast
 * yeniden hesaplanmaz.
 *
 * Girdi `buildStockForecasts`in çıktısıdır ve olduğu gibi okunur; ek bir
 * port çağrısı yapılmaz, ek bir "günlük hız" hesabı üretilmez.
 */
export function buildLeadTimeRisks(
  performance: readonly ProductPerformance[],
  forecasts: StockForecastBatch,
  decisionHorizonDays?: number,
): LeadTimeRiskBatch {
  const byProduct = new Map<string, LeadTimeRisk>();

  for (const item of performance) {
    const forecast = forecasts.byProduct.get(item.product.id);
    byProduct.set(
      item.product.id,
      forecast
        ? leadTimeRiskFor({
            forecast,
            leadTimeDays: item.product.leadTimeDays,
            ...(decisionHorizonDays !== undefined ? { decisionHorizonDays } : {}),
          })
        : { state: "unmeasurable", leadTimeDays: null, daysOfCover: null, ...EMPTY },
    );
  }

  return {
    decisionHorizonDays:
      decisionHorizonDays ?? DEFAULT_RULES.inventory.decisionHorizonDays,
    byProduct,
  };
}
