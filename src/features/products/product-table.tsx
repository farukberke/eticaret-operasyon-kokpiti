import { getTranslations } from "next-intl/server";

import type { DateRange, ProductPerformance } from "@/core/domain";
import {
  buildStockForecasts,
  type StockCoverageState,
} from "@/core/services/stock-forecast";
import type { Locale } from "@/i18n/routing";

import { ProductTableClient } from "./product-table.client";
import { toProductRow, type ProductTableLabels } from "./product-row";
import type { StockCoverageTexts } from "./stock-forecast-view";

/**
 * Ürün tablosunun sunucu yarısı.
 *
 * Çeviri ve para/tarih biçimlendirmesini burada bitirir, istemciye yalnızca
 * düz veri geçirir. Böylece `Intl` çağrıları ve sözlükler tarayıcıya inmez.
 */

/**
 * Sözlükte karşılığı olması gereken durumlar.
 *
 * Etiketler `t(\`coverage.${state}\`)` ile dinamik kurulsaydı eksik bir
 * anahtar ne derlemeyi ne testi kırar, kullanıcıya ham anahtar adını basardı.
 * Tek tek yazmak derleyiciyi bekçi yapıyor: `StockCoverageState`e yeni bir
 * durum eklendiği anda burası tip hatası verir.
 */
function coverageTextsOf(
  t: Awaited<ReturnType<typeof getTranslations<"products">>>,
): StockCoverageTexts {
  const state: Record<StockCoverageState, string> = {
    critical: t("coverage.critical"),
    low: t("coverage.low"),
    normal: t("coverage.normal"),
    high: t("coverage.high"),
    unknown: t("coverage.unknown"),
    noSales: t("coverage.noSales"),
    negative: t("coverage.negative"),
  };

  return {
    state,
    days: (days) => t("daysUnit", { days }),
    hint: (windowDays) => t("coverage.hint", { days: windowDays }),
  };
}

export async function ProductTable({
  performance,
  range,
  locale,
  compact = false,
}: {
  performance: readonly ProductPerformance[];
  /** Seçili analiz penceresi — satış hızının ve dipnotun kaynağı. */
  range: DateRange;
  locale: Locale;
  compact?: boolean;
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
  const coverageTexts = coverageTextsOf(t);

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

  return <ProductTableClient rows={rows} labels={labels} compact={compact} />;
}
