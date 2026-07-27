import { ArrowRight, CheckCircle2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { container, DEFAULT_ANALYSIS_DAYS, defaultRange } from "@/data/container";
import { Link } from "@/i18n/navigation";
import { CURRENCY, type Locale } from "@/i18n/routing";
import { SignalList } from "@/features/signals/signal-list";
import { SignalSummary } from "@/features/signals/signal-summary";
import { ProductTable } from "@/features/products/product-table";
import { EmptyState } from "@/ui/patterns/empty-state";
import { SectionCard } from "@/ui/patterns/section-card";
import { TrendChart } from "@/ui/charts/trend-chart";

import { KpiRow } from "./kpi-row";

/**
 * KOKPİT — "sabah aç, 30 saniyede ne yapacağını anla".
 *
 * Bilgi hiyerarşisi bilinçlidir ve yukarıdan aşağıya şöyle okunur:
 *
 *   1. BUGÜN NE YAPMALISIN   → karar (ilk 3 öncelik, gerekçeleriyle)
 *   2. Sayılar               → bağlam (ciro, kâr, marj, sipariş)
 *   3. Riskler / Fırsatlar   → derinlik
 *   4. Ürün performansı      → kanıt
 *
 * Klasik panellerin hatası bunu ters sıralamaktır: grafikle başlayıp karar
 * vermeyi kullanıcıya bırakırlar. Bu ekranın tamamı, ilk bloğun okunmasıyla
 * işini bitirmiş sayılır; gerisi "neden?" diyenler için.
 */

/** Bölüm başlıklarındaki "Tümü →" bağlantısı. */
function DetailLink({
  href,
  label,
}: {
  href: "/priorities" | "/risks" | "/opportunities" | "/products" | "/sales";
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

/** En yüksek ve en düşük kârlı üçer ürün — tablo yerine özet. */
function topAndBottom<T>(items: readonly T[], compare: (a: T, b: T) => number) {
  const sorted = [...items].sort(compare);
  if (sorted.length <= 6) return sorted;
  return [...sorted.slice(0, 3), ...sorted.slice(-3)];
}

const COCKPIT_SIGNAL_LIMIT = 3;

export async function CockpitPage({ locale }: { locale: Locale }) {
  const range = defaultRange();

  // Tüm veri paralel çekilir: portlar birbirine bağımlı değil.
  const [priorities, risks, opportunities, sales, profit, products] = await Promise.all(
    [
      container.priorities.getPriorities(range),
      container.signals.getRisks(range),
      container.signals.getOpportunities(range),
      container.sales.getSummary(range),
      container.profit.getSummary(range),
      container.products.getPerformance(range),
    ],
  );

  const [t, common] = await Promise.all([
    getTranslations("cockpit"),
    getTranslations("common"),
  ]);

  const highlightProducts = topAndBottom(
    products.filter((item) => item.unitsSold > 0),
    (a, b) => b.netProfit.minor - a.netProfit.minor,
  );

  const chartPoints = sales.daily.map((point, index) => ({
    date: point.date,
    revenue: point.revenue.minor,
    profit: profit.daily[index]?.profit.minor ?? 0,
  }));

  return (
    <div className="flex flex-col gap-4">
      {/* 1 — KARAR */}
      <SectionCard
        title={t("prioritiesTitle")}
        description={t("prioritiesDescription")}
        count={priorities.length}
        action={
          priorities.length > 0 ? (
            <DetailLink href="/priorities" label={common("viewAll")} />
          ) : undefined
        }
        flush
      >
        <div className="px-4">
          {priorities.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="size-6" />}
              title={t("allClear")}
              description={t("allClearDescription")}
            />
          ) : (
            <SignalList
              signals={priorities
                .slice(0, COCKPIT_SIGNAL_LIMIT)
                .map((action) => action.signal)}
              locale={locale}
              ranked
              empty={{
                title: t("allClear"),
                description: t("allClearDescription"),
              }}
            />
          )}
        </div>
      </SectionCard>

      {/* 2 — BAĞLAM */}
      <KpiRow sales={sales} profit={profit} locale={locale} />

      <SectionCard
        title={t("trendTitle")}
        description={common("period", { days: DEFAULT_ANALYSIS_DAYS })}
        action={<DetailLink href="/sales" label={common("detail")} />}
      >
        <TrendChart
          points={chartPoints}
          locale={locale}
          currency={CURRENCY}
          labels={{
            revenue: (await getTranslations("chart"))("revenue"),
            profit: (await getTranslations("chart"))("profit"),
          }}
        />
      </SectionCard>

      {/* 3 — DERİNLİK
          Kart tekrarı yerine gruplu özet: öncelik listesindeki maddeler
          burada bir daha görünmez, bunun yerine "hangi türden kaç tane ve
          toplam ne kadar para" bilgisi verilir. */}
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

      {/* 4 — KANIT */}
      <SectionCard
        title={t("productsTitle")}
        description={t("productsDescription")}
        action={<DetailLink href="/products" label={common("viewAll")} />}
        flush
      >
        <ProductTable performance={highlightProducts} locale={locale} compact />
      </SectionCard>
    </div>
  );
}
