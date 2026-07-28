import { getTranslations } from "next-intl/server";

import type { DateRange, ProductPerformance } from "@/core/domain";
import { buildStockForecasts } from "@/core/services/stock-forecast";
import type { Locale } from "@/i18n/routing";

import { ProductTableClient } from "./product-table.client";
import { toProductRow, type ProductTableLabels } from "./product-row";
import { buildStockCoverageTexts } from "./stock-forecast-view";

/**
 * Ürün tablosunun sunucu yarısı.
 *
 * Çeviri ve para/tarih biçimlendirmesini burada bitirir, istemciye yalnızca
 * düz veri geçirir. Böylece `Intl` çağrıları ve sözlükler tarayıcıya inmez.
 */

export async function ProductTable({
  performance,
  range,
  locale,
  compact = false,
  focusProductId,
}: {
  performance: readonly ProductPerformance[];
  /** Seçili analiz penceresi — satış hızının ve dipnotun kaynağı. */
  range: DateRange;
  locale: Locale;
  compact?: boolean;
  /** Kokpitteki stok uyarısından gelindiğinde vurgulanacak ürün. */
  focusProductId?: string | undefined;
}) {
  const [t, common] = await Promise.all([
    getTranslations("products"),
    getTranslations("common"),
  ]);

  /**
   * Tahminler **tek seferde**, tablo kurulmadan önce hesaplanır. Satır
   * döngüsünün içinde ürün başına analiz kurmak, aynı takvim hesabını katalog
   * boyu tekrarlamak olurdu.
   */
  const forecasts = buildStockForecasts(performance, range);
  const coverageTexts = buildStockCoverageTexts(t);

  const rows = performance.map((item) =>
    toProductRow(item, forecasts.byProduct.get(item.product.id), locale, coverageTexts),
  );

  const labels: ProductTableLabels = {
    unitCost: t("unitCost"),
    costMissing: t("costMissing"),
    name: t("name"),
    category: t("category"),
    unitsSold: t("unitsSold"),
    netRevenue: t("netRevenue"),
    netProfit: t("netProfit"),
    margin: t("margin"),
    returnRate: t("returnRate"),
    stock: t("stock"),
    daysOfCover: t("daysOfCover"),
    empty: t("empty"),
    emptyDescription: t("emptyDescription"),
    sortHint: common("sortHint"),
    /**
     * Dipnot satır başına değil tablo başına: "son 30 güne göre" cümlesini
     * 40 kez tekrarlamak bilgi değil gürültüdür. Pencere tüm satırlar için
     * aynı olduğundan bir kez söylemek yeterli.
     */
    coverageNote: coverageTexts.hint(forecasts.windowDays),
  };

  return (
    <ProductTableClient
      rows={rows}
      labels={labels}
      compact={compact}
      focusProductId={focusProductId}
    />
  );
}
