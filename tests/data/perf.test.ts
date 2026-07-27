import { describe, expect, it } from "vitest";

import { lastDays } from "@/core/domain";
import { createAnalysisContext } from "@/core/services/analysis-context";
import { buildProfitSummary } from "@/core/services/summary-builder";
import { buildDataset } from "@/data/mock/seed";

/**
 * PERFORMANS SINIRI.
 *
 * Maliyet çözümleme her sipariş satırında çalışıyor. Naif bir uygulama
 * (her aramada indeksi yeniden kurmak ya da dizi taramak) 10 binden fazla
 * satırda görünür yavaşlama üretirdi. Bu test o sınırı bekçiye bağlar.
 */
const TODAY = "2026-07-27";

describe("Maliyet çözümleme performansı", () => {
  it("tam analiz makul sürede tamamlanır", () => {
    const dataset = buildDataset(TODAY);
    const range = lastDays(TODAY, 30);

    const started = performance.now();
    const context = createAnalysisContext({ dataset, range, today: TODAY });
    buildProfitSummary(dataset, range, context.costs);
    const elapsed = performance.now() - started;

    console.log(
      `analiz: ${elapsed.toFixed(0)}ms · ${dataset.orders.length} siparis · ` +
        `${dataset.costs.products.length} maliyet kaydi`,
    );

    // Gerçekçi bir tavan: CI'da bile rahatça altında kalmalı.
    expect(elapsed).toBeLessThan(2000);
  });
});
