import { useTranslations } from "next-intl";

import type { PurchasePriorityItem } from "@/core/services/purchase-priority";
import type { ReorderRecommendation } from "@/core/services/reorder-suggestion";
import type { StockAlert } from "@/core/services/stock-alerts";
import type { AnalysisSelection } from "@/core/services/analysis-window";
import { withAnalysisQuery } from "@/features/analysis/analysis-params";
import {
  buildStockAlertTexts,
  toStockAlertViews,
  type StockAlertView,
} from "@/features/products/stock-alert-view";
import { buildStockCoverageTexts } from "@/features/products/stock-forecast-view";
import { productFocusHref } from "@/features/products/product-focus";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Badge } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";
import { EmptyState } from "@/ui/patterns/empty-state";
import { SectionCard } from "@/ui/patterns/section-card";

import {
  buildPurchasePriorityTexts,
  toPurchasePriorityViews,
} from "./purchase-priority-view";

/**
 * "STOKTA ÖNCE BUNLARA BAKIN" — stok tahminini ürün tablosundan kokpite taşıyan
 * kart.
 *
 * Tahmin burada **hesaplanmaz**: `buildStockAlerts` katalogun tamamı için tek
 * geçişte ürettiği listeyi olduğu gibi gösterir. Kart yalnızca çeviriyle
 * bitirir — tıpkı `MissingCostCard` gibi, sıralamaya ya da eşiklere dokunmaz.
 *
 * Task/sinyal yaşam döngüsü (tamamla/ertele) burada YOK: bu bir aksiyon
 * kuyruğu değil, bir uyarı listesi. Kullanıcının tek eylemi ürünün kendi
 * sayfasına gidip stoğu düzeltmek/tazelemek; "yaptım" demesi gereken bir görev
 * değil. Bu yüzden `TaskStateProvider`in bilmediği ikinci bir görev sistemi
 * kurulmadı.
 *
 * `purchasePriorities` de aynı ilkeye tabi: `buildPurchasePriorities`in
 * (`core/services/purchase-priority.ts`) rütbelediği sonucu okur, kendi
 * sırasını kurmaz — sıralama zaten `alerts`in geldiği sırada bitmiş olur.
 */
const NO_PRIORITIES: readonly PurchasePriorityItem[] = [];

export function StockAlertsCard({
  alerts,
  windowDays,
  hasData,
  locale,
  selection,
  reorderRecommendations,
  purchasePriorities = NO_PRIORITIES,
}: {
  /**
   * Gösterim sırası — kart bu sırayı **değiştirmez**. Satın alma öncelik
   * motorunun rütbelediği ürünler önde olacak şekilde bu diziyi kuran taraf
   * çağırandır (`orderStockAlertsByPriority`), kart değil.
   */
  alerts: readonly StockAlert[];
  /** Hızın hesaplandığı pencere — dipnotta "son X güne göre" cümlesinin X'i. */
  windowDays: number;
  /**
   * Katalogda hiç ürün yoksa `false`. Bu durumda "stok müdahalesi gereken
   * ürün yok" demek boş bir katalogu sağlıklı göstermek olurdu.
   */
  hasData: boolean;
  locale: Locale;
  selection: AnalysisSelection;
  /** Ürün kimliğine göre yeniden sipariş önerisi — toplu hesaptan gelir. */
  reorderRecommendations: ReadonlyMap<string, ReorderRecommendation>;
  /**
   * `buildPurchasePriorities`in çıktısı — yalnızca negative/critical/low
   * kapsar. Verilmezse (ör. eski çağıranlar) kart rozet/etki metni olmadan,
   * önceki davranışıyla aynı şekilde çalışmaya devam eder.
   */
  purchasePriorities?: readonly PurchasePriorityItem[];
}) {
  const t = useTranslations("stockAlerts");
  const products = useTranslations("products");
  const priority = useTranslations("purchasePriority");

  const coverageTexts = buildStockCoverageTexts(products);
  const texts = buildStockAlertTexts(t, coverageTexts);
  const views: StockAlertView[] = toStockAlertViews(
    alerts,
    locale,
    texts,
    windowDays,
    reorderRecommendations,
  );

  const priorityTexts = buildPurchasePriorityTexts(priority);
  const priorityViews = toPurchasePriorityViews(
    purchasePriorities,
    locale,
    priorityTexts,
  );

  const urgent = views[0]?.state === "negative" || views[0]?.state === "critical";

  return (
    <SectionCard
      title={t("title")}
      description={t("description")}
      {...(views.length > 0 ? { count: views.length } : {})}
      {...(urgent ? { className: "border-danger-border" } : {})}
    >
      {!hasData ? (
        <EmptyState title={t("noData")} description={t("noDataHint")} />
      ) : views.length === 0 ? (
        <EmptyState title={t("empty")} description={t("emptyDescription")} />
      ) : (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col gap-2">
            {views.map((view) => {
              const priorityView = priorityViews.get(view.productId);

              return (
                <li
                  key={view.productId}
                  className="border-border bg-surface rounded-lg border p-3"
                >
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-fg truncate text-sm font-medium">
                          {view.productName}
                        </p>
                        <Badge tone={view.tone}>{view.stateLabel}</Badge>
                        {priorityView?.rankLabel ? (
                          <Badge tone="accent">{priorityView.rankLabel}</Badge>
                        ) : null}
                      </div>

                      <div className="text-fg-muted mt-1 flex flex-wrap gap-x-2 text-xs">
                        <span>{view.stockLabel}</span>
                        {/* Ölçülemeyen durumda kalan gün yerine durum kelimesi
                          tekrar edilir — ikinci bir "ölçülemedi" cümlesi
                          icat edilmez. */}
                        <span>{view.daysLabel ?? view.stateLabel}</span>
                      </div>

                      <p className="text-fg-muted mt-1.5 text-sm">{view.reason}</p>
                      <p className="text-fg mt-1 text-sm font-medium">{view.action}</p>
                      {/* Satın alma öncelik motorunun cevabı: "ertelenirse ne
                        olur?" — negative/critical/low dışındaki (unknown)
                        satırlarda `priorityView` yok, bu yüzden gösterilmez. */}
                      {priorityView ? (
                        <p className="text-fg-muted mt-1 text-xs">
                          {priorityView.impact}
                        </p>
                      ) : null}

                      {view.reorderQuantityLabel ? (
                        <div className="mt-1">
                          <p className="text-fg text-sm font-medium">
                            {view.reorderQuantityLabel}
                          </p>
                          {view.reorderBasisLabel ? (
                            <p className="text-fg-subtle text-xs">
                              {view.reorderBasisLabel}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <Button asChild size="sm">
                      <Link
                        href={withAnalysisQuery(
                          productFocusHref(view.productId),
                          selection,
                        )}
                      >
                        {t("cta")}
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          <p className="text-fg-subtle px-1 text-xs">
            {coverageTexts.hint(windowDays)}
          </p>
        </div>
      )}
    </SectionCard>
  );
}
