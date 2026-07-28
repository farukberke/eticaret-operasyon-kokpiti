import type { getTranslations } from "next-intl/server";

import { DEFAULT_RULES } from "@/core/services/rules.config";
import type { PurchasePriorityItem } from "@/core/services/purchase-priority";
import { formatNumber } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

/**
 * SATIN ALMA ÖNCELİĞİ → GÖRÜNÜM.
 *
 * `core` sıralamayı ve rütbeyi zaten üretti (`buildPurchasePriorities`);
 * burada eklenen şey yalnızca **çeviri**. Rozet gösterimi ilk üç ürünle
 * sınırlı — bu sayı yeni bir eşik icat etmiyor, kokpitte zaten "öne çıkarılan
 * öğe sayısı" anlamına gelen `DEFAULT_RULES.priority.cockpitLimit`i (3)
 * yeniden kullanıyor.
 */

export interface PurchasePriorityRowView {
  readonly rank: number;
  /** Yalnızca ilk `cockpitLimit` üründe dolu; ötesinde `null`. */
  readonly rankLabel: string | null;
  /** "Ertelenirse ne olur?" cümlesi. */
  readonly impact: string;
}

export interface PurchasePriorityTexts {
  readonly rankBadge: (rank: string) => string;
  readonly impact: Record<PurchasePriorityItem["level"], string>;
}

export function buildPurchasePriorityTexts(
  purchasePriority: Awaited<ReturnType<typeof getTranslations<"purchasePriority">>>,
): PurchasePriorityTexts {
  return {
    rankBadge: (rank) => purchasePriority("rankBadge", { rank }),
    impact: {
      negative: purchasePriority("impact.negative"),
      critical: purchasePriority("impact.critical"),
      low: purchasePriority("impact.low"),
    },
  };
}

/**
 * Rütbe → görünüm haritası. Kart, satırın önceliği olup olmadığını buradan
 * anlar: haritada olmayan ürün (`unknown` durumu) rozet ya da etki cümlesi
 * göstermez.
 */
export function toPurchasePriorityViews(
  priorities: readonly PurchasePriorityItem[],
  locale: Locale,
  texts: PurchasePriorityTexts,
): ReadonlyMap<string, PurchasePriorityRowView> {
  const badgeLimit = DEFAULT_RULES.priority.cockpitLimit;

  return new Map(
    priorities.map((item) => [
      item.productId,
      {
        rank: item.rank,
        rankLabel:
          item.rank <= badgeLimit
            ? texts.rankBadge(formatNumber(item.rank, locale))
            : null,
        impact: texts.impact[item.level],
      },
    ]),
  );
}
