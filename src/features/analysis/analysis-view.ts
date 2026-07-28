import { getTranslations } from "next-intl/server";

import type { AnalysisWindow } from "@/core/services/analysis-window";
import { formatDateRange } from "@/lib/format";

/**
 * Pencerenin kullanıcıya görünen hâli.
 *
 * Domain → görünüm çevirisi `features` katmanında yapılır: `ui` bileşenleri
 * `AnalysisWindow` değil hazır metin alır. İki ayrı ekranın aynı pencereyi
 * iki farklı cümleyle anlatmaması için etiket üretimi tek yerde.
 *
 * Yeni bir formatter yazılmadı: `formatDateRange` tam bu iş için vardı ve
 * bugüne kadar hiç çağrılmıyordu.
 */

/** "1 – 30 Tem" — pencerenin kapsadığı günler. */
export function analysisRangeLabel(window: AnalysisWindow, locale: string): string {
  return formatDateRange(window.range, locale);
}

/**
 * "1 – 30 Tem dönemine göre." — seçici taşımayan ekranların dipnotu.
 *
 * Dönem seçicisi yalnızca kokpitte; diğer ekranlar pencereyi bağlantıyla
 * devralır. Devraldığını yazmazlarsa kullanıcı 7 günlük kokpitten gelip
 * buradaki listeyi 30 günlük sanır.
 */
export async function analysisWindowNote(
  window: AnalysisWindow,
  locale: string,
): Promise<string> {
  const t = await getTranslations("analysis");
  return t("windowNote", { range: analysisRangeLabel(window, locale) });
}
