import type { StoreDataset } from "../domain/dataset";
import { previousPeriod, type DateRange, type IsoDate } from "../domain/date-range";
import type { Money } from "../domain/money";
import type { ProductPerformance } from "../domain/product";
import type {
  Evidence,
  Severity,
  Signal,
  SignalCode,
  SignalKind,
  SignalSubject,
} from "../domain/signal";

import { buildProductPerformance } from "./inventory-analyzer";
import { aggregateStore, netRevenueOf } from "./profit-calculator";
import { DEFAULT_RULES, type RulesConfig } from "./rules.config";

/**
 * Dedektörlerin ortak girdisi.
 *
 * Ürün performansı ve mağaza toplamları **bir kez** hesaplanıp burada
 * paylaşılır; risk ve fırsat dedektörlerinin aynı işi iki kez yapması
 * hem yavaş hem de iki motorun ayrışması riski demek olurdu.
 */
export interface AnalysisContext {
  readonly dataset: StoreDataset;
  readonly range: DateRange;
  readonly today: IsoDate;
  readonly rules: RulesConfig;
  readonly performance: readonly ProductPerformance[];
  readonly storeNetRevenue: Money;
  readonly previousStoreNetRevenue: Money;
}

export function createAnalysisContext(params: {
  dataset: StoreDataset;
  range: DateRange;
  today: IsoDate;
  rules?: RulesConfig;
}): AnalysisContext {
  const rules = params.rules ?? DEFAULT_RULES;

  return {
    dataset: params.dataset,
    range: params.range,
    today: params.today,
    rules,
    performance: buildProductPerformance(params.dataset, params.range),
    storeNetRevenue: netRevenueOf(aggregateStore(params.dataset, params.range)),
    previousStoreNetRevenue: netRevenueOf(
      aggregateStore(params.dataset, previousPeriod(params.range)),
    ),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Para tutarını 0–10 arası "etki" puanına çevirir.
 *
 * Logaritmik ölçek bilinçli. Taşıdığı özellik: **eşit oranlı büyümeler eşit
 * puan kazandırır** — ₺500→₺5.000 ile ₺50.000→₺500.000 aynı miktarda puan
 * ekler, çünkü ikisi de "on katına çıktı" demektir.
 *
 * Sonucu şu: tek bir büyük kalem listeyi ele geçiremez. Doğrusal ölçekte
 * ₺500.000'lik bir sinyal ₺5.000'lik sinyalden 100 kat puan alır ve acil ama
 * küçük işler kokpitte hiç görünmezdi.
 */
export function impactOf(moneyAtStake: Money, saturation: Money): number {
  const stake = Math.max(0, moneyAtStake.minor);
  const ceiling = Math.max(1, saturation.minor);
  return clamp((Math.log1p(stake) / Math.log1p(ceiling)) * 10, 0, 10);
}

/** Aciliyetten türetilir: "ne zaman canımı yakar" sorusunun cevabı. */
export function severityOf(urgency: number): Severity {
  if (urgency >= 8) return "critical";
  if (urgency >= 6) return "high";
  if (urgency >= 4) return "medium";
  return "low";
}

/**
 * Sinyal üretiminin tek kapısı.
 *
 * Her dedektör kuralı yalnızca "ne buldum, ne kadar acil, ne kadar para"
 * söyler; kimlik üretimi, etki puanı ve şiddet hesabı burada tek yerde yapılır.
 */
export function createSignal(params: {
  kind: SignalKind;
  code: SignalCode;
  subject: SignalSubject;
  moneyAtStake: Money;
  urgency: number;
  evidence: readonly Evidence[];
  context: AnalysisContext;
  /**
   * Aynı kod + aynı konu için birden fazla sinyal üretilebilen durumlarda
   * (ör. bir ürünün iki farklı paket adayı) kimliği ayrıştırır.
   */
  variant?: string;
}): Signal {
  const urgency = clamp(params.urgency, 0, 10);
  const subjectKey = params.subject.type === "product" ? params.subject.id : "store";
  const variantKey = params.variant ? `:${params.variant}` : "";

  return {
    // Deterministik kimlik: aynı veri her zaman aynı id üretir.
    // React liste anahtarları ve testler bu kararlılığa dayanır.
    id: `${params.code}:${subjectKey}${variantKey}`,
    kind: params.kind,
    code: params.code,
    severity: severityOf(urgency),
    subject: params.subject,
    moneyAtStake: params.moneyAtStake,
    urgency,
    impact: impactOf(
      params.moneyAtStake,
      params.context.rules.priority.impactSaturation,
    ),
    evidence: params.evidence,
    detectedAt: params.context.today,
  };
}
