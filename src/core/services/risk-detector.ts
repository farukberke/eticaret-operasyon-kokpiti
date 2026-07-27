import { daysInRange } from "../domain/date-range";
import {
  absMoney,
  isNegativeMoney,
  multiplyMoney,
  subtractMoney,
  type Money,
} from "../domain/money";
import type { ProductPerformance } from "../domain/product";
import type { Evidence, Signal, SignalSubject } from "../domain/signal";

import {
  createSignal,
  orderDeadlineOf,
  perDayOf,
  todayDeadlineOf,
  weekDeadlineOf,
  type AnalysisContext,
} from "./analysis-context";

/**
 * RİSK DEDEKTÖRÜ — 7 kural.
 *
 * Her kural bağımsız bir fonksiyondur ve ya bir sinyal ya da `null` döner.
 * Bu biçim bilinçli: yeni bir risk eklemek, mevcut hiçbir koda dokunmadan
 * listeye bir fonksiyon eklemek demek. Kuralların birbirini ezme ihtimali yok.
 *
 * Eşiklerin tamamı `rules.config.ts` içinden gelir; burada çıplak sayı yoktur.
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 1) Stok tükeniyor.
 *
 * Bu kuralın para hesabı, panelin inandırıcılığının sınandığı yerdir.
 *
 * Yanlış yol (ve yaygın olanı): "30 gün stoksuz kalırsan şu kadar CİRO
 * kaçar". İki yönden birden abartır — satıcı 30 gün stoksuz beklemez ve
 * kaçan cironun tamamı kâr değildir. Fiyatı ₺2.450, marjı %22 olan bir üründe
 * bu iki hata birleşince gerçek kaybın ~25 katı bir rakam çıkar; satıcı ekrana
 * bir kez bakıp "saçmalıyor" der ve panelin hiçbir sayısına güvenmez.
 *
 * Dürüst yol: satıcı bugün sipariş verirse mal `tedarik süresi` kadar gün
 * sonra gelir. Elinde `stok yeterlilik günü` kadar mal var. Gerçekten
 * stoksuz kalacağı süre ikisinin farkıdır. Kaybettiği de ciro değil,
 * o adetlerden kazanacağı **birim kâr**.
 */
const stockoutImminent: ProductRule = (performance, context) => {
  const { stockoutDaysOfCover } = context.rules.risk;
  const { supplyLeadTimeDays } = context.rules.inventory;
  const cover = performance.daysOfCover;

  if (cover === null || cover >= stockoutDaysOfCover) return null;

  const daysWithoutStock = Math.max(0, supplyLeadTimeDays - cover);
  const lostProfit = multiplyMoney(
    performance.unitProfit,
    performance.dailyVelocity * daysWithoutStock,
  );
  // Bir gün geç sipariş vermek, stoksuz geçecek süreye bir gün ekler.
  const costOfOneDayDelay = multiplyMoney(
    performance.unitProfit,
    performance.dailyVelocity,
  );

  return createSignal({
    kind: "risk",
    code: "STOCKOUT_IMMINENT",
    subject: subjectOf(performance),
    moneyAtStake: lostProfit,
    dailyImpact: costOfOneDayDelay,
    deadline: orderDeadlineOf(cover, context),
    // 0 günde 10, eşikte 5: yaklaştıkça acilleşir.
    urgency: clamp(10 - (cover / stockoutDaysOfCover) * 5, 5, 10),
    evidence: [
      evidence("velocityVsStock", {
        perDay: Math.round(performance.dailyVelocity * 10) / 10,
        stock: performance.product.stock,
        days: Math.round(cover * 10) / 10,
      }),
      evidence("leadTimeGap", {
        leadDays: supplyLeadTimeDays,
        gapDays: Math.round(daysWithoutStock * 10) / 10,
      }),
    ],
    context,
  });
};

/**
 * 2) Ölü stok.
 * Dönem boyunca hiç satılmamış ama sermayeyi bağlayan ürün.
 */
const deadStock: ProductRule = (performance, context) => {
  const { deadStockMinValue } = context.rules.risk;
  const windowDays = daysInRange(context.range);

  if (performance.unitsSold > 0) return null;
  if (performance.product.stock <= 0) return null;
  if (performance.stockValue.minor < deadStockMinValue.minor) return null;

  return createSignal({
    kind: "risk",
    code: "DEAD_STOCK",
    subject: subjectOf(performance),
    moneyAtStake: performance.stockValue,
    // Acil değil ama para orada kilitli duruyor.
    urgency: 3,
    evidence: [
      evidence("noSalesInDays", {
        days: windowDays,
        stock: performance.product.stock,
        tiedCapital: performance.stockValue,
      }),
    ],
    context,
  });
};

/**
 * 3) Marj erozyonu.
 * İki ayrı yoldan tetiklenir: kritik seviyenin altına inme veya sert düşüş.
 */
const marginErosion: ProductRule = (performance, context) => {
  const { criticalMarginRatio, marginDropPoints } = context.rules.risk;
  const margin = performance.marginRatio;

  if (margin === null || performance.unitsSold === 0) return null;

  const previous = performance.previousMarginRatio;
  const dropPoints = previous !== null ? previous - margin : 0;

  const belowCritical = margin < criticalMarginRatio;
  const droppedSharply = dropPoints >= marginDropPoints;

  if (!belowCritical && !droppedSharply) return null;

  // Sağlıklı marja göre kaybedilen kâr.
  const referenceMargin = belowCritical
    ? criticalMarginRatio
    : (previous ?? criticalMarginRatio);
  const lostProfit = multiplyMoney(
    performance.netRevenue,
    Math.max(0, referenceMargin - margin),
  );

  return createSignal({
    kind: "risk",
    code: "MARGIN_EROSION",
    subject: subjectOf(performance),
    moneyAtStake: lostProfit,
    dailyImpact: perDayOf(lostProfit, context),
    // Fiyat ya da tedarik maliyeti gözden geçirilmeli — bugün patlamaz.
    deadline: weekDeadlineOf(context),
    urgency: belowCritical ? 7 : 6,
    evidence: [
      evidence("marginNow", { margin }),
      ...(previous !== null
        ? [evidence("marginWas", { margin: previous, dropPoints })]
        : []),
    ],
    context,
  });
};

/**
 * 4) Yüksek iade oranı.
 * Az sayıda siparişte oran gürültülü olduğu için minimum adet şartı var.
 *
 * Para hesabı: iade tutarının tamamı **kayıp değildir** — mal geri gelir ve
 * yeniden satılır. Gerçek kayıp, kabul edilebilir orandan fazla iade edilen
 * adetlerin getirmediği kârdır. İade tutarını kayıp yazmak, sorunu 20 kata
 * kadar abartır.
 */
const highReturnRate: ProductRule = (performance, context) => {
  const { maxReturnRate, returnRateMinUnits } = context.rules.risk;
  const rate = performance.returnRate;

  if (rate === null) return null;
  if (performance.unitsSold < returnRateMinUnits) return null;
  if (rate <= maxReturnRate) return null;

  const excessUnits = (rate - maxReturnRate) * performance.unitsSold;
  const lostProfit = multiplyMoney(performance.unitProfit, excessUnits);

  return createSignal({
    kind: "risk",
    code: "HIGH_RETURN_RATE",
    subject: subjectOf(performance),
    moneyAtStake: lostProfit,
    dailyImpact: perDayOf(lostProfit, context),
    // İlan görseli ve beden tablosu düzeltmesi bir haftalık iş.
    deadline: weekDeadlineOf(context),
    urgency: 5,
    evidence: [
      evidence("returnRate", {
        rate,
        returned: performance.unitsReturned,
        sold: performance.unitsSold,
      }),
      evidence("excessReturns", {
        excess: Math.round(excessUnits),
        threshold: maxReturnRate,
      }),
    ],
    context,
  });
};

/**
 * 5) Zararına satış.
 * Tüm giderler düşüldüğünde net kâr negatif — her satış zararı büyütüyor.
 */
const sellingAtLoss: ProductRule = (performance, context) => {
  if (performance.unitsSold === 0) return null;
  if (!isNegativeMoney(performance.netProfit)) return null;

  const loss = absMoney(performance.netProfit);

  return createSignal({
    kind: "risk",
    code: "SELLING_AT_LOSS",
    subject: subjectOf(performance),
    // Gerçekleşmiş zarar — tahmin değil, dönemde fiilen kaybedilen para.
    moneyAtStake: loss,
    dailyImpact: perDayOf(loss, context),
    // En acil kural: durdurulmadıkça her sipariş zararı artırır.
    // Tedarik takvimi yok ama karar bugüne ait.
    deadline: todayDeadlineOf(context),
    urgency: 9,
    evidence: [
      evidence("lossPerPeriod", {
        loss: absMoney(performance.netProfit),
        units: performance.unitsSold,
      }),
    ],
    context,
  });
};

/**
 * 6) Reklam sızıntısı.
 * Harcama var, dönüş harcamayı karşılamıyor (ROAS < 1).
 *
 * Masadaki para doğrudan **reklam bütçesinin kendisidir**: geri dönmeyen,
 * kampanya durdurulduğunda cebe kalacak tutar. Önceki hesap
 * (`harcama − ciro`) ROAS 1'e yakınken sıfıra çöküyor ve gerçek yangını
 * gizliyordu.
 */
const adSpendLeak: ProductRule = (performance, context) => {
  const { minRoas } = context.rules.risk;
  const roas = performance.roas;

  if (roas === null) return null;
  if (performance.adSpend.minor <= 0) return null;
  if (roas >= minRoas) return null;

  return createSignal({
    kind: "risk",
    code: "AD_SPEND_LEAK",
    subject: subjectOf(performance),
    moneyAtStake: performance.adSpend,
    dailyImpact: perDayOf(performance.adSpend, context),
    // Bütçe her gün yanıyor; kampanyayı durdurmak bugünün işi.
    deadline: todayDeadlineOf(context),
    urgency: 7,
    evidence: [
      evidence("roasBelowOne", {
        roas,
        spend: performance.adSpend,
        revenue: performance.netRevenue,
      }),
    ],
    context,
  });
};

const PRODUCT_RULES: readonly ProductRule[] = [
  stockoutImminent,
  deadStock,
  marginErosion,
  highReturnRate,
  sellingAtLoss,
  adSpendLeak,
];

/**
 * 7) Mağaza geneli kâr düşüşü.
 *
 * Ciroya değil kâra bakar. Ciro sabitken kârın erimesi (komisyon zammı,
 * artan reklam, ucuzlayan sepet) satıcı için ciro düşüşünden daha tehlikeli
 * ve daha sinsi bir durumdur — ciroya bakan panellerin tamamen kaçırdığı şey.
 */
function profitDrop(context: AnalysisContext): Signal | null {
  const { profitDropRatio } = context.rules.risk;
  const previous = context.previousStoreNetProfit;
  const current = context.storeNetProfit;

  if (previous.minor <= 0) return null;

  const change = (current.minor - previous.minor) / previous.minor;
  if (change > profitDropRatio) return null;

  const lost: Money = subtractMoney(previous, current);

  return createSignal({
    kind: "risk",
    code: "REVENUE_DROP",
    subject: { type: "store", label: "store" },
    moneyAtStake: lost,
    dailyImpact: perDayOf(lost, context),
    // Kategori incelemesi araştırma gerektirir; bu haftaya yazılır.
    deadline: weekDeadlineOf(context),
    urgency: 8,
    evidence: [evidence("profitChange", { change, current, previous })],
    context,
  });
}

/** Tüm risk kurallarını çalıştırır. Sıralama öncelik motorunun işidir. */
export function detectRisks(context: AnalysisContext): Signal[] {
  const signals: Signal[] = [];

  for (const performance of context.performance) {
    for (const rule of PRODUCT_RULES) {
      const signal = rule(performance, context);
      if (signal) signals.push(signal);
    }
  }

  const storeSignal = profitDrop(context);
  if (storeSignal) signals.push(storeSignal);

  return signals;
}
