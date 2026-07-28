import { getTranslations } from "next-intl/server";

import { compareMoney, type DateRange, type Signal } from "@/core/domain";
import { container } from "@/data/container";
import {
  readAnalysisWindow,
  type SearchParamsRecord,
} from "@/features/analysis/analysis-params";
import { analysisWindowNote } from "@/features/analysis/analysis-view";
import type { Locale } from "@/i18n/routing";
import { Card } from "@/ui/primitives/card";
import { PageHeader } from "@/ui/patterns/page-header";

import { SignalList } from "./signal-list";

/**
 * Risk, fırsat ve öncelik sayfalarının ortak gövdesi.
 *
 * Üçü de aynı şeyi yapar: sinyalleri çek, sırala, listele. Üç ayrı sayfa
 * bileşeni yazmak yerine tek parametreli bir gövde — yeni bir sinyal
 * görünümü eklemek `kind` eklemek demek.
 */
export type SignalPageKind = "risks" | "opportunities" | "priorities";

async function loadSignals(kind: SignalPageKind, range: DateRange): Promise<Signal[]> {
  if (kind === "priorities") {
    // Öncelikler zaten motor tarafından sıralı gelir.
    const actions = await container.priorities.getPriorities(range);
    return actions.map((action) => action.signal);
  }

  const signals =
    kind === "risks"
      ? await container.signals.getRisks(range)
      : await container.signals.getOpportunities(range);

  // Risk ve fırsat sayfalarında sıra para büyüklüğüne göre.
  return [...signals].sort((a, b) => compareMoney(b.moneyAtStake, a.moneyAtStake));
}

export async function SignalPage({
  kind,
  locale,
  searchParams,
}: {
  kind: SignalPageKind;
  locale: Locale;
  /** Kokpitteki "Tümü →" bağlantısı analiz penceresini buraya taşır. */
  searchParams: SearchParamsRecord;
}) {
  const analysisWindow = readAnalysisWindow(searchParams, container.clock.today());
  const [signals, t, note] = await Promise.all([
    loadSignals(kind, analysisWindow.range),
    getTranslations(kind),
    analysisWindowNote(analysisWindow, locale),
  ]);

  return (
    <>
      {/* Sayfa açıklaması hangi dönemin sinyalleri olduğunu da söyler:
          kokpitten "Son 7 gün" ile gelen kullanıcı burada 30 günlük bir
          liste görüp aynı işleri sayamadığında panele güvenmeyi bırakır. */}
      <PageHeader title={t("title")} description={`${t("description")} ${note}`} />
      <Card className="px-4">
        <SignalList
          signals={signals}
          locale={locale}
          ranked={kind === "priorities"}
          empty={{ title: t("empty"), description: t("emptyDescription") }}
        />
      </Card>
    </>
  );
}
