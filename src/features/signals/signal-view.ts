import type { Evidence, EvidenceValue, Money, Severity, Signal } from "@/core/domain";
import type { BadgeTone } from "@/ui/primitives/badge";
import {
  formatDelta,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPoints,
} from "@/lib/format";

/**
 * SİNYAL → GÖRÜNÜM eşleyicisi.
 *
 * `core` çeviri bilmez, `ui` domain bilmez. İkisini birleştiren yer burası:
 * kod + değer taşıyan sinyalleri, locale'e uygun hazır metinlere çevirir.
 *
 * Bu ayrım sayesinde risk kuralları Türkçe ve İngilizce arayüzü aynı kodla
 * besliyor — dedektörlerin içinde tek bir kullanıcı metni yok.
 */

/** next-intl'in `t` fonksiyonunun ihtiyacımız olan asgari şekli. */
export type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;

export interface SignalTranslators {
  readonly signal: Translate;
  readonly action: Translate;
  readonly evidence: Translate;
  readonly severity: Translate;
  readonly amountCaption: Translate;
  readonly subject: Translate;
  readonly common: Translate;
}

export interface SignalView {
  readonly id: string;
  readonly rank?: number;
  readonly title: string;
  readonly evidence: string[];
  readonly action: string;
  readonly amount: string;
  readonly amountCaption: string;
  readonly severityLabel: string;
  readonly severityTone: BadgeTone;
}

const SEVERITY_TONE: Record<Severity, BadgeTone> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "neutral",
};

/**
 * Kanıt değerlerinin nasıl biçimleneceği **anahtar adından** anlaşılır.
 *
 * Alternatif, her kanıt değerine tip etiketi taşıtmaktı; bu, dedektör kodunu
 * sunum kaygısıyla kirletirdi. Ad sözleşmesi daha ucuz ve tek yerde denetlenir.
 */
const PERCENT_KEYS = new Set(["margin", "rate", "spendShare", "uplift"]);
/** İşaretli gösterilir: artış/azalış yönü sayının kendisinde okunur. */
const SIGNED_PERCENT_KEYS = new Set(["change", "growth"]);
/** Yüzde puanı — yüzdenin yüzdesi değil. */
const POINT_KEYS = new Set(["dropPoints"]);
/** Ondalık anlamlı olanlar: 2,5 gün ile 2 gün farklı şeylerdir. */
const DECIMAL_KEYS = new Set(["roas", "days", "perDay", "now", "before"]);

function isMoney(value: EvidenceValue): value is Money {
  return typeof value === "object" && value !== null && "minor" in value;
}

function formatEvidenceValue(
  key: string,
  value: EvidenceValue,
  locale: string,
  common: Translate,
): string | number {
  if (isMoney(value)) return formatMoney(value, locale);
  if (typeof value === "string") return value;

  if (SIGNED_PERCENT_KEYS.has(key)) return formatDelta(value, locale);
  if (PERCENT_KEYS.has(key)) return formatPercent(value, locale);
  if (POINT_KEYS.has(key)) {
    return formatPoints(value, locale, { point: common("point") });
  }
  if (DECIMAL_KEYS.has(key)) return formatNumber(value, locale, 1);

  return formatNumber(value, locale);
}

function renderEvidence(item: Evidence, locale: string, t: SignalTranslators): string {
  const values: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(item.values)) {
    values[key] = formatEvidenceValue(key, value, locale, t.common);
  }
  return t.evidence(item.code, values);
}

export function toSignalView(
  signal: Signal,
  locale: string,
  t: SignalTranslators,
  rank?: number,
): SignalView {
  const subject =
    signal.subject.type === "product" ? signal.subject.label : t.subject("store");

  return {
    id: signal.id,
    ...(rank !== undefined ? { rank } : {}),
    title: t.signal(signal.code, { subject }),
    evidence: signal.evidence.map((item) => renderEvidence(item, locale, t)),
    action: t.action(signal.code),
    amount: formatMoney(signal.moneyAtStake, locale),
    amountCaption: t.amountCaption(signal.kind),
    severityLabel: t.severity(signal.severity),
    severityTone: SEVERITY_TONE[signal.severity],
  };
}
