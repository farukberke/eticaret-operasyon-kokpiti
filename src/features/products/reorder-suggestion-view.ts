import type { getTranslations } from "next-intl/server";

import type { ReorderRecommendation } from "@/core/services/reorder-suggestion";
import type { Locale } from "@/i18n/routing";
import { formatNumber } from "@/lib/format";

/**
 * YENİDEN SİPARİŞ ÖNERİSİ → GÖRÜNÜM.
 *
 * `core` çeviri bilmez; burada `ReorderRecommendation`in `suggested` dışındaki
 * hâlleri (`correctStock`/`needsStockData`/`none`) bilinçli olarak metne
 * çevrilmez — bu durumlarda zaten `stockAlerts.action.*` ("Stok miktarını
 * düzeltin.", "Güncel stok bilgisini ekleyin.") aynı mesajı taşıyor; ikinci
 * bir "veri eksik" cümlesi icat etmek gereksiz tekrar olurdu.
 */
export interface ReorderSuggestionView {
  /** "Önerilen sipariş: 39 adet" — yalnızca `suggested` durumunda dolu. */
  readonly quantityLabel: string | null;
  /** "Günde ortalama 2,4 adet satışa göre, 21 günlük hedef stok için tahmini." */
  readonly basisLabel: string | null;
}

export interface ReorderSuggestionTexts {
  readonly quantity: (count: string) => string;
  readonly basis: (velocity: string, days: string) => string;
}

export function buildReorderSuggestionTexts(
  stockAlerts: Awaited<ReturnType<typeof getTranslations<"stockAlerts">>>,
): ReorderSuggestionTexts {
  return {
    quantity: (count) => stockAlerts("reorder.quantity", { count }),
    basis: (velocity, days) => stockAlerts("reorder.basis", { velocity, days }),
  };
}

export function toReorderSuggestionView(
  recommendation: ReorderRecommendation | undefined,
  locale: Locale,
  texts: ReorderSuggestionTexts,
): ReorderSuggestionView {
  if (!recommendation || recommendation.kind !== "suggested") {
    return { quantityLabel: null, basisLabel: null };
  }

  return {
    quantityLabel: texts.quantity(formatNumber(recommendation.quantity, locale)),
    basisLabel: texts.basis(
      formatNumber(recommendation.dailyVelocity, locale, 1),
      formatNumber(recommendation.targetCoverageDays, locale),
    ),
  };
}
