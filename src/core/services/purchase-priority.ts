import type { LeadTimeRisk, LeadTimeRiskState } from "./lead-time-risk";
import type { ReorderRecommendation } from "./reorder-suggestion";
import type { StockAlert, StockAlertLevel } from "./stock-alerts";

/**
 * SATIN ALMA ÖNCELİK MOTORU — "39 adet sipariş ver" listesini "önce hangisi"
 * sırasına çeviren katman.
 *
 * `stock-alerts.ts` zaten dört durumu (negative/critical/unknown/low)
 * önceliklendiriyor; `reorder-suggestion.ts` zaten adet öneriyor;
 * `lead-time-risk.ts` zaten "tedarik süresine göre ne kadar acil" sorusunu
 * cevaplıyor. Burada hiçbiri yeniden hesaplanmaz — üçünün çıktısı
 * **birleştirilir** ve satın alma kararına özgü bir sıraya dizilir. Yeni bir
 * puan sistemi icat edilmedi: sıralama tamamen mevcut alanların (durum,
 * tedarik süresi durumu, karar günü, kalan gün, hız, adet, stok, kimlik) çok
 * boyutlu karşılaştırmasıdır — `stock-alerts.ts`teki `compareCandidates` ile
 * aynı ruhta.
 *
 * Kapsam bilinçli olarak **üç** grupla sınırlı: `negative`, `critical`,
 * `low`. `unknown` dışarıda bırakıldı çünkü bu motor "ne kadar sipariş
 * vereyim" sorusuna cevap arıyor; stok verisi bilinmeyen bir üründe sipariş
 * kararı değil, veri düzeltme kararı var. O görev `stockAlerts` kartında zaten
 * duruyor, burada yeniden üretilmiyor.
 *
 * Tedarik süresi riski yalnızca **aynı stok alarm grubunun içinde** devreye
 * girer — üst seviye grup sırası (`negative` → `critical` → `low`) hiçbir
 * zaman lead-time durumuna göre bozulmaz. Bir üründe stok kaydı bozuksa
 * (`negative`), tedarik süresi ne olursa olsun önce o düzeltilir.
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

/**
 * Grup içi ikinci sıralama katmanı — talimatın kendisi. `late` en önde:
 * stok, tedarik süresi dolmadan tükeniyor demektir, bu andan itibaren her
 * gün kaybı büyütür. `safe` ölçülebilir dört durumun sonuncusu: tedarik
 * süresi açısından şu an acil bir şey yok.
 *
 * `unknownLeadTime` bilinçli olarak `safe`nin önünde: eksik tedarik süresi
 * bilgisi bir operasyon riski taşır, bunu "acil değil" ile aynı sıraya
 * koymak yanlış güven verir.
 *
 * `unmeasurable` son sırada: bu durum ya `negative` grubunda (stoğun kendisi
 * zaten en üst öncelikte, aralarında ayrım gereksiz) ya da `leadTimeRisks`
 * haritasında eşleşme bulunamadığında oluşur — her iki halde de en yüksek
 * aciliyeti iddia etmek anlamsız olurdu, bu yüzden güvenli/deterministik
 * biçimde en sona düşer.
 */
const LEAD_TIME_RANK: Record<LeadTimeRiskState, number> = {
  late: 0,
  dueToday: 1,
  upcoming: 2,
  unknownLeadTime: 3,
  safe: 4,
  unmeasurable: 5,
};

/**
 * `leadTimeRisks` haritasında eşleşme bulunamadığında kullanılan güvenli
 * geri dönüş — `lead-time-risk.ts`teki `unmeasurable` durumuyla aynı şekil.
 * En yüksek aciliyeti iddia etmek yerine grup içinde en sona düşer.
 */
const UNMEASURABLE_LEAD_TIME_RISK: LeadTimeRisk = {
  state: "unmeasurable",
  leadTimeDays: null,
  daysOfCover: null,
  shortageGapDays: null,
  orderDecisionDays: null,
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
  /**
   * `lead-time-risk.ts`teki `LeadTimeRiskBatch`ten okunur. `leadTimeRisks`
   * haritasında eşleşme yoksa `unmeasurable`e düşer — ikinci bir tedarik
   * süresi hesabı burada **yapılmaz**.
   */
  readonly leadTimeStatus: LeadTimeRiskState;
  /** Aynı kaynaktan: `LeadTimeRisk.orderDecisionDays`in olduğu gibi taşınması. */
  readonly orderDecisionDays: number | null;
  /** Aynı kaynaktan: `LeadTimeRisk.shortageGapDays`in olduğu gibi taşınması. */
  readonly shortageGapDays: number | null;
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

/**
 * `NaN`/`Infinity` sıralamaya asla sızmaz — `null` ile aynı muameleyi görür
 * ve deterministik olarak sona düşer, bir sonraki ölçüte devredilir.
 */
function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

/** Yalnızca ölçülebilir/finite değerlerde karşılaştırır (karar günü — az önce). */
function compareFiniteAscending(a: number | null, b: number | null): number {
  return compareAscending(finiteOrNull(a), finiteOrNull(b));
}

/** Yalnızca ölçülebilir/finite değerlerde karşılaştırır (boşluk günü — çok önce). */
function compareFiniteDescending(a: number | null, b: number | null): number {
  return compareDescending(finiteOrNull(a), finiteOrNull(b));
}

interface Candidate {
  readonly productId: string;
  readonly productName: string;
  readonly level: PurchasePriorityLevel;
  readonly stock: number;
  readonly daysRemaining: number | null;
  readonly dailyVelocity: number | null;
  readonly reorderQuantity: number | null;
  readonly leadTimeStatus: LeadTimeRiskState;
  readonly orderDecisionDays: number | null;
  readonly shortageGapDays: number | null;
}

/**
 * Sıralama: stok alarm grubu → tedarik süresi risk grubu → sipariş karar
 * günü (az/erken önce) → stok boşluğu günü (yalnızca `late`de anlamlı, çok
 * önce) → kalan gün (az önce) → satış hızı (çok önce) → önerilen sipariş
 * adedi (çok önce) → mevcut stok (az önce) → ürün kimliği (kararlı bağ
 * bozucu).
 *
 * İlk iki katman (`GROUP_RANK`, `LEAD_TIME_RANK`) talimatın kendisi — geri
 * kalanı Adım L'deki mevcut bağ bozucu zinciri, olduğu gibi korunur.
 */
function compareCandidates(a: Candidate, b: Candidate): number {
  const byGroup = GROUP_RANK[a.level] - GROUP_RANK[b.level];
  if (byGroup !== 0) return byGroup;

  const byLeadTime =
    LEAD_TIME_RANK[a.leadTimeStatus] - LEAD_TIME_RANK[b.leadTimeStatus];
  if (byLeadTime !== 0) return byLeadTime;

  const byOrderDecision = compareFiniteAscending(
    a.orderDecisionDays,
    b.orderDecisionDays,
  );
  if (byOrderDecision !== 0) return byOrderDecision;

  const byShortageGap = compareFiniteDescending(a.shortageGapDays, b.shortageGapDays);
  if (byShortageGap !== 0) return byShortageGap;

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
 * Katalogun satın alma önceliği — **tek geçiş**, forecast/reorder/tedarik
 * süresi riski yeniden hesaplanmaz.
 *
 * Girdiler `buildStockAlerts`, `buildReorderRecommendations` ve
 * `buildLeadTimeRisks`in çıktısıdır ve olduğu gibi okunur;
 * `dailyVelocity`/`reorderQuantity` yalnızca öneri `suggested` döndüyse
 * dolar, `leadTimeStatus`/`orderDecisionDays`/`shortageGapDays` yalnızca
 * `leadTimeRisks` haritasında eşleşme varsa doğrudan taşınır — hiçbiri burada
 * yeniden hesaplanmaz. Eşleştirme `productId` üzerinden `Map.get` ile
 * yapılır (O(1) başına, toplam O(n)); bu yüzden ürün başına ayrı bir arama
 * (O(n²)) hiç oluşmaz ve üç girdinin sırası sonucu etkilemez. Karmaşıklık
 * bütünüyle O(n log n)'dir — alt sınırı sıralama (`Array.prototype.sort`)
 * belirler, eşleştirme adımı değil.
 */
export function buildPurchasePriorities(
  alerts: readonly StockAlert[],
  reorderRecommendations: ReadonlyMap<string, ReorderRecommendation>,
  leadTimeRisks: ReadonlyMap<string, LeadTimeRisk>,
): readonly PurchasePriorityItem[] {
  const candidates: Candidate[] = [];

  for (const alert of alerts) {
    if (!isPurchasePriorityLevel(alert.level)) continue;

    const recommendation = reorderRecommendations.get(alert.productId);
    const suggested = recommendation?.kind === "suggested" ? recommendation : null;
    const risk = leadTimeRisks.get(alert.productId) ?? UNMEASURABLE_LEAD_TIME_RISK;

    candidates.push({
      productId: alert.productId,
      productName: alert.productName,
      level: alert.level,
      stock: alert.stock,
      daysRemaining: alert.daysRemaining,
      dailyVelocity: suggested?.dailyVelocity ?? null,
      reorderQuantity: suggested?.quantity ?? null,
      leadTimeStatus: risk.state,
      orderDecisionDays: risk.orderDecisionDays,
      shortageGapDays: risk.shortageGapDays,
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
