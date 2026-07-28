import { previousPeriod, type DateRange } from "../domain/date-range";
import type { ProfitSummary, SalesSummary } from "../domain/metrics";
import {
  ZERO_MONEY,
  moneyRatio,
  subtractMoney,
  sumMoney,
  type Money,
} from "../domain/money";
import type { Signal } from "../domain/signal";

/**
 * ÖNCEKİ DÖNEM KARŞILAŞTIRMASI — "bu rakam iyi mi kötü mü" sorusunun cevabı.
 *
 * Kokpit bir sayı gösterdiğinde ("net kâr ₺142.300") kullanıcı onu tek başına
 * okuyamaz: iyi bir ay mı, düşüş mü? Cevap her zaman **hemen önceki eşit
 * uzunluktaki dönemle** kıyaslamaktan gelir.
 *
 * İki şey bilinçli olarak burada, tek yerde toplandı:
 *
 * 1. **Karşılaştırma penceresi.** Seçili aralık ne olursa olsun (7 gün, bu ay,
 *    özel 10 gün) önceki dönem aynı gün sayısına sahip ve bitişiktir. Hesabı
 *    bileşenlere dağıtmak, iki kartın iki farklı "önceki dönem"den konuşması
 *    demekti.
 * 2. **Değişim matematiği.** Yüzde değişimin ne zaman anlamsız olduğu
 *    (sıfır taban, veri yokluğu, negatif taban) bir sunum ayrıntısı değil,
 *    dürüstlük kararıdır — ve karar çekirdekte verilir.
 *
 * Yeni bir tarih fonksiyonu yazılmadı: `previousPeriod` zaten domain'de vardı
 * ve satış/kâr özetlerinin trend hesabı da onu kullanıyor. Buradaki sarmalayıcı
 * yalnızca "analizin karşılaştırma penceresi" kavramına ad veriyor.
 */

/**
 * Seçili pencerenin karşılaştırma penceresi.
 *
 * Sözleşme: aynı gün sayısı, seçili dönemin başlangıcından bir gün önce biten,
 * uçları dahil bir `DateRange`. Çakışma yoktur — iki dönem aynı günü sayarsa
 * değişim olduğundan küçük görünür.
 */
export function comparisonRangeOf(range: DateRange): DateRange {
  return previousPeriod(range);
}

export type ComparisonDirection = "up" | "down" | "flat";

/**
 * Karşılaştırmanın **hangi zeminde** yapıldığı.
 *
 * Yüzde değişim her zaman hesaplanamaz ve hesaplanamadığında uydurmak yerine
 * sebebini taşımak gerekir; ekran "Yeni" ile "Karşılaştırılamıyor" arasındaki
 * farkı ancak böyle söyleyebilir.
 *
 * • `comparable`     → önceki dönemde ölçülebilir bir taban var, oran geçerli.
 * • `newBaseline`    → önceki dönemde hiç veri yoktu, bu dönemde var ("Yeni").
 * • `noPreviousData` → önceki dönemde hiç veri yoktu, bu dönemde de yok.
 * • `zeroBaseline`   → veri vardı ama taban sıfır ya da ölçü tanımsız.
 */
export type ComparisonBasis =
  "comparable" | "newBaseline" | "noPreviousData" | "zeroBaseline";

export interface PeriodDelta {
  readonly direction: ComparisonDirection;
  readonly basis: ComparisonBasis;
  /**
   * Yüzde değişim. `basis !== "comparable"` iken **her zaman `null`** —
   * Infinity ya da NaN bu tipin dışına hiç çıkmaz.
   */
  readonly deltaRatio: number | null;
}

export interface MoneyDelta extends PeriodDelta {
  readonly current: Money;
  readonly previous: Money;
  /** Mutlak fark: `current − previous`. Yön okunabilsin diye işaretli. */
  readonly absolute: Money;
}

/**
 * Oran ölçülerinin (marj) karşılaştırması.
 *
 * Mutlak fark **puan** cinsindendir: %22 → %18 ise −0,04. Oranın oranını
 * almak ("%18 düştü") yüzdenin yüzdesidir ve panelde bilinçli olarak
 * gösterilmiyor — `deltaRatio` bu yüzden oran ölçülerinde her zaman `null`.
 */
export interface RatioDelta extends PeriodDelta {
  readonly current: number | null;
  readonly previous: number | null;
  readonly absolute: number | null;
}

/**
 * Oran farkında "değişmedi" eşiği.
 *
 * Marj puanı ekranda tek ondalıkla yazılıyor (`formatPoints`); 0,1 puanın
 * altındaki fark ekranda "+0,0 puan" olarak görünür ve yanına yukarı oku
 * koymak yanıltıcı olurdu.
 */
const RATIO_FLAT_EPSILON = 0.001;

function directionOf(delta: number, epsilon = 0): ComparisonDirection {
  if (Math.abs(delta) <= epsilon) return "flat";
  return delta > 0 ? "up" : "down";
}

/**
 * Yüzde değişimin zeminini belirler.
 *
 * Payda **mutlak değer**: önceki dönem −₺10.000, bu dönem −₺5.000 ise iş
 * düzelmiştir. Ham `(current − previous) / previous` bu durumda −%50 verir ve
 * iyileşmeyi düşüş gibi gösterir. `|previous|` ile bölmek işareti mutlak farkın
 * işaretiyle aynı tutar: +%50, yani "önceki dönemin büyüklüğünün yarısı kadar
 * iyileşti".
 */
function basisOf(
  current: number,
  previous: number,
  previousHasData: boolean,
): { basis: ComparisonBasis; deltaRatio: number | null } {
  if (!previousHasData) {
    return {
      basis: current === 0 ? "noPreviousData" : "newBaseline",
      deltaRatio: null,
    };
  }

  if (previous === 0) {
    // Sıfırdan sıfıra: oran tanımsız değil, gerçekten değişim yok.
    if (current === 0) return { basis: "comparable", deltaRatio: 0 };
    return { basis: "zeroBaseline", deltaRatio: null };
  }

  const ratio = (current - previous) / Math.abs(previous);
  if (!Number.isFinite(ratio)) return { basis: "zeroBaseline", deltaRatio: null };
  return { basis: "comparable", deltaRatio: ratio };
}

export interface ComparisonOptions {
  /**
   * Önceki dönemde ölçülecek bir şey var mıydı.
   *
   * Sıfır iki farklı şey olabilir: "sattı ama kâr etmedi" ile "hiç sipariş
   * yoktu". İkincisinde "%100 arttı" demek de "değişim yok" demek de yalandır;
   * bu bayrak ayrımı taşır ve ekran "Yeni" diyebilir.
   */
  readonly previousHasData: boolean;
}

export function compareMoneyPeriods(
  current: Money,
  previous: Money,
  options: ComparisonOptions,
): MoneyDelta {
  const absolute = subtractMoney(current, previous);
  const { basis, deltaRatio } = basisOf(
    current.minor,
    previous.minor,
    options.previousHasData,
  );

  return {
    current,
    previous,
    absolute,
    // Kuruş tamsayı: eşitlik tam olarak eşitliktir, eşik gerekmez.
    direction: directionOf(absolute.minor),
    basis,
    deltaRatio,
  };
}

/**
 * Oran karşılaştırması (marj).
 *
 * Uçlardan biri `null` ise (ciro sıfır → marj tanımsız) fark da `null`:
 * "hesaplanamayan bir sayıdan hesaplanamayan bir sayıya kaç puan" sorusunun
 * cevabı yok. Zemin, önceki dönemde veri olup olmamasına göre ayrışır.
 */
export function compareRatioPeriods(
  current: number | null,
  previous: number | null,
  options: ComparisonOptions,
): RatioDelta {
  const usable =
    current !== null &&
    previous !== null &&
    Number.isFinite(current) &&
    Number.isFinite(previous);

  if (!usable) {
    const basis: ComparisonBasis = !options.previousHasData
      ? current !== null && Number.isFinite(current)
        ? "newBaseline"
        : "noPreviousData"
      : "zeroBaseline";

    return {
      current: current !== null && Number.isFinite(current) ? current : null,
      previous: previous !== null && Number.isFinite(previous) ? previous : null,
      absolute: null,
      direction: "flat",
      basis,
      deltaRatio: null,
    };
  }

  const absolute = current - previous;

  return {
    current,
    previous,
    absolute,
    direction: directionOf(absolute, RATIO_FLAT_EPSILON),
    // Puan farkı her zaman anlamlı; oranın oranı bilinçli olarak yok.
    basis: options.previousHasData ? "comparable" : "newBaseline",
    deltaRatio: null,
  };
}

/** Bir sinyal listesinin masadaki toplam parası. */
export function signalsAtStake(signals: readonly Signal[]): Money {
  if (signals.length === 0) return ZERO_MONEY;
  return sumMoney(signals.map((signal) => signal.moneyAtStake));
}

/**
 * Kokpitin karşılaştırdığı dört sonuç.
 *
 * `netRevenue` beşinci olarak burada çünkü bağlam şeridi cironun değişimini
 * zaten gösteriyordu; aynı şeridin üç hücresinden ikisi zengin, biri eski
 * biçimde kalsaydı ekran tutarsız görünürdü.
 */
export interface PeriodComparison {
  readonly range: DateRange;
  readonly previousRange: DateRange;
  /** Seçili dönemde sipariş var mı — boş durum kararları bunu okur. */
  readonly hasCurrentData: boolean;
  readonly hasPreviousData: boolean;

  readonly netProfit: MoneyDelta;
  readonly margin: RatioDelta;
  readonly netRevenue: MoneyDelta;
  readonly risk: MoneyDelta;
  readonly opportunity: MoneyDelta;
}

/**
 * Tek çağrı, beş karşılaştırma.
 *
 * Önceki dönemin **net kâr ve ciro** değerleri yeniden hesaplanmıyor:
 * `SalesSummary` ve `ProfitSummary` trend alanlarında zaten aynı
 * `previousPeriod` penceresinin toplamlarını taşıyor. Yalnızca risk ve fırsat
 * toplamları için önceki dönemin sinyalleri gerekiyor — onlar da dışarıdan,
 * tek bir analiz bağlamından geliyor.
 */
export function buildPeriodComparison(params: {
  range: DateRange;
  sales: SalesSummary;
  profit: ProfitSummary;
  risks: readonly Signal[];
  opportunities: readonly Signal[];
  previousRisks: readonly Signal[];
  previousOpportunities: readonly Signal[];
}): PeriodComparison {
  const previousOrders = params.sales.orderTrend.previous;
  const options: ComparisonOptions = { previousHasData: previousOrders > 0 };

  const previousRevenue = params.sales.revenueTrend.previous;
  const previousProfit = params.profit.profitTrend.previous;

  return {
    range: params.range,
    previousRange: comparisonRangeOf(params.range),
    hasCurrentData: params.sales.orderCount > 0,
    hasPreviousData: previousOrders > 0,

    netProfit: compareMoneyPeriods(params.profit.netProfit, previousProfit, options),
    margin: compareRatioPeriods(
      params.profit.marginRatio,
      moneyRatio(previousProfit, previousRevenue),
      options,
    ),
    netRevenue: compareMoneyPeriods(params.sales.netRevenue, previousRevenue, options),

    /**
     * Risk ve fırsat toplamlarında da veri ölçüsü **siparişdir**, sinyal sayısı
     * değil. Önceki dönemde sipariş olup hiç risk çıkmamış olabilir; o dönem
     * "risk toplamı sıfırdı" demektir, "veri yoktu" değil — ve temiz geçen bir
     * dönemi "önceki dönemde veri yok" diye göstermek yanlış olurdu.
     */
    risk: compareMoneyPeriods(
      signalsAtStake(params.risks),
      signalsAtStake(params.previousRisks),
      options,
    ),
    opportunity: compareMoneyPeriods(
      signalsAtStake(params.opportunities),
      signalsAtStake(params.previousOpportunities),
      options,
    ),
  };
}
