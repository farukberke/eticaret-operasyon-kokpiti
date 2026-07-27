import type { PriorityAction } from "../domain/priority";
import type { Signal } from "../domain/signal";

import type { AnalysisContext } from "./analysis-context";
import { detectOpportunities } from "./opportunity-detector";
import { detectRisks } from "./risk-detector";

/**
 * ÖNCELİK MOTORU — "bugün ne yapmalısın?" sorusunun cevabı.
 *
 * Risk ve fırsat sinyalleri tek havuzda toplanır ve tek ölçütle sıralanır:
 *
 *     skor = aciliyet(0–10) × etki(0–10)  →  0–100
 *
 * İki boyut da gerekli. Sadece paraya göre sıralamak, yarın patlayacak küçük
 * bir sorunu üç ay sonraki büyük bir fırsatın altına gömerdi. Sadece aciliyete
 * göre sıralamak ise ₺200'lük bir işi ₺40.000'lik işin üstüne çıkarırdı.
 *
 * Sonuç deterministiktir: aynı veri her zaman aynı sırayı verir. Eşitlik
 * bozucular (para → id) tam da bunun için var — sayfa yenilendiğinde listenin
 * karışması, paneli bir anda oyuncağa çevirirdi.
 */

/** Ham skor: aciliyet × etki, 0–100 aralığında. */
export function scoreOf(signal: Signal): number {
  return signal.urgency * signal.impact;
}

function compareSignals(a: Signal, b: Signal): number {
  const byScore = scoreOf(b) - scoreOf(a);
  if (byScore !== 0) return byScore;

  const byMoney = b.moneyAtStake.minor - a.moneyAtStake.minor;
  if (byMoney !== 0) return byMoney;

  // Son çare: kimlik. Sıranın veriye göre tamamen belirlenmesini garanti eder.
  return a.id.localeCompare(b.id);
}

/** Sinyalleri sıralayıp numaralandırır. */
export function rankSignals(signals: readonly Signal[]): PriorityAction[] {
  return [...signals].sort(compareSignals).map((signal, index) => ({
    rank: index + 1,
    score: Math.round(scoreOf(signal) * 10) / 10,
    signal,
  }));
}

/**
 * Bağlamdan tam öncelik listesini üretir.
 * Kokpit ilk N tanesini gösterir, `/priorities` sayfası tamamını.
 */
export function buildPriorities(context: AnalysisContext): PriorityAction[] {
  return rankSignals([...detectRisks(context), ...detectOpportunities(context)]);
}
