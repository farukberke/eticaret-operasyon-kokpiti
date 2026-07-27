import { getTranslations } from "next-intl/server";

import type { Signal } from "@/core/domain";
import type { Locale } from "@/i18n/routing";
import { EmptyState } from "@/ui/patterns/empty-state";
import { SignalCard } from "@/ui/patterns/signal-card";

import { toSignalView } from "./signal-view";

/**
 * Sinyal listesi — risk, fırsat ve öncelik sayfalarının ortak gövdesi.
 *
 * Üç ekran da bunu kullanır; aradaki tek fark sıra numarası gösterilip
 * gösterilmediği. Sunucu bileşeni: çeviri ve biçimlendirme sunucuda biter,
 * istemciye tek satır JavaScript inmez.
 */
export async function SignalList({
  signals,
  locale,
  ranked = false,
  empty,
}: {
  signals: readonly Signal[];
  locale: Locale;
  /** Öncelik listesinde sıra numarası gösterilir. */
  ranked?: boolean;
  empty: { title: string; description: string };
}) {
  if (signals.length === 0) {
    return <EmptyState title={empty.title} description={empty.description} />;
  }

  const [signal, action, evidence, severity, amountCaption, subject, common] =
    await Promise.all([
      getTranslations("signal"),
      getTranslations("action"),
      getTranslations("evidence"),
      getTranslations("severity"),
      getTranslations("amountCaption"),
      getTranslations("subject"),
      getTranslations("common"),
    ]);

  const translators = {
    signal,
    action,
    evidence,
    severity,
    amountCaption,
    subject,
    common,
  } as const;

  return (
    <ul className="divide-border divide-y">
      {signals.map((item, index) => {
        const view = toSignalView(
          item,
          locale,
          translators,
          ranked ? index + 1 : undefined,
        );

        return (
          <li key={view.id}>
            <SignalCard
              {...(view.rank !== undefined ? { rank: view.rank } : {})}
              title={view.title}
              evidence={view.evidence}
              action={view.action}
              amount={view.amount}
              amountCaption={view.amountCaption}
              severityLabel={view.severityLabel}
              severityTone={view.severityTone}
            />
          </li>
        );
      })}
    </ul>
  );
}
