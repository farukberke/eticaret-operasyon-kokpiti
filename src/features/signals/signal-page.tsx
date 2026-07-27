import { getTranslations } from "next-intl/server";

import { compareMoney, type Signal } from "@/core/domain";
import { container, defaultRange } from "@/data/container";
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

async function loadSignals(kind: SignalPageKind): Promise<Signal[]> {
  const range = defaultRange();

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
}: {
  kind: SignalPageKind;
  locale: Locale;
}) {
  const [signals, t] = await Promise.all([loadSignals(kind), getTranslations(kind)]);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
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
