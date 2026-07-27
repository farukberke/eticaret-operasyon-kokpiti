/**
 * TOHUMLU RASTGELE SAYI ÜRETECİ (mulberry32).
 *
 * `Math.random()` bu projede yasak. Sebep somut: sunucu bileşeni her
 * render'da farklı veri üretirse (a) sayfa yenilendiğinde öncelik listesi
 * karışır ve panel oyuncak gibi hissettirir, (b) React hydration uyuşmazlığı
 * çıkar, (c) testler tutarsızlaşır.
 *
 * Aynı tohum → aynı dizi. Her zaman.
 */

export interface Rng {
  /** [0, 1) aralığında sayı. */
  next(): number;
  /** [min, max] aralığında tamsayı (iki uç dahil). */
  int(min: number, max: number): number;
  /** [min, max) aralığında ondalık. */
  float(min: number, max: number): number;
  /** `probability` olasılıkla true. */
  chance(probability: number): boolean;
  /** Diziden rastgele bir eleman. Dizi boşsa hata verir. */
  pick<T>(items: readonly T[]): T;
  /** Normal dağılım — talep dalgalanmasını gerçekçi kılar. */
  normal(mean: number, standardDeviation: number): number;
}

export function createRng(seed: number): Rng {
  // 32-bit duruma sıkıştır; ondalık veya negatif tohumlar da kabul edilsin.
  let state = Math.trunc(seed) >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,

    int(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },

    float(min, max) {
      return next() * (max - min) + min;
    },

    chance(probability) {
      return next() < probability;
    },

    pick(items) {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) {
        throw new Error("Boş diziden eleman seçilemez");
      }
      return item;
    },

    normal(mean, standardDeviation) {
      // Box–Muller dönüşümü.
      const u = 1 - next();
      const v = next();
      const magnitude = Math.sqrt(-2 * Math.log(u));
      return mean + magnitude * Math.cos(2 * Math.PI * v) * standardDeviation;
    },
  };

  return rng;
}

/**
 * Metni kararlı bir sayısal tohuma çevirir (FNV-1a).
 * Böylece her ürün kendi bağımsız ama tekrarlanabilir rastgeleliğine sahip olur.
 */
export function seedFrom(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
