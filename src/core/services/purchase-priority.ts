import type { ReorderRecommendation } from "./reorder-suggestion";
import type { StockAlert, StockAlertLevel } from "./stock-alerts";

/**
 * SATIN ALMA ÖNCELİK MOTORU — "39 adet sipariş ver" listesini "önce hangisi"
 * sırasına çeviren katman.
 *
 * `stock-alerts.ts` zaten dört durumu (negative/critical/unknown/low)
 * önceliklendiriyor; `reorder-suggestion.ts` zaten adet öneriyor. Burada
 * hiçbiri yeniden hesaplanmaz — ikisinin çıktısı **birleştirilir** ve satın
 * alma kararına özgü bir sıraya dizilir. Yeni bir puan sistemi icat edilmedi:
 * sıralama tamamen mevcut alanların (durum, kalan gün, hız, adet, stok,
 * kimlik) çok boyutlu karşılaştırmasıdır — `stock-alerts.ts`teki
 * `compareCandidates` ile aynı ruhta.
 *
 * Kapsam bilinçli olarak **üç** grupla sınırlı: `negative`, `critical`,
 * `low`. `unknown` dışarıda bırakıldı çünkü bu motor "ne kadar sipariş
 * vereyim" sorusuna cevap arıyor; stok verisi bilinmeyen bir üründe sipariş
 * kararı değil, veri düzeltme kararı var. O görev `stockAlerts` kartında zaten
 * duruyor, burada yeniden üretilmiyor.
 */

/** Satın alma kararına giren üç durum — `StockAlertLevel`in alt kümesi. */
export type PurchasePriorityLevel = Extract<
  StockAlertLevel,
  "negative" | "critical" | "low"
>;

const PRIORITY_LEVELS: ReadonlySet<StockAlertLevel> = new Set<StockAlertLevel>([
  "negative",
  "critical",
  "low",
]);

function isPurchasePriorityLevel(
  level: StockAlertLevel,
): level is PurchasePriorityLevel {
  return PRIORITY_LEVELS.has(level);
}

/**
 * Grup sırası — talimatın kendisi. `negative` en önde: envanter kaydı bozuk
 * olduğu sürece bir sipariş adedi hesaplamanın anlamı yok. `critical`
 * `low`dan önde: tükenmeye daha yakın olan grup.
 */
const GROUP_RANK: Record<PurchasePriorityLevel, number> = {
  negative: 0,
  critical: 1,
  low: 2,
};

export interface PurchasePriorityItem {
  readonly productId: string;
  readonly productName: string;
  readonly level: PurchasePriorityLevel;
  readonly stock: number;
  /** Yalnızca critical/low durumunda dolu; negative'de `null`. */
  readonly daysRemaining: number | null;
  /**
   * `reorder-suggestion.ts`teki `suggested` önerisinden gelir. Öneri
   * üretilemediyse (`correctStock`/`needsStockData`/`none`) `null` — burada
   * ikinci bir hız hesabı **yapılmaz**.
   */
  readonly dailyVelocity: number | null;
  /** Aynı kaynaktan: yalnızca `suggested` önerisi varsa dolu. */
  readonly reorderQuantity: number | null;
  /** 1'den başlayan sıra — listedeki konumun kendisi. */
  readonly rank: number;
}

/** `null` sona düşer — küçükten büyüğe sıralarda (kalan gün, stok). */
function compareAscending(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/** `null` sona düşer — büyükten küçüğe sıralarda (hız, sipariş adedi). */
function compareDescending(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

interface Candidate {
  readonly productId: string;
  readonly productName: string;
  readonly level: PurchasePriorityLevel;
  readonly stock: number;
  readonly daysRemaining: number | null;
  readonly dailyVelocity: number | null;
  readonly reorderQuantity: number | null;
}

/**
 * Sıralama: grup → kalan gün (az önce) → satış hızı (çok önce) →
 * önerilen sipariş adedi (çok önce) → mevcut stok (az önce) →
 * ürün kimliği (kararlı bağ bozucu).
 */
function compareCandidates(a: Candidate, b: Candidate): number {
  const byGroup = GROUP_RANK[a.level] - GROUP_RANK[b.level];
  if (byGroup !== 0) return byGroup;

  const byDays = compareAscending(a.daysRemaining, b.daysRemaining);
  if (byDays !== 0) return byDays;

  const byVelocity = compareDescending(a.dailyVelocity, b.dailyVelocity);
  if (byVelocity !== 0) return byVelocity;

  const byQuantity = compareDescending(a.reorderQuantity, b.reorderQuantity);
  if (byQuantity !== 0) return byQuantity;

  const byStock = a.stock - b.stock;
  if (byStock !== 0) return byStock;

  return a.productId.localeCompare(b.productId);
}

/**
 * Katalogun satın alma önceliği — **tek geçiş**, forecast/reorder yeniden
 * hesaplanmaz.
 *
 * Girdiler `buildStockAlerts` ve `buildReorderRecommendations`in çıktısıdır
 * ve olduğu gibi okunur; `dailyVelocity`/`reorderQuantity` yalnızca öneri
 * `suggested` döndüyse dolar, aksi halde `null` kalır ve sıralama bir sonraki
 * ölçüte düşer.
 */
export function buildPurchasePriorities(
  alerts: readonly StockAlert[],
  reorderRecommendations: ReadonlyMap<string, ReorderRecommendation>,
): readonly PurchasePriorityItem[] {
  const candidates: Candidate[] = [];

  for (const alert of alerts) {
    if (!isPurchasePriorityLevel(alert.level)) continue;

    const recommendation = reorderRecommendations.get(alert.productId);
    const suggested = recommendation?.kind === "suggested" ? recommendation : null;

    candidates.push({
      productId: alert.productId,
      productName: alert.productName,
      level: alert.level,
      stock: alert.stock,
      daysRemaining: alert.daysRemaining,
      dailyVelocity: suggested?.dailyVelocity ?? null,
      reorderQuantity: suggested?.quantity ?? null,
    });
  }

  return candidates
    .sort(compareCandidates)
    .map((candidate, index): PurchasePriorityItem => ({
      ...candidate,
      rank: index + 1,
    }));
}

/**
 * `alerts`i satın alma önceliğine göre yeniden dizer.
 *
 * Önceliklendirilen (`negative`/`critical`/`low`) ürünler rütbe sırasıyla
 * en öne alınır; kapsam dışındaki (`unknown`) ürünler değişmeden, aralarındaki
 * göreli sırayı koruyarak sona kalır — `Array.prototype.sort` kararlı olduğu
 * için ikinci bir sıralama kuralı yazmaya gerek yok.
 *
 * Kartın kendisi sıralama yapmaz (`StockAlertsCard`); sıralama burada, tek
 * yerde biter ve kart aldığı sırayı olduğu gibi basar.
 */
export function orderStockAlertsByPriority(
  alerts: readonly StockAlert[],
  priorities: readonly PurchasePriorityItem[],
): readonly StockAlert[] {
  const rankOf = new Map(
    priorities.map((item) => [item.productId, item.rank] as const),
  );

  return [...alerts].sort((a, b) => {
    const rankA = rankOf.get(a.productId);
    const rankB = rankOf.get(b.productId);
    if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
    if (rankA !== undefined) return -1;
    if (rankB !== undefined) return 1;
    return 0;
  });
}
