import { getTranslations } from "next-intl/server";

import {
  compareMoney,
  sumMoney,
  type Severity,
  type Signal,
  type SignalCode,
} from "@/core/domain";
import type { Locale } from "@/i18n/routing";
import { formatMoney } from "@/lib/format";
import { EmptyState } from "@/ui/patterns/empty-state";
import {
  SummaryList,
  type SummaryRow,
  type SummaryTone,
} from "@/ui/patterns/summary-list";

/**
 * Sinyalleri türe göre gruplayıp özetler.
 *
 * Kokpitte kart tekrarını önler: öncelik listesi "hangi üç iş" sorusuna,
 * bu özet "toplamda neyle karşı karşıyayım" sorusuna cevap verir.
 */

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

const SEVERITY_TONE: Record<Severity, SummaryTone> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "neutral",
};

interface Group {
  readonly code: SignalCode;
  readonly signals: Signal[];
}

function groupByCode(signals: readonly Signal[]): Group[] {
  const groups = new Map<SignalCode, Signal[]>();
  for (const signal of signals) {
    const bucket = groups.get(signal.code);
    if (bucket) bucket.push(signal);
    else groups.set(signal.code, [signal]);
  }
  return [...groups.entries()].map(([code, items]) => ({
    code,
    signals: items,
  }));
}

export async function SignalSummary({
  signals,
  locale,
  tone,
  empty,
}: {
  signals: readonly Signal[];
  locale: Locale;
  /** Fırsatlar için grup noktası her zaman olumlu renkte. */
  tone?: SummaryTone;
  empty: { title: string; description: string };
}) {
  if (signals.length === 0) {
    return <EmptyState title={empty.title} description={empty.description} />;
  }

  const [group, common] = await Promise.all([
    getTranslations("signalGroup"),
    getTranslations("common"),
  ]);

  const summarised = groupByCode(signals).map((item) => {
    const total = sumMoney(item.signals.map((s) => s.moneyAtStake));
    const worst = item.signals.reduce<Severity>(
      (acc, s) => (SEVERITY_ORDER[s.severity] > SEVERITY_ORDER[acc] ? s.severity : acc),
      "low",
    );
    return { code: item.code, count: item.signals.length, total, worst };
  });

  const rows: SummaryRow[] = summarised
    // Toplam para büyükten küçüğe: en çok neyin tehlikede olduğu önce okunur.
    .sort((a, b) => compareMoney(b.total, a.total))
    .map((item) => ({
      id: item.code,
      label: group(item.code),
      count: item.count,
      amount: formatMoney(item.total, locale),
      tone: tone ?? SEVERITY_TONE[item.worst],
    }));

  return (
    <SummaryList rows={rows} countLabel={(count) => common("itemCount", { count })} />
  );
}
