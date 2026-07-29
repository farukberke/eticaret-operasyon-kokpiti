/**
 * AKILLI İÇGÖRÜLER (SMART INSIGHTS) — hazır satın alma planı ve durum
 * kararlarındaki örüntülerin kısa semantic özeti.
 *
 * Yeni bir hesap değil: `purchase-action-plan.ts`in ürettiği plan ve
 * `purchase-action-status.ts`in tuttuğu kullanıcı kararı zaten "ne yapılmalı"
 * ve "kullanıcı ne yaptı" sorularını cevaplıyor. Buradaki tipler bu iki
 * kaynaktaki sinyalleri **sınıflandırıp adlandırır** — rütbe, aksiyon türü,
 * stok/tedarik süresi durumu gibi hiçbir operasyon hesabı burada yeniden
 * üretilmez ya da taşınmaz. `morning-brief.ts`/`task-timeline.ts` ile aynı
 * statüde bir sunum modeli: kardeş bir aggregation, ikisinin girdisi ya da
 * çıktısı değil.
 */

/**
 * Altı içgörü türü. `concentratedRisk` bilinçli olarak YOK: mevcut plan
 * yalnızca `productId` taşıyor, ürün kategorisi ya da mağaza segmenti yok —
 * bu veri olmadan "aynı segment planın önemli bölümünü oluşturuyor" demek
 * uydurma bir gruplama icat etmek olurdu.
 */
export type SmartInsightType =
  /** Aktif planda birden fazla negative/critical stok aksiyonu var. */
  | "criticalStockPressure"
  /** En yüksek öncelikli aktif aksiyon bugün hemen ele alınmalı (`actNow`). */
  | "urgentPurchaseFocus"
  /** Aktif planda late/dueToday tedarik süresi riski taşıyan aksiyon var. */
  | "leadTimeExposure"
  /** Kullanıcı en az bir aksiyonu ertelemiş. */
  | "snoozedActionBacklog"
  /** Kullanıcı en az bir aksiyonu tamamlanmış işaretlemiş. */
  | "executionProgress"
  /** Kritik/uyarı düzeyinde içgörü yok ve aktif aksiyon sayısı düşük. */
  | "operationsClear";

/** Presentation rengi değil — semantic önem sırası. Rozet/renk çevirisi view-model'de yapılır. */
export type SmartInsightSeverity = "critical" | "warning" | "positive" | "neutral";

/**
 * Bir içgörünün dayandığı ham kanıt. Her alan her zaman dolu (uygun değilse
 * `null`) — opsiyonel alan yerine açık `null` tercih edilir, tıpkı
 * `PurchaseActionPlanItem`teki gibi.
 */
export interface SmartInsightEvidence {
  /** İçgörüyü tetikleyen sayı — kritik ürün sayısı, ertelenmiş görev sayısı vb. */
  readonly count: number;
  /** Yalnızca `urgentPurchaseFocus`te dolu: odak ürünün rütbesi. */
  readonly rank: number | null;
}

export interface SmartInsight {
  /**
   * Deterministik kimlik — `smart-insight:{type}` ya da (ürüne bağlıysa)
   * `smart-insight:{type}:{productId}`. Rastgele UUID ya da `Date.now`
   * burada hiç kullanılmaz.
   */
  readonly id: string;
  readonly type: SmartInsightType;
  readonly severity: SmartInsightSeverity;
  /** Yalnızca `urgentPurchaseFocus`te dolu; diğerlerinde `null`. */
  readonly productId: string | null;
  /** İçgörüyü destekleyen ürünler — uygulanmıyorsa boş dizi. */
  readonly relatedProductIds: readonly string[];
  readonly evidence: SmartInsightEvidence;
}

export interface SmartInsightsSummary {
  readonly totalInsights: number;
  readonly criticalInsights: number;
  readonly warningInsights: number;
  readonly positiveInsights: number;
  readonly neutralInsights: number;
  /** Değerlendirmeye alınan aktif (pending/snoozed) aksiyon sayısı. */
  readonly activeRelatedActions: number;
}

export interface SmartInsightsBatch {
  /** Sabit önem sırasıyla (critical → warning → positive → neutral) dizili. */
  readonly insights: readonly SmartInsight[];
  readonly summary: SmartInsightsSummary;
}
