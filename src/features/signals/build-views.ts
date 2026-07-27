import { getTranslations } from "next-intl/server";

import type { Signal } from "@/core/domain";

import { toSignalView, type SignalView } from "./signal-view";

/**
 * Sinyalleri sunucuda görünüm modeline çevirir.
 *
 * Yedi ayrı çeviri alanının toplanması hem `SignalList` hem de istemci
 * kuyruğu için gerekli; iki yerde tekrar etmesin diye burada tek yerde.
 *
 * Sunucuda çalışması bilinçli: sözlükler ve `Intl` çağrıları tarayıcıya
 * inmez, istemciye yalnızca hazır metin gider.
 */
export async function buildSignalViews(
  signals: readonly Signal[],
  locale: string,
  options: { ranked?: boolean } = {},
): Promise<SignalView[]> {
  if (signals.length === 0) return [];

  const [signal, action, done, evidence, severity, outcome, subject, common] =
    await Promise.all([
      getTranslations("signal"),
      getTranslations("action"),
      getTranslations("done"),
      getTranslations("evidence"),
      getTranslations("severity"),
      getTranslations("outcome"),
      getTranslations("subject"),
      getTranslations("common"),
    ]);

  const translators = {
    signal,
    action,
    done,
    evidence,
    severity,
    outcome,
    subject,
    common,
  } as const;

  return signals.map((item, index) =>
    toSignalView(item, locale, translators, options.ranked ? index + 1 : undefined),
  );
}
