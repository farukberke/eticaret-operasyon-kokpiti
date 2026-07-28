import type { LeadTimeRiskState } from "./lead-time-risk";
import type { PurchasePriorityItem, PurchasePriorityLevel } from "./purchase-priority";
import type { ReorderRecommendation } from "./reorder-suggestion";

/**
 * GÜNLÜK SATIN ALMA EYLEM PLANI — "1. sıradasın" cümlesini "ne yapmalıyım"
 * cümlesine çevirir.
 *
 * `stock-alerts.ts`, `reorder-suggestion.ts`, `lead-time-risk.ts` ve
 * `purchase-priority.ts` zaten kapsamı belirledi (negative/critical/low),
 * adedi önerdi, aciliyeti ölçtü ve sırayı kurdu. Bu servis hiçbirini yeniden
 * hesaplamaz: girdisi `buildPurchasePriorities`in çıktısıdır — o çıktı zaten
 * `StockAlertBatch` ve `LeadTimeRiskBatch`i birleştirmiş durumda (`level`,
 * `daysRemaining`, `leadTimeStatus`, `orderDecisionDays`, `shortageGapDays`
 * oradan aynen taşınır). İkinci girdi `ReorderRecommendationBatch`tir ve
 * yalnızca miktarı dürüstçe yansıtmak için `productId` başına okunur.
 *
 * Üretilen tek şey **sınıflandırma**: aynı rütbeli listenin her satırına
 * "bugün ne yapmalıyım" sorusuna cevap veren bir `action` ve bunun tek
 * cümlelik yapılandırılmış gerekçesi (`reason`) eklenir. Sıra hiç
 * dokunulmaz — `priorities` zaten rütbeye göre dizili gelir, burada
 * `Array.prototype.sort` hiç çağrılmaz.
 */

/**
 * Beş eylem türü. `none` bilinçli olarak YOK: bu servisin girdisi
 * (`PurchasePriorityItem[]`) zaten yalnızca negative/critical/low'u
 * kapsıyor — normal/high/noSales/unknown ürünler `buildPurchasePriorities`
 * aşamasında elenmiş durumda. Dolayısıyla "plana dahil edilmemesi gereken
 * ürün" durumu burada hiç üretilmez, üretmek yerine baştan girmez.
 */
export type PurchaseActionKind =
  /** Karar gecikmiş ya da stok riski ölçülebilir biçimde çok yüksek. */
  | "actNow"
  /** Sipariş kararı bugün ele alınmalı. */
  | "decideToday"
  /** Henüz geç değil, ama karar penceresi yaklaşıyor. */
  | "planSoon"
  /** Satın alma kararından önce eksik veri tamamlanmalı. */
  | "completeData"
  /** Yukarıdaki dört duruma güvenli biçimde yerleştirilemiyor. */
  | "review";

/**
 * Sekiz yapılandırılmış gerekçe kodu — serbest metin core serviste
 * üretilmez, çeviri `features/cockpit/purchase-action-plan-view.ts`nin işi.
 * Birincil gerekçe deterministik seçilir (bkz. `reasonFor`).
 */
export type PurchaseActionReasonCode =
  | "stockAlreadyNegative"
  | "leadTimeAlreadyLate"
  | "orderDueToday"
  | "decisionWindowApproaching"
  | "leadTimeMissing"
  | "stockDataMissing"
  | "criticalStock"
  | "lowStock";

export interface PurchaseActionPlanItem {
  readonly productId: string;
  /** `PurchasePriorityItem.rank`in olduğu gibi taşınması — burada yeniden sıralanmaz. */
  readonly rank: number;
  readonly action: PurchaseActionKind;
  /**
   * Yalnızca `ReorderRecommendation.kind === "suggested"` ise dolu.
   * `correctStock`/`needsStockData`/`none` durumlarında miktar uydurulmaz.
   */
  readonly recommendedQuantity: number | null;
  readonly alertState: PurchasePriorityLevel;
  readonly leadTimeState: LeadTimeRiskState;
  readonly daysRemaining: number | null;
  readonly orderDecisionDays: number | null;
  readonly shortageGapDays: number | null;
  readonly reason: PurchaseActionReasonCode;
}

export interface PurchaseActionPlanSummary {
  readonly total: number;
  readonly actNowCount: number;
  readonly decideTodayCount: number;
  readonly planSoonCount: number;
  readonly completeDataCount: number;
  readonly reviewCount: number;
}

export interface PurchaseActionPlanBatch {
  /** `priorities` ile birebir aynı sırada — rütbe (`rank`) tek sıralama kaynağı. */
  readonly items: readonly PurchaseActionPlanItem[];
  readonly summary: PurchaseActionPlanSummary;
}

/** `NaN`/`Infinity` asla dışarı sızmaz — girdi zaten temiz gelir, bu ikinci bir savunma satırı. */
function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

/**
 * Önerilen miktar yalnızca gerçekten `suggested` ise ve pozitif/sonluysa
 * dışarı çıkar. `correctStock`/`needsStockData`/`none` için `null` —
 * quantity burada **hiç hesaplanmaz**, yalnızca doğrulanır.
 */
function recommendedQuantityFor(
  recommendation: ReorderRecommendation | undefined,
): number | null {
  if (!recommendation || recommendation.kind !== "suggested") return null;
  const quantity = recommendation.quantity;
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

/**
 * Eylem + birincil gerekçe kararı.
 *
 * Öncelik sırası:
 * 1. Reorder önerisinin kendisi "veri eksik" diyorsa (`needsStockData`) —
 *    hangi stok alarm grubunda olursa olsun, hiçbir satın alma kararı bu
 *    veri tamamlanmadan verilemez.
 * 2. `negative` grubu — envanter kaydı bozuk olduğu sürece tedarik süresi
 *    durumu ne olursa olsun önce o düzeltilir (`purchase-priority.ts`teki
 *    aynı ilke). Öneri gerçekten `suggested` döndüyse (mevcut sistemde
 *    negative için hiç olmaz, ama servis bunu **varsaymaz**, olduğu gibi
 *    okur) `actNow`; aksi halde `completeData`.
 * 3. Geriye yalnızca `critical`/`low` kalır — tedarik süresi durumu
 *    zaman çizelgesini belirler: `late` → `actNow`, `dueToday` →
 *    `decideToday`, `upcoming` → `planSoon`, `unknownLeadTime` →
 *    `completeData`. `safe` ve `unmeasurable` acil bir zaman çizelgesi
 *    iddia etmez: `safe` mevcut stok alarmına göre `planSoon`, `unmeasurable`
 *    (yalnızca haritada eşleşme yoksa oluşan savunma durumu) `review`e
 *    düşer — en yükseğe asla atlamaz.
 */
function decide(
  item: PurchasePriorityItem,
  recommendation: ReorderRecommendation | undefined,
): { readonly action: PurchaseActionKind; readonly reason: PurchaseActionReasonCode } {
  if (recommendation?.kind === "needsStockData") {
    return { action: "completeData", reason: "stockDataMissing" };
  }

  if (item.level === "negative") {
    return recommendation?.kind === "suggested"
      ? { action: "actNow", reason: "stockAlreadyNegative" }
      : { action: "completeData", reason: "stockAlreadyNegative" };
  }

  const fallbackReason: PurchaseActionReasonCode =
    item.level === "critical" ? "criticalStock" : "lowStock";

  switch (item.leadTimeStatus) {
    case "late":
      return { action: "actNow", reason: "leadTimeAlreadyLate" };
    case "dueToday":
      return { action: "decideToday", reason: "orderDueToday" };
    case "upcoming":
      return { action: "planSoon", reason: "decisionWindowApproaching" };
    case "unknownLeadTime":
      return { action: "completeData", reason: "leadTimeMissing" };
    case "safe":
      return { action: "planSoon", reason: fallbackReason };
    case "unmeasurable":
      return { action: "review", reason: fallbackReason };
  }
}

const EMPTY_COUNTS: Record<PurchaseActionKind, number> = {
  actNow: 0,
  decideToday: 0,
  planSoon: 0,
  completeData: 0,
  review: 0,
};

/**
 * Günlük satın alma eylem planı — **tek geçiş**, forecast/reorder/tedarik
 * süresi/satın alma önceliği hiçbiri yeniden hesaplanmaz.
 *
 * `priorities` zaten `PurchasePriorityItem.rank`e göre dizili gelir (bkz.
 * `buildPurchasePriorities`) ve bu sıra **olduğu gibi** korunur — burada
 * `Array.prototype.sort` çağrılmaz. `reorderRecommendations` yalnızca
 * `productId` üzerinden `Map.get` ile okunur (O(1) başına, toplam O(n));
 * girdilerin herhangi birinin sırası (dizi ya da `Map` ekleme sırası)
 * sonucu etkilemez.
 */
export function buildPurchaseActionPlan(
  priorities: readonly PurchasePriorityItem[],
  reorderRecommendations: ReadonlyMap<string, ReorderRecommendation>,
): PurchaseActionPlanBatch {
  const counts: Record<PurchaseActionKind, number> = { ...EMPTY_COUNTS };

  const items: PurchaseActionPlanItem[] = priorities.map((item) => {
    const recommendation = reorderRecommendations.get(item.productId);
    const { action, reason } = decide(item, recommendation);
    counts[action] += 1;

    return {
      productId: item.productId,
      rank: item.rank,
      action,
      recommendedQuantity: recommendedQuantityFor(recommendation),
      alertState: item.level,
      leadTimeState: item.leadTimeStatus,
      daysRemaining: finiteOrNull(item.daysRemaining),
      orderDecisionDays: finiteOrNull(item.orderDecisionDays),
      shortageGapDays: finiteOrNull(item.shortageGapDays),
      reason,
    };
  });

  return {
    items,
    summary: {
      total: items.length,
      actNowCount: counts.actNow,
      decideTodayCount: counts.decideToday,
      planSoonCount: counts.planSoon,
      completeDataCount: counts.completeData,
      reviewCount: counts.review,
    },
  };
}
