import { useTranslations } from "next-intl";

import type { IsoDate } from "@/core/domain";
import type { LeadTimeRisk } from "@/core/services/lead-time-risk";
import type { PurchaseActionPlanBatch } from "@/core/services/purchase-action-plan";
import type { PurchasePriorityItem } from "@/core/services/purchase-priority";
import type { ReorderRecommendation } from "@/core/services/reorder-suggestion";
import type { StockAlert } from "@/core/services/stock-alerts";
import type { AnalysisSelection } from "@/core/services/analysis-window";
import { withAnalysisQuery } from "@/features/analysis/analysis-params";
import {
  buildLeadTimeRiskTexts,
  toLeadTimeRiskViews,
} from "@/features/products/lead-time-risk-view";
import {
  buildStockAlertTexts,
  toStockAlertViews,
  type StockAlertView,
} from "@/features/products/stock-alert-view";
import { buildStockCoverageTexts } from "@/features/products/stock-forecast-view";
import { productFocusHref } from "@/features/products/product-focus";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Badge, type BadgeTone } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";
import { EmptyState } from "@/ui/patterns/empty-state";
import { SectionCard } from "@/ui/patterns/section-card";

import { buildMorningBriefTexts } from "./morning-brief-view";
import { MorningBriefSummary } from "./morning-brief-summary.client";
import {
  buildPurchaseActionPlanTexts,
  toPurchaseActionPlanRowViews,
  toPurchaseActionPlanSummaryView,
} from "./purchase-action-plan-view";
import { buildPurchaseActionStatusTexts } from "./purchase-action-status-view";
import { PurchaseActionStatusProvider } from "./purchase-action-status-provider.client";
import { PurchaseActionStatusRow } from "./purchase-action-status-row.client";
import { PurchaseActionStatusSummary } from "./purchase-action-status-summary.client";
import {
  buildPurchasePriorityTexts,
  toPurchasePriorityViews,
} from "./purchase-priority-view";
import { TaskTimeline } from "./task-timeline.client";
import { buildTaskTimelineTexts } from "./task-timeline-view";

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
const NO_LEAD_TIME_RISKS: ReadonlyMap<string, LeadTimeRisk> = new Map();
const NO_ACTION_PLAN: PurchaseActionPlanBatch = {
  items: [],
  summary: {
    total: 0,
    actNowCount: 0,
    decideTodayCount: 0,
    planSoonCount: 0,
    completeDataCount: 0,
    reviewCount: 0,
  },
};

/**
 * `LeadTimeRiskView.tone`u metin rengine çevirir — rozet açılmıyor, çünkü
 * satır zaten bir durum rozeti (`view.stateLabel`) taşıyor; ikinci bir
 * rozet aynı bilgiyi iki kez renklendirmiş olurdu. Renk burada da tek
 * başına anlam taşımaz: cümlenin kendisi ("gecikti" / "bugün" / "yaklaşıyor")
 * zaten farkı söylüyor.
 */
const LEAD_TIME_TEXT_TONE: Record<BadgeTone, string> = {
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
  info: "text-info",
  neutral: "text-fg-muted",
  accent: "text-accent",
};

export function StockAlertsCard({
  alerts,
  windowDays,
  hasData,
  locale,
  selection,
  reorderRecommendations,
  purchasePriorities = NO_PRIORITIES,
  leadTimeRisks = NO_LEAD_TIME_RISKS,
  actionPlan = NO_ACTION_PLAN,
  today,
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
  /**
   * `buildLeadTimeRisks`in çıktısı — ürün kimliğine göre tedarik süresi
   * riski. Verilmezse (ör. eski çağıranlar) satırlar tedarik süresi
   * bilgisi olmadan, önceki davranışıyla aynı şekilde çalışmaya devam eder.
   */
  leadTimeRisks?: ReadonlyMap<string, LeadTimeRisk>;
  /**
   * `buildPurchaseActionPlan`in çıktısı — yalnızca negative/critical/low
   * kapsar, rütbe sırası `purchasePriorities`ten aynen gelir. Verilmezse
   * (ör. eski çağıranlar) kart eylem rozeti/özeti olmadan, önceki
   * davranışıyla aynı şekilde çalışmaya devam eder.
   */
  actionPlan?: PurchaseActionPlanBatch;
  /**
   * Kullanıcının satın alma eylemi kararlarının (`done`/`snoozed`/`ignored`)
   * kaydedileceği gün — `PurchaseActionStatusRecord.updatedAt`. Sinyal görev
   * durumunun (`TaskState`) `today`sinin aynısı, ayrı bir tarih hesabı değil.
   */
  today: IsoDate;
}) {
  const t = useTranslations("stockAlerts");
  const products = useTranslations("products");
  const priority = useTranslations("purchasePriority");
  const morningBrief = useTranslations("morningBrief");
  const taskTimeline = useTranslations("taskTimeline");

  const coverageTexts = buildStockCoverageTexts(products);
  const texts = buildStockAlertTexts(t, coverageTexts);
  const views: StockAlertView[] = toStockAlertViews(
    alerts,
    locale,
    texts,
    windowDays,
    reorderRecommendations,
  );

  const leadTimeTexts = buildLeadTimeRiskTexts(t);
  const leadTimeViews = toLeadTimeRiskViews(leadTimeRisks, locale, leadTimeTexts);

  const priorityTexts = buildPurchasePriorityTexts(priority);
  const priorityViews = toPurchasePriorityViews(
    purchasePriorities,
    locale,
    priorityTexts,
  );

  const actionPlanTexts = buildPurchaseActionPlanTexts(t);
  const actionPlanRowViews = toPurchaseActionPlanRowViews(
    actionPlan.items,
    locale,
    actionPlanTexts,
  );
  const actionPlanSummary = toPurchaseActionPlanSummaryView(
    actionPlan,
    locale,
    actionPlanTexts,
  );
  const actionStatusTexts = buildPurchaseActionStatusTexts(t);
  const actionPlanProductIds = actionPlan.items.map((item) => item.productId);
  const morningBriefTexts = buildMorningBriefTexts(morningBrief);
  const taskTimelineTexts = buildTaskTimelineTexts(taskTimeline);
  /**
   * Ürün kimliğine göre ad haritası — `views`den (zaten `toStockAlertViews`
   * tarafından çevrilmiş) kurulur, ikinci bir çeviri yapılmaz. Task Timeline
   * satırları bu haritayı yalnızca `.get()` ile okur.
   */
  const productNames = new Map(views.map((view) => [view.productId, view.productName]));

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
        <PurchaseActionStatusProvider today={today}>
          <div className="flex flex-col gap-2">
            {/*
              SABAH ÖZETİ — planın 10-15 saniyelik özeti. Aşağıdaki plan
              kutusunun yerine geçmez, önüne geçer: "bugün ne durumdayım"
              sorusunun ilk cevabı burada, ayrıntı aşağıda.
            */}
            <MorningBriefSummary
              actionPlan={actionPlan}
              locale={locale}
              texts={morningBriefTexts}
              actionPlanRowViews={actionPlanRowViews}
            />

            {/*
              GÜNLÜK ZAMAN AKIŞI — planı gün içindeki ele alma sırasına göre
              gruplar. Morning Brief'in "ne durumdayım" cevabından sonra,
              aşağıdaki ayrıntılı plan/durum listesinden önce durur — akış
              tam olarak bu sırayı izler.
            */}
            <TaskTimeline
              actionPlan={actionPlan}
              locale={locale}
              texts={taskTimelineTexts}
              statusTexts={actionStatusTexts}
              productNames={productNames}
              actionPlanRowViews={actionPlanRowViews}
              priorityViews={priorityViews}
              leadTimeViews={leadTimeViews}
            />

            {/*
              BUGÜNÜN SATIN ALMA PLANI — kompakt özet. Sayılar
              `buildPurchaseActionPlan`in tek geçişte hazırladığı `summary`den
              gelir; burada `filter`/toplama yapılmaz. Plan boşsa (yalnızca
              `unknown` durumlu ürünler varsa) sakin, iddiasız bir cümle
              gösterilir — kart bozulmaz, mevcut boş durumla çelişmez.
            */}
            <div className="border-border bg-surface-muted rounded-lg border p-3">
              <p className="text-fg text-xs font-semibold">{actionPlanSummary.title}</p>
              {actionPlanSummary.hasActions ? (
                <ul className="text-fg-muted mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                  {actionPlanSummary.rows.map((row) => (
                    <li key={row.action}>{row.line}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-fg-muted mt-1 text-xs">
                  {actionPlanSummary.emptyText}
                </p>
              )}
              {/*
                Operasyon durumu özeti — kullanıcının kararlarının
                (yapıldı/ertelendi/yoksayıldı) dağılımı. Yukarıdaki özetin
                yerine geçmez, yanına eklenir: biri "ne öneriliyor" biri
                "kullanıcı ne yaptı" sorusuna cevap verir.
              */}
              <PurchaseActionStatusSummary
                productIds={actionPlanProductIds}
                texts={actionStatusTexts}
              />
            </div>

            <ul className="flex flex-col gap-2">
              {views.map((view) => {
                const priorityView = priorityViews.get(view.productId);
                const leadTimeView = leadTimeViews.get(view.productId);
                const actionView = actionPlanRowViews.get(view.productId);

                return (
                  <PurchaseActionStatusRow
                    key={view.productId}
                    productId={view.productId}
                    hasAction={actionView !== undefined}
                    texts={actionStatusTexts}
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
                          {actionView ? (
                            <Badge tone={actionView.tone}>
                              {actionView.actionLabel}
                            </Badge>
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
                        <p className="text-fg mt-1 text-sm font-medium">
                          {view.action}
                        </p>
                        {/* Satın alma öncelik motorunun cevabı: "ertelenirse ne
                          olur?" — negative/critical/low dışındaki (unknown)
                          satırlarda `priorityView` yok, bu yüzden gösterilmez. */}
                        {priorityView ? (
                          <p className="text-fg-muted mt-1 text-xs">
                            {priorityView.impact}
                          </p>
                        ) : null}

                        {/* Tedarik süresi riski: "ne kadar acil?" sorusunun
                          cevabı. `safe`/ölçülemeyen durumlarda `leadTimeView`
                          `visible: false` döner ve hiçbir şey basılmaz. */}
                        {leadTimeView?.visible ? (
                          <div className="mt-1">
                            <p
                              className={`text-xs font-medium ${LEAD_TIME_TEXT_TONE[leadTimeView.tone]}`}
                            >
                              {leadTimeView.message}
                            </p>
                            {leadTimeView.detail ? (
                              <p className="text-fg-subtle text-xs">
                                {leadTimeView.detail}
                              </p>
                            ) : null}
                          </div>
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
                  </PurchaseActionStatusRow>
                );
              })}
            </ul>

            <p className="text-fg-subtle px-1 text-xs">
              {coverageTexts.hint(windowDays)}
            </p>
          </div>
        </PurchaseActionStatusProvider>
      )}
    </SectionCard>
  );
}
