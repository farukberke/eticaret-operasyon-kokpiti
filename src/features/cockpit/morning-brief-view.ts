import type { getTranslations } from "next-intl/server";

import type { MorningBrief, MorningBriefItemKind } from "@/core/domain";
import type { Locale } from "@/i18n/routing";
import { formatNumber } from "@/lib/format";
import type { BadgeTone } from "@/ui/primitives/badge";

/**
 * SABAH ÖZETİ → GÖRÜNÜM.
 *
 * `core` özeti zaten hazırladı (`buildMorningBrief`); burada eklenen şey
 * yalnızca **çeviri**: satır şablonları ve şiddet rozeti. Business hesabı
 * burada yapılmaz — yalnızca sayılar cümleye dökülür, filtre/toplama
 * component tarafında yapılmaz.
 */

/**
 * Sayının yerini tutan işaretçi. `buildMorningBriefTexts` şablonu bu değerle
 * doldurur (`toMorningBriefView` içindeki `.replace` onu asıl sayıyla
 * değiştirir); satır metni yalnızca Client Component'te, kullanıcının
 * kararına bağlı sayı bilindiğinde tamamlanır. Fonksiyon değil düz metin
 * taşındığı için bu obje sunucu→istemci sınırını geçebilir.
 */
const COUNT_PLACEHOLDER = "__COUNT__";

export interface MorningBriefTexts {
  readonly title: string;
  readonly subtitle: string;
  readonly prioritiesTitle: string;
  readonly todayTasksLabel: string;
  readonly severity: { readonly critical: string; readonly normal: string };
  readonly allClear: string;
  readonly item: Record<MorningBriefItemKind, string>;
  readonly aiNarration: { readonly label: string; readonly loading: string };
}

export function buildMorningBriefTexts(
  morningBrief: Awaited<ReturnType<typeof getTranslations<"morningBrief">>>,
): MorningBriefTexts {
  return {
    title: morningBrief("title"),
    subtitle: morningBrief("subtitle"),
    prioritiesTitle: morningBrief("prioritiesTitle"),
    todayTasksLabel: morningBrief("todayTasksLabel"),
    severity: {
      critical: morningBrief("severity.critical"),
      normal: morningBrief("severity.normal"),
    },
    allClear: morningBrief("allClear"),
    item: {
      activeActions: morningBrief("item.activeActions", { count: COUNT_PLACEHOLDER }),
      criticalStock: morningBrief("item.criticalStock", { count: COUNT_PLACEHOLDER }),
      leadTimeRisk: morningBrief("item.leadTimeRisk", { count: COUNT_PLACEHOLDER }),
      completedActions: morningBrief("item.completedActions", {
        count: COUNT_PLACEHOLDER,
      }),
      snoozedActions: morningBrief("item.snoozedActions", { count: COUNT_PLACEHOLDER }),
    },
    aiNarration: {
      label: morningBrief("aiNarration.label"),
      loading: morningBrief("aiNarration.loading"),
    },
  };
}

export interface MorningBriefLineView {
  readonly kind: MorningBriefItemKind;
  readonly text: string;
}

export interface MorningBriefView {
  readonly title: string;
  readonly subtitle: string;
  readonly prioritiesTitle: string;
  readonly todayTasksLabel: string;
  /** Plan boş değilse `true` — rozet ve satırlar yalnızca bu durumda gösterilir. */
  readonly hasActivity: boolean;
  readonly severityLabel: string;
  readonly severityTone: BadgeTone;
  /** Yalnızca sayısı > 0 olan satırlar — görünürlük kararı `core`de verildi. */
  readonly lines: readonly MorningBriefLineView[];
  readonly allClearText: string;
}

/**
 * `criticalActions > 0` ise rozet "Kritik" olur — yeni bir eşik icat
 * edilmedi, `core`daki sayının kendisi (negative/critical stok ya da
 * late/dueToday tedarik süresi) zaten kararı vermiş durumda.
 */
export function toMorningBriefView(
  brief: MorningBrief,
  locale: Locale,
  texts: MorningBriefTexts,
): MorningBriefView {
  const lines: MorningBriefLineView[] = brief.items.map((item) => ({
    kind: item.kind,
    text: texts.item[item.kind].replace(
      COUNT_PLACEHOLDER,
      formatNumber(item.count, locale),
    ),
  }));

  const severe = brief.summary.criticalActions > 0;

  return {
    title: texts.title,
    subtitle: texts.subtitle,
    prioritiesTitle: texts.prioritiesTitle,
    todayTasksLabel: texts.todayTasksLabel,
    hasActivity: brief.summary.total > 0,
    severityLabel: severe ? texts.severity.critical : texts.severity.normal,
    severityTone: severe ? "danger" : "neutral",
    lines,
    allClearText: texts.allClear,
  };
}
