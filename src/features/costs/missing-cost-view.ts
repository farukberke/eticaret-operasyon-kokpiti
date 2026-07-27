import type { MissingCostImpact, MissingCostLevel } from "@/core/domain";
import { formatMoney, formatNumber, formatShortDate } from "@/lib/format";
import type { Locale } from "@/i18n/routing";
import type { BadgeTone } from "@/ui/primitives/badge";

import type { MissingCostRow } from "./missing-cost-panel.client";

/**
 * Domain → görünüm çevirisi.
 *
 * Para ve tarih biçimlendirmesi burada, sunucuda yapılır: `formatMoney`
 * locale'i bilir ve sonuç istemciye hazır metin olarak gider. Sayıları
 * (sipariş, adet) ham bırakıyoruz — onları `next-intl` cümlenin içinde
 * çoğullamayla birlikte biçimlendirecek.
 */

const TONE: Record<MissingCostLevel, BadgeTone> = {
  critical: "danger",
  high: "warning",
  normal: "neutral",
};

export function toneOf(level: MissingCostLevel): BadgeTone {
  return TONE[level];
}

export function buildMissingCostRows(
  items: readonly MissingCostImpact[],
  locale: Locale,
): MissingCostRow[] {
  return items.map((item) => ({
    productId: item.productId,
    name: item.name,
    sku: item.sku,
    // Barkod varsa gösterilir: kullanıcı ürünü pazaryeri panelinde çoğu zaman
    // SKU ile değil barkodla arıyor.
    identifier: item.barcode ? `${item.sku} · ${item.barcode}` : item.sku,

    level: item.level,
    tone: toneOf(item.level),
    reason: item.reason,

    orders: item.affectedOrders,
    units: item.affectedUnits,
    lines: item.affectedLines,
    unitsLabel: formatNumber(item.affectedUnits, locale),
    revenueLabel: formatMoney(item.uncomputableRevenue, locale),
    firstDateLabel: formatShortDate(item.firstOrderDate, locale),
    lastDateLabel: formatShortDate(item.lastOrderDate, locale),

    // Maliyeti eksik olduğu için form boş açılır; `CostEditor`'ın beklediği
    // sözleşme bu (`unitCostValue` ham değer taşır, biçimlenmiş metin değil).
    unitCostValue: "",
    commissionValue: "",
    missing: true,
  }));
}
