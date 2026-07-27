import { cache } from "react";

import {
  todayIn,
  type CostTable,
  type DateRange,
  type IsoDate,
  type Product,
  type StoreDataset,
} from "@/core/domain";
import type {
  ClockPort,
  PriorityPort,
  ProductPort,
  ProfitPort,
  SalesPort,
  SignalPort,
} from "@/core/ports";
import {
  createAnalysisContext,
  type AnalysisContext,
} from "@/core/services/analysis-context";
import { detectOpportunities } from "@/core/services/opportunity-detector";
import { detectRisks } from "@/core/services/risk-detector";
import { buildPriorities } from "@/core/services/priority-engine";
import { buildProfitSummary, buildSalesSummary } from "@/core/services/summary-builder";

import { costContainer } from "../../cost-container";
import { buildDataset } from "../../mock/seed";
import { mergeCostTables } from "../local/file-cost.adapter";

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

/**
 * Üretilmiş veriyi kullanıcının kaydettiği maliyetlerle birleştirir.
 *
 * Tohumlanan maliyetler bir başlangıç noktası; kullanıcı bir ürünü
 * düzenlediğinde onunki kazanır.
 */
async function datasetFor(today: IsoDate): Promise<StoreDataset> {
  const base = buildDataset(today);
  const saved = await costContainer.costs.load();
  return { ...base, costs: mergeCostTables(base.costs, saved) };
}

/**
 * Toplu içe aktarmanın ihtiyaç duyduğu iki şey: katalog ve **yürürlükteki**
 * maliyet kayıtları.
 *
 * Yürürlükteki, çünkü önizlemenin "mevcut değer" sütunu kullanıcının
 * kaydettiklerini de tohumlanan başlangıç verisini de içermeli — kâr hesabı
 * hangi tabloyu görüyorsa karşılaştırma da onu görmeli. Yalnızca kullanıcı
 * kayıtlarına bakmak, tohumlu bir maliyeti aynı değerle içe aktaran satırı
 * "değişecek" diye göstermek olurdu.
 */
export async function loadCostSource(): Promise<{
  readonly products: readonly Product[];
  readonly costs: CostTable;
}> {
  const dataset = await datasetFor(mockClock.today());
  return { products: dataset.products, costs: dataset.costs };
}

/**
 * Analiz bağlamı **istek başına** bir kez kurulur.
 *
 * Bir sayfa render'ı beş ayrı port çağırıyor (öncelikler, riskler, fırsatlar,
 * satış, kâr); hepsi aynı bağlamı paylaşmalı, yoksa aynı hesap beş kez
 * yapılır.
 *
 * Modül düzeyinde bir `Map` kullanmak burada **hataydı ve hata verdi**:
 * sunucu eylemleri ile sayfa bileşenleri farklı modül grafiklerinde
 * paketlenebiliyor, dolayısıyla eylemden yapılan "önbelleği temizle" çağrısı
 * sayfanın gördüğü örneğe ulaşmıyordu. Kullanıcı maliyeti kaydediyor,
 * maliyet ekranı güncelleniyor ama ürünler ve kâr sayfaları eski rakamlarda
 * kalıyordu.
 *
 * `React.cache` istek sınırında yaşar: istekler arasında hiçbir şey
 * taşınmaz, dolayısıyla bayat veri de olamaz.
 */
const contextFor = cache(async (from: string, to: string): Promise<AnalysisContext> => {
  const today = mockClock.today();
  return createAnalysisContext({
    dataset: await datasetFor(today),
    range: { from, to },
    today,
  });
});

const contextForRange = (range: DateRange): Promise<AnalysisContext> =>
  contextFor(range.from, range.to);

export const mockSalesPort: SalesPort = {
  async getSummary(range) {
    const context = await contextForRange(range);
    return buildSalesSummary(context.dataset, range, context.costs);
  },
};

export const mockProfitPort: ProfitPort = {
  async getSummary(range) {
    const context = await contextForRange(range);
    return buildProfitSummary(context.dataset, range, context.costs);
  },
};

export const mockProductPort: ProductPort = {
  async getPerformance(range) {
    return (await contextForRange(range)).performance;
  },
};

export const mockSignalPort: SignalPort = {
  async getRisks(range) {
    return detectRisks(await contextForRange(range));
  },
  async getOpportunities(range) {
    return detectOpportunities(await contextForRange(range));
  },
};

export const mockPriorityPort: PriorityPort = {
  async getPriorities(range) {
    return buildPriorities(await contextForRange(range));
  },
};
