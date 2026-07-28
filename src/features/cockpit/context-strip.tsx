import { getTranslations } from "next-intl/server";

import type { ProfitSummary, SalesSummary } from "@/core/domain";
import type { Locale } from "@/i18n/routing";
import { formatDelta, formatMoney, formatPercent, formatPoints } from "@/lib/format";
import { Card } from "@/ui/primitives/card";
import { TrendDelta, type Direction } from "@/ui/patterns/trend-delta";

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
 */
function Stat({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: { direction: Direction; label: string };
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-fg-muted text-xs">{label}</span>
      <span className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-fg text-lg leading-none font-semibold">{value}</span>
        {delta && (
          <TrendDelta direction={delta.direction} label={delta.label} higherIsBetter />
        )}
      </span>
    </div>
  );
}

export async function ContextStrip({
  sales,
  profit,
  locale,
  periodLabel,
}: {
  sales: SalesSummary;
  profit: ProfitSummary;
  locale: Locale;
  /**
   * Hangi aralığın toplamı olduğu. Sabit "Son 30 gün" yazısı, kullanıcı
   * dönemi değiştirdiği anda yalan söylemeye başlıyordu.
   */
  periodLabel: string;
}) {
  const [kpi, common] = await Promise.all([
    getTranslations("kpi"),
    getTranslations("common"),
  ]);

  const marginDirection: Direction =
    profit.marginDeltaPoints === null || Math.abs(profit.marginDeltaPoints) < 0.001
      ? "flat"
      : profit.marginDeltaPoints > 0
        ? "up"
        : "down";

  return (
    <div>
      <p className="text-fg-subtle mb-1.5 text-xs">{periodLabel}</p>
      <Card className="divide-border grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat
          label={kpi("netProfit")}
          value={formatMoney(profit.netProfit, locale)}
          delta={{
            direction: profit.profitTrend.direction,
            label: formatDelta(profit.profitTrend.deltaRatio, locale),
          }}
        />
        <Stat
          label={kpi("margin")}
          value={formatPercent(profit.marginRatio, locale)}
          delta={{
            direction: marginDirection,
            label: formatPoints(profit.marginDeltaPoints, locale, {
              point: common("point"),
            }),
          }}
        />
        <Stat
          label={kpi("revenue")}
          value={formatMoney(sales.netRevenue, locale)}
          delta={{
            direction: sales.revenueTrend.direction,
            label: formatDelta(sales.revenueTrend.deltaRatio, locale),
          }}
        />
      </Card>
    </div>
  );
}
