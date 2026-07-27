"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import {
  isClosedOn,
  isDone,
  isSnoozedOn,
  matchesFilter,
  type Currency,
  type IsoDate,
  type TaskFilter,
} from "@/core/domain";
import { TIME_GROUPS, type TimeGroup } from "@/core/services/queue-groups";
import type { SignalView } from "@/features/signals/signal-view";
import { useTasks } from "@/features/tasks/task-state-provider.client";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { formatMoney, formatShortDate } from "@/lib/format";
import { Card } from "@/ui/primitives/card";
import { EmptyState } from "@/ui/patterns/empty-state";
import { SignalCard } from "@/ui/patterns/signal-card";

import { DayBrief } from "./day-brief";
import { QueueGroup } from "./queue-group.client";
import { TaskActions } from "./task-actions.client";

/**
 * KOKPİT KUYRUĞU — panelin rapordan operasyona döndüğü yer.
 *
 * Açık kuyruk **zamana göre** gruplanır: Bugün / Bu hafta / Takipte.
 * Gruplama son karar tarihinden gelir, şiddet rozetinden değil — "Kritik"
 * bir soyutlamadır, "Bugün" bir talimattır. Bu yüzden kokpit kartlarında
 * şiddet rozeti de gösterilmez; iki hiyerarşi yarışmaz.
 *
 * Ertelenen ve Tamamlanan sekmeleri gruplanmaz: onlarda soru "ne zaman karar
 * vermeliyim" değil, "neyi ertelemiştim / neyi kapatmıştım".
 *
 * Neden istemci bileşeni: görev durumu `localStorage`'da yaşıyor ve sunucuda
 * okunamıyor. Sunucu tüm sinyalleri hazır görünüm modeli olarak veriyor.
 */
const FILTERS: readonly TaskFilter[] = ["open", "snoozed", "done"];

const GROUP_LABEL: Record<TimeGroup, string> = {
  today: "groupToday",
  week: "groupWeek",
  later: "groupLater",
};

export function CockpitQueue({
  views,
  today,
  locale,
  currency,
}: {
  views: readonly SignalView[];
  today: IsoDate;
  locale: string;
  currency: Currency;
}) {
  const t = useTranslations("queue");
  const cockpit = useTranslations("cockpit");

  const { states, complete, snooze, reopen } = useTasks();
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

  /** Açık işlerin zaman gruplarına dağılımı. Sayaçlar buradan canlı gelir. */
  const byTime = useMemo(() => {
    const grouped = new Map<TimeGroup, SignalView[]>(
      TIME_GROUPS.map((key) => [key, [] as SignalView[]]),
    );
    for (const view of byFilter.get("open") ?? []) {
      grouped.get(view.timeGroup)!.push(view);
    }
    return grouped;
  }, [byFilter]);

  const todayGroup = useMemo(() => byTime.get("today") ?? [], [byTime]);

  /**
   * Günün özeti artık **Bugün grubuna** bağlı.
   *
   * Önceden "ilk 3 iş" üzerinden hesaplanıyordu ve "bugün 3 işin var" cümlesi
   * aslında "listenin ilk üçü" demekti. Zaman grupları geldiğine göre cümle
   * gerçekten bugünkü işi sayabilir.
   */
  const brief = useMemo(() => {
    if (todayGroup.length === 0) {
      return { headline: cockpit("allClear"), stake: undefined, dueToday: undefined };
    }

    const stakeMinor = todayGroup.reduce((sum, view) => sum + view.profitGainMinor, 0);
    const overdue = todayGroup.filter((view) => view.overdueDays > 0).length;

    return {
      headline: cockpit("briefCount", { count: todayGroup.length }),
      stake: cockpit("briefStake", {
        amount: formatMoney({ minor: stakeMinor, currency }, locale),
      }),
      dueToday: overdue > 0 ? cockpit("briefOverdue", { count: overdue }) : undefined,
    };
  }, [todayGroup, cockpit, currency, locale]);

  const renderCard = (view: SignalView, showRank: number | undefined) => {
    const state = states.get(view.id);
    const snoozed = isSnoozedOn(state, today);
    const done = isDone(state);
    const closed = isClosedOn(state, today);

    return (
      <li key={view.id}>
        <SignalCard
          rank={showRank}
          title={view.title}
          evidence={view.evidence}
          action={view.action}
          outcome={view.outcome}
          deadline={view.deadline}
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
              onComplete={() =>
                complete(view.id, { minor: view.profitGainMinor, currency })
              }
              onSnooze={(days) => snooze(view.id, days)}
              onReopen={() => reopen(view.id)}
            />
          }
        />
      </li>
    );
  };

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

  const activeCount = byFilter.get(filter)?.length ?? 0;

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

      {activeCount === 0 ? (
        <Card className="px-4">
          <EmptyState {...emptyFor(filter)} />
        </Card>
      ) : filter === "open" ? (
        <div className="flex flex-col gap-4">
          {TIME_GROUPS.map((group) => {
            const items = byTime.get(group) ?? [];
            return (
              <QueueGroup
                key={group}
                label={t(GROUP_LABEL[group])}
                count={items.length}
                tone={group === "today" ? "urgent" : "neutral"}
                /**
                 * Yalnızca "Bugün" açık başlar.
                 *
                 * Üçü birden açıkken kokpit 5000 piksele çıkıyordu ve
                 * "30 saniyede anla" vaadi scroll altında kalıyordu. Ekranın
                 * ilk görünümü bugünün işine ait olmalı; haftalık plan ve
                 * takip listesi bir tık ötede dursun.
                 */
                collapsible={group !== "today"}
              >
                <ul className="divide-border divide-y">
                  {items.map((view, index) => renderCard(view, index + 1))}
                </ul>
              </QueueGroup>
            );
          })}
        </div>
      ) : (
        <Card className="px-4">
          <ul className="divide-border divide-y">
            {(byFilter.get(filter) ?? []).map((view) => renderCard(view, undefined))}
          </ul>
        </Card>
      )}

      <Link
        href="/priorities"
        className="text-accent inline-flex items-center gap-1 self-start text-xs font-medium hover:underline"
      >
        {t("viewFullList")}
        <ArrowRight className="size-3" aria-hidden />
      </Link>
    </div>
  );
}
