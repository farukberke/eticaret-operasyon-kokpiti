"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import {
  isClosedOn,
  isDone,
  isSnoozedOn,
  matchesFilter,
  type IsoDate,
  type TaskFilter,
} from "@/core/domain";
import type { SignalView } from "@/features/signals/signal-view";
import { useTaskState } from "@/features/tasks/use-task-state";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney, formatShortDate } from "@/lib/format";
import { Card } from "@/ui/primitives/card";
import { EmptyState } from "@/ui/patterns/empty-state";
import { SignalCard } from "@/ui/patterns/signal-card";

import { DayBrief } from "./day-brief";
import { TaskActions } from "./task-actions.client";

/**
 * KOKPİT KUYRUĞU — panelin rapordan operasyona döndüğü yer.
 *
 * Neden istemci bileşeni: görev durumu `localStorage`'da yaşıyor ve sunucuda
 * okunamıyor. Sunucu tüm sinyalleri hazır görünüm modeli olarak veriyor,
 * kuyruk hangilerinin görüneceğine burada karar veriyor.
 *
 * Bilinen sınır: ilk boyamada kuyruk sunucunun bildiği hâliyle (her sinyal
 * açık) görünür, hidrasyondan sonra kullanıcının kararları uygulanır. Bu,
 * durum tarayıcıda olduğu sürece kaçınılmaz. Oturum ve veritabanı
 * geldiğinde `TaskPort` sunucu tarafına geçecek ve tamamen ortadan kalkacak.
 *
 * Sunucu **tüm** öncelikleri gönderir, ilk üçünü değil: kullanıcı üstteki
 * işleri kapattıkça alttakiler kuyruğa yükselmeli, ayrıca "Tamamlanan"
 * sekmesi ilk üçün dışındaki işleri de gösterebilmeli.
 */
const FILTERS: readonly TaskFilter[] = ["open", "snoozed", "done"];

export function CockpitQueue({
  views,
  today,
  locale,
  currency,
  limit,
}: {
  views: readonly SignalView[];
  today: IsoDate;
  locale: string;
  currency: string;
  /** Açık kuyrukta bir seferde gösterilecek iş sayısı. */
  limit: number;
}) {
  const t = useTranslations("queue");
  const cockpit = useTranslations("cockpit");

  const { states, complete, snooze, reopen } = useTaskState(today);
  const [filter, setFilter] = useState<TaskFilter>("open");

  const byFilter = useMemo(() => {
    const grouped = new Map<TaskFilter, SignalView[]>(
      FILTERS.map((key) => [key, [] as SignalView[]]),
    );
    for (const view of views) {
      for (const key of FILTERS) {
        if (matchesFilter(states.get(view.id), key, today)) {
          grouped.get(key)!.push(view);
        }
      }
    }
    return grouped;
  }, [views, states, today]);

  // `useMemo` bağımlılığı olduğu için ayrı tutuluyor: `?? []` her render'da
  // yeni dizi üretir ve özeti gereksiz yere yeniden hesaplatır.
  const open = useMemo(() => byFilter.get("open") ?? [], [byFilter]);
  const active = byFilter.get(filter) ?? [];
  // Yalnızca açık kuyruk kısaltılır; kapanmış işlerin tamamı görünmeli.
  const shown = filter === "open" ? active.slice(0, limit) : active;

  /**
   * Günün özeti her zaman **açık** işlerden hesaplanır, aktif sekmeden değil.
   * "Tamamlananlar"a bakarken bile günün durumu değişmez.
   */
  const brief = useMemo(() => {
    const queue = open.slice(0, limit);
    if (queue.length === 0) {
      return { headline: cockpit("allClear"), stake: undefined, dueToday: undefined };
    }

    const stakeMinor = queue.reduce((sum, view) => sum + view.moneyAtStakeMinor, 0);
    const urgent = queue.filter((view) => view.deadline?.urgent).length;

    return {
      headline: cockpit("briefCount", { count: queue.length }),
      stake: cockpit("briefStake", {
        amount: formatMoney({ minor: stakeMinor, currency }, locale),
      }),
      dueToday: urgent > 0 ? cockpit("briefDueToday", { count: urgent }) : undefined,
    };
  }, [open, limit, cockpit, currency, locale]);

  const emptyFor = (key: TaskFilter) => {
    if (key === "snoozed") {
      return { title: t("emptySnoozed"), description: t("emptySnoozedDescription") };
    }
    if (key === "done") {
      return { title: t("emptyDone"), description: t("emptyDoneDescription") };
    }
    return {
      title: cockpit("allClear"),
      description: cockpit("allClearDescription"),
    };
  };

  const remaining = open.length - shown.length;

  return (
    <div className="flex flex-col gap-4">
      <DayBrief
        headline={brief.headline}
        stake={brief.stake}
        dueToday={brief.dueToday}
      />

      {/* Sekmeler. Sayaçlar sekmeye girmeden hacmi belli etsin. */}
      <div className="flex flex-wrap gap-1" role="tablist">
        {FILTERS.map((key) => {
          const count = byFilter.get(key)?.length ?? 0;
          const selected = key === filter;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                selected
                  ? "bg-accent-soft text-accent"
                  : "text-fg-muted hover:bg-surface-muted hover:text-fg",
              )}
            >
              {t(
                key === "open"
                  ? "filterOpen"
                  : key === "snoozed"
                    ? "filterSnoozed"
                    : "filterDone",
              )}
              <span className="tabular ml-1 opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      <Card className="px-4">
        {shown.length === 0 ? (
          <EmptyState {...emptyFor(filter)} />
        ) : (
          <ul className="divide-border divide-y">
            {shown.map((view, index) => {
              const state = states.get(view.id);
              const snoozed = isSnoozedOn(state, today);
              const done = isDone(state);
              // Süresi dolmuş erteleme kuyruğa döndüğü için "kapalı" sayılmaz.
              const closed = isClosedOn(state, today);

              return (
                <li key={view.id}>
                  <SignalCard
                    rank={filter === "open" ? index + 1 : undefined}
                    title={view.title}
                    evidence={view.evidence}
                    action={view.action}
                    outcome={view.outcome}
                    deadline={view.deadline}
                    severityLabel={view.severityLabel}
                    severityTone={view.severityTone}
                    dimmed={closed}
                    note={
                      snoozed && state?.snoozedUntil
                        ? t("snoozedUntil", {
                            date: formatShortDate(state.snoozedUntil, locale),
                          })
                        : done
                          ? t("doneNote")
                          : undefined
                    }
                    actions={
                      <TaskActions
                        closed={closed}
                        doneLabel={view.doneLabel}
                        onComplete={() => complete(view.id)}
                        onSnooze={(days) => snooze(view.id, days)}
                        onReopen={() => reopen(view.id)}
                      />
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {filter === "open" && remaining > 0 && (
        <Link
          href="/priorities"
          className="text-accent inline-flex items-center gap-1 self-start text-xs font-medium hover:underline"
        >
          {cockpit("remaining", { count: remaining })}
          <ArrowRight className="size-3" aria-hidden />
        </Link>
      )}
    </div>
  );
}
