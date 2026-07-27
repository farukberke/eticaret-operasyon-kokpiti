import { cn } from "@/lib/cn";
import { Sparkline } from "../charts/sparkline";
import { TrendDelta, type Direction } from "./trend-delta";

/**
 * KPI kartı — kokpitteki tüm sayılar bunu kullanır.
 *
 * Sözleşme: etiket · değer · (değişim) · (sparkline).
 * Dört KPI için dört ayrı kart bileşeni yazmak yerine tek kalıp; yeni bir
 * ölçü eklemek yeni bileşen değil, yeni bir `<StatTile>` demek.
 *
 * Not: büyük değer **orantılı rakam** kullanır, `tabular-nums` değil.
 * Tabular rakamlar her basamağa "0" genişliği verir; 24px'te "121" gevşek
 * görünür. Tabular yalnızca dikey hizalanması gereken sütunlarda kullanılır.
 */
export interface StatTileProps {
  readonly label: string;
  readonly value: string;
  readonly delta?: {
    readonly direction: Direction;
    readonly label: string;
    readonly higherIsBetter: boolean;
    readonly srLabel?: string;
  };
  /** Değişimin neye göre olduğu: "önceki 30 güne göre". */
  readonly comparison?: string;
  readonly sparkline?: readonly number[];
  readonly className?: string;
}

export function StatTile({
  label,
  value,
  delta,
  comparison,
  sparkline,
  className,
}: StatTileProps) {
  return (
    <div className={cn("flex flex-col gap-1.5 p-4", className)}>
      <p className="text-fg-muted text-xs font-medium">{label}</p>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-fg text-2xl leading-none font-semibold">{value}</span>
        {delta && (
          <TrendDelta
            direction={delta.direction}
            label={delta.label}
            higherIsBetter={delta.higherIsBetter}
            {...(delta.srLabel ? { srLabel: delta.srLabel } : {})}
          />
        )}
      </div>

      {comparison && <p className="text-fg-subtle text-xs">{comparison}</p>}

      {sparkline && sparkline.length > 1 && (
        <div className="mt-1.5">
          <Sparkline values={sparkline} highlightLast={7} />
        </div>
      )}
    </div>
  );
}
