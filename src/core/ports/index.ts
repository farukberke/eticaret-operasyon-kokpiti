import type { DateRange, IsoDate } from "../domain/date-range";
import type { ProfitSummary, SalesSummary } from "../domain/metrics";
import type { PriorityAction } from "../domain/priority";
import type { ProductPerformance } from "../domain/product";
import type { Signal } from "../domain/signal";

/**
 * PORTLAR — veri kaynağıyla aramızdaki sözleşme.
 *
 * Arayüz katmanı yalnızca bu arayüzleri bilir; karşısında mock üretici mi
 * yoksa Trendyol API'si mi olduğunu bilmez ve bilmemelidir. Gerçek entegrasyon
 * geldiğinde değişecek tek yer `src/data/container.ts` olacak.
 *
 * Hata yönetimi bilinçli olarak `Result<T,E>` ile modellenmedi: adapter'lar
 * hata durumunda `throw` eder, Next.js `error.tsx` sınırları yakalar. Bu hem
 * daha az kod hem de framework'ün kendi mekanizmasıyla uyumlu.
 */

export interface SalesPort {
  getSummary(range: DateRange): Promise<SalesSummary>;
}

export interface ProfitPort {
  getSummary(range: DateRange): Promise<ProfitSummary>;
}

export interface ProductPort {
  getPerformance(range: DateRange): Promise<ProductPerformance[]>;
}

export interface SignalPort {
  /** Tespit edilen tüm riskler — öncelik sırasında değil, ham liste. */
  getRisks(range: DateRange): Promise<Signal[]>;
  getOpportunities(range: DateRange): Promise<Signal[]>;
}

/**
 * Öncelik listesi.
 *
 * v1'de kural tabanlı motor bu portu uygular. İleride doğal dil özeti üreten
 * bir LLM adapter'ı **aynı portu** uygulayarak devreye girecek; kokpit kodu
 * bundan etkilenmeyecek.
 */
export interface PriorityPort {
  getPriorities(range: DateRange): Promise<PriorityAction[]>;
}

/**
 * "Şimdi" kavramı da bir bağımlılıktır.
 *
 * Doğrudan `new Date()` çağırmak testleri takvime bağlar ve mock verinin
 * deterministikliğini bozar. Saat de porttan gelir.
 */
export interface ClockPort {
  today(): IsoDate;
}
