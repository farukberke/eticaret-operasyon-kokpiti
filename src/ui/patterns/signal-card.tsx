import { ArrowRight, CalendarClock } from "lucide-react";

import { cn } from "@/lib/cn";
import { Badge, type BadgeTone } from "../primitives/badge";

/**
 * SİNYAL KARTI — risk, fırsat ve öncelik listesinin **tek** görsel bileşeni.
 *
 * Kart dört soruya sırayla cevap verir; sıra rastgele değil, satıcının
 * kafasındaki sırayla aynı:
 *
 *   1. NE olmuş?        → başlık
 *   2. NEDEN böyle?     → kanıt satırları
 *   3. NE YAPMALIYIM?   → aksiyon + son karar günü
 *   4. NE KAZANIRIM /
 *      NE KAYBEDERİM?   → sonuç bloğu
 *
 * Dördüncüsü en ikna edici olan ve en çok atlanandır. "₺41.304 riskte"
 * bir bilgidir; "yaparsan ₺41.304 korunur, yapmazsan her gün ₺8.560
 * eriyor" bir karardır.
 *
 * Bilinçli olarak domain tipi (`Signal`) almaz, hazır metin alır — `ui`
 * katmanı iş mantığından bağımsız kalsın ve çeviri/biçimlendirme locale'i
 * bilen `features` katmanında yapılsın diye.
 */
export interface SignalOutcome {
  /** "Yaparsan" */
  readonly doLabel: string;
  /** "+₺41.304 kâr korunur" */
  readonly doValue: string;
  /** "Yapmazsan" */
  readonly skipLabel: string;
  /** "−₺41.304" */
  readonly skipValue: string;
  /** "her gecikme günü ₺8.560" */
  readonly skipDetail?: string | undefined;
}

export interface SignalCardProps {
  /** Öncelik listesinde sıra numarası. Risk/fırsat listelerinde verilmez. */
  readonly rank?: number | undefined;
  readonly title: string;
  /** Kanıt satırları — "neden böyle söylüyorsun" sorusunun cevabı. */
  readonly evidence: readonly string[];
  /** Önerilen aksiyon: "Hemen stok tazele". */
  readonly action: string;
  readonly outcome: SignalOutcome;
  /** Son karar günü. `urgent` bugün ya da geçmiş demektir. */
  readonly deadline?: { readonly label: string; readonly urgent: boolean } | undefined;
  readonly severityLabel: string;
  readonly severityTone: BadgeTone;
  readonly className?: string;
}

export function SignalCard({
  rank,
  title,
  evidence,
  action,
  outcome,
  deadline,
  severityLabel,
  severityTone,
  className,
}: SignalCardProps) {
  return (
    <article className={cn("flex items-start gap-3 py-4", className)}>
      {rank !== undefined && (
        <span
          className="bg-surface-muted text-fg-muted tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          aria-hidden
        >
          {rank}
        </span>
      )}

      <div className="min-w-0 flex-1">
        {/* 1 — NE */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-fg text-sm font-semibold">{title}</h3>
          <Badge tone={severityTone}>{severityLabel}</Badge>
        </div>

        {/* 2 — NEDEN. Kartın en ikna edici parçası; fısıltı olamaz. */}
        {evidence.length > 0 && (
          <ul className="text-fg-muted mt-1.5 space-y-0.5 text-xs">
            {evidence.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        {/* 3 — NE YAPMALIYIM
            Aksiyon metni bilinçli olarak vurgu rengi TAŞIMAZ: mavi ve altı
            çizili görünen ama tıklanmayan bir metin, arayüzün kullanıcıya
            söylediği bir yalandır. */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="text-fg inline-flex items-center gap-1.5 text-sm font-medium">
            <ArrowRight className="text-fg-subtle size-3.5 shrink-0" aria-hidden />
            {action}
          </p>

          {deadline && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                deadline.urgent ? "text-danger" : "text-fg-muted",
              )}
            >
              <CalendarClock className="size-3.5 shrink-0" aria-hidden />
              {deadline.label}
            </span>
          )}
        </div>

        {/* 4 — NE KAZANIRIM / NE KAYBEDERİM */}
        {/* Genişlik sınırlı: geniş ekranda iki sütun birbirinden kopunca
            "kazanç ↔ kayıp" karşıtlığı okunmaz oluyor. */}
        <dl className="border-border bg-surface-muted mt-2.5 grid max-w-xl grid-cols-1 gap-x-4 gap-y-2 rounded-md border px-3 py-2 sm:grid-cols-2">
          <div>
            <dt className="text-fg-subtle text-[11px] font-medium">
              {outcome.doLabel}
            </dt>
            <dd className="text-success tabular text-sm font-semibold">
              {outcome.doValue}
            </dd>
          </div>
          <div className="sm:border-border sm:border-l sm:pl-4">
            <dt className="text-fg-subtle text-[11px] font-medium">
              {outcome.skipLabel}
            </dt>
            <dd className="text-danger tabular text-sm font-semibold">
              {outcome.skipValue}
            </dd>
            {outcome.skipDetail && (
              <dd className="text-fg-muted tabular mt-0.5 text-xs">
                {outcome.skipDetail}
              </dd>
            )}
          </div>
        </dl>
      </div>
    </article>
  );
}
