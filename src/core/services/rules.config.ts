import { lira, type Money } from "../domain/money";

/**
 * KARAR EŞİKLERİ — tek doğruluk kaynağı.
 *
 * Dedektör servislerinin içinde çıplak sayı BULUNMAZ. Sebep pratik:
 * "stok kaç gün kalınca uyaralım?" sorusu ürün ekibinin sürekli oynayacağı
 * bir ayardır; bunun 7 farklı dosyaya serpilmiş olması ürünü dondurur.
 *
 * İleride bu nesne kullanıcı başına ayarlanabilir hale gelecek
 * (tedarik süresi 3 gün olan mağaza da var, 30 gün olan da).
 */
export interface RulesConfig {
  readonly inventory: InventoryRules;
  readonly risk: RiskRules;
  readonly opportunity: OpportunityRules;
  readonly priority: PriorityRules;
  readonly cost: CostRules;
}

/**
 * Tedarik gerçekleri. Stok kararlarının tamamı bu iki sayıya dayanır.
 */
export interface InventoryRules {
  /**
   * Sipariş verildikten sonra malın rafa girmesi kaç gün sürer.
   *
   * Panelin en kritik ayarı: "stok 2 gün yeter" tek başına bir bilgi değil.
   * Tedarik 7 günse karar **zaten gecikmiştir**; 1 günse acele yoktur.
   * Aynı stok seviyesi, tedarik süresine göre bambaşka iki anlam taşır.
   */
  readonly supplyLeadTimeDays: number;
  /**
   * Trend ve fiyat fırsatlarının projeksiyon ufku: "bu gidişat N gün sürerse
   * ne kazanırım". Stok kararlarında kullanılmaz — orada ufku tedarik
   * süresi belirler, keyfî bir sayı değil.
   */
  readonly forecastHorizonDays: number;
  /**
   * "Bu hafta" grubunun uzunluğu ve tarihi belirsiz işlere verilen süre.
   *
   * Bugün patlamayan ama sürüncemede bırakılmaması gereken işler (marj
   * erozyonu, yüksek iade, sönen trend) bu kadar gün sonrasına tarihlenir.
   */
  readonly decisionHorizonDays: number;
}

export interface RiskRules {
  /** Stok yeterlilik günü bu değerin altındaysa "tükeniyor" sayılır. */
  readonly stockoutDaysOfCover: number;
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
  /** Mağaza kârı önceki döneme göre bu oranda düşerse uyarılır. */
  readonly profitDropRatio: number;
}

export interface OpportunityRules {
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
}

export interface PriorityRules {
  /**
   * Etki puanının (0–10) doyum noktası: bu tutar ve üstü 10 puan alır.
   * Logaritmik ölçek kullanılır — eşit oranlı büyümeler eşit puan kazandırır,
   * böylece tek bir büyük kalem listeyi ele geçiremez.
   */
  readonly impactSaturation: Money;
  /** Kokpitte gösterilecek öncelik sayısı. */
  readonly cockpitLimit: number;
}

/**
 * Eksik maliyet kuyruğunun eşikleri.
 *
 * Sıralamayı bu sayılar **belirlemez** — sıra her zaman tutar, hacim ve
 * eskilik üçlüsünden çıkar. Bu eşikler yalnızca kullanıcıya gösterilecek
 * seviyeyi ve "neden öncelikli" cümlesini seçer: aynı listede ₺80.000'lik bir
 * eksik ile ₺40'lık bir eksik aynı rozetle durursa rozet bilgi taşımaz.
 */
export interface CostRules {
  /** Bu tutarın üstündeki hesaplanamayan satış tek başına kritiktir. */
  readonly criticalRevenue: Money;
  /** "Kayda değer" tutar eşiği — gerekçe seçiminde de kullanılır. */
  readonly notableRevenue: Money;
  /**
   * Tutar küçük olsa bile bu kadar siparişe yayılan eksik maliyet öne çıkar:
   * çok siparişe dokunan bir eksik, panelin tamamına yayılan bir kör noktadır.
   */
  readonly notableOrderCount: number;
  /** En eski etkilenen sipariş bu kadar gün geride kaldıysa iş bayatlamıştır. */
  readonly staleDays: number;
  /** Eylem bölümünde kaç ürün gösterilsin — gerisi zaten listede duruyor. */
  readonly actionLimit: number;
}

export const DEFAULT_RULES: RulesConfig = {
  inventory: {
    supplyLeadTimeDays: 7,
    forecastHorizonDays: 30,
    decisionHorizonDays: 7,
  },

  risk: {
    stockoutDaysOfCover: 7,
    deadStockDays: 30,
    deadStockMinValue: lira(2_000),
    criticalMarginRatio: 0.1,
    marginDropPoints: 0.05,
    maxReturnRate: 0.15,
    returnRateMinUnits: 10,
    minRoas: 1,
    profitDropRatio: -0.2,
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

  cost: {
    criticalRevenue: lira(25_000),
    notableRevenue: lira(5_000),
    notableOrderCount: 10,
    staleDays: 14,
    actionLimit: 5,
  },
};

/**
 * Stok yeterlilik gününün seviye sınırları — ürün tablosundaki "Kalan gün"
 * rozeti bunlara göre renk ve kelime seçer.
 *
 * İlk iki sınır yeni sayı DEĞİL, `DEFAULT_RULES` içindeki mevcut eşiklerin
 * kendisi. Bu bilinçli: "Kritik" rozeti gördüğü ürün için kullanıcı kuyrukta
 * `STOCKOUT_IMMINENT` sinyalini de görmeli. Sınırları elle 7 ve 21 yazsaydım
 * biri değiştiğinde tablo ile kuyruk sessizce ayrışır ve panel kendi kendini
 * yalanlardı.
 *
 * `high` yalnızca burada tanımlı, çünkü hiçbir sinyal üretmiyor: aşırı stok
 * bir uyarı değil, "bu ürüne bir daha sipariş verme" bağlamı. İki aylık
 * yeterlilik, `forecastHorizonDays` (30) ufkunun iki katıdır — bu ürün
 * projeksiyon penceresi boyunca hiçbir karar gerektirmez.
 */
export interface StockCoverageThresholds {
  /** Bu gün sayısı ve altı kritik. */
  readonly critical: number;
  /** Kritiğin üstünde, bu değer ve altı düşük. */
  readonly low: number;
  /** Düşüğün üstünde, bu değer ve altı normal; üstü yüksek stok. */
  readonly normal: number;
}

export const STOCK_COVERAGE_THRESHOLDS: StockCoverageThresholds = {
  critical: DEFAULT_RULES.risk.stockoutDaysOfCover,
  low: DEFAULT_RULES.opportunity.restockDaysOfCover,
  normal: DEFAULT_RULES.inventory.forecastHorizonDays * 2,
};
