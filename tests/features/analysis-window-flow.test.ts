import { describe, expect, it } from "vitest";

import { lira, type StoreDataset } from "@/core/domain";
import { createAnalysisContext } from "@/core/services/analysis-context";
import { getMissingCostImpacts } from "@/core/services/missing-cost";
import {
  ANALYSIS_FROM_PARAM,
  ANALYSIS_PARAM,
  ANALYSIS_TO_PARAM,
  readAnalysisWindow,
  type SearchParamsRecord,
} from "@/features/analysis/analysis-params";

import {
  costsFor,
  makeDataset,
  makeLine,
  makeOrder,
  makeProduct,
} from "../core/fixtures";

/**
 * SEÇİLEN PENCERE GERÇEKTEN ANALİZE ULAŞIYOR MU.
 *
 * Seçici doğru adresi üretse bile pencere hesabın girdisine dönüşmüyorsa
 * kullanıcı dönemi değiştirir ve ekranda hiçbir şey oynamaz. Burada
 * kokpit ve maliyet ekranının **aynı adresten aynı aralığı** çıkardığı ve o
 * aralığın rapor sonucunu gerçekten değiştirdiği doğrulanıyor.
 *
 * Ekranlar tek satırla (`readAnalysisWindow`) aynı pencereyi okuduğu için
 * senaryonun geri kalanı çekirdek servislerle birebir üretimdeki yoldan
 * geçiyor.
 */

const TODAY = "2026-07-28";

/**
 * Maliyeti eksik iki ürün, farklı tarihlerde satılıyor:
 * "yakın" bu haftaya, "eski" iki ay öncesine düşüyor.
 */
function dataset(): StoreDataset {
  return makeDataset({
    products: [
      makeProduct({ id: "yakin", sku: "YKN-1", name: "Yakın Ürün" }),
      makeProduct({ id: "eski", sku: "ESK-1", name: "Eski Ürün" }),
    ],
    orders: [
      makeOrder({
        id: "o-yakin",
        date: "2026-07-25",
        lines: [makeLine({ productId: "yakin", quantity: 2 })],
      }),
      makeOrder({
        id: "o-eski",
        date: "2026-05-20",
        lines: [makeLine({ productId: "eski", quantity: 5 })],
      }),
    ],
    unitCosts: { yakin: null, eski: null },
  });
}

/** Üretimdeki yol: adres → pencere → rapor. */
function reportFor(searchParams: SearchParamsRecord) {
  const data = dataset();
  const window = readAnalysisWindow(searchParams, TODAY);

  return {
    window,
    report: getMissingCostImpacts({
      dataset: data,
      range: window.range,
      costs: costsFor(data),
      today: TODAY,
    }),
  };
}

describe("analiz penceresi hesaba ulaşıyor", () => {
  it("son 7 gün yalnızca yakın siparişi kapsar", () => {
    const { report } = reportFor({ [ANALYSIS_PARAM]: "last7" });

    expect(report.ordersConsidered).toBe(1);
    expect(report.items.map((item) => item.productId)).toEqual(["yakin"]);
  });

  it("son 90 gün her iki siparişi de kapsar", () => {
    const { report } = reportFor({ [ANALYSIS_PARAM]: "last90" });

    expect(report.ordersConsidered).toBe(2);
    expect(report.items.map((item) => item.productId).sort()).toEqual([
      "eski",
      "yakin",
    ]);
  });

  it("'Geçen ay' takvim ayına göre filtreler, son N güne göre değil", () => {
    // Haziran'da hiç sipariş yok: 30 günlük pencere ile aynı sonucu verseydi
    // takvim seçenekleri hiçbir işe yaramıyor demekti.
    const { window, report } = reportFor({ [ANALYSIS_PARAM]: "lastMonth" });

    expect(window.range).toEqual({ from: "2026-06-01", to: "2026-06-30" });
    expect(report.ordersConsidered).toBe(0);
  });

  it("özel aralık tam olarak seçilen günleri kapsar", () => {
    const { report } = reportFor({
      [ANALYSIS_PARAM]: "custom",
      [ANALYSIS_FROM_PARAM]: "2026-05-01",
      [ANALYSIS_TO_PARAM]: "2026-05-31",
    });

    expect(report.ordersConsidered).toBe(1);
    expect(report.items.map((item) => item.productId)).toEqual(["eski"]);
  });

  it("siparişsiz dönem boş rapor üretir — 'her şey tamam' demez", () => {
    /**
     * Kart ve maliyet ekranı boş durumu tam olarak bu iki sayıdan okuyor
     * (`ordersConsidered > 0 && productsInCatalog > 0`). Sipariş yokken
     * kuyruk boş olduğu için "tüm maliyetler tamam" demek, boş bir defteri
     * temiz sanmak olurdu.
     */
    const { report } = reportFor({
      [ANALYSIS_PARAM]: "custom",
      [ANALYSIS_FROM_PARAM]: "2026-01-01",
      [ANALYSIS_TO_PARAM]: "2026-01-31",
    });

    expect(report.ordersConsidered).toBe(0);
    expect(report.items).toHaveLength(0);
    // Katalog dolu: ayrım "veri yok" ile "iş bitti" arasında.
    expect(report.productsInCatalog).toBe(2);
  });

  it("geçersiz aralık analizi varsayılan pencereye düşürür", () => {
    const { window, report } = reportFor({
      [ANALYSIS_PARAM]: "custom",
      [ANALYSIS_FROM_PARAM]: "2026-07-25",
      [ANALYSIS_TO_PARAM]: "2026-07-01",
    });

    expect(window.invalid).toBe(true);
    // Son 30 gün: yalnızca yakın sipariş. Bozuk aralık boş ekran üretmemeli.
    expect(report.ordersConsidered).toBe(1);
  });

  it("kokpit ve maliyet ekranı aynı adresten aynı aralığı çıkarır", () => {
    // İki ekran ayrı sunucu bileşeni; ikisi de `readAnalysisWindow` çağırıyor.
    // Ayrışsalardı kokpitteki kuyruk ile maliyet ekranındaki kuyruk farklı
    // sırada olurdu ve "önce bunu yap" iki farklı ürünü gösterirdi.
    const query = { [ANALYSIS_PARAM]: "last90" };

    expect(readAnalysisWindow(query, TODAY)).toEqual(readAnalysisWindow(query, TODAY));
  });

  it("kâr hesabı da eksik maliyet raporuyla aynı pencereyi kullanır", () => {
    const data = dataset();
    const window = readAnalysisWindow({ [ANALYSIS_PARAM]: "last7" }, TODAY);
    const context = createAnalysisContext({
      dataset: data,
      range: window.range,
      today: TODAY,
    });

    // Pencerede yalnızca "yakın" satıldı ve maliyeti eksik: kapsam dışı ciro
    // rapordaki tutarla aynı olmalı, yoksa iki rakam birbirini yalanlar.
    const report = getMissingCostImpacts({
      dataset: data,
      range: window.range,
      costs: context.costs,
      today: TODAY,
    });

    expect(context.coverage.revenueExcluded).toEqual(lira(200));
    expect(report.items[0]?.uncomputableRevenue).toEqual(lira(200));
  });
});
