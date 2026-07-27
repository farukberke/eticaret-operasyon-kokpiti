import { Info } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { toRatio } from "@/core/domain";
import { container, defaultRange } from "@/data/container";
import { EMPTY, formatMoney, formatPercent, formatShortDate } from "@/lib/format";
import type { Locale } from "@/i18n/routing";
import { Card } from "@/ui/primitives/card";
import { PageHeader } from "@/ui/patterns/page-header";

import { CostList, type CostListRow } from "./cost-list.client";

/**
 * MALİYETLER — pazaryerinin bilmediği verinin girildiği yer.
 *
 * Ürünler ekranı maliyeti yalnızca **gösterir**; düzenleme ve (bir sonraki
 * adımda) toplu içe aktarma burada yaşar. Ürün tablosuna form sıkıştırmak
 * onu okunmaz bir canavara çevirirdi.
 */
export async function CostsPage({ locale }: { locale: Locale }) {
  const range = defaultRange();
  const [performance, profit, t] = await Promise.all([
    container.products.getPerformance(range),
    container.profit.getSummary(range),
    getTranslations("costs"),
  ]);

  const today = container.clock.today();

  const rows: CostListRow[] = [...performance]
    // Eksik olanlar üstte: kullanıcının burada yapacağı iş onlar.
    .sort((a, b) => {
      const byStatus = Number(b.unitCost === null) - Number(a.unitCost === null);
      if (byStatus !== 0) return byStatus;
      return b.netRevenue.minor - a.netRevenue.minor;
    })
    .map((item) => {
      /**
       * Bu ekrandaki rozet "bu ürünün maliyet kaydı var mı" sorusunu
       * cevaplar — "analiz penceresinin tamamı kapsanıyor mu" sorusunu
       * değil. İkisi farklı sorular ve karıştırılırsa kullanıcı maliyeti
       * girdikten sonra bile "Maliyet eksik" görüp haklı olarak şaşırır.
       *
       * Dönem kapsamı zaten üstteki özet satırında ayrıca raporlanıyor.
       */
      const missing = item.unitCost === null;
      return {
        productId: item.product.id,
        name: item.product.name,
        sku: item.product.sku,
        missing,
        unitCostLabel: item.unitCost ? formatMoney(item.unitCost, locale) : EMPTY,
        // Form alanları ham değer taşır; kullanıcı biçimlenmiş metni silmesin.
        unitCostValue: item.unitCost ? String(item.unitCost.minor / 100) : "",
        commissionLabel: formatPercent(toRatio(item.commissionRate), locale),
        commissionValue: "",
        effectiveFromLabel: item.costEffectiveFrom
          ? formatShortDate(item.costEffectiveFrom, locale)
          : EMPTY,
      };
    });

  const { coverage } = profit;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <div className="flex flex-col gap-4">
        {/* Dürüstlük notu: kullanıcı bu rakamları muhasebe sonucu sanmasın. */}
        <Card className="text-fg-muted flex items-start gap-2 p-3 text-xs">
          <Info className="text-fg-subtle mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{t("vatNotice")}</span>
        </Card>

        {coverage.productsMissing > 0 ? (
          <p className="text-warning text-sm font-medium">
            {t("missingSummary", {
              count: coverage.productsMissing,
              revenue: formatMoney(coverage.revenueExcluded, locale),
            })}
          </p>
        ) : (
          <p className="text-success text-sm font-medium">{t("allComplete")}</p>
        )}

        <CostList rows={rows} today={today} />

        <Card className="text-fg-muted p-3 text-xs">
          <p className="text-fg mb-1 text-sm font-medium">{t("importTitle")}</p>
          <p>{t("importSoon")}</p>
        </Card>
      </div>
    </>
  );
}
