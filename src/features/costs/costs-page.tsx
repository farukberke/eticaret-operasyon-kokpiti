import { CircleCheck, Info, PackageOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { toRatio } from "@/core/domain";
import { DEFAULT_RULES } from "@/core/services/rules.config";
import { container, loadCostSource } from "@/data/container";
import {
  readAnalysisWindow,
  type SearchParamsRecord,
} from "@/features/analysis/analysis-params";
import { analysisWindowNote } from "@/features/analysis/analysis-view";
import { EMPTY, formatMoney, formatPercent, formatShortDate } from "@/lib/format";
import type { Locale } from "@/i18n/routing";
import { Card } from "@/ui/primitives/card";
import { EmptyState } from "@/ui/patterns/empty-state";
import { PageHeader } from "@/ui/patterns/page-header";
import { SectionCard } from "@/ui/patterns/section-card";

import { CostDefaults } from "./cost-defaults.client";
import { CostImport } from "./cost-import.client";
import { CostList, type CostListRow } from "./cost-list.client";
import { MissingCostPanel } from "./missing-cost-panel.client";
import { buildCostDefaultsView } from "./default-view";
import { buildMissingCostRows } from "./missing-cost-view";
import { templateCsv } from "./import-actions";

/**
 * MALİYETLER — pazaryerinin bilmediği verinin girildiği yer.
 *
 * Ürünler ekranı maliyeti yalnızca **gösterir**; düzenleme ve (bir sonraki
 * adımda) toplu içe aktarma burada yaşar. Ürün tablosuna form sıkıştırmak
 * onu okunmaz bir canavara çevirirdi.
 */
export async function CostsPage({
  locale,
  searchParams,
  focusProductId,
}: {
  locale: Locale;
  /** Analiz penceresi kokpitten bağlantıyla taşınır; sunucu onu buradan okur. */
  searchParams: SearchParamsRecord;
  /**
   * Kokpitteki "Tamamla" ile gelindiğinde formu açık başlayacak ürün.
   * Adres çubuğunda durur: bağlantı paylaşılabilir, yenilenince kaybolmaz.
   */
  focusProductId?: string | undefined;
}) {
  const today = container.clock.today();

  /**
   * Kokpitle **aynı** pencere. Kullanıcı kokpitte "Son 7 gün"e bakıp bir
   * ürüne tıkladığında buradaki kuyruk da son 7 günü göstermeli; aksi hâlde
   * tıkladığı satır bu ekranda bambaşka bir sırada durur.
   */
  const analysisWindow = readAnalysisWindow(searchParams, today);
  const range = analysisWindow.range;

  const [performance, profit, missing, template, costSource, t, windowNote] =
    await Promise.all([
      container.products.getPerformance(range),
      container.profit.getSummary(range),
      container.costInsights.getMissingCosts(range),
      templateCsv(),
      // Varsayılan ayarları kâr hesabının gördüğü **aynı** tablodan okunur:
      // kullanıcı ekranda %15 görürken kârın %11 ile hesaplandığı bir panel
      // güvenilemez olurdu.
      loadCostSource(),
      getTranslations("costs"),
      analysisWindowNote(analysisWindow, locale),
    ]);

  const defaultsView = buildCostDefaultsView({
    defaults: costSource.costs.defaults,
    products: costSource.products,
    today,
    locale,
  });

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

  /**
   * Boş durumlar birbirine karıştırılmamalı.
   *
   * Hiç sipariş yokken "tüm maliyetler tamam" demek, boş bir defteri temiz
   * sanmaktır: kullanıcı kâr rakamlarına güvenir, oysa ölçülmüş hiçbir şey
   * yoktur. Bu yüzden veri yokluğu ayrı bir durum.
   */
  const hasData = missing.ordersConsidered > 0 && missing.productsInCatalog > 0;
  const limit = DEFAULT_RULES.cost.actionLimit;
  const missingRows = buildMissingCostRows(missing.items.slice(0, limit), locale);
  const remaining = Math.max(0, missing.items.length - missingRows.length);

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

        <SectionCard
          title={t("priorityTitle")}
          /**
           * Kuyruğun hangi döneme ait olduğu başlıkta yazıyor. Seçici
           * kokpitte; buraya ikinci bir kopyasını koymak, kullanıcının işini
           * yaptığı ekranda ona ikinci bir karar sordurmak olurdu — ama hangi
           * pencereye baktığını bilmeden de çalışamaz.
           */
          description={`${t("priorityDescription")} ${windowNote}`}
          {...(missingRows.length > 0 ? { count: missing.items.length } : {})}
        >
          {!hasData ? (
            <EmptyState
              icon={<PackageOpen className="size-5" aria-hidden />}
              title={t("priorityNoData")}
              description={t("priorityNoDataHint")}
            />
          ) : missingRows.length === 0 ? (
            <EmptyState
              icon={<CircleCheck className="text-success size-5" aria-hidden />}
              title={t("priorityAllCovered")}
              description={t("priorityAllCoveredHint")}
            />
          ) : (
            <MissingCostPanel
              /**
               * Odaklanılan ürün değiştiğinde panel sıfırdan kurulur:
               * `useState` başlangıç değeri yalnızca ilk render'da okunur ve
               * anahtar olmadan ikinci bir "Tamamla" tıklaması yanlış formu
               * açık bırakırdı.
               */
              key={focusProductId ?? "none"}
              rows={missingRows}
              today={today}
              remaining={remaining}
              focusProductId={focusProductId}
            />
          )}
        </SectionCard>

        {/*
          Varsayılanlar listeden önce: "yüzlerce ürüne tek tek girme" işini
          burası bitiriyor. Kullanıcının aşağıdaki tek tek düzenleme listesine
          inmeden önce bu bölümü görmesi, aynı komisyonu yüz kez yazmasını
          engelleyen tek şey.
        */}
        <SectionCard title={t("defaultsTitle")} description={t("defaultsDescription")}>
          <CostDefaults view={defaultsView} today={today} />
        </SectionCard>

        <CostImport template={template} />

        <CostList rows={rows} today={today} />
      </div>
    </>
  );
}
