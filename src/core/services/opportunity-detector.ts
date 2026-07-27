import { isWithin } from "../domain/date-range";
import { addMoney, multiplyMoney } from "../domain/money";
import type { ProductPerformance } from "../domain/product";
import type { Evidence, Signal, SignalSubject } from "../domain/signal";

import {
  createSignal,
  orderDeadlineOf,
  type AnalysisContext,
} from "./analysis-context";
import { velocityChangeOf } from "./inventory-analyzer";

/**
 * FIRSAT DEDEKTÖRÜ — 5 kural.
 *
 * Risk dedektörüyle aynı biçimi kullanır (kural = saf fonksiyon → Signal | null),
 * aynı `createSignal` fabrikasından geçer ve aynı `Signal` tipini üretir.
 * Bu sayede kokpitte risk ve fırsat aynı bileşenle, aynı sıralamayla gösterilir.
 *
 * Not: plandaki "düşük görünürlük–yüksek dönüşüm" kuralı, gösterim (impression)
 * verisi olmadan hesaplanamadığı için aynı iş amacını taşıyan ölçülebilir bir
 * kuralla değiştirildi: HIGH_MARGIN_LOW_ADSPEND — "kazandırıyor ama hiç
 * desteklenmiyor". Gerçek reklam API'si bağlandığında özgün kural eklenebilir.
 */

type ProductRule = (
  performance: ProductPerformance,
  context: AnalysisContext,
) => Signal | null;

const subjectOf = (performance: ProductPerformance): SignalSubject => ({
  type: "product",
  id: performance.product.id,
  label: performance.product.name,
});

const evidence = (code: string, values: Evidence["values"]): Evidence => ({
  code,
  values,
});

/**
 * 1) Yükselen trend.
 * Satış hızı önceki döneme göre belirgin arttı — stok ve reklam kararı gerektirir.
 *
 * Kazanç, ek adetlerin **kârı** üzerinden hesaplanır; fiyatla çarpmak ciroyu
 * verir ve fırsatı olduğundan 4–5 kat büyük gösterirdi.
 */
const trendingUp: ProductRule = (performance, context) => {
  const { trendingUpRatio, trendingMinUnits } = context.rules.opportunity;
  const change = velocityChangeOf(performance);

  // Düşük hacimde yüzdeler yalan söyler: 4 adetten 6 adede çıkmak "%50 büyüme"
  // değil, gürültüdür.
  if (performance.unitsSold < trendingMinUnits) return null;
  if (change === null || change < trendingUpRatio) return null;

  const extraUnitsPerDay =
    performance.dailyVelocity - performance.previousDailyVelocity;
  const upside = multiplyMoney(
    performance.unitProfit,
    extraUnitsPerDay * context.rules.inventory.forecastHorizonDays,
  );

  return createSignal({
    kind: "opportunity",
    code: "TRENDING_UP",
    subject: subjectOf(performance),
    moneyAtStake: upside,
    dailyImpact: multiplyMoney(performance.unitProfit, extraUnitsPerDay),
    // Trend soğumadan hareket etmek gerekir.
    urgency: 6,
    evidence: [
      evidence("velocityGrowth", {
        growth: change,
        now: Math.round(performance.dailyVelocity * 10) / 10,
        before: Math.round(performance.previousDailyVelocity * 10) / 10,
      }),
    ],
    context,
  });
};

/**
 * 2) Stok tazeleme adayı.
 * Yüksek marjlı ve hızlı satan ürünün stoğu azalıyor.
 *
 * Kritik stok eşiğinin altındakiler bilinçli olarak dışarıda bırakılır:
 * onlar zaten STOCKOUT_IMMINENT riski olarak listede, iki kez görünmeleri
 * kokpiti gürültüye boğar.
 */
const restockWinner: ProductRule = (performance, context) => {
  const { winnerMarginRatio, restockDaysOfCover } = context.rules.opportunity;
  const { stockoutDaysOfCover } = context.rules.risk;
  const { supplyLeadTimeDays } = context.rules.inventory;

  const cover = performance.daysOfCover;
  const margin = performance.marginRatio;

  if (cover === null || margin === null) return null;
  if (margin < winnerMarginRatio) return null;
  if (cover < stockoutDaysOfCover || cover >= restockDaysOfCover) return null;

  /**
   * Bu üründe stok HENÜZ bitmedi — kural zaten kritik eşiğin üstünde
   * tetikleniyor. Dolayısıyla "şu an kaç gün açıktasın" diye sormak anlamsız;
   * doğru soru "hiçbir şey yapmazsam ne olur".
   *
   * Cevap: stok `cover` gün sonra biter, sipariş o gün verilse mal `tedarik
   * süresi` kadar sonra gelir. Yani tam bir tedarik süresi boyunca satış
   * yapılamaz. Şimdi sipariş vermenin değeri budur.
   */
  const upside = multiplyMoney(
    performance.unitProfit,
    performance.dailyVelocity * supplyLeadTimeDays,
  );

  return createSignal({
    kind: "opportunity",
    code: "RESTOCK_WINNER",
    subject: subjectOf(performance),
    moneyAtStake: upside,
    dailyImpact: multiplyMoney(performance.unitProfit, performance.dailyVelocity),
    deadline: orderDeadlineOf(cover, context),
    urgency: 6,
    evidence: [
      evidence("winnerRunningLow", {
        margin,
        days: Math.round(cover * 10) / 10,
        perDay: Math.round(performance.dailyVelocity * 10) / 10,
      }),
    ],
    context,
  });
};

/**
 * 3) Fiyat testi adayı.
 * Marj çok yüksekse fiyat esnekliği denenebilir.
 */
const priceTestCandidate: ProductRule = (performance, context) => {
  const { priceTestMarginRatio, priceTestUpliftRatio } = context.rules.opportunity;
  const margin = performance.marginRatio;

  if (margin === null || performance.unitsSold === 0) return null;
  if (margin < priceTestMarginRatio) return null;

  const upside = multiplyMoney(performance.netRevenue, priceTestUpliftRatio);

  return createSignal({
    kind: "opportunity",
    code: "PRICE_TEST_CANDIDATE",
    subject: subjectOf(performance),
    moneyAtStake: upside,
    // Acil değil; kaçmayan bir fırsat.
    urgency: 3,
    evidence: [evidence("highMargin", { margin, uplift: priceTestUpliftRatio })],
    context,
  });
};

/**
 * 4) Desteklenmeyen kazanan.
 * Marjı yüksek, kâr ediyor ama neredeyse hiç reklam bütçesi almıyor.
 */
const highMarginLowAdSpend: ProductRule = (performance, context) => {
  const { winnerMarginRatio, lowAdSpendRatio } = context.rules.opportunity;
  const margin = performance.marginRatio;

  if (margin === null || margin < winnerMarginRatio) return null;
  if (performance.unitsSold === 0) return null;
  if (performance.product.stock <= 0) return null;
  if (performance.netRevenue.minor <= 0) return null;

  const spendShare = performance.adSpend.minor / performance.netRevenue.minor;
  if (spendShare >= lowAdSpendRatio) return null;

  return createSignal({
    kind: "opportunity",
    code: "HIGH_MARGIN_LOW_ADSPEND",
    subject: subjectOf(performance),
    // Kanıtlanmış kazanç: bu ürün desteksiz haliyle bile bu kadar kâr etti.
    moneyAtStake: performance.netProfit,
    urgency: 4,
    evidence: [
      evidence("unsupportedWinner", {
        margin,
        spendShare,
        profit: performance.netProfit,
      }),
    ],
    context,
  });
};

const PRODUCT_RULES: readonly ProductRule[] = [
  trendingUp,
  restockWinner,
  priceTestCandidate,
  highMarginLowAdSpend,
];

/**
 * 5) Paket adayı.
 * Aynı siparişte sık birlikte geçen ürün çiftleri.
 *
 * Ürün bazlı değil, çift bazlı çalıştığı için ayrı ele alınır.
 */
function bundleCandidates(context: AnalysisContext): Signal[] {
  const { bundleMinCoOccurrence, bundleMaxSuggestions } = context.rules.opportunity;

  const counts = new Map<string, number>();

  for (const order of context.dataset.orders) {
    if (!isWithin(order.date, context.range)) continue;

    const ids = [...new Set(order.lines.map((line) => line.productId))].sort();
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const key = `${ids[i]}|${ids[j]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }

  const performanceById = new Map(
    context.performance.map((p) => [p.product.id, p] as const),
  );

  return (
    [...counts.entries()]
      .filter(([, count]) => count >= bundleMinCoOccurrence)
      // Deterministik sıra: önce sıklık, eşitlikte anahtar alfabetik.
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, bundleMaxSuggestions)
      .flatMap(([key, count]) => {
        const [firstId, secondId] = key.split("|");
        const first = firstId ? performanceById.get(firstId) : undefined;
        const second = secondId ? performanceById.get(secondId) : undefined;
        if (!first || !second) return [];

        // Paketin değeri, birlikte satılan adetlerin **kârı**. Fiyat toplamı
        // ciroyu verir ve öneriyi olduğundan kat kat büyük gösterirdi.
        const pairValue = multiplyMoney(
          addMoney(first.unitProfit, second.unitProfit),
          count,
        );

        return [
          createSignal({
            kind: "opportunity",
            code: "BUNDLE_CANDIDATE",
            subject: subjectOf(first),
            variant: second.product.id,
            moneyAtStake: pairValue,
            urgency: 2,
            evidence: [
              evidence("boughtTogether", {
                partner: second.product.name,
                count,
              }),
            ],
            context,
          }),
        ];
      })
  );
}

/** Tüm fırsat kurallarını çalıştırır. Sıralama öncelik motorunun işidir. */
export function detectOpportunities(context: AnalysisContext): Signal[] {
  const signals: Signal[] = [];

  for (const performance of context.performance) {
    for (const rule of PRODUCT_RULES) {
      const signal = rule(performance, context);
      if (signal) signals.push(signal);
    }
  }

  signals.push(...bundleCandidates(context));

  return signals;
}
