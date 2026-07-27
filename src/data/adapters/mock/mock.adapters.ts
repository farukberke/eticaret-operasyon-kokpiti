import { todayIn, type DateRange, type IsoDate } from "@/core/domain";
import type {
  ClockPort,
  PriorityPort,
  ProductPort,
  ProfitPort,
  SalesPort,
  SignalPort,
} from "@/core/ports";
import { createAnalysisContext } from "@/core/services/analysis-context";
import { buildProductPerformance } from "@/core/services/inventory-analyzer";
import { detectOpportunities } from "@/core/services/opportunity-detector";
import { detectRisks } from "@/core/services/risk-detector";
import { buildPriorities } from "@/core/services/priority-engine";
import { buildProfitSummary, buildSalesSummary } from "@/core/services/summary-builder";

import { buildDataset } from "../../mock/seed";

/**
 * MOCK ADAPTER'LAR — portların v1 uygulaması.
 *
 * Kritik nokta: bu adapter'lar **hazır cevap uydurmaz**. Üretilmiş veriyi
 * çekirdek servislere verir ve gerçek hesabı yaptırır. Yarın Trendyol
 * adapter'ı geldiğinde değişen tek şey verinin kaynağı olacak; kâr formülü,
 * risk kuralları ve öncelik sıralaması aynı kodla çalışmaya devam edecek.
 *
 * Bu yüzden "mock" burada "sahte panel" değil, "sahte veri kaynağı" demek.
 */

/**
 * Mağazanın saat dilimi.
 *
 * "Bugün"ün tanımı buradan gelir. Sunucu UTC'de çalıştığı için doğrudan
 * `new Date()` okumak, İstanbul'da gece yarısıyla 03:00 arasındaki her
 * istekte günü bir geri kaydırırdı — ve son karar tarihi bugün olan bir iş
 * "yarın" grubuna düşerdi.
 *
 * Çok bölgeli mağazalar geldiğinde bu değer kullanıcı ayarından okunacak.
 */
export const STORE_TIME_ZONE = "Europe/Istanbul";

export const mockClock: ClockPort = {
  today(): IsoDate {
    return todayIn(STORE_TIME_ZONE);
  },
};

/** Her istek aynı bağlamı yeniden kurmasın diye gün + aralık bazlı önbellek. */
const contextCache = new Map<string, ReturnType<typeof createAnalysisContext>>();

function contextFor(range: DateRange) {
  const today = mockClock.today();
  const key = `${today}|${range.from}|${range.to}`;

  const cached = contextCache.get(key);
  if (cached) return cached;

  const context = createAnalysisContext({
    dataset: buildDataset(today),
    range,
    today,
  });
  contextCache.set(key, context);
  return context;
}

export const mockSalesPort: SalesPort = {
  async getSummary(range) {
    return buildSalesSummary(buildDataset(mockClock.today()), range);
  },
};

export const mockProfitPort: ProfitPort = {
  async getSummary(range) {
    return buildProfitSummary(buildDataset(mockClock.today()), range);
  },
};

export const mockProductPort: ProductPort = {
  async getPerformance(range) {
    return buildProductPerformance(buildDataset(mockClock.today()), range);
  },
};

export const mockSignalPort: SignalPort = {
  async getRisks(range) {
    return detectRisks(contextFor(range));
  },
  async getOpportunities(range) {
    return detectOpportunities(contextFor(range));
  },
};

export const mockPriorityPort: PriorityPort = {
  async getPriorities(range) {
    return buildPriorities(contextFor(range));
  },
};
