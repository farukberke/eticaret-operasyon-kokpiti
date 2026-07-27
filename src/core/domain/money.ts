/**
 * Para değer tipi.
 *
 * Neden `number` değil: 0.1 + 0.2 === 0.30000000000000004. Bir e-ticaret
 * panelinde bu, binlerce satırlık kâr toplamında gözle görülür sapma demektir.
 * Bu yüzden para her zaman **kuruş bazlı tamsayı** olarak taşınır; bölme
 * dışında hiçbir işlem ondalık üretmez.
 *
 * Fonksiyon adları bilinçli olarak açık (`addMoney`, `sumMoney`): domain
 * barrel'ından (`@/core/domain`) tek isim uzayına aktıkları için `add` gibi
 * genel adlar ileride kaçınılmaz olarak çakışırdı.
 */

export type Currency = "TRY";

export interface Money {
  /** Kuruş cinsinden tamsayı. 12,50 ₺ → 1250 */
  readonly minor: number;
  readonly currency: Currency;
}

export const DEFAULT_CURRENCY: Currency = "TRY";

/** Kuruştan Money üretir. Ondalık gelirse en yakın kuruşa yuvarlanır. */
export function money(minor: number, currency: Currency = DEFAULT_CURRENCY): Money {
  return { minor: Math.round(minor), currency };
}

/** Liradan Money üretir: `lira(12.5)` → 1250 kuruş. Fixture yazarken okunaklı. */
export function lira(major: number, currency: Currency = DEFAULT_CURRENCY): Money {
  return money(major * 100, currency);
}

export const ZERO_MONEY: Money = { minor: 0, currency: DEFAULT_CURRENCY };

/** Görüntüleme ve grafik için lira cinsinden ondalıklı değer. Hesapta kullanılmaz. */
export function toMajor(m: Money): number {
  return m.minor / 100;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(
      `Farklı para birimleri bir arada işlenemez: ${a.currency} ve ${b.currency}`,
    );
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { minor: a.minor + b.minor, currency: a.currency };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { minor: a.minor - b.minor, currency: a.currency };
}

/** Katsayı ile çarpar (adet, oran). Sonuç en yakın kuruşa yuvarlanır. */
export function multiplyMoney(m: Money, factor: number): Money {
  return { minor: Math.round(m.minor * factor), currency: m.currency };
}

export function negateMoney(m: Money): Money {
  return { minor: -m.minor, currency: m.currency };
}

export function sumMoney(
  items: readonly Money[],
  currency: Currency = DEFAULT_CURRENCY,
): Money {
  return items.reduce<Money>((acc, item) => addMoney(acc, item), {
    minor: 0,
    currency,
  });
}

/**
 * İki para değerinin oranı (marj, ROAS gibi). Payda sıfırsa `null` döner —
 * "0 ciroda %0 marj" demek yanıltıcıdır, "hesaplanamaz" demek doğrudur.
 */
export function moneyRatio(numerator: Money, denominator: Money): number | null {
  assertSameCurrency(numerator, denominator);
  if (denominator.minor === 0) return null;
  return numerator.minor / denominator.minor;
}

export function isZeroMoney(m: Money): boolean {
  return m.minor === 0;
}

export function isNegativeMoney(m: Money): boolean {
  return m.minor < 0;
}

export function isPositiveMoney(m: Money): boolean {
  return m.minor > 0;
}

/** Sıralama için: a > b → pozitif. */
export function compareMoney(a: Money, b: Money): number {
  assertSameCurrency(a, b);
  return a.minor - b.minor;
}

export function absMoney(m: Money): Money {
  return { minor: Math.abs(m.minor), currency: m.currency };
}

/** İki değerden büyüğü. Risk tutarlarını kıyaslarken kullanılır. */
export function maxMoney(a: Money, b: Money): Money {
  return compareMoney(a, b) >= 0 ? a : b;
}

/**
 * Bir tutarı ağırlıklara göre **kuruş kaybetmeden** paylaştırır.
 *
 * Sipariş bazlı giderler (komisyon, kargo, indirim) ürünlere dağıtılırken
 * naif `tutar * oran` yaklaşımı her satırda yuvarlama artığı bırakır ve
 * parçaların toplamı orijinal tutarı tutmaz. Burada "en büyük kalan" yöntemi
 * kullanılır: taban değerler dağıtılır, artan kuruşlar en büyük ondalık
 * kısımdan başlayarak birer birer eklenir.
 *
 * Garanti: `sumMoney(allocateMoney(t, w)) === t`
 *
 * @param total Negatif olmayan tutar (gider kalemleri her zaman pozitiftir).
 */
export function allocateMoney(total: Money, weights: readonly number[]): Money[] {
  const asMoney = (minor: number): Money => ({ minor, currency: total.currency });

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  if (totalWeight <= 0 || weights.length === 0) {
    return weights.map(() => asMoney(0));
  }

  const exact = weights.map((w) => (total.minor * w) / totalWeight);
  const shares = exact.map((value) => Math.floor(value));

  let remainder = total.minor - shares.reduce((acc, s) => acc + s, 0);

  const byLargestFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (const { index } of byLargestFraction) {
    if (remainder <= 0) break;
    shares[index] = (shares[index] ?? 0) + 1;
    remainder -= 1;
  }

  return shares.map(asMoney);
}
