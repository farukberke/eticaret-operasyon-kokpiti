import { lira, type Money } from "../domain/money";

/**
 * KARAR EŞİKLERİ — tek doğruluk kaynağı.
 *
 * Dedektör servislerinin içinde çıplak sayı BULUNMAZ. Sebep pratik:
 * "stok kaç gün kalınca uyaralım?" sorusu ürün ekibinin sürekli oynayacağı
 * bir ayardır; bunun 7 farklı dosyaya serpilmiş olması ürünü dondurur.
 *
 * İleride bu nesne kullanıcı başına ayarlanabilir hale gelecek
 * (mağazanın tedarik süresi 3 gün olan da var, 30 gün olan da).
 */
export interface RulesConfig {
  readonly risk: {
    /** Stok yeterlilik günü bu değerin altındaysa "tükeniyor" sayılır. */
    readonly stockoutDaysOfCover: number;
    /**
     * Kaçan satış hesabının ufku. "Stok bitince önümüzdeki N günde ne kadar
     * ciro kaybederim" sorusunun N'i.
     */
    readonly stockoutHorizonDays: number;
    /** Ölü stok sayılmak için kaç gün satışsız kalmalı. */
    readonly deadStockDays: number;
    /** Ölü stok uyarısı için bağlı sermayenin alt sınırı. */
    readonly deadStockMinValue: Money;
    /** Marj bu oranın altındaysa erozyon sayılır. */
    readonly criticalMarginRatio: number;
    /** Marj önceki döneme göre bu kadar **puan** düşerse erozyon sayılır. */
    readonly marginDropPoints: number;
    /** İade oranı üst sınırı. */
    readonly maxReturnRate: number;
    /** İade oranı anlamlı olsun diye gereken en az satış adedi. */
    readonly returnRateMinUnits: number;
    /** ROAS bu değerin altındaysa reklam zarar ediyordur. */
    readonly minRoas: number;
    /** Mağaza cirosu önceki döneme göre bu oranda düşerse uyarılır. */
    readonly revenueDropRatio: number;
  };

  readonly opportunity: {
    /** Satış hızı önceki döneme göre bu oranda artarsa trend sayılır. */
    readonly trendingUpRatio: number;
    /**
     * Trend sinyali için gereken en az satış adedi.
     *
     * Bu eşik olmadan, ayda 6 adet satan bir ürünün 9 adede çıkması "%50
     * büyüme" diye listenin başına oturur. Küçük sayılarda yüzdeler yalan
     * söyler; istatistiksel gürültüyü karar sanmamak için taban gerekir.
     */
    readonly trendingMinUnits: number;
    /** "Kazanan" sayılmak için gereken marj alt sınırı. */
    readonly winnerMarginRatio: number;
    /** Kazanan ürünün stoğu bu gün sayısının altına inerse tazeleme fırsatı. */
    readonly restockDaysOfCover: number;
    /** Fiyat testi önerisi için marj üst eşiği. */
    readonly priceTestMarginRatio: number;
    /** Fiyat testinde denenecek zam oranı — kazanç tahmini bununla yapılır. */
    readonly priceTestUpliftRatio: number;
    /** Reklamsız sayılmak için harcamanın ciroya oranı üst sınırı. */
    readonly lowAdSpendRatio: number;
    /** Paket adayı sayılmak için iki ürünün birlikte geçtiği en az sipariş sayısı. */
    readonly bundleMinCoOccurrence: number;
    /** En fazla kaç paket önerisi üretilsin (liste gürültüsünü sınırlar). */
    readonly bundleMaxSuggestions: number;
  };

  readonly priority: {
    /**
     * Etki puanının (0–10) doyum noktası: bu tutar ve üstü 10 puan alır.
     * Logaritmik ölçek kullanılır — ₺500 ile ₺5.000 arasındaki fark,
     * ₺50.000 ile ₺500.000 arasındaki farktan daha çok şey ifade eder.
     */
    readonly impactSaturation: Money;
    /** Kokpitte gösterilecek öncelik sayısı. */
    readonly cockpitLimit: number;
  };
}

export const DEFAULT_RULES: RulesConfig = {
  risk: {
    stockoutDaysOfCover: 7,
    stockoutHorizonDays: 30,
    deadStockDays: 30,
    deadStockMinValue: lira(2_000),
    criticalMarginRatio: 0.1,
    marginDropPoints: 0.05,
    maxReturnRate: 0.15,
    returnRateMinUnits: 10,
    minRoas: 1,
    revenueDropRatio: -0.2,
  },

  opportunity: {
    trendingUpRatio: 0.3,
    trendingMinUnits: 20,
    winnerMarginRatio: 0.25,
    restockDaysOfCover: 21,
    priceTestMarginRatio: 0.4,
    priceTestUpliftRatio: 0.05,
    lowAdSpendRatio: 0.02,
    bundleMinCoOccurrence: 8,
    bundleMaxSuggestions: 2,
  },

  priority: {
    impactSaturation: lira(100_000),
    cockpitLimit: 3,
  },
};
