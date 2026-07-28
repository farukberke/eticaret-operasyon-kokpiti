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

export interface MorningBriefTexts {
  readonly title: string;
  readonly subtitle: string;
  readonly prioritiesTitle: string;
  readonly todayTasksLabel: string;
  readonly severity: { readonly critical: string; readonly normal: string };
  readonly allClear: string;
  readonly item: Record<MorningBriefItemKind, (count: string) => string>;
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
      activeActions: (count) => morningBrief("item.activeActions", { count }),
      criticalStock: (count) => morningBrief("item.criticalStock", { count }),
      leadTimeRisk: (count) => morningBrief("item.leadTimeRisk", { count }),
      completedActions: (count) => morningBrief("item.completedActions", { count }),
      snoozedActions: (count) => morningBrief("item.snoozedActions", { count }),
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
    text: texts.item[item.kind](formatNumber(item.count, locale)),
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
