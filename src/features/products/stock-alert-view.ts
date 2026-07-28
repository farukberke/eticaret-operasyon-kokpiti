import type { getTranslations } from "next-intl/server";

import type { StockAlert, StockAlertLevel } from "@/core/services/stock-alerts";
import type { Locale } from "@/i18n/routing";
import { formatNumber } from "@/lib/format";
import type { BadgeTone } from "@/ui/primitives/badge";

import { toStockCoverageView, type StockCoverageTexts } from "./stock-forecast-view";

/**
 * STOK UYARISI → GÖRÜNÜM.
 *
 * Durum kelimesi ve tonu **yeniden yazılmaz** — `toStockCoverageView` neyi
 * "Kritik" ya da "Negatif stok" sayıyorsa burada da odur. Ayrı bir eşleme
 * kurmak, tabloda "Kritik" görülen bir ürünün kokpitte başka bir kelimeyle
 * anılması riskini açardı.
 *
 * Eklenen tek şey **operasyonel yorum**: aynı durum kelimesinin arkasında
 * "neden öncelikli" ve "ne yapmalıyım" cümleleri. Bunlar sinyal kataloğundaki
 * `action.*` / `signalGroup.*` ile aynı sözleşmeyi taşır — koda gömülü metin
 * yok, tamamı `stockAlerts` sözlüğünden gelir.
 */
export interface StockAlertView {
  readonly productId: string;
  readonly productName: string;
  readonly stockLabel: string;
  readonly state: StockAlertLevel;
  readonly tone: BadgeTone;
  readonly stateLabel: string;
  /** Ölçülebilir durumlarda kalan gün; değilse `null` — çağıran `stateLabel`e düşer. */
  readonly daysLabel: string | null;
  /** "Neden öncelikli?" sorusunun cevabı. */
  readonly reason: string;
  /** "Ne yapmalıyım?" sorusunun cevabı. */
  readonly action: string;
}

export interface StockAlertTexts {
  readonly coverage: StockCoverageTexts;
  readonly reason: Record<StockAlertLevel, string>;
  readonly action: Record<StockAlertLevel, string>;
  readonly stock: (count: string) => string;
}

export function toStockAlertView(
  alert: StockAlert,
  locale: Locale,
  texts: StockAlertTexts,
  windowDays: number,
): StockAlertView {
  const coverage = toStockCoverageView(
    { state: alert.level, daysRemaining: alert.daysRemaining, windowDays },
    locale,
    texts.coverage,
  );

  return {
    productId: alert.productId,
    productName: alert.productName,
    stockLabel: texts.stock(formatNumber(alert.stock, locale)),
    state: alert.level,
    tone: coverage.tone,
    stateLabel: coverage.stateLabel,
    daysLabel: coverage.daysLabel,
    reason: texts.reason[alert.level],
    action: texts.action[alert.level],
  };
}

export function toStockAlertViews(
  alerts: readonly StockAlert[],
  locale: Locale,
  texts: StockAlertTexts,
  windowDays: number,
): StockAlertView[] {
  return alerts.map((alert) => toStockAlertView(alert, locale, texts, windowDays));
}

/**
 * `stockAlerts` ve `products` sözlüklerinden `StockAlertTexts` kurar.
 *
 * Durum listesi tek tek yazılır — `StockAlertLevel`e yeni bir durum
 * eklendiğinde burası tip hatası versin diye, sözlükte eksik bir anahtar
 * sessizce `undefined` basmasın diye.
 */
export function buildStockAlertTexts(
  stockAlerts: Awaited<ReturnType<typeof getTranslations<"stockAlerts">>>,
  coverage: StockCoverageTexts,
): StockAlertTexts {
  const reason: Record<StockAlertLevel, string> = {
    negative: stockAlerts("reason.negative"),
    critical: stockAlerts("reason.critical"),
    unknown: stockAlerts("reason.unknown"),
    low: stockAlerts("reason.low"),
  };

  const action: Record<StockAlertLevel, string> = {
    negative: stockAlerts("action.negative"),
    critical: stockAlerts("action.critical"),
    unknown: stockAlerts("action.unknown"),
    low: stockAlerts("action.low"),
  };

  return {
    coverage,
    reason,
    action,
    stock: (count) => stockAlerts("stockLabel", { count }),
  };
}
