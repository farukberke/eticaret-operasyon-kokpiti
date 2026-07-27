import { getTranslations } from "next-intl/server";

import type { ProductPerformance } from "@/core/domain";
import type { Locale } from "@/i18n/routing";

import { ProductTableClient } from "./product-table.client";
import { toProductRow, type ProductTableLabels } from "./product-row";

/**
 * Ürün tablosunun sunucu yarısı.
 *
 * Çeviri ve para/tarih biçimlendirmesini burada bitirir, istemciye yalnızca
 * düz veri geçirir. Böylece `Intl` çağrıları ve sözlükler tarayıcıya inmez.
 */
export async function ProductTable({
  performance,
  locale,
  compact = false,
}: {
  performance: readonly ProductPerformance[];
  locale: Locale;
  compact?: boolean;
}) {
  const [t, common] = await Promise.all([
    getTranslations("products"),
    getTranslations("common"),
  ]);

  const rows = performance.map((item) =>
    toProductRow(item, locale, (days) => t("daysUnit", { days })),
  );

  const labels: ProductTableLabels = {
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
  };

  return <ProductTableClient rows={rows} labels={labels} compact={compact} />;
}
