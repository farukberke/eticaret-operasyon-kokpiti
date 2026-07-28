import type { getTranslations } from "next-intl/server";

import type { LeadTimeRisk, LeadTimeRiskState } from "@/core/services/lead-time-risk";
import type { Locale } from "@/i18n/routing";
import { formatNumber } from "@/lib/format";
import type { BadgeTone } from "@/ui/primitives/badge";

/**
 * TEDARİK SÜRESİ RİSKİ → GÖRÜNÜM.
 *
 * `core` çeviri bilmez, `ui` domain bilmez — `stock-forecast-view.ts` ile
 * aynı sözleşme. Component burada üretilen metni **olduğu gibi** basar,
 * formül ya da eşik değeri görmez.
 *
 * `safe` ve `unmeasurable` bilinçli olarak görünmez: ilki "acil bir şey yok"
 * demek için ekstra metin gerektirmez (kalabalık yaratır), ikincisi zaten
 * satırın kendi durum rozetinde (`unknown`/`noSales`/`negative`) anlatılmış
 * olur — burada ikinci bir "ölçülemedi" cümlesi tekrarlanmaz.
 */
export interface LeadTimeRiskView {
  readonly visible: boolean;
  readonly tone: BadgeTone;
  /** "Sipariş kararına yaklaşık 5 gün var" — kesinlik iddia etmeyen tek cümle. */
  readonly message: string;
  /** "Tedarik süresi: 7 gün · Tahmini stok: 4 gün" — yalnızca ikisi de biliniyorsa dolu. */
  readonly detail: string | null;
}

export interface LeadTimeRiskTexts {
  readonly late: (shortageGapDays: string) => string;
  readonly dueToday: string;
  readonly upcoming: (orderDecisionDays: string) => string;
  readonly unknownLeadTime: string;
  readonly detail: (leadTimeDays: string, daysOfCover: string) => string;
}

const HIDDEN: LeadTimeRiskView = {
  visible: false,
  tone: "neutral",
  message: "",
  detail: null,
};

/**
 * Durum → ton. `late` ve `dueToday` ikisi de `danger`: metin ikisini ayırt
 * eder ("gecikti" / "bugün"), renk yalnızca aciliyeti taşır — tek başına
 * anlam iddia etmez.
 */
const TONE: Record<"late" | "dueToday" | "upcoming" | "unknownLeadTime", BadgeTone> = {
  late: "danger",
  dueToday: "danger",
  upcoming: "warning",
  unknownLeadTime: "neutral",
};

const VISIBLE_STATES: ReadonlySet<LeadTimeRiskState> = new Set<LeadTimeRiskState>([
  "late",
  "dueToday",
  "upcoming",
  "unknownLeadTime",
]);

export function toLeadTimeRiskView(
  risk: LeadTimeRisk,
  locale: Locale,
  texts: LeadTimeRiskTexts,
): LeadTimeRiskView {
  if (!VISIBLE_STATES.has(risk.state)) return HIDDEN;

  const detail =
    risk.leadTimeDays !== null && risk.daysOfCover !== null
      ? texts.detail(
          formatNumber(risk.leadTimeDays, locale),
          formatNumber(risk.daysOfCover, locale, 1),
        )
      : null;

  if (risk.state === "unknownLeadTime") {
    return {
      visible: true,
      tone: TONE.unknownLeadTime,
      message: texts.unknownLeadTime,
      detail,
    };
  }

  if (risk.state === "late") {
    return {
      visible: true,
      tone: TONE.late,
      message: texts.late(formatNumber(risk.shortageGapDays, locale, 1)),
      detail,
    };
  }

  if (risk.state === "dueToday") {
    return { visible: true, tone: TONE.dueToday, message: texts.dueToday, detail };
  }

  // Kalan tek görünür durum: upcoming.
  return {
    visible: true,
    tone: TONE.upcoming,
    message: texts.upcoming(formatNumber(risk.orderDecisionDays, locale, 1)),
    detail,
  };
}

/**
 * Ürün kimliğine göre görünüm haritası — `priorityViews`/`reorderRecommendations`
 * ile aynı desen. Kart bu haritayı satır başına `.get()` ile okur, kendi
 * dönüşümünü kurmaz.
 */
export function toLeadTimeRiskViews(
  risks: ReadonlyMap<string, LeadTimeRisk>,
  locale: Locale,
  texts: LeadTimeRiskTexts,
): ReadonlyMap<string, LeadTimeRiskView> {
  return new Map(
    [...risks].map(([productId, risk]) => [
      productId,
      toLeadTimeRiskView(risk, locale, texts),
    ]),
  );
}

/**
 * `stockAlerts.leadTime` sözlüğünden `LeadTimeRiskTexts` kurar.
 *
 * Yeni bir i18n ad alanı açılmadı: `stockAlerts` altındaki `reorder` bloğu
 * gibi, tedarik süresi metinleri de aynı kartın sözlüğünde yaşıyor.
 */
export function buildLeadTimeRiskTexts(
  stockAlerts: Awaited<ReturnType<typeof getTranslations<"stockAlerts">>>,
): LeadTimeRiskTexts {
  return {
    late: (shortageGapDays) => stockAlerts("leadTime.late", { days: shortageGapDays }),
    dueToday: stockAlerts("leadTime.dueToday"),
    upcoming: (orderDecisionDays) =>
      stockAlerts("leadTime.upcoming", { days: orderDecisionDays }),
    unknownLeadTime: stockAlerts("leadTime.unknownLeadTime"),
    detail: (leadTimeDays, daysOfCover) =>
      stockAlerts("leadTime.detail", {
        leadDays: leadTimeDays,
        coverDays: daysOfCover,
      }),
  };
}
