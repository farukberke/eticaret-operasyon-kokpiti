import { lira, type Money, type Product } from "@/core/domain";

import { seedFrom } from "./prng";

/**
 * DEMO KATALOĞU — 40 ürün.
 *
 * Ürünler rastgele değil, **arketiplere** göre tasarlandı. Amaç, karar
 * motorunun her kuralının gerçek veriyle en az bir kez tetiklenmesi ama
 * panelin de gürültüye boğulmaması.
 *
 * Kritik denge: ürünlerin çoğunluğu `steady` — yani hiçbir sinyal üretmez.
 * Her ürünün bağırdığı bir panel, hiçbir ürünün bağırmadığı panel kadar
 * işe yaramaz; satıcı neye bakacağını yine bilemez.
 */

/** Katalogun listelenme tarihi — maliyet kayıtlarının geçerlilik başlangıcı. */
export const CATALOG_LISTED_AT = "2025-11-01";

export type Archetype =
  /** Sessiz çoğunluk: sağlıklı marj, dengeli stok, sinyal üretmez. */
  | "steady"
  /** Hızlı satan, stoğu kritik seviyeye inmiş → STOCKOUT_IMMINENT */
  | "stockout"
  /** Yüksek marjlı, stoğu azalmakta olan kazanan → RESTOCK_WINNER */
  | "star"
  /** Satmıyor, sermaye bağlı → DEAD_STOCK */
  | "dead"
  /** Maliyet + gider fiyatı aşıyor → SELLING_AT_LOSS */
  | "loss"
  /** İade oranı yüksek → HIGH_RETURN_RATE */
  | "returner"
  /** Reklam yakıyor, dönüşü yok → AD_SPEND_LEAK */
  | "adburner"
  /** Son haftada talep patladı → TRENDING_UP */
  | "trending"
  /** Marjı çok yüksek, reklamsız → PRICE_TEST_CANDIDATE, HIGH_MARGIN_LOW_ADSPEND */
  | "premium"
  /** Talebi sönüyor → mağaza cirosunu aşağı çeker */
  | "fading";

export interface DemandProfile {
  /** Ortalama günlük satış adedi. */
  readonly base: number;
  /** Günlük dalgalanma katsayısı (0,25 → %25 standart sapma). */
  readonly volatility: number;
  /** Son N günde talebe uygulanan çarpan — trend ve sönüş bununla modellenir. */
  readonly recentDays: number;
  readonly recentFactor: number;
  /** Satılan adedin ne kadarı iade edilir. */
  readonly returnRate: number;
  /** Günlük reklam harcaması (₺). */
  readonly adSpendPerDay: number;
  /** Sık birlikte alınan ürün — paket önerisi bu ilişkiden doğar. */
  readonly bundlePartnerId?: string;
}

export interface CatalogEntry {
  readonly product: Product;
  readonly archetype: Archetype;
  readonly demand: DemandProfile;
  /**
   * Demo mağazanın alış maliyeti.
   *
   * Ürünün ÜZERİNDE değil, yanında duruyor: pazaryeri bu veriyi vermez.
   * `seedCosts()` bunu `ProductCost` kayıtlarına çevirir — tıpkı gerçek
   * kullanıcının maliyet ekranından gireceği gibi.
   */
  readonly unitCost: Money;
}

const DEMAND_BY_ARCHETYPE: Record<Archetype, DemandProfile> = {
  steady: {
    base: 4,
    volatility: 0.3,
    recentDays: 0,
    recentFactor: 1,
    returnRate: 0.05,
    adSpendPerDay: 45,
  },
  stockout: {
    base: 14,
    volatility: 0.25,
    recentDays: 0,
    recentFactor: 1,
    returnRate: 0.04,
    adSpendPerDay: 120,
  },
  star: {
    base: 6,
    volatility: 0.25,
    recentDays: 0,
    recentFactor: 1,
    returnRate: 0.03,
    adSpendPerDay: 20,
  },
  dead: {
    base: 0,
    volatility: 0,
    recentDays: 0,
    recentFactor: 1,
    returnRate: 0,
    adSpendPerDay: 0,
  },
  loss: {
    base: 7,
    volatility: 0.3,
    recentDays: 0,
    recentFactor: 1,
    returnRate: 0.06,
    adSpendPerDay: 60,
  },
  returner: {
    base: 9,
    volatility: 0.3,
    recentDays: 0,
    recentFactor: 1,
    returnRate: 0.24,
    adSpendPerDay: 80,
  },
  /**
   * Reklam sızıntısı için ROAS < 1 gerekir: günlük ciro günlük harcamanın
   * altında kalmalı. ~0,3 adet/gün × ~1.500 ₺ ≈ 450 ₺ ciroya karşı 620 ₺
   * harcama → ROAS ≈ 0,7. Kötü hedeflenmiş bir kampanyanın tipik hâli.
   */
  adburner: {
    base: 0.3,
    volatility: 0.5,
    recentDays: 0,
    recentFactor: 1,
    returnRate: 0.08,
    adSpendPerDay: 620,
  },
  /**
   * Yükseliş 14 güne yayıldı: varsayılan analiz penceresi 30 gün olduğu için
   * yalnızca son 7 günü yükseltmek, 30 günlük ortalamada %26'ya sulanıyor ve
   * %30 eşiğinin altında kalıyordu.
   */
  trending: {
    base: 5,
    volatility: 0.25,
    recentDays: 14,
    recentFactor: 2.2,
    returnRate: 0.04,
    adSpendPerDay: 55,
  },
  premium: {
    base: 3,
    volatility: 0.35,
    recentDays: 0,
    recentFactor: 1,
    returnRate: 0.03,
    adSpendPerDay: 0,
  },
  fading: {
    base: 8,
    volatility: 0.3,
    recentDays: 7,
    recentFactor: 0.25,
    returnRate: 0.05,
    adSpendPerDay: 30,
  },
};

/**
 * [id, ad, kategori, fiyat₺, maliyet₺, stok, arketip, tedarikSüresiGün]
 *
 * Maliyetler gelişigüzel değil, hedef **net** marja göre seçildi. Net marj
 * fiyattan maliyet + %15 komisyon + kargo payı düşüldükten sonra kalandır;
 * bu yüzden %60 brüt marj gerçekte ~%18 nete iner. Gerçek e-ticaret bandı
 * budur — daha yüksek tutmak, her ürünü "yüksek marjlı fırsat" gösterir ve
 * fırsat listesini anlamsızlaştırırdı.
 *
 *   steady/returner/fading ≈ maliyet %63 → net ~%18
 *   stockout/adburner/dead ≈ %60        → net ~%21
 *   trending               ≈ %58        → net ~%23
 *   star                   ≈ %55        → net ~%27  (RESTOCK_WINNER eşiği %25)
 *   premium                ≈ %35        → net ~%47  (fiyat testi eşiği %40)
 *   loss                   ≈ %84        → net negatif
 *
 * Tedarik süresi kategoriye göre kabaca gerçekçi: elektronik ithal olduğu
 * için en uzun (18-21 gün), aksesuar yerli/hızlı tedarik olduğu için en
 * kısa (5-9 gün). Dört üründe `undefined` — satıcının henüz tedarik süresi
 * girmediği ürünleri temsil eder (`leadTimeDays` eksik davranışı gerçekten
 * görünsün diye, tıpkı `PRODUCTS_WITHOUT_COST` gibi).
 */
type Row = readonly [
  string,
  string,
  string,
  number,
  number,
  number,
  Archetype,
  number | undefined,
];

const ROWS: readonly Row[] = [
  // ── Sinyal üretmesi beklenen ürünler ────────────────────────────────────
  ["kirmizi-elbise", "Kırmızı Midi Elbise", "Giyim", 1290, 774, 28, "stockout", 12],
  ["beyaz-sneaker", "Beyaz Deri Sneaker", "Ayakkabı", 2450, 1470, 34, "stockout", 15],
  ["deri-ceket", "Siyah Deri Ceket", "Giyim", 4890, 2690, 74, "star", 14],
  ["yun-kazak", "Merinos Yün Kazak", "Giyim", 1890, 1040, 66, "star", 10],
  ["mavi-gomlek", "Mavi Oxford Gömlek", "Giyim", 990, 832, 210, "loss", 9],
  ["spor-canta", "Spor Sırt Çantası", "Aksesuar", 1150, 966, 180, "loss", undefined],
  ["dijital-saat", "Dijital Kol Saati", "Aksesuar", 2290, 1442, 145, "returner", 6],
  ["kot-pantolon", "Slim Fit Kot Pantolon", "Giyim", 1490, 939, 165, "returner", 11],
  [
    "bluetooth-kulaklik",
    "Bluetooth Kulaklık",
    "Elektronik",
    1790,
    1074,
    220,
    "adburner",
    21,
  ],
  ["akilli-bileklik", "Akıllı Bileklik", "Elektronik", 1290, 774, 195, "adburner", 18],
  ["keten-gomlek", "Keten Yazlık Gömlek", "Giyim", 1090, 632, 240, "trending", 8],
  ["hasir-sapka", "Hasır Plaj Şapkası", "Aksesuar", 650, 377, 310, "trending", 5],
  [
    "yaz-elbise",
    "Çiçek Desenli Yaz Elbisesi",
    "Giyim",
    1390,
    806,
    285,
    "trending",
    undefined,
  ],
  ["ipek-esarp", "İpek Eşarp", "Aksesuar", 1850, 648, 120, "premium", 7],
  ["parfum-set", "Özel Seri Parfüm Seti", "Kozmetik", 3200, 1120, 95, "premium", 10],
  ["deri-cuzdan", "El Yapımı Deri Cüzdan", "Aksesuar", 1450, 508, 140, "premium", 6],
  ["kislik-mont", "Kışlık Şişme Mont", "Giyim", 3890, 2334, 130, "dead", 16],
  ["kar-botu", "Su Geçirmez Kar Botu", "Ayakkabı", 2990, 1794, 105, "dead", 18],
  ["kapusonlu-sweat", "Kapüşonlu Sweatshirt", "Giyim", 1290, 813, 175, "fading", 9],
  ["kosu-ayakkabi", "Koşu Ayakkabısı", "Ayakkabı", 2790, 1758, 150, "fading", 12],

  // ── Sessiz çoğunluk ─────────────────────────────────────────────────────
  ["basic-tisort", "Basic Pamuk Tişört", "Giyim", 490, 309, 420, "steady", 7],
  ["jean-ceket", "Denim Ceket", "Giyim", 1990, 1254, 190, "steady", 12],
  ["triko-hirka", "Triko Hırka", "Giyim", 1590, 1002, 205, "steady", 10],
  ["chino-pantolon", "Chino Pantolon", "Giyim", 1290, 813, 230, "steady", 8],
  ["polo-tisort", "Polo Yaka Tişört", "Giyim", 790, 498, 310, "steady", 6],
  ["loafer", "Süet Loafer", "Ayakkabı", 2190, 1380, 145, "steady", 10],
  ["sandalet", "Deri Sandalet", "Ayakkabı", 1390, 876, 175, "steady", 9],
  ["bot", "Klasik Deri Bot", "Ayakkabı", 3290, 2073, 120, "steady", undefined],
  ["terlik", "Ev Terliği", "Ayakkabı", 390, 246, 380, "steady", 5],
  ["kemer", "Hakiki Deri Kemer", "Aksesuar", 890, 561, 265, "steady", 5],
  ["gunes-gozlugu", "Polarize Güneş Gözlüğü", "Aksesuar", 1690, 1065, 185, "steady", 8],
  ["omuz-cantasi", "Omuz Çantası", "Aksesuar", 1990, 1254, 155, "steady", 7],
  ["nemlendirici", "Yoğun Nemlendirici Krem", "Kozmetik", 690, 435, 340, "steady", 7],
  ["sampuan", "Onarıcı Şampuan", "Kozmetik", 450, 284, 410, "steady", 6],
  ["yuz-serumu", "C Vitamini Serum", "Kozmetik", 1290, 813, 220, "steady", 8],
  ["nevresim", "Pamuk Nevresim Takımı", "Ev & Yaşam", 2490, 1569, 135, "steady", 12],
  ["havlu-set", "Bambu Havlu Seti", "Ev & Yaşam", 1190, 750, 245, "steady", 9],
  ["mum-set", "Aromatik Mum Seti", "Ev & Yaşam", 590, 372, 300, "steady", 6],
  ["termos", "Çelik Termos 1L", "Ev & Yaşam", 890, 561, 260, "steady", 7],
  [
    "masa-lambasi",
    "LED Masa Lambası",
    "Ev & Yaşam",
    1390,
    876,
    165,
    "steady",
    undefined,
  ],
];

/** Sık birlikte alınan çiftler — paket önerisi bu ilişkiden doğar. */
const BUNDLE_PAIRS: readonly (readonly [string, string])[] = [
  ["beyaz-sneaker", "basic-tisort"],
  ["kirmizi-elbise", "ipek-esarp"],
  ["nevresim", "havlu-set"],
];

const BUNDLE_PARTNER = new Map(BUNDLE_PAIRS);

export const CATALOG: readonly CatalogEntry[] = ROWS.map(
  ([id, name, category, price, cost, stock, archetype, leadTimeDays]) => {
    const partner = BUNDLE_PARTNER.get(id);
    const baseDemand = DEMAND_BY_ARCHETYPE[archetype];

    return {
      product: {
        id,
        sku: `SKU-${id.toUpperCase().replace(/-/g, "")}`,
        barcode: `868${String(Math.abs(seedFrom(id)) % 10_000_000_000).padStart(10, "0")}`,
        name,
        category,
        price: lira(price),
        stock,
        listedAt: CATALOG_LISTED_AT,
        leadTimeDays,
      },
      unitCost: lira(cost),
      archetype,
      demand: partner ? { ...baseDemand, bundlePartnerId: partner } : baseDemand,
    } satisfies CatalogEntry;
  },
);

/**
 * Maliyeti bilinçli olarak GİRİLMEMİŞ ürünler.
 *
 * Yeni listelenmiş ürünlerde maliyetin henüz girilmemiş olması gerçek bir
 * durumdur. Demo verisinde de bulunması, "maliyet eksik" davranışının
 * ekranlarda görünmesini sağlar — özelliğin kendisini görünmez kılmak,
 * kullanıcının onu hiç fark etmemesi demek olurdu.
 */
export const PRODUCTS_WITHOUT_COST: readonly string[] = [
  "mum-set",
  "terlik",
  "sampuan",
];

export const CATEGORIES: readonly string[] = [
  ...new Set(CATALOG.map((entry) => entry.product.category)),
].sort((a, b) => a.localeCompare(b, "tr"));
