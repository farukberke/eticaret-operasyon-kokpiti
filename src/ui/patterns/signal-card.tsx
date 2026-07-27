import { cn } from "@/lib/cn";
import { Badge, type BadgeTone } from "../primitives/badge";

/**
 * SİNYAL KARTI — risk, fırsat ve öncelik listesinin **tek** görsel bileşeni.
 *
 * Üçü de "bir varlık hakkında, para değeri olan, aciliyeti olan gözlem"
 * olduğu için üç ayrı kart yazmak gereksiz tekrar olurdu.
 *
 * Bilinçli olarak domain tipi (`Signal`) almaz, hazır metinler alır.
 * Böylece `ui` katmanı iş mantığından bağımsız kalır ve çeviri/biçimlendirme
 * kararları locale'i bilen `features` katmanında verilir.
 */
export interface SignalCardProps {
  /** Öncelik listesinde sıra numarası. Risk/fırsat listelerinde verilmez. */
  readonly rank?: number;
  readonly title: string;
  /** Kanıt satırları — "neden böyle söylüyorsun" sorusunun cevabı. */
  readonly evidence: readonly string[];
  /** Önerilen aksiyon: "Stok tazele". */
  readonly action: string;
  /** Masadaki para: "₺48.000". */
  readonly amount: string;
  /** Tutarın ne olduğu: "risk altında" / "fırsat". */
  readonly amountCaption: string;
  readonly severityLabel: string;
  readonly severityTone: BadgeTone;
  readonly className?: string;
}

export function SignalCard({
  rank,
  title,
  evidence,
  action,
  amount,
  amountCaption,
  severityLabel,
  severityTone,
  className,
}: SignalCardProps) {
  return (
    <article className={cn("flex items-start gap-3 py-3", className)}>
      {rank !== undefined && (
        <span
          className="bg-surface-muted text-fg-muted tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          aria-hidden
        >
          {rank}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-fg text-sm font-medium">{title}</h3>
          <Badge tone={severityTone}>{severityLabel}</Badge>
        </div>

        {evidence.length > 0 && (
          <p className="text-fg-muted mt-1 text-xs">{evidence.join(" · ")}</p>
        )}

        <p className="text-accent mt-1.5 text-xs font-medium">{action}</p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-fg tabular text-sm font-semibold">{amount}</p>
        <p className="text-fg-subtle text-xs">{amountCaption}</p>
      </div>
    </article>
  );
}
