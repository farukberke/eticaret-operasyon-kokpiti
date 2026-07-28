import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Değişim göstergesi: ▲%12 / ▼%4.
 *
 * İki tasarım kararı:
 *
 * 1. **Yön yalnızca renkle anlatılmaz** — her zaman bir ok ikonu eşlik eder.
 *    Renk körü kullanıcı için kırmızı/yeşil ayrımı kaybolur, ok kaybolmaz.
 *
 * 2. **"Yukarı" her zaman iyi değildir.** İade oranı veya reklam maliyeti
 *    yükselmesi kötüdür. `higherIsBetter` bu yüzden zorunlu bir karar noktası;
 *    varsayılan vermek, bir gün sessizce yanlış rengi basardı.
 *
 * 3. **Bazı ölçüler ne iyi ne kötüdür.** Fırsat toplamının artması "daha çok
 *    kazanç fırsatı" da olabilir "işlerin bozulmaya başladığı" da; anlamı
 *    bağlam belirler. `"neutral"` bu durumda renk yerine yalnızca ok ve metin
 *    bırakır — yeşil basmak, kullanıcıya olmayan bir yargıyı satmak olurdu.
 */
export type Direction = "up" | "down" | "flat";

/** `true`/`false` bir yargıdır; `"neutral"` yargıda bulunmamaktır. */
export type DeltaMeaning = boolean | "neutral";

export interface TrendDeltaProps {
  readonly direction: Direction;
  /** Biçimlendirilmiş değişim metni ("+%12,4"). Hesaplanamıyorsa "—". */
  readonly label: string;
  readonly higherIsBetter: DeltaMeaning;
  /** Ekran okuyucu için tam cümle: "geçen döneme göre %12,4 arttı". */
  readonly srLabel?: string;
  readonly className?: string;
}

const ICONS = { up: ArrowUp, down: ArrowDown, flat: ArrowRight } as const;

function toneOf(direction: Direction, higherIsBetter: DeltaMeaning): string {
  if (direction === "flat" || higherIsBetter === "neutral") return "text-fg-muted";
  const isGood = direction === "up" ? higherIsBetter : !higherIsBetter;
  return isGood ? "text-success" : "text-danger";
}

export function TrendDelta({
  direction,
  label,
  higherIsBetter,
  srLabel,
  className,
}: TrendDeltaProps) {
  const Icon = ICONS[direction];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        toneOf(direction, higherIsBetter),
        className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span aria-hidden>{label}</span>
      <span className="sr-only">{srLabel ?? label}</span>
    </span>
  );
}
