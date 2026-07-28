import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { selectionOf } from "@/core/services/analysis-window";
import {
  buildPeriodComparison,
  comparisonRangeOf,
  signalsAtStake,
} from "@/core/services/period-comparison";
import {
  buildPurchasePriorities,
  orderStockAlertsByPriority,
} from "@/core/services/purchase-priority";
import { buildLeadTimeRisks } from "@/core/services/lead-time-risk";
import { buildPurchaseActionPlan } from "@/core/services/purchase-action-plan";
import { buildReorderRecommendations } from "@/core/services/reorder-suggestion";
import { buildStockAlerts } from "@/core/services/stock-alerts";
import { buildStockForecasts } from "@/core/services/stock-forecast";
import { container } from "@/data/container";
import { Link } from "@/i18n/navigation";
import { CURRENCY, type Locale } from "@/i18n/routing";
import { formatMoney } from "@/lib/format";
import { AnalysisPicker } from "@/features/analysis/analysis-picker.client";
import {
  readAnalysisWindow,
  withAnalysisQuery,
  type SearchParamsRecord,
} from "@/features/analysis/analysis-params";
import { analysisRangeLabel } from "@/features/analysis/analysis-view";
import { buildSignalViews } from "@/features/signals/build-views";
import { SignalSummary } from "@/features/signals/signal-summary";
import { SectionCard } from "@/ui/patterns/section-card";

import { TaskStateProvider } from "@/features/tasks/task-state-provider.client";

import { CockpitQueue } from "./cockpit-queue.client";
import { ComparisonStat } from "./comparison-stat";
import { buildComparisonViews } from "./comparison-view";
import { ContextStrip } from "./context-strip";
import { DayLedger } from "./day-ledger.client";
import { MissingCostCard } from "./missing-cost-card";
import { StockAlertsCard } from "./stock-alerts-card";

/**
 * KOKPİT — "sabah aç, 30 saniyede ne yapacağını anla".
 *
 * Ekran bir rapor değil, bir **vardiya devri**. Yukarıdan aşağıya:
 *
 *   0. Eksik maliyet       → panelin kâr hesaplayabilmesinin ön koşulu
 *   1. Günün tek cümlesi   → kaç iş, ne kadar para, ne kadar acele
 *   2. Kuyruk              → yapılacak işler, dört soruya cevaplı
 *   3. Bağlam şeridi       → net kâr, marj, ciro (arka plan)
 *   4. Risk/fırsat özeti   → türe göre dağılım
 *   5. Defter              → kapattığın işlerin getirisi (kapanış notu)
 *
 * Sıfırıncı adım en üstte duruyor çünkü altındaki her rakam ona bağlı: alış
 * maliyeti eksik olduğu sürece kuyruğun "şu kadar kâr korunur" cümlesi de,
 * bağlam şeridindeki net kâr da eksik bir veri kümesinden konuşur.
 *
 * Bilinçli olarak burada OLMAYANLAR ve sebepleri:
 *
 * • **Trend grafiği.** Yumuşak bir 30 günlük çizgiye bakıp kimse karar
 *   vermez. Eskiden ekranın en büyük parçasıydı — yani karardan daha çok yer
 *   kaplıyordu. `/satis` ve `/kar` sayfalarında duruyor.
 * • **Sipariş sayısı.** Gurur metriği; hiçbir aksiyona bağlanmıyor.
 * • **Ürün tablosu.** En kötü ürünler zaten kuyrukta, en iyiler sadece
 *   keyif veriyordu. Tamamı `/urunler` sayfasında.
 *
 * Kokpitte aksiyon dışında ne varsa, aksiyonun yerini çalar.
 */

/**
 * Bölüm başlıklarındaki "Tümü →" bağlantısı.
 *
 * `href` metin: analiz penceresi sorgu olarak eklendiği için sabit rota
 * birleşimi yetmez. Detay sayfaları da aynı pencereyi görsün diye bağlantı
 * `withAnalysisQuery` ile kuruluyor.
 */
function DetailLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-accent inline-flex items-center gap-1 text-xs font-medium hover:underline"
    >
      {label}
      <ArrowRight className="size-3" aria-hidden />
    </Link>
  );
}

export async function CockpitPage({
  locale,
  searchParams,
}: {
  locale: Locale;
  /** Analiz penceresi adres çubuğunda yaşar; sunucu onu buradan okur. */
  searchParams: SearchParamsRecord;
}) {
  const today = container.clock.today();

  /**
   * Ekranın tek tarih hesabı. Aşağıdaki altı port çağrısı da, eksik maliyet
   * kartı da, kartın bağlantılarının götürdüğü ekranlar da aynı `range`i
   * kullanır — hiçbiri kendi aralığını üretmez.
   */
  const analysisWindow = readAnalysisWindow(searchParams, today);
  const range = analysisWindow.range;
  const selection = selectionOf(analysisWindow);

  /**
   * Karşılaştırma penceresi seçili pencereden **türetilir**, ayrıca seçilmez:
   * adres çubuğuna ikinci bir tarih aralığı yazmak, kullanıcıya cevabını
   * bilmediği bir soru sormak ve iki aralığın kayması riskini almak olurdu.
   */
  const previousRange = comparisonRangeOf(range);

  /**
   * Portlar birbirinden bağımsız; hepsi paralel çekilir.
   *
   * Önceki dönemin iki çağrısı (risk + fırsat) **tek bir analiz bağlamı**
   * kurar: adapter bağlamı aralık anahtarıyla istek başına önbelleğe alıyor.
   * Net kâr ve ciro için üçüncü bir çağrı yok — `SalesSummary` ve
   * `ProfitSummary` önceki dönemin toplamlarını trend alanlarında zaten
   * taşıyor.
   */
  const [
    priorities,
    risks,
    opportunities,
    sales,
    profit,
    missingCosts,
    previousRisks,
    previousOpportunities,
    productPerformance,
  ] = await Promise.all([
    container.priorities.getPriorities(range),
    container.signals.getRisks(range),
    container.signals.getOpportunities(range),
    container.sales.getSummary(range),
    container.profit.getSummary(range),
    // Maliyet ekranıyla **aynı** port, aynı aralık: iki ekran aynı kuyruğu
    // görsün diye rapor burada yeniden hesaplanmıyor.
    container.costInsights.getMissingCosts(range),
    container.signals.getRisks(previousRange),
    container.signals.getOpportunities(previousRange),
    /**
     * Ek port çağrısı: stok uyarısı kartı, risk motorunun görmediği durumları
     * (düşük, negatif, bilinmeyen stok) da göstermek zorunda ve bunlar
     * `ProductPerformance`den — maliyetten değil — türüyor. `/products`
     * sayfası zaten aynı çağrıyı yapıyor; kokpit onu tekrar kullanıyor.
     */
    container.products.getPerformance(range),
  ]);

  /**
   * Stok tahmini tek yerde hesaplanır (`buildStockForecasts`) ve hem
   * uyarı listesi hem de — ürün sayfasına gidildiğinde — tablo aynı
   * çıktıyı okur; burada yeniden hesaplanmaz.
   */
  const stockForecasts = buildStockForecasts(productPerformance, range);
  const stockAlerts = buildStockAlerts(productPerformance, stockForecasts);
  /**
   * Aynı tek geçiş ilkesi: öneri `stockForecasts`i olduğu gibi okur, tahmini
   * yeniden hesaplamaz. Kritik/düşük dışındaki ürünler için de üretiliyor
   * (harita tüm katalogu kapsıyor) ama yalnızca kart bu satırları kullanıyor.
   */
  const reorderRecommendations = buildReorderRecommendations(
    productPerformance,
    stockForecasts,
  );
  /**
   * Aynı tek geçiş ilkesi: tedarik süresi riski `stockForecasts`i olduğu
   * gibi okur, tahmini yeniden hesaplamaz. Satın alma önceliği aşağıda bu
   * çıktıyı — aynı grup içindeki ikinci sıralama katmanı olarak — okur.
   */
  const leadTimeRisks = buildLeadTimeRisks(productPerformance, stockForecasts);
  /**
   * Satın alma önceliği — `stockAlerts`, `reorderRecommendations` ve
   * `leadTimeRisks`i olduğu gibi okur, hiçbirini yeniden hesaplamaz. Kartın
   * gördüğü `alerts` burada, tek yerde, rütbeye göre dizilir; kart kendisi
   * sıralama yapmaz.
   */
  const purchasePriorities = buildPurchasePriorities(
    stockAlerts,
    reorderRecommendations,
    leadTimeRisks.byProduct,
  );
  const orderedStockAlerts = orderStockAlertsByPriority(
    stockAlerts,
    purchasePriorities,
  );
  /**
   * Günlük satın alma eylem planı — `purchasePriorities` ve
   * `reorderRecommendations`i olduğu gibi okur, rütbeyi yeniden kurmaz.
   * Kartın gördüğü eylem rozeti ve kompakt özet burada, tek yerde biter.
   */
  const purchaseActionPlan = buildPurchaseActionPlan(
    purchasePriorities,
    reorderRecommendations,
  );

  const [t, common, comparisonMessages] = await Promise.all([
    getTranslations("cockpit"),
    getTranslations("common"),
    getTranslations("comparison"),
  ]);

  /**
   * Beş karşılaştırma, tek hesap.
   *
   * Alt bileşenlerin hiçbiri kendi farkını çıkarmaz: aynı sayıyı iki yerde
   * hesaplamak, bir gün iki farklı "önceki dönem" göstermenin en kestirme
   * yoluydu.
   */
  const comparisons = buildComparisonViews(
    buildPeriodComparison({
      range,
      sales,
      profit,
      risks,
      opportunities,
      previousRisks,
      previousOpportunities,
    }),
    locale,
    { comparison: comparisonMessages, common },
  );

  /**
   * Görünüm modelleri sunucuda hazırlanır: çeviri ve para biçimlendirmesi
   * burada biter, istemciye yalnızca düz metin iner.
   *
   * Kuyruğa **tüm** öncelikler verilir, ilk üçü değil — kullanıcı üstteki
   * işleri kapattıkça alttakiler yükselmeli ve "Tamamlanan" sekmesi ilk üçün
   * dışındakileri de gösterebilmeli.
   */
  const views = await buildSignalViews(
    priorities.map((action) => action.signal),
    locale,
  );

  return (
    /**
     * Kuyruk ve defter aynı görev durumunu paylaşır: bir iş kapatıldığında
     * ikisi de aynı anda güncellenmeli. Aradaki sunucu bileşenleri
     * (bağlam şeridi, dağılım kartları) `children` olarak geçtiği için
     * sunucuda render edilmeye devam eder.
     */
    <TaskStateProvider today={today}>
      <div className="flex flex-col gap-5">
        {/*
          ANALİZ DÖNEMİ — altındaki her rakamın hangi aralıktan geldiğini
          söyleyen satır. En üstte, çünkü "bu sayı ne kadarlık bir dönemin?"
          sorusu sayıyı okumadan önce cevaplanmalı.
        */}
        <AnalysisPicker
          window={analysisWindow}
          rangeLabel={analysisRangeLabel(analysisWindow, locale)}
        />

        {/* 0 — ÖNCE BUNLARI TAMAMLAYIN */}
        <MissingCostCard report={missingCosts} locale={locale} selection={selection} />

        {/* 1–2 — GÜNÜN CÜMLESİ + KUYRUK */}
        <CockpitQueue
          views={views}
          today={today}
          locale={locale}
          currency={CURRENCY}
          fullListHref={withAnalysisQuery("/priorities", selection)}
        />

        {/* 3 — BAĞLAM */}
        <ContextStrip
          sales={sales}
          profit={profit}
          locale={locale}
          comparisons={comparisons}
        />

        {/* 4 — DAĞILIM */}
        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard
            title={t("risksTitle")}
            description={t("risksDescription")}
            count={risks.length}
            action={
              risks.length > 0 ? (
                <DetailLink
                  href={withAnalysisQuery("/risks", selection)}
                  label={common("viewAll")}
                />
              ) : undefined
            }
            flush
          >
            {/*
              Toplam, dağılımın üstünde: "hangi türden kaç tane" sorusundan
              önce "toplamda ne kadar ve dün neye göre" cevaplanmalı. Boş
              durum bozulmuyor — sinyal yoksa toplam ₺0 ve altındaki
              `SignalSummary` yine "Risk yok" der.
            */}
            <ComparisonStat
              className="border-border border-b pt-0"
              label={t("riskTotal")}
              value={formatMoney(signalsAtStake(risks), locale)}
              comparison={comparisons.risk}
            />
            <div className="px-4 pb-2">
              <SignalSummary
                signals={risks}
                locale={locale}
                empty={{
                  title: t("noRisks"),
                  description: t("noRisksDescription"),
                }}
              />
            </div>
          </SectionCard>

          <SectionCard
            title={t("opportunitiesTitle")}
            description={t("opportunitiesDescription")}
            count={opportunities.length}
            action={
              opportunities.length > 0 ? (
                <DetailLink
                  href={withAnalysisQuery("/opportunities", selection)}
                  label={common("viewAll")}
                />
              ) : undefined
            }
            flush
          >
            <ComparisonStat
              className="border-border border-b pt-0"
              label={t("opportunityTotal")}
              value={formatMoney(signalsAtStake(opportunities), locale)}
              comparison={comparisons.opportunity}
            />
            <div className="px-4 pb-2">
              <SignalSummary
                signals={opportunities}
                locale={locale}
                tone="success"
                empty={{
                  title: t("noOpportunities"),
                  description: t("noOpportunitiesDescription"),
                }}
              />
            </div>
          </SectionCard>
        </div>

        {/*
          STOK UYARILARI — ürün tablosundaki tahminin operasyon karşılığı.
          Risk motorunun ürettiği `STOCKOUT_IMMINENT` yalnızca maliyeti bilinen
          ve kritik eşiğin altındaki ürünleri kapsar; burası düşük, negatif ve
          bilinmeyen stok durumlarını da gösterir. Liste satın alma öncelik
          motoruna göre dizilir: ilk görünen ürün gerçekten en yüksek
          öncelikli üründür.
        */}
        <StockAlertsCard
          alerts={orderedStockAlerts}
          windowDays={stockForecasts.windowDays}
          hasData={productPerformance.length > 0}
          locale={locale}
          selection={selection}
          reorderRecommendations={reorderRecommendations}
          purchasePriorities={purchasePriorities}
          leadTimeRisks={leadTimeRisks.byProduct}
          actionPlan={purchaseActionPlan}
        />

        {/* 5 — KAPANIŞ. Günün işi bittikten sonra okunacak not. */}
        <DayLedger today={today} locale={locale} />
      </div>
    </TaskStateProvider>
  );
}
