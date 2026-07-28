import type { DateRange } from "@/core/domain";
import {
  analysisPresetDays,
  defaultAnalysisWindow,
  DEFAULT_ANALYSIS_PRESET,
} from "@/core/services/analysis-window";
import type {
  ClockPort,
  CostInsightPort,
  PriorityPort,
  ProductPort,
  ProfitPort,
  SalesPort,
  SignalPort,
} from "@/core/ports";

import {
  loadCostSource,
  mockClock,
  mockCostInsightPort,
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
  readonly costInsights: CostInsightPort;
}

export const container: Container = {
  clock: mockClock,
  sales: mockSalesPort,
  profit: mockProfitPort,
  products: mockProductPort,
  signals: mockSignalPort,
  priorities: mockPriorityPort,
  costInsights: mockCostInsightPort,
};

/**
 * Panelin varsayılan analiz penceresi.
 *
 * Gün sayısı da aralık da `core/services/analysis-window` içinden geliyor:
 * kullanıcı bir dönem seçmediğinde görünen aralık ile seçicideki "Son 30 gün"
 * seçeneğinin ürettiği aralık **aynı kodun** çıktısı olmalı, yoksa varsayılan
 * ekran ile açıkça seçilmiş varsayılan farklı veri gösterebilir.
 */
export const DEFAULT_ANALYSIS_DAYS = analysisPresetDays(DEFAULT_ANALYSIS_PRESET) ?? 30;

/**
 * Dönem seçicisi olmayan ekranların aralığı.
 *
 * Seçiciyi taşıyan ekranlar bunun yerine adresten okunan pencereyi kullanır
 * (`readAnalysisWindow`); ikisi de aynı çözümleyiciye dayanır.
 */
export function defaultRange(): DateRange {
  return defaultAnalysisWindow(container.clock.today()).range;
}
