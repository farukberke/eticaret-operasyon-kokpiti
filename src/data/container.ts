import { lastDays, type DateRange } from "@/core/domain";
import type {
  ClockPort,
  PriorityPort,
  ProductPort,
  ProfitPort,
  SalesPort,
  SignalPort,
} from "@/core/ports";

import {
  loadCostSource,
  mockClock,
  mockPriorityPort,
  mockProductPort,
  mockProfitPort,
  mockSalesPort,
  mockSignalPort,
} from "./adapters/mock/mock.adapters";

/**
 * Toplu maliyet içe aktarmanın kaynak verisi (katalog + yürürlükteki
 * kayıtlar). Port değil çünkü bir *sorgu* değil, adapter'ın kendi verisine
 * bakış — gerçek entegrasyonda da aynı yerden gelecek.
 */
export { loadCostSource };

/**
 * BAĞIMLILIK KONTEYNERİ — mimarinin tek anahtarı.
 *
 * Gerçek pazaryeri entegrasyonu geldiğinde değişecek dosya **budur ve
 * yalnızca budur**. Aşağıdaki altı satır `trendyol*Port` olarak değişir;
 * `src/core`, `src/ui` ve `src/features` içinde tek satır dokunulmaz.
 *
 * Arayüz katmanı hiçbir zaman `adapters/` klasörünü doğrudan import etmez —
 * ESLint katman kuralı buna zaten izin vermez.
 */
export interface Container {
  readonly clock: ClockPort;
  readonly sales: SalesPort;
  readonly profit: ProfitPort;
  readonly products: ProductPort;
  readonly signals: SignalPort;
  readonly priorities: PriorityPort;
}

export const container: Container = {
  clock: mockClock,
  sales: mockSalesPort,
  profit: mockProfitPort,
  products: mockProductPort,
  signals: mockSignalPort,
  priorities: mockPriorityPort,
};

/**
 * Panelin varsayılan analiz penceresi.
 *
 * 30 gün bilinçli: 7 gün haftalık dalgalanmada gürültülü, 90 gün ise dünün
 * sorununu ortalamanın içinde kaybediyor. 30 gün, "bu ay nasıl gidiyoruz"
 * sorusuna cevap verirken trendleri de görünür kılıyor.
 */
export const DEFAULT_ANALYSIS_DAYS = 30;

export function defaultRange(): DateRange {
  return lastDays(container.clock.today(), DEFAULT_ANALYSIS_DAYS);
}
