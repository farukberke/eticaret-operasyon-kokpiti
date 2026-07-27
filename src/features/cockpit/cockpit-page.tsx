import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { container, defaultRange } from "@/data/container";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { SignalList } from "@/features/signals/signal-list";
import { SignalSummary } from "@/features/signals/signal-summary";
import { Card } from "@/ui/primitives/card";
import { SectionCard } from "@/ui/patterns/section-card";

import { ContextStrip } from "./context-strip";
import { DayBrief } from "./day-brief";

/**
 * KOKPİT — "sabah aç, 30 saniyede ne yapacağını anla".
 *
 * Ekran bir rapor değil, bir **vardiya devri**. Yukarıdan aşağıya:
 *
 *   1. Günün tek cümlesi   → kaç iş, ne kadar para, ne kadar acele
 *   2. Kuyruk              → yapılacak işler, dört soruya cevaplı
 *   3. Bağlam şeridi       → net kâr, marj, ciro (arka plan)
 *   4. Risk/fırsat özeti   → türe göre dağılım
 *
 * Bilinçli olarak burada OLMAYANLAR ve sebepleri:
 *
 * • **Trend grafiği.** Yumuşak bir 30 günlük çizgiye bakıp kimse karar
 *   vermez. Eskiden ekranın en büyük parçasıydı — yani karardan daha çok yer
 *   kaplıyordu. `/satis` ve `/kar` sayfalarında duruyor.
 * • **Sipariş sayısı.** Gurur metriği; hiçbir aksiyona bağlanmıyor.
 * • **Ürün tablosu.** En kötü ürünler zaten kuyrukta, en iyiler sadece
 *   keyif veriyordu. Tamamı `/urunler` sayfasında.
 *
 * Kokpitte aksiyon dışında ne varsa, aksiyonun yerini çalar.
 */

/** Bölüm başlıklarındaki "Tümü →" bağlantısı. */
function DetailLink({
  href,
  label,
}: {
  href: "/priorities" | "/risks" | "/opportunities";
  label: string;
}) {
  return (
    <Link
      href={href}
      className="text-accent inline-flex items-center gap-1 text-xs font-medium hover:underline"
    >
      {label}
      <ArrowRight className="size-3" aria-hidden />
    </Link>
  );
}

const COCKPIT_QUEUE_LIMIT = 3;

export async function CockpitPage({ locale }: { locale: Locale }) {
  const range = defaultRange();

  // Portlar birbirinden bağımsız; hepsi paralel çekilir.
  const [priorities, risks, opportunities, sales, profit] = await Promise.all([
    container.priorities.getPriorities(range),
    container.signals.getRisks(range),
    container.signals.getOpportunities(range),
    container.sales.getSummary(range),
    container.profit.getSummary(range),
  ]);

  const [t, common] = await Promise.all([
    getTranslations("cockpit"),
    getTranslations("common"),
  ]);

  const queue = priorities.slice(0, COCKPIT_QUEUE_LIMIT);

  return (
    <div className="flex flex-col gap-5">
      {/* 1 — GÜNÜN CÜMLESİ */}
      <DayBrief priorities={queue} locale={locale} />

      {/* 2 — KUYRUK */}
      <Card className="px-4">
        <SignalList
          signals={queue.map((action) => action.signal)}
          locale={locale}
          ranked
          empty={{
            title: t("allClear"),
            description: t("allClearDescription"),
          }}
        />
      </Card>

      {priorities.length > queue.length && (
        <div className="-mt-3">
          <DetailLink
            href="/priorities"
            label={t("remaining", { count: priorities.length - queue.length })}
          />
        </div>
      )}

      {/* 3 — BAĞLAM */}
      <ContextStrip sales={sales} profit={profit} locale={locale} />

      {/* 4 — DAĞILIM */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={t("risksTitle")}
          description={t("risksDescription")}
          count={risks.length}
          action={
            risks.length > 0 ? (
              <DetailLink href="/risks" label={common("viewAll")} />
            ) : undefined
          }
          flush
        >
          <div className="px-4 pb-2">
            <SignalSummary
              signals={risks}
              locale={locale}
              empty={{
                title: t("noRisks"),
                description: t("noRisksDescription"),
              }}
            />
          </div>
        </SectionCard>

        <SectionCard
          title={t("opportunitiesTitle")}
          description={t("opportunitiesDescription")}
          count={opportunities.length}
          action={
            opportunities.length > 0 ? (
              <DetailLink href="/opportunities" label={common("viewAll")} />
            ) : undefined
          }
          flush
        >
          <div className="px-4 pb-2">
            <SignalSummary
              signals={opportunities}
              locale={locale}
              tone="success"
              empty={{
                title: t("noOpportunities"),
                description: t("noOpportunitiesDescription"),
              }}
            />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
