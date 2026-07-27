import type { StoreDataset } from "../domain/dataset";
import {
  addDays,
  daysInRange,
  previousPeriod,
  type DateRange,
  type IsoDate,
} from "../domain/date-range";
import { ZERO_MONEY, multiplyMoney, type Money } from "../domain/money";
import type { CostCoverage } from "../domain/cost";
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
import { createCostResolver, type CostResolver } from "./cost-resolver";
import {
  aggregateCoverage,
  aggregateStore,
  netProfitOf,
  netRevenueOf,
} from "./profit-calculator";
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
  /** Dönemdeki gün sayısı — günlük etki hesaplarında paydadır. */
  readonly dayCount: number;
  /** Maliyet çözümleyici — dedektörler ve raporlar aynı örneği paylaşır. */
  readonly costs: CostResolver;
  readonly storeNetRevenue: Money;
  /** Maliyeti bilinen ürünlerin toplam net kârı. */
  readonly storeNetProfit: Money;
  readonly previousStoreNetProfit: Money;
  /** Kaç ürün ölçülemiyor ve ne kadar ciro kapsam dışı. */
  readonly coverage: CostCoverage;
}

export function createAnalysisContext(params: {
  dataset: StoreDataset;
  range: DateRange;
  today: IsoDate;
  rules?: RulesConfig;
}): AnalysisContext {
  const rules = params.rules ?? DEFAULT_RULES;

  // Çözümleyici analiz başına bir kez kurulur: 10 binden fazla sipariş satırı
  // için her aramanın yeniden indeks kurması görünür maliyet demek.
  const costs = createCostResolver(
    params.dataset.costs,
    new Map(params.dataset.products.map((p) => [p.id, p.category] as const)),
  );

  const current = aggregateStore(params.dataset, params.range, costs);
  const previous = aggregateStore(params.dataset, previousPeriod(params.range), costs);

  return {
    dataset: params.dataset,
    range: params.range,
    today: params.today,
    rules,
    costs,
    performance: buildProductPerformance(params.dataset, params.range, costs),
    dayCount: daysInRange(params.range),
    storeNetRevenue: netRevenueOf(current),
    // `aggregateStore` yalnızca ölçülebilir ürünleri topladığı için sonuç
    // her zaman hesaplanabilir; `?? ZERO_MONEY` savunma amaçlıdır.
    storeNetProfit: netProfitOf(current) ?? ZERO_MONEY,
    previousStoreNetProfit: netProfitOf(previous) ?? ZERO_MONEY,
    coverage: aggregateCoverage(params.dataset, params.range, costs),
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
  /** Gecikilen her günün maliyeti. Aciliyeti hissettiren türev. */
  dailyImpact?: Money;
  /** Kararın en geç verilmesi gereken gün. */
  deadline?: IsoDate;
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
    dailyImpact: params.dailyImpact,
    deadline: params.deadline,
    urgency,
    impact: impactOf(
      params.moneyAtStake,
      params.context.rules.priority.impactSaturation,
    ),
    evidence: params.evidence,
    detectedAt: params.context.today,
  };
}

/**
 * Stok kararının son günü.
 *
 * `stok yeterlilik günü − tedarik süresi` kadar gün sonra sipariş verilmelidir.
 *
 * Sonuç **geçmişe düşebilir ve düşmelidir**: stok 2 gün yetiyorsa ve tedarik
 * 7 gün sürüyorsa, sipariş 5 gün önce verilmeliydi. Önceki sürüm bu tarihi
 * bugüne kırpıyordu ve "gecikmiş" durumu hiç oluşamıyordu — oysa "Gecikti ·
 * 5 gün", "Son karar: bugün"den çok daha fazlasını anlatır: iş çoktan
 * kaçmıştır ve her gün daha da kötüleşmektedir.
 */
export function orderDeadlineOf(
  daysOfCover: number,
  context: AnalysisContext,
): IsoDate {
  const slack = daysOfCover - context.rules.inventory.supplyLeadTimeDays;
  return addDays(context.today, Math.floor(slack));
}

/**
 * "Bugün karar ver" — her gün para eriten sinyaller için.
 *
 * Zararına satış ve reklam sızıntısında beklemenin somut bir günlük bedeli
 * var; tedarik süresi gibi bir takvim kısıtı olmasa da karar bugüne aittir.
 */
export function todayDeadlineOf(context: AnalysisContext): IsoDate {
  return context.today;
}

/**
 * "Bu hafta ele al" — bugün patlamayan ama sürüncemede kalmaması gereken
 * işler (marj erozyonu, yüksek iade, sönen trend) için.
 */
export function weekDeadlineOf(context: AnalysisContext): IsoDate {
  return addDays(context.today, context.rules.inventory.decisionHorizonDays);
}

/** Dönem toplamını günlük orana çevirir. */
export function perDayOf(total: Money, context: AnalysisContext): Money {
  if (context.dayCount <= 0) return total;
  return multiplyMoney(total, 1 / context.dayCount);
}
