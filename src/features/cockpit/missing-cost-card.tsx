import { ArrowRight, CircleCheck, PackageOpen } from "lucide-react";
import { useTranslations } from "next-intl";

import type { MissingCostReport } from "@/core/domain";
import type { AnalysisSelection } from "@/core/services/analysis-window";
import { DEFAULT_RULES } from "@/core/services/rules.config";
import { withAnalysisQuery } from "@/features/analysis/analysis-params";
import { costFocusHref } from "@/features/costs/cost-focus";
import { MissingCostItem } from "@/features/costs/missing-cost-item";
import { buildMissingCostRows } from "@/features/costs/missing-cost-view";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { EmptyState } from "@/ui/patterns/empty-state";
import { SectionCard } from "@/ui/patterns/section-card";
import { Button } from "@/ui/primitives/button";

/**
 * "ÖNCE BUNLARI TAMAMLAYIN" — kokpitin ilk kartı.
 *
 * Eksik alış maliyeti sıradan bir veri boşluğu değil: panelin **kâr
 * gösterememesinin** sebebi. Bu iş bitmeden kokpitteki net kâr, marj ve
 * "yaparsan şu kadar korunur" cümlelerinin tamamı eksik bir veri kümesinden
 * konuşuyor. Bu yüzden kart kuyruğun bile üstünde: kullanıcı önce panelin
 * gözünü açsın, sonra panelin söylediklerine baksın.
 *
 * Bu bileşen **hiçbir şey hesaplamaz**. Sıra, seviye, gerekçe ve tutar
 * `getMissingCostImpacts` servisinden geldiği gibi gösterilir; satır markup'ı
 * da maliyet ekranıyla ortak (`MissingCostItem`). İki ekranın aynı işi farklı
 * sırayla ya da farklı gerekçeyle göstermesi, kullanıcının panele olan
 * güvenini tek seferde bitirirdi.
 *
 * Buradaki tek fark eylemde: maliyet ekranında satırın altında form açılır,
 * burada CTA kullanıcıyı **o ürünün formuna** götürür. Kokpitte form açmak,
 * "30 saniyede ne yapmalıyım" ekranını veri giriş ekranına çevirirdi.
 */
export function MissingCostCard({
  report,
  locale,
  selection,
}: {
  report: MissingCostReport;
  locale: Locale;
  /**
   * Kokpitte açık olan analiz penceresi.
   *
   * Rapor zaten bu pencereyle hesaplandı; buradaki tek işi **bağlantılara
   * binmek**. Kullanıcı "Son 7 gün" kuyruğundan bir ürüne tıklayıp maliyet
   * ekranında son 30 günün kuyruğunu bulursa, tıkladığı satır listede
   * başka bir sırada durur ve iki ekran farklı bir "önce bunu yap" söyler.
   */
  selection: AnalysisSelection;
}) {
  const t = useTranslations("cockpit");
  // Satır metinleri maliyet ekranıyla ortak sözlükten okunur: aynı iş, aynı
  // kelimeler.
  const costs = useTranslations("costs");

  const rows = buildMissingCostRows(
    report.items.slice(0, DEFAULT_RULES.cost.actionLimit),
    locale,
  );
  const remaining = Math.max(0, report.items.length - rows.length);

  /**
   * Boş durumlar birbirine karıştırılmamalı: hiç sipariş yokken "tüm
   * maliyetler tamam" demek, boş bir defteri temiz sanmaktır. Maliyet ekranı
   * da aynı ayrımı yapıyor.
   */
  const hasData = report.ordersConsidered > 0 && report.productsInCatalog > 0;

  /**
   * En üstteki iş kritikse kartın kendisi de uyarı rengine geçer.
   *
   * Rozet tek başına satır içinde kalıyor; kart kenarlığı ise ekranın ilk
   * bakışında görünür. Renk yine tek başına anlam taşımıyor — aynı bilgi ilk
   * satırdaki "Önce bu" rozetinde yazıyla da duruyor.
   */
  const urgent = rows[0]?.level === "critical";

  return (
    <SectionCard
      title={costs("priorityTitle")}
      description={costs("priorityDescription")}
      {...(rows.length > 0 ? { count: report.items.length } : {})}
      {...(urgent ? { className: "border-danger-border" } : {})}
    >
      {!hasData ? (
        <EmptyState
          icon={<PackageOpen className="size-5" aria-hidden />}
          title={costs("priorityNoData")}
          description={costs("priorityNoDataHint")}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CircleCheck className="text-success size-5" aria-hidden />}
          title={t("missingCostDone")}
          description={t("missingCostDoneHint")}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <ol className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <MissingCostItem
                key={row.productId}
                row={row}
                rank={index + 1}
                action={
                  <Button asChild size="sm">
                    {/* Bağlantı, düğme değil: yeni sekmede açılabilsin ve
                        klavyeyle gezilebilsin. */}
                    <Link
                      href={withAnalysisQuery(costFocusHref(row.productId), selection)}
                    >
                      {t("missingCostCta")}
                    </Link>
                  </Button>
                }
              />
            ))}
          </ol>

          {remaining > 0 && (
            <Link
              href={withAnalysisQuery("/costs", selection)}
              className="text-accent inline-flex items-center gap-1 self-start text-xs font-medium hover:underline"
            >
              {t("missingCostMore", { count: remaining })}
              <ArrowRight className="size-3" aria-hidden />
            </Link>
          )}
        </div>
      )}
    </SectionCard>
  );
}
