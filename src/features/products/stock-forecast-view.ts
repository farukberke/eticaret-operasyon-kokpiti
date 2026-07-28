import type { StockCoverageState, StockForecast } from "@/core/services/stock-forecast";
import type { Locale } from "@/i18n/routing";
import { formatNumber } from "@/lib/format";
import type { BadgeTone } from "@/ui/primitives/badge";

/**
 * STOK TAHMİNİ → GÖRÜNÜM.
 *
 * `core` çeviri bilmez, `ui` domain bilmez; ikisini burada birleştiriyoruz —
 * `signals/signal-view.ts` ile aynı sözleşme. Çıktı tamamen
 * serileştirilebilir: içinde fonksiyon ya da domain nesnesi yok, sunucu →
 * istemci sınırını sorunsuz geçer.
 *
 * İkon bileşeni bilinçli olarak burada seçilmiyor: React bileşeni o sınırı
 * geçemez. Görünüm `state`i taşır, istemci tablosu ondan ikonu kendi seçer.
 */

/**
 * Renk asla tek başına anlam taşımaz.
 *
 * Rozette her zaman hem ikon hem durum kelimesi var; ton üçüncü katman.
 * Kırmızıyı ayırt edemeyen kullanıcı için "Kritik" yazısı ve üçgen ikon
 * kaybolmaz.
 */
const TONE: Record<StockCoverageState, BadgeTone> = {
  critical: "danger",
  low: "warning",
  normal: "success",
  // Aşırı stok bir hata değil, bağlı sermaye: uyarı değil bilgi tonunda.
  high: "info",
  unknown: "neutral",
  noSales: "neutral",
  // Negatif stok gerçek bir veri hatası — sessizce nötr geçilemez.
  negative: "danger",
};

export interface StockCoverageView {
  readonly state: StockCoverageState;
  readonly tone: BadgeTone;
  /** "Kritik" / "Satış verisi yok" — rozetin içindeki kelime. */
  readonly stateLabel: string;
  /** "12,5 gün". Ölçülemeyen durumlarda `null` — sıfır yazmak yalan olurdu. */
  readonly daysLabel: string | null;
  /** "Son 30 günlük satış hızına göre tahmini." */
  readonly hint: string;
}

export interface StockCoverageTexts {
  /** Durum → kullanıcının göreceği kelime. */
  readonly state: Record<StockCoverageState, string>;
  /** Ham sayıyı birimiyle sarar: "12,5" → "12,5 gün". */
  readonly days: (days: string) => string;
  /** Pencere gün sayısını yerleştirir: "Son {days} günlük satış hızına göre…". */
  readonly hint: (windowDays: number) => string;
}

/**
 * Tahmin yoksa "bilinmiyor" gösterilir.
 *
 * Katalogda olup tahmini üretilmemiş bir ürün bir hata belirtisidir; boş hücre
 * bırakmak onu görünmez kılardı. `undefined` kabul etmek ayrıca çağıranın
 * `!` yazmasını gereksiz kılıyor.
 */
export function toStockCoverageView(
  forecast: StockForecast | undefined,
  locale: Locale,
  texts: StockCoverageTexts,
): StockCoverageView {
  const state = forecast?.state ?? "unknown";
  const days = forecast?.daysRemaining ?? null;

  return {
    state,
    tone: TONE[state],
    stateLabel: texts.state[state],
    // Ondalık anlamlı: 2,5 gün ile 2 gün farklı kararlar doğurur.
    daysLabel: days === null ? null : texts.days(formatNumber(days, locale, 1)),
    hint: texts.hint(forecast?.windowDays ?? 0),
  };
}
