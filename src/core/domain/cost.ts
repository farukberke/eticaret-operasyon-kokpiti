import type { IsoDate } from "./date-range";
import type { Money } from "./money";

/**
 * MALİYET MODELİ — ürünün ticari savunma hattı.
 *
 * Temel ayrım: **`Product` pazaryerinin bildiğidir, `Cost` yalnızca senin
 * bildiğin.** Trendyol siparişi verir, fiyatı verir, stoğu verir — alış
 * maliyetini asla vermez. Pazaryeri panelleri bu yüzden ciro gösterir, kâr
 * gösteremez. Bu dosya o boşluğu dolduruyor.
 *
 * Bu yüzden `unitCost` alanı `Product` üzerinde DEĞİL: orada durması, veriyi
 * pazaryerinden geliyormuş gibi modellemek olurdu.
 */

/**
 * Komisyon oranı **baz puan** olarak: %15 = 1500.
 *
 * Neden `0.15` değil: ondalık oran, para hesabında kayan nokta hatası
 * riskidir. Baz puan tamsayıdır; komisyon `kuruş × bp / 10000` ile hesaplanır
 * ve bölme yalnızca son adımda, yuvarlamayla birlikte yapılır. Ara sonuçların
 * hiçbiri ondalık değildir.
 *
 * Geçerli aralık 0–10000 (%0–%100) ve `basisPoints()` bunu doğrular.
 */
export type BasisPoints = number;

export const MAX_BASIS_POINTS = 10_000;

/** Yüzdeden baz puana: `basisPoints(15)` → 1500. */
export function basisPoints(percent: number): BasisPoints {
  const value = Math.round(percent * 100);
  if (!Number.isFinite(value) || value < 0 || value > MAX_BASIS_POINTS) {
    throw new Error(`Geçersiz komisyon oranı: %${percent}`);
  }
  return value;
}

/** Görüntüleme için orana çevirir: 1500 → 0,15. Hesapta kullanılmaz. */
export function toRatio(bp: BasisPoints): number {
  return bp / MAX_BASIS_POINTS;
}

/**
 * Tutara baz puan uygular. Çarpma tamsayı üzerinde yapılır, bölme sonda.
 *
 * `10.000.000 kuruş × 10.000 bp = 10^11` — güvenli tamsayı sınırının
 * (2^53 ≈ 9×10^15) çok altında.
 */
export function applyBasisPoints(money: Money, bp: BasisPoints): Money {
  return {
    minor: Math.round((money.minor * bp) / MAX_BASIS_POINTS),
    currency: money.currency,
  };
}

/**
 * Ürüne özel maliyet kaydı.
 *
 * `unitCost` zorunlu: kârın hesaplanabilir olmasının şartı budur ve
 * varsayılanı olamaz — bir ürünün alış fiyatını tahmin etmek, sahte kâr
 * üretmenin en kısa yoludur.
 */
export interface ProductCost {
  readonly productId: string;
  /** Bu tarihten itibaren geçerli. Bitiş tarihi YOK — bir sonraki kaydın başlangıcıdır. */
  readonly effectiveFrom: IsoDate;
  readonly unitCost: Money;
  /** Ürün bazlı komisyon; yoksa kategori, o da yoksa mağaza varsayılanına düşer. */
  readonly commissionRate?: BasisPoints | undefined;
  /**
   * Kargo bedeli. Bir siparişte bu üründen kaç adet olursa olsun **bir kez**
   * sayılır — kargo paket başınadır, adet başına değil.
   */
  readonly shippingCost?: Money | undefined;
  /** Paketleme/operasyon gideri. Bu gerçekten adet başınadır. */
  readonly packagingPerUnit?: Money | undefined;
  readonly source: "manual" | "import" | "seed";
}

export type CostScope =
  { readonly kind: "category"; readonly category: string } | { readonly kind: "store" };

/**
 * Kategori ya da mağaza geneli varsayılan.
 *
 * `unitCost` burada YOK: alış maliyetinin kategori varsayılanı olamaz.
 */
export interface CostDefault {
  readonly scope: CostScope;
  readonly effectiveFrom: IsoDate;
  readonly commissionRate?: BasisPoints | undefined;
  readonly shippingCost?: Money | undefined;
  readonly packagingPerUnit?: Money | undefined;
}

/** Analizin girdisi olan maliyet tablosu. */
export interface CostTable {
  readonly products: readonly ProductCost[];
  readonly defaults: readonly CostDefault[];
}

export const EMPTY_COST_TABLE: CostTable = { products: [], defaults: [] };

/**
 * Bir ürünün belirli bir tarihteki çözümlenmiş maliyet modeli.
 *
 * `unitCost` `null` ise **maliyet eksiktir** ve o ürün için kâr
 * hesaplanamaz. Sıfır değil `null`: sıfır maliyet "bedava aldım" demektir,
 * eksik veri değil.
 */
export interface ResolvedCost {
  readonly unitCost: Money | null;
  readonly commissionRate: BasisPoints;
  readonly shippingCost: Money;
  readonly packagingPerUnit: Money;
}

export type CostStatus = "complete" | "missing";

/**
 * Maliyet kapsamı: analizin ne kadarını gerçekten ölçebiliyoruz.
 *
 * Eksik maliyetli ürünleri toplamdan çıkarmak doğru, ama sessizce çıkarmak
 * değil. Bu tip, "gösterdiğim rakam neyin toplamı" sorusunun cevabını
 * ekranlara taşır.
 */
export interface CostCoverage {
  readonly productsMeasured: number;
  readonly productsMissing: number;
  /** Maliyeti bilinmediği için değerlendirilemeyen net ciro. */
  readonly revenueExcluded: Money;
}

export function costStatusOf(cost: ResolvedCost): CostStatus {
  return cost.unitCost === null ? "missing" : "complete";
}

/**
 * Eksik maliyetin **operasyonel etkisi**.
 *
 * `CostCoverage` "ne kadarını ölçemiyoruz" der ve orada durur. Bu tip bir
 * adım öteye geçip "önce hangisini gireyim" sorusunu cevaplar: eksik maliyet
 * bir liste satırı değil, sıraya girmiş bir iştir ve sırayı ürün adı değil
 * paranın ve hacmin büyüklüğü belirler.
 *
 * Bilinçli olarak **kâr kaybı yok**: maliyet bilinmiyorsa kaybedilen kâr da
 * bilinemez. Yalnızca "kârı hesaplanamayan satış tutarı" gerçekten ölçülebilir
 * bir sayıdır ve rapor yalnızca onu taşır.
 */
export interface MissingCostImpact {
  readonly productId: string;
  readonly name: string;
  readonly sku: string;
  /** Varsa ikincil tanımlayıcı — kullanıcı ürünü panelinde bununla arıyor olabilir. */
  readonly barcode?: string | undefined;

  /** Maliyeti çözümlenemeyen sipariş satırı sayısı. */
  readonly affectedLines: number;
  /** Bu satırların dağıldığı **farklı** sipariş sayısı. */
  readonly affectedOrders: number;
  readonly affectedUnits: number;

  /**
   * Bu satırların net satış tutarı: brüt − pay edilen iskonto − iade.
   *
   * Kârı hesaplanamayan tutar budur. Ürünün dönemdeki tüm cirosu değil —
   * yalnızca maliyetin gerçekten çözümlenemediği satırlar.
   */
  readonly uncomputableRevenue: Money;

  readonly firstOrderDate: IsoDate;
  readonly lastOrderDate: IsoDate;

  readonly level: MissingCostLevel;
  /** Bu ürünün neden öncelikli olduğu — ekranda cümleye çevrilir. */
  readonly reason: MissingCostReason;
}

export type MissingCostLevel = "critical" | "high" | "normal";

/**
 * Önceliğin gerekçesi.
 *
 * `revenue` → tutar tek başına büyük · `volume` → tutar küçük ama çok
 * siparişe yayılıyor · `age` → küçük ve seyrek, ama uzun süredir açık.
 */
export type MissingCostReason = "revenue" | "volume" | "age";

/**
 * Eksik maliyet raporu.
 *
 * `ordersConsidered` ve `productsInCatalog` yalnızca boş durumu ayırt etmek
 * için var: hiç sipariş yokken "tüm maliyetler tamam" demek, boş bir defteri
 * temiz sanmaktır.
 */
export interface MissingCostReport {
  /** Öncelik sırasında; sıralama deterministiktir. */
  readonly items: readonly MissingCostImpact[];
  /** Analiz penceresindeki sipariş sayısı. */
  readonly ordersConsidered: number;
  readonly productsInCatalog: number;
}

/**
 * Aynı ürün + aynı geçerlilik tarihi için iki kayıt olamaz.
 *
 * Olsaydı hangisinin geçerli olduğu yazma sırasına bağlı kalır ve kâr
 * hesabı deterministik olmaktan çıkardı. Yazma işlemi bu anahtarla
 * güncelleme (upsert) yapar.
 */
export function costKeyOf(
  cost: Pick<ProductCost, "productId" | "effectiveFrom">,
): string {
  return `${cost.productId}@${cost.effectiveFrom}`;
}

export function defaultKeyOf(entry: CostDefault): string {
  const scope =
    entry.scope.kind === "store" ? "store" : `category:${entry.scope.category}`;
  return `${scope}@${entry.effectiveFrom}`;
}
