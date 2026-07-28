/**
 * SABAH ÖZETİ (MORNING BRIEF) — günün satın alma operasyonunun kısa özeti.
 *
 * Yeni bir hesap değil: `purchase-action-plan.ts`in ürettiği planı ve
 * `purchase-action-status.ts`in tuttuğu kullanıcı kararını **özetler**.
 * Buradaki tipler yalnızca özet bilgisini temsil eder — rütbe, aksiyon türü,
 * miktar gibi hiçbir operasyon hesabı burada yeniden üretilmez ya da taşınmaz.
 */

/** Görünür özet satırı türleri — yalnızca sayısı > 0 olanlar üretilir. */
export type MorningBriefItemKind =
  /** Aktif (pending/snoozed) satın alma aksiyonu sayısı. */
  | "activeActions"
  /** Aktif aksiyonlar içinde stok durumu negative/critical olanlar. */
  | "criticalStock"
  /** Aktif aksiyonlar içinde tedarik süresi late/dueToday olanlar. */
  | "leadTimeRisk"
  | "completedActions"
  | "snoozedActions";

export interface MorningBriefItem {
  readonly kind: MorningBriefItemKind;
  readonly count: number;
}

/** Bugünün en yüksek öncelikli aktif (pending/snoozed) satın alma aksiyonu. */
export interface MorningBriefFocus {
  readonly productId: string;
  /** `PurchaseActionPlanItem.rank`in olduğu gibi taşınması. */
  readonly rank: number;
}

export interface MorningBriefSummary {
  readonly total: number;
  /** pending + snoozed — varsayılan görünümde görünen aksiyon sayısı. */
  readonly activeActions: number;
  readonly completedActions: number;
  readonly snoozedActions: number;
  readonly ignoredActions: number;
  /** Aktif aksiyonlar içinde stok ya da tedarik süresi açısından acil olanlar. */
  readonly criticalActions: number;
}

export interface MorningBrief {
  readonly summary: MorningBriefSummary;
  /** Yalnızca sayısı > 0 olan satırlar, sabit sırayla. */
  readonly items: readonly MorningBriefItem[];
  /** Aktif aksiyon yoksa `null`. */
  readonly focus: MorningBriefFocus | null;
}
