import {
  toRatio,
  type CostDefault,
  type CostScope,
  type IsoDate,
  type Product,
} from "@/core/domain";
import { findEffectiveDefault } from "@/core/services/cost-resolver";
import { formatMoney, formatPercent, formatShortDate } from "@/lib/format";
import type { Locale } from "@/i18n/routing";

/**
 * VARSAYILAN MALİYET AYARLARI — domain → görünüm çevirisi.
 *
 * Ekranın cevaplaması gereken soru "bu alanda ne yazıyor" değil, **"bu değer
 * nereden geliyor"**. Bir kategori satırında ₺34,90 görmek tek başına
 * yanıltıcıdır: kullanıcı onu o kategoriye ait bir ayar sanıp silmeye çalışır,
 * oysa mağaza varsayılanından iniyordur. Bu yüzden her alan değerinin yanında
 * `source` taşınır.
 *
 * İkinci karar: **miras alınan değer form alanına yazılmaz.** Kategori formu
 * mağazadan gelen ₺34,90 ile açılsaydı, kullanıcı yalnızca komisyonu
 * değiştirip kaydettiğinde kargo da o kategoriye sabitlenirdi — mağaza
 * varsayılanı sonradan değişince o kategori sessizce geride kalırdı.
 * Boş alan "burada tanımlı değil" demektir ve zincir aşağı akmaya devam eder.
 */

/** Varsayılanın tanımlanabildiği üç kalem. Alış maliyeti burada YOK. */
export type CostDefaultField = "commission" | "shipping" | "packaging";

export type CostDefaultSource =
  /** Değer bu satırın kendi kaydından geliyor. */
  | "own"
  /** Kategori satırında: mağaza varsayılanından iniyor. */
  | "store"
  /** Hiçbir yerde tanımlı değil — zincirin sonundaki sabite düşer. */
  | "none";

export interface CostDefaultValueView {
  /** Yürürlükteki biçimlenmiş değer; hiçbir yerde tanımlı değilse `null`. */
  readonly label: string | null;
  /** Form alanının ham değeri. Yalnızca `source === "own"` ise dolu. */
  readonly value: string;
  readonly source: CostDefaultSource;
}

export interface CostDefaultRowView {
  /** React anahtarı ve sunucu eylemine giden kapsam kimliği. */
  readonly key: string;
  readonly kind: CostScope["kind"];
  /** Kategori satırlarında kategori adı; mağaza satırında `null`. */
  readonly category: string | null;
  /** Bu kapsamın etkilediği katalog ürünü sayısı — ayarın yarıçapı. */
  readonly productCount: number;

  readonly commission: CostDefaultValueView;
  readonly shipping: CostDefaultValueView;
  readonly packaging: CostDefaultValueView;

  /** Bu kapsamın yürürlükteki kaydının başlangıcı; kendi kaydı yoksa `null`. */
  readonly effectiveFromLabel: string | null;
}

export interface CostDefaultsView {
  readonly store: CostDefaultRowView;
  /** Katalogdaki her kategori için bir satır; katalog boşsa boş dizi. */
  readonly categories: readonly CostDefaultRowView[];
}

/** Kuruşu form alanının beklediği ham metne çevirir: 3490 → "34.9". */
function rawMoney(minor: number): string {
  return String(minor / 100);
}

/** Baz puanı ham yüzdeye: 1500 → "15". */
function rawPercent(bp: number): string {
  return String(bp / 100);
}

function valueOf<T>(params: {
  own: T | undefined;
  inherited: T | undefined;
  format: (value: T) => string;
  raw: (value: T) => string;
}): CostDefaultValueView {
  if (params.own !== undefined) {
    return {
      label: params.format(params.own),
      value: params.raw(params.own),
      source: "own",
    };
  }
  if (params.inherited !== undefined) {
    // Miras alınan değer gösterilir ama forma yazılmaz — bkz. dosya başı.
    return { label: params.format(params.inherited), value: "", source: "store" };
  }
  return { label: null, value: "", source: "none" };
}

function buildRow(params: {
  scope: CostScope;
  own: CostDefault | undefined;
  /** Kategori satırlarında mağaza kaydı; mağaza satırında `undefined`. */
  inherited: CostDefault | undefined;
  productCount: number;
  locale: Locale;
}): CostDefaultRowView {
  const { own, inherited, locale } = params;

  return {
    key: params.scope.kind === "store" ? "store" : `category:${params.scope.category}`,
    kind: params.scope.kind,
    category: params.scope.kind === "category" ? params.scope.category : null,
    productCount: params.productCount,

    commission: valueOf({
      own: own?.commissionRate,
      inherited: inherited?.commissionRate,
      format: (bp) => formatPercent(toRatio(bp), locale),
      raw: rawPercent,
    }),
    shipping: valueOf({
      own: own?.shippingCost,
      inherited: inherited?.shippingCost,
      format: (money) => formatMoney(money, locale),
      raw: (money) => rawMoney(money.minor),
    }),
    packaging: valueOf({
      own: own?.packagingPerUnit,
      inherited: inherited?.packagingPerUnit,
      format: (money) => formatMoney(money, locale),
      raw: (money) => rawMoney(money.minor),
    }),

    effectiveFromLabel: own ? formatShortDate(own.effectiveFrom, locale) : null,
  };
}

/**
 * Katalogdaki kategoriler, ürün sayılarıyla.
 *
 * Kaynak `Product.category`: ayrı bir kategori varlığı yok ve icat edilmiyor.
 * Sıralama locale'e göre yapılır — Türkçede "Ç" ile "C" arasındaki sıra
 * `localeCompare` olmadan yanlış çıkar. Aynı locale'de sonuç deterministiktir.
 */
function categoryCounts(
  products: readonly Pick<Product, "category">[],
  locale: Locale,
): { category: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const product of products) {
    const category = product.category.trim();
    if (category === "") continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => a.category.localeCompare(b.category, locale));
}

export function buildCostDefaultsView(params: {
  defaults: readonly CostDefault[];
  products: readonly Pick<Product, "category">[];
  /** Yürürlük tarihi — "şu an ne geçerli" sorusunun referansı. */
  today: IsoDate;
  locale: Locale;
}): CostDefaultsView {
  const { defaults, today, locale } = params;

  const storeDefault = findEffectiveDefault(defaults, { kind: "store" }, today);

  return {
    store: buildRow({
      scope: { kind: "store" },
      own: storeDefault,
      inherited: undefined,
      productCount: params.products.length,
      locale,
    }),
    categories: categoryCounts(params.products, locale).map((entry) =>
      buildRow({
        scope: { kind: "category", category: entry.category },
        own: findEffectiveDefault(
          defaults,
          { kind: "category", category: entry.category },
          today,
        ),
        inherited: storeDefault,
        productCount: entry.count,
        locale,
      }),
    ),
  };
}
