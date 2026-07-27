import { getTranslations } from "next-intl/server";

import { sumMoney, type PriorityAction } from "@/core/domain";
import type { Locale } from "@/i18n/routing";
import { formatMoney } from "@/lib/format";

/**
 * GÜNÜN TEK CÜMLESİ — ekranın ilk 5 saniyesi.
 *
 * Kullanıcı başka hiçbir şey okumasa bile buradan çıkması gereken üç bilgi:
 * kaç iş var, yapılırsa ne kazanılır, ne kadar acele var.
 *
 * KPI kutusu değil, **cümle**. Bir sayı ("₺127.000") kullanıcıya bunun iyi mi
 * kötü mü olduğunu düşündürür; bir cümle ("yaparsan ₺127.000 kâr korunur")
 * düşünmeyi ortadan kaldırır. 30 saniye hedefi tam olarak burada kazanılır
 * ya da kaybedilir.
 */
export async function DayBrief({
  priorities,
  locale,
}: {
  priorities: readonly PriorityAction[];
  locale: Locale;
}) {
  const t = await getTranslations("cockpit");

  if (priorities.length === 0) {
    return (
      <section className="pb-1">
        <p className="text-fg text-xl font-semibold tracking-tight sm:text-2xl">
          {t("allClear")}
        </p>
        <p className="text-fg-muted mt-1 text-sm">{t("allClearDescription")}</p>
      </section>
    );
  }

  const atStake = sumMoney(priorities.map((item) => item.signal.moneyAtStake));

  // Son karar günü bugün ya da geçmiş olanlar: gerçekten bugün karar isteyenler.
  const dueToday = priorities.filter(
    (item) =>
      item.signal.deadline !== undefined &&
      item.signal.deadline <= item.signal.detectedAt,
  ).length;

  return (
    <section className="pb-1">
      <p className="text-fg text-xl leading-snug font-semibold tracking-tight sm:text-2xl">
        {t("briefCount", { count: priorities.length })}{" "}
        <span className="text-fg-muted font-normal">
          {t("briefStake", { amount: formatMoney(atStake, locale) })}
        </span>
      </p>
      {dueToday > 0 && (
        <p className="text-danger mt-1.5 text-sm font-medium">
          {t("briefDueToday", { count: dueToday })}
        </p>
      )}
    </section>
  );
}
