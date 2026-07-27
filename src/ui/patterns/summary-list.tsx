import { cn } from "@/lib/cn";

/**
 * Gruplu özet listesi.
 *
 * Kokpitte risk ve fırsat bölümleri, öncelik listesindeki kartları tekrar
 * etmek yerine bunu kullanır. Aynı kartı tek ekranda iki kez göstermek hem
 * yer harcar hem de "zaten okudum" hissi verip bölümün atlanmasına yol açar.
 *
 * Burada verilen bilgi farklı: **hangi türden kaç tane var ve toplam ne kadar
 * para tutuyor**. Detay bir tık ötede.
 */
export type SummaryTone = "danger" | "warning" | "success" | "info" | "neutral";

export interface SummaryRow {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly amount: string;
  readonly tone: SummaryTone;
}

const DOT_COLOR: Record<SummaryTone, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
  info: "bg-info",
  neutral: "bg-fg-subtle",
};

export function SummaryList({
  rows,
  countLabel,
  className,
}: {
  rows: readonly SummaryRow[];
  /** Ekran okuyucu için adet açıklaması: "3 adet". */
  countLabel: (count: number) => string;
  className?: string;
}) {
  return (
    <ul className={cn("divide-border divide-y", className)}>
      {rows.map((row) => (
        <li key={row.id} className="flex items-center gap-3 py-2.5">
          <span
            className={cn("size-2 shrink-0 rounded-full", DOT_COLOR[row.tone])}
            aria-hidden
          />
          <span className="text-fg min-w-0 flex-1 truncate text-sm">{row.label}</span>
          <span className="text-fg-muted tabular shrink-0 text-xs">
            <span aria-hidden>×{row.count}</span>
            <span className="sr-only">{countLabel(row.count)}</span>
          </span>
          <span className="text-fg tabular w-28 shrink-0 text-right text-sm font-medium">
            {row.amount}
          </span>
        </li>
      ))}
    </ul>
  );
}
