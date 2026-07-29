"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { buildMorningBrief } from "@/core/services/ai-morning-brief";
import type { PurchaseActionPlanBatch } from "@/core/services/purchase-action-plan";
import type { Locale } from "@/i18n/routing";
import { Badge } from "@/ui/primitives/badge";

import { narrateMorningBrief } from "./morning-brief-narration-actions";
import { toMorningBriefView, type MorningBriefTexts } from "./morning-brief-view";
import type { PurchaseActionPlanRowView } from "./purchase-action-plan-view";
import { useActionStatus } from "./purchase-action-status-provider.client";

/**
 * SABAH ÖZETİ — satın alma planının 10-15 saniyelik özeti.
 *
 * `buildMorningBrief` hiçbir şey hesaplamaz; `actionPlan`i (zaten sunucuda
 * hesaplanmış) ve kullanıcının kararlarını (`useActionStatus`) okur, yalnızca
 * sayar. Bu yüzden istemci bileşeni: durum `localStorage`da yaşıyor, sunucu
 * bunu bilmiyor — `PurchaseActionStatusSummary`nin aynı gerekçesi.
 *
 * `<PurchaseActionStatusProvider>`in içine, `PurchaseActionStatusSummary` ile
 * aynı bağlama render edilmesi gerekir — aksi halde ayrı bir durum kopyası
 * kurulur ve ikisi birbirinden bağımsız kayar.
 */
export function MorningBriefSummary({
  actionPlan,
  locale,
  texts,
  actionPlanRowViews,
}: {
  actionPlan: PurchaseActionPlanBatch;
  locale: Locale;
  texts: MorningBriefTexts;
  /**
   * `StockAlertsCard`de zaten kurulan görünüm haritası — odak satırının
   * eylem/gerekçe metni buradan okunur, ikinci bir çeviri üretilmez.
   */
  actionPlanRowViews: ReadonlyMap<string, PurchaseActionPlanRowView>;
}) {
  const { states } = useActionStatus();

  const brief = useMemo(
    () => buildMorningBrief(actionPlan, states),
    [actionPlan, states],
  );
  const view = useMemo(
    () => toMorningBriefView(brief, locale, texts),
    [brief, locale, texts],
  );
  const focusRowView = brief.focus
    ? actionPlanRowViews.get(brief.focus.productId)
    : undefined;

  /**
   * AI ANLATIMI — yalnızca gösterecek bir şey varken istenir.
   *
   * "Sakin gün" cümlesi zaten iyi ve statik (`view.allClearText`); LLM'e
   * onu yeniden yazdırmak gecikme ve maliyetten başka bir şey katmaz.
   *
   * `key` girdiyi özetler: içerik değişmeden yeniden istek atılmaz, ama
   * kullanıcı bir işi kapatıp özetin sayıları değiştiğinde yeni cümle
   * istenir. Sonuç `key`iyle birlikte tutulur — `CostHistory`deki
   * gerekçenin aynısı: aksi halde ürün/durum değişince eski cümle bir an
   * ekranda asılı kalır.
   */
  const narrationInput = useMemo(
    () =>
      view.hasActivity
        ? {
            locale,
            summary: brief.summary,
            focus: focusRowView
              ? {
                  actionLabel: focusRowView.actionLabel,
                  reasonText: focusRowView.reasonText,
                }
              : null,
          }
        : null,
    [view.hasActivity, locale, brief.summary, focusRowView],
  );
  const narrationKey = useMemo(
    () => (narrationInput ? JSON.stringify(narrationInput) : null),
    [narrationInput],
  );
  const [narration, setNarration] = useState<{ key: string; text: string } | null>(
    null,
  );
  /**
   * Hidrasyon sonrası `useActionStatus` `states`i localStorage'dan okuyup
   * ikinci kez set ettiğinde (`usePurchaseActionStatus`), içerik aynı kalsa
   * bile `brief`/`narrationInput` yeni bir referansla yeniden kurulur ve bu
   * efekt yeniden çalışır. Kilit `narrationKey`in **içeriğine** göre tutulur
   * (referansına göre değil): istek yalnızca içerik gerçekten değiştiğinde
   * tekrarlanır. Cevap uygulanırken de aynı ref'e bakılır — efekt cleanup'ı
   * (`current` bayrağı) burada kasıtlı olarak **yok**: içerik değişmeden
   * yeniden render olduğunda cleanup yine de tetiklenir ve istek atlanırdı
   * (ref eşleşiyor diye), ama zaten uçuştaki isteği "iptal edilmiş" işaretler
   * ve cevap hiç uygulanmazdı. Tek doğruluk kaynağı: cevap geldiğinde
   * `requestedKeyRef.current` hâlâ o isteğin anahtarına mı eşit.
   */
  const requestedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!narrationInput || !narrationKey) return;
    if (requestedKeyRef.current === narrationKey) return;
    requestedKeyRef.current = narrationKey;

    narrateMorningBrief(narrationInput)
      .then((text) => {
        if (requestedKeyRef.current === narrationKey) {
          setNarration({ key: narrationKey, text });
        }
      })
      .catch(() => {
        // Port asla throw etmez, ama istemci tarafı ağ hatasına karşı yine
        // de sağlam olsun: sessizce hiç göstermemek en güvenlisi.
      });
  }, [narrationInput, narrationKey]);

  const narrationText =
    narration && narrationKey && narration.key === narrationKey ? narration.text : null;

  return (
    <div className="border-border bg-surface-muted rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-fg text-xs font-semibold">{view.title}</h3>
        <span className="text-fg-subtle text-xs">{view.subtitle}</span>
        {view.hasActivity ? (
          <Badge tone={view.severityTone}>{view.severityLabel}</Badge>
        ) : null}
      </div>

      {!view.hasActivity ? (
        <p className="text-fg-muted mt-1 text-xs">{view.allClearText}</p>
      ) : (
        <>
          <p className="text-fg-muted mt-1.5 text-xs italic">
            <span className="text-fg-subtle font-medium not-italic">
              {texts.aiNarration.label}:
            </span>{" "}
            {narrationText ?? texts.aiNarration.loading}
          </p>

          {focusRowView ? (
            <div className="mt-1.5">
              <p className="text-fg-subtle text-xs">{view.prioritiesTitle}</p>
              <p className="text-fg text-sm font-medium">{focusRowView.actionLabel}</p>
              <p className="text-fg-muted text-xs">{focusRowView.reasonText}</p>
            </div>
          ) : null}

          <div className="mt-1.5">
            <p className="text-fg-subtle text-xs">{view.todayTasksLabel}</p>
            <ul className="text-fg-muted mt-0.5 flex flex-col gap-0.5 text-xs">
              {view.lines.map((line) => (
                <li key={line.kind}>{line.text}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
