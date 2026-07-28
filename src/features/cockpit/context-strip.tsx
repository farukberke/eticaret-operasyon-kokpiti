import { getTranslations } from "next-intl/server";

import type { ProfitSummary, SalesSummary } from "@/core/domain";
import type { Locale } from "@/i18n/routing";
import { formatMoney, formatPercent } from "@/lib/format";
import { Card } from "@/ui/primitives/card";

import { ComparisonStat } from "./comparison-stat";
import type { CockpitComparisonViews } from "./comparison-view";

/**
 * BAĞLAM ŞERİDİ — kokpitin en altı.
 *
 * Eskiden dört büyük KPI kartıydı ve kuyruğun üstünde duruyordu. İki sorun
 * vardı: (a) sipariş sayısı hiçbir karara bağlanmıyordu, gurur metriğiydi;
 * (b) sayılar kararın önüne geçince kullanıcı "bu rakam iyi mi kötü mü?"
 * diye düşünmek zorunda kalıyordu.
 *
 * Şimdi üç sayı, tek satır, kuyruğun altında. Bunlar kararın kendisi değil,
 * kararın arka planı — ve bu ekranda arka plan arka planda durur.
 * Ayrıntı `/kar` ve `/satis` sayfalarında.
 *
 * (b) sorusunun kalan yarısını **önceki dönem karşılaştırması** kapatıyor:
 * "₺142.300 net kâr" tek başına okunamaz, "önceki döneme göre ₺12.450 arttı"
 * okunabilir. Karşılaştırma hesabı burada değil, sayfada tek kez kuruluyor.
 */
export async function ContextStrip({
  sales,
  profit,
  locale,
  comparisons,
}: {
  sales: SalesSummary;
  profit: ProfitSummary;
  locale: Locale;
  /** Sayfada bir kez hesaplanan karşılaştırmalar; şerit kendi hesabını yapmaz. */
  comparisons: CockpitComparisonViews;
}) {
  const kpi = await getTranslations("kpi");

  return (
    <div>
      {/*
        Hangi iki dönem kıyaslandığı yazıyla duruyor: "1 – 30 Tem · önceki
        1 – 30 Haz". Sabit bir "Son 30 gün" yazısı, kullanıcı dönemi
        değiştirdiği anda yalan söylemeye başlıyordu.
      */}
      <p className="text-fg-subtle mb-1.5 text-xs">{comparisons.windowLabel}</p>
      <Card className="divide-border grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <ComparisonStat
          label={kpi("netProfit")}
          value={formatMoney(profit.netProfit, locale)}
          comparison={comparisons.netProfit}
        />
        <ComparisonStat
          label={kpi("margin")}
          value={formatPercent(profit.marginRatio, locale)}
          comparison={comparisons.margin}
        />
        <ComparisonStat
          label={kpi("revenue")}
          value={formatMoney(sales.netRevenue, locale)}
          comparison={comparisons.netRevenue}
        />
      </Card>
    </div>
  );
}
