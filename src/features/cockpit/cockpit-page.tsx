import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { container, defaultRange } from "@/data/container";
import { Link } from "@/i18n/navigation";
import { CURRENCY, type Locale } from "@/i18n/routing";
import { buildSignalViews } from "@/features/signals/build-views";
import { SignalSummary } from "@/features/signals/signal-summary";
import { SectionCard } from "@/ui/patterns/section-card";

import { TaskStateProvider } from "@/features/tasks/task-state-provider.client";

import { CockpitQueue } from "./cockpit-queue.client";
import { ContextStrip } from "./context-strip";
import { DayLedger } from "./day-ledger.client";

/**
 * KOKPİT — "sabah aç, 30 saniyede ne yapacağını anla".
 *
 * Ekran bir rapor değil, bir **vardiya devri**. Yukarıdan aşağıya:
 *
 *   1. Günün tek cümlesi   → kaç iş, ne kadar para, ne kadar acele
 *   2. Kuyruk              → yapılacak işler, dört soruya cevaplı
 *   3. Bağlam şeridi       → net kâr, marj, ciro (arka plan)
 *   4. Risk/fırsat özeti   → türe göre dağılım
 *   5. Defter              → kapattığın işlerin getirisi (kapanış notu)
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

  /**
   * Görünüm modelleri sunucuda hazırlanır: çeviri ve para biçimlendirmesi
   * burada biter, istemciye yalnızca düz metin iner.
   *
   * Kuyruğa **tüm** öncelikler verilir, ilk üçü değil — kullanıcı üstteki
   * işleri kapattıkça alttakiler yükselmeli ve "Tamamlanan" sekmesi ilk üçün
   * dışındakileri de gösterebilmeli.
   */
  const views = await buildSignalViews(
    priorities.map((action) => action.signal),
    locale,
  );

  const today = container.clock.today();

  return (
    /**
     * Kuyruk ve defter aynı görev durumunu paylaşır: bir iş kapatıldığında
     * ikisi de aynı anda güncellenmeli. Aradaki sunucu bileşenleri
     * (bağlam şeridi, dağılım kartları) `children` olarak geçtiği için
     * sunucuda render edilmeye devam eder.
     */
    <TaskStateProvider today={today}>
      <div className="flex flex-col gap-5">
        {/* 1–2 — GÜNÜN CÜMLESİ + KUYRUK */}
        <CockpitQueue views={views} today={today} locale={locale} currency={CURRENCY} />

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

        {/* 5 — KAPANIŞ. Günün işi bittikten sonra okunacak not. */}
        <DayLedger today={today} locale={locale} />
      </div>
    </TaskStateProvider>
  );
}
