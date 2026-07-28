import type {
  ComparisonBasis,
  ComparisonDirection,
  MoneyDelta,
  PeriodComparison,
  RatioDelta,
} from "@/core/services/period-comparison";
import type { Translate } from "@/features/signals/signal-view";
import {
  EMPTY,
  formatDateRange,
  formatDelta,
  formatMoney,
  formatPercent,
  formatPoints,
} from "@/lib/format";
import type { DeltaMeaning, Direction } from "@/ui/patterns/trend-delta";

/**
 * KARŞILAŞTIRMA → GÖRÜNÜM eşleyicisi.
 *
 * `core` yüzde değişimin **ne zaman anlamsız** olduğunu söyler; burası onu
 * kullanıcının okuyacağı cümleye çevirir. Ayrım kasıtlı: "önceki dönem sıfırdı"
 * bir dil sorunu değil bir dürüstlük kararıdır ve çekirdekte verilir; "Yeni"
 * kelimesi ise Türkçe/İngilizce arasında değişir ve sözlükte yaşar.
 *
 * Bileşenler burada hesap yapmaz — hazır metin alır.
 */

export interface ComparisonTranslators {
  readonly comparison: Translate;
  readonly common: Translate;
}

/**
 * Bir ölçünün artışının ne anlama geldiği.
 *
 * Zorunlu bir alan: varsayılan vermek, bir gün risk artışını yeşile boyamak
 * demekti. `neutral` "bilmiyoruz" değil, "bağlama göre değişir" demektir.
 */
export type ComparisonMeaning = "higherIsBetter" | "lowerIsBetter" | "neutral";

const MEANING_TO_DELTA: Record<ComparisonMeaning, DeltaMeaning> = {
  higherIsBetter: true,
  lowerIsBetter: false,
  neutral: "neutral",
};

/**
 * Ekranın gördüğü hâl — tamamı hazır metin.
 *
 * `direction` ve `meaning` renk/ok seçimi için kalıyor; ikisi de `ui`
 * katmanının zaten anladığı tipler, domain değil.
 */
export interface ComparisonView {
  readonly direction: Direction;
  readonly meaning: DeltaMeaning;
  /** Değerin yanındaki rozet: "+%8,2", "+4,0 puan", "Yeni" ya da "—". */
  readonly badge: string;
  /** Altındaki açıklama: "Önceki döneme göre ₺12.450 arttı · önceki ₺129.850". */
  readonly caption: string;
  /** Ekran okuyucuya giden tam cümle. */
  readonly srLabel: string;
}

/** Ok yönü `ui` ile birebir aynı birleşim; çeviri gerektirmiyor. */
function toDirection(direction: ComparisonDirection): Direction {
  return direction;
}

/**
 * Hesaplanamayan zeminlerin karşılığı.
 *
 * Üç ayrı cümle çünkü üç ayrı durum: hiç veri yoktu / veri yoktu ama artık var
 * / veri vardı ama taban sıfırdı. Hepsine "—" basmak, kullanıcının ekranda
 * gördüğü boşluğu bir hata sanmasına yol açardı.
 */
function basisLabel(basis: ComparisonBasis, t: ComparisonTranslators): string | null {
  switch (basis) {
    case "newBaseline":
      return t.comparison("new");
    case "noPreviousData":
      return t.comparison("noPreviousData");
    case "zeroBaseline":
      return t.comparison("notComparable");
    default:
      return null;
  }
}

/** "Önceki döneme göre {amount} arttı" — yön cümlenin kendisinde okunur. */
function changeSentence(
  direction: ComparisonDirection,
  amount: string,
  t: ComparisonTranslators,
): string {
  if (direction === "flat") return t.comparison("unchanged");
  return t.comparison(direction === "up" ? "increased" : "decreased", { amount });
}

function joined(parts: readonly string[], t: ComparisonTranslators): string {
  return parts.filter((part) => part !== "").join(t.comparison("separator"));
}

/**
 * Para ölçüsünün karşılaştırması.
 *
 * Rozet **yüzde**, açıklama **mutlak fark + önceki değer** taşır: kullanıcı
 * "ne kadar oranla" ile "kaç lira" sorularının ikisini de tek bakışta görür.
 * Mutlak fark işaretsiz basılır — yönü zaten cümle ve ok söylüyor, "+₺12.450
 * arttı" kendini tekrar ederdi.
 */
export function moneyComparisonView(
  delta: MoneyDelta,
  meaning: ComparisonMeaning,
  locale: string,
  t: ComparisonTranslators,
): ComparisonView {
  const fallback = basisLabel(delta.basis, t);
  const previous = t.comparison("previousValue", {
    value: formatMoney(delta.previous, locale),
  });

  if (fallback !== null) {
    // Taban yoksa yüzde de mutlak fark da yanıltıcı: yalnızca durumu söyle.
    return {
      direction: toDirection(delta.direction),
      meaning: MEANING_TO_DELTA[meaning],
      badge: delta.basis === "newBaseline" ? fallback : EMPTY,
      caption: fallback,
      srLabel: fallback,
    };
  }

  const amount = formatMoney(
    { minor: Math.abs(delta.absolute.minor), currency: delta.absolute.currency },
    locale,
  );
  const sentence = changeSentence(delta.direction, amount, t);

  return {
    direction: toDirection(delta.direction),
    meaning: MEANING_TO_DELTA[meaning],
    badge: formatDelta(delta.deltaRatio, locale),
    caption: joined([sentence, previous], t),
    srLabel: joined([sentence, previous], t),
  };
}

/**
 * Oran ölçüsünün (marj) karşılaştırması.
 *
 * Rozet **puan**, yüzde değil: %22'den %18'e inen marj için "%18 düştü" demek
 * yüzdenin yüzdesidir ve panelde hiçbir yerde kullanılmıyor. Bu yüzden
 * `RatioDelta.deltaRatio` her zaman `null` ve buraya hiç girmiyor.
 */
export function ratioComparisonView(
  delta: RatioDelta,
  meaning: ComparisonMeaning,
  locale: string,
  t: ComparisonTranslators,
): ComparisonView {
  const fallback = basisLabel(delta.basis, t);

  if (fallback !== null || delta.absolute === null) {
    const label = fallback ?? t.comparison("notComparable");
    return {
      direction: toDirection(delta.direction),
      meaning: MEANING_TO_DELTA[meaning],
      badge: delta.basis === "newBaseline" ? label : EMPTY,
      caption: label,
      srLabel: label,
    };
  }

  const points = formatPoints(Math.abs(delta.absolute), locale, {
    point: t.common("point"),
  });
  const sentence = changeSentence(delta.direction, points, t);
  const previous = t.comparison("previousValue", {
    value: formatPercent(delta.previous, locale),
  });

  return {
    direction: toDirection(delta.direction),
    meaning: MEANING_TO_DELTA[meaning],
    badge: formatPoints(delta.absolute, locale, { point: t.common("point") }),
    caption: joined([sentence, previous], t),
    srLabel: joined([sentence, previous], t),
  };
}

/**
 * Kokpitin beş karşılaştırması — **tek yerde, tek kez**.
 *
 * Anlam eşlemesi burada sabitleniyor: net kâr ve marj artışı iyi, risk artışı
 * kötü, fırsat artışı ne iyi ne kötü. Bu kararı her bileşene ayrı ayrı
 * bıraksaydık iki ekran aynı artışı iki farklı renkte gösterebilirdi.
 */
export interface CockpitComparisonViews {
  readonly netProfit: ComparisonView;
  readonly margin: ComparisonView;
  readonly netRevenue: ComparisonView;
  readonly risk: ComparisonView;
  readonly opportunity: ComparisonView;
  /** "1 – 30 Tem · önceki 1 – 30 Haz" — hangi iki dönem kıyaslandı. */
  readonly windowLabel: string;
}

export function buildComparisonViews(
  comparison: PeriodComparison,
  locale: string,
  t: ComparisonTranslators,
): CockpitComparisonViews {
  return {
    netProfit: moneyComparisonView(comparison.netProfit, "higherIsBetter", locale, t),
    margin: ratioComparisonView(comparison.margin, "higherIsBetter", locale, t),
    netRevenue: moneyComparisonView(comparison.netRevenue, "higherIsBetter", locale, t),
    risk: moneyComparisonView(comparison.risk, "lowerIsBetter", locale, t),
    /**
     * Fırsat toplamı bilinçli olarak nötr. Artması "daha çok kazanç kapısı"
     * da olabilir "ürünlerin fiyat/stok kurgusu bozulmaya başladı" da —
     * yeşile boyamak, olmayan bir yargıyı satmak olurdu.
     */
    opportunity: moneyComparisonView(comparison.opportunity, "neutral", locale, t),
    windowLabel: joined(
      [
        formatDateRange(comparison.range, locale),
        t.comparison("previousWindow", {
          range: formatDateRange(comparison.previousRange, locale),
        }),
      ],
      t,
    ),
  };
}
