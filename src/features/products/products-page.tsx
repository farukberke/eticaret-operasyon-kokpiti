import { getTranslations } from "next-intl/server";

import { container, DEFAULT_ANALYSIS_DAYS, defaultRange } from "@/data/container";
import type { Locale } from "@/i18n/routing";
import { Card } from "@/ui/primitives/card";
import { PageHeader } from "@/ui/patterns/page-header";

import { ProductTable } from "./product-table";

export async function ProductsPage({ locale }: { locale: Locale }) {
  const [performance, t] = await Promise.all([
    container.products.getPerformance(defaultRange()),
    getTranslations("products"),
  ]);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description", { days: DEFAULT_ANALYSIS_DAYS })}
      />
      <Card className="overflow-hidden py-2">
        <ProductTable performance={performance} locale={locale} />
      </Card>
    </>
  );
}
