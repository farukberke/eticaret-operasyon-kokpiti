import type { Signal } from "@/core/domain";
import type { Locale } from "@/i18n/routing";
import { EmptyState } from "@/ui/patterns/empty-state";
import { SignalCard } from "@/ui/patterns/signal-card";

import { buildSignalViews } from "./build-views";

/**
 * Sinyal listesi — risk, fırsat ve öncelik sayfalarının ortak gövdesi.
 *
 * Salt okunur: bu sayfalar sinyalleri **inceleme** içindir. Görev kapatma
 * kuyruğun (kokpitin) işidir; her listeye düğme koymak, "bugün ne yapmalıyım"
 * sorusunun tek bir yerde cevaplanması ilkesini bozardı.
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

  const views = await buildSignalViews(signals, locale, { ranked });

  return (
    <ul className="divide-border divide-y">
      {views.map((view) => (
        <li key={view.id}>
          <SignalCard
            rank={view.rank}
            title={view.title}
            evidence={view.evidence}
            action={view.action}
            outcome={view.outcome}
            deadline={view.deadline}
            severityLabel={view.severityLabel}
            severityTone={view.severityTone}
          />
        </li>
      ))}
    </ul>
  );
}
