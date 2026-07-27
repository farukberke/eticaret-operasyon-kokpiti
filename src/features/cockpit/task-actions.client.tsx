"use client";

import { Check, Clock, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { SNOOZE_OPTIONS } from "@/data/task-container";
import { Button } from "@/ui/primitives/button";

/**
 * Bir sinyalin karar düğmeleri.
 *
 * Üç durumun üçünde de **tek bir birincil eylem** var. Açık bir işte
 * "yaptım", kapanmış bir işte "geri al". Kullanıcıyı her kartta üç seçenek
 * arasında düşündürmek, kuyruğu hızlı işlemenin önündeki en büyük engeldir.
 *
 * Erteleme seçenekleri ancak istendiğinde açılır: varsayılan görünümde
 * kart başına iki düğme durur, beş değil.
 */
export function TaskActions({
  closed,
  doneLabel,
  onComplete,
  onSnooze,
  onReopen,
}: {
  /**
   * Görev kuyruktan çıkmış mı — **etkin** durum, ham `status` değil.
   *
   * Ayrım önemli: süresi dolmuş bir erteleme kaydı hâlâ `snoozed` yazar ama
   * iş kuyruğa geri dönmüştür. Ham duruma bakan bir kontrol, geri gelen işe
   * "Geri al" düğmesi gösterip kullanıcıyı kilitlerdi.
   */
  closed: boolean;
  doneLabel: string;
  onComplete: () => void;
  onSnooze: (days: number) => void;
  onReopen: () => void;
}) {
  const t = useTranslations("queue");
  const [choosingSnooze, setChoosingSnooze] = useState(false);

  // Kuyruktan çıkmış işlerde tek yol geri dönüş.
  if (closed) {
    return (
      <Button variant="outline" size="sm" onClick={onReopen}>
        <RotateCcw className="size-3.5" aria-hidden />
        {t("undo")}
      </Button>
    );
  }

  if (choosingSnooze) {
    return (
      <>
        {SNOOZE_OPTIONS.map((days) => (
          <Button
            key={days}
            variant="outline"
            size="sm"
            onClick={() => {
              setChoosingSnooze(false);
              onSnooze(days);
            }}
          >
            {t("snoozeDays", { days })}
          </Button>
        ))}
        <Button variant="ghost" size="sm" onClick={() => setChoosingSnooze(false)}>
          {t("snoozeCancel")}
        </Button>
      </>
    );
  }

  return (
    <>
      <Button size="sm" onClick={onComplete}>
        <Check className="size-3.5" aria-hidden />
        {doneLabel}
      </Button>
      <Button variant="outline" size="sm" onClick={() => setChoosingSnooze(true)}>
        <Clock className="size-3.5" aria-hidden />
        {t("snooze")}
      </Button>
    </>
  );
}
