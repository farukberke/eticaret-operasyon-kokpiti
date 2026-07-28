import { getTranslations } from "next-intl/server";

import { container } from "@/data/container";
import {
  readAnalysisWindow,
  type SearchParamsRecord,
} from "@/features/analysis/analysis-params";
import { analysisWindowNote } from "@/features/analysis/analysis-view";
import type { Locale } from "@/i18n/routing";
import { Card } from "@/ui/primitives/card";
import { PageHeader } from "@/ui/patterns/page-header";

import { ProductTable } from "./product-table";

export async function ProductsPage({
  locale,
  searchParams,
}: {
  locale: Locale;
  /** Analiz penceresi kokpitten bağlantıyla taşınır; sunucu onu buradan okur. */
  searchParams: SearchParamsRecord;
}) {
  /**
   * Sayfa artık `defaultRange()` kullanmıyor.
   *
   * Kullanmaya devam etseydi "Kalan gün" sütunu dönem seçicisine sağır
   * kalırdı: kullanıcı kokpitte "Son 7 gün"e geçip buraya geldiğinde satış
   * hızı hâlâ 30 günden hesaplanır ve rozet, kuyruktaki sinyalle çelişirdi.
   */
  const analysisWindow = readAnalysisWindow(searchParams, container.clock.today());
  const range = analysisWindow.range;

  const [performance, t, note] = await Promise.all([
    container.products.getPerformance(range),
    getTranslations("products"),
    analysisWindowNote(analysisWindow, locale),
  ]);

  return (
    <>
      <PageHeader title={t("title")} description={`${t("description")} ${note}`} />
      <Card className="overflow-hidden py-2">
        <ProductTable performance={performance} range={range} locale={locale} />
      </Card>
    </>
  );
}
