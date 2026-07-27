import type { Evidence, EvidenceValue, Money, Severity, Signal } from "@/core/domain";
import type { BadgeTone } from "@/ui/primitives/badge";
import type { SignalOutcome } from "@/ui/patterns/signal-card";
import {
  formatDelta,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPoints,
  formatShortDate,
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
  readonly done: Translate;
  readonly evidence: Translate;
  readonly severity: Translate;
  readonly outcome: Translate;
  readonly subject: Translate;
  readonly common: Translate;
}

/**
 * Ekranın ihtiyacı olan her şey — **tamamen serileştirilebilir**.
 *
 * Sunucu bileşeni bunu hazırlar, istemci kuyruğu tüketir. İçinde fonksiyon
 * ya da domain nesnesi yok; sunucu→istemci sınırını sorunsuz geçer.
 */
export interface SignalView {
  readonly id: string;
  readonly rank?: number;
  readonly title: string;
  readonly evidence: string[];
  readonly action: string;
  /** "Sipariş verdim" — aksiyonu onaylayan düğme metni. */
  readonly doneLabel: string;
  readonly outcome: SignalOutcome;
  readonly deadline?: { label: string; urgent: boolean };
  readonly severityLabel: string;
  readonly severityTone: BadgeTone;
  /**
   * Kuruş cinsinden ham tutar. Günün özetindeki toplam istemcide
   * hesaplandığı için (kullanıcı iş kapattıkça değişir) sayı da gerekir.
   */
  readonly moneyAtStakeMinor: number;
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

/**
 * Ölü stok diğerlerinden farklı bir para türü taşır.
 *
 * `DEAD_STOCK` dışındaki tüm sinyaller **akış** ölçer: dönemde kazanılan ya
 * da kaybedilen kâr. Ölü stok ise **duran** parayı ölçer: rafta bekleyen
 * sermaye. İkisine aynı cümleyi kurmak ("₺18.000 kaybediyorsun") yanlış olur;
 * o para kaybolmadı, sıkıştı.
 */
const CAPITAL_SIGNALS = new Set(["DEAD_STOCK"]);

function buildOutcome(
  signal: Signal,
  locale: string,
  t: SignalTranslators,
): SignalOutcome {
  const amount = formatMoney(signal.moneyAtStake, locale);
  const isCapital = CAPITAL_SIGNALS.has(signal.code);
  const isOpportunity = signal.kind === "opportunity";

  const variant = isCapital ? "capital" : isOpportunity ? "gain" : "loss";

  return {
    doLabel: t.outcome("doLabel"),
    doValue: t.outcome(`${variant}.do`, { amount }),
    skipLabel: t.outcome("skipLabel"),
    skipValue: t.outcome(`${variant}.skip`, { amount }),
    ...(signal.dailyImpact
      ? {
          skipDetail: t.outcome("perDay", {
            amount: formatMoney(signal.dailyImpact, locale),
          }),
        }
      : {}),
  };
}

function buildDeadline(
  signal: Signal,
  locale: string,
  t: SignalTranslators,
): { label: string; urgent: boolean } | undefined {
  if (!signal.deadline) return undefined;

  // Son gün bugün ya da geçmişse acele vurgusu; "3 gün sonra" sakin kalır.
  const urgent = signal.deadline <= signal.detectedAt;

  return {
    label: urgent
      ? t.outcome("deadlineToday")
      : t.outcome("deadlineOn", {
          date: formatShortDate(signal.deadline, locale),
        }),
    urgent,
  };
}

export function toSignalView(
  signal: Signal,
  locale: string,
  t: SignalTranslators,
  rank?: number,
): SignalView {
  const subject =
    signal.subject.type === "product" ? signal.subject.label : t.subject("store");
  const deadline = buildDeadline(signal, locale, t);

  return {
    id: signal.id,
    ...(rank !== undefined ? { rank } : {}),
    title: t.signal(signal.code, { subject }),
    evidence: signal.evidence.map((item) => renderEvidence(item, locale, t)),
    action: t.action(signal.code),
    doneLabel: t.done(signal.code),
    outcome: buildOutcome(signal, locale, t),
    ...(deadline ? { deadline } : {}),
    severityLabel: t.severity(signal.severity),
    severityTone: SEVERITY_TONE[signal.severity],
    moneyAtStakeMinor: signal.moneyAtStake.minor,
  };
}
