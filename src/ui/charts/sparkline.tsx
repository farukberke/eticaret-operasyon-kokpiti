import { cn } from "@/lib/cn";

/**
 * Mini trend çizgisi — stat kartının içinde yaşar.
 *
 * Recharts değil, elle çizilmiş SVG. Sebebi: bu boyutta bir çizgi için
 * grafik kütüphanesi taşımak, sunucu bileşenini istemci bileşenine çevirmek
 * ve paket boyutunu şişirmek demek. Saf SVG sunucuda render olur, sıfır JS.
 *
 * Eksen, ızgara, etiket yok — sparkline'ın işi değer okutmak değil,
 * **şekil** göstermektir. Değerler zaten üstündeki sayıda ve tooltip'te.
 */
export interface SparklineProps {
  readonly values: readonly number[];
  /** Son N nokta vurgulanır ("bu dönem"), öncesi bağlam rengine düşer. */
  readonly highlightLast?: number;
  readonly className?: string;
  /** Ekran okuyucu açıklaması. Grafik dekoratifse boş bırakılabilir. */
  readonly ariaLabel?: string;
}

const WIDTH = 100;
const HEIGHT = 28;
const PADDING = 2;

function buildPoints(values: readonly number[]): { x: number; y: number }[] {
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  // Düz çizgide bölme hatası olmasın; ortada dursun.
  const span = max - min || 1;
  const step = values.length > 1 ? WIDTH / (values.length - 1) : 0;
  const usable = HEIGHT - PADDING * 2;

  return values.map((value, index) => ({
    x: index * step,
    y: PADDING + usable - ((value - min) / span) * usable,
  }));
}

const toPath = (points: readonly { x: number; y: number }[]): string =>
  points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

export function Sparkline({
  values,
  highlightLast = 0,
  className,
  ariaLabel,
}: SparklineProps) {
  const points = buildPoints(values);
  if (points.length < 2) return null;

  // Vurgulu bölüm bir nokta geriden başlar ki iki parça birleşik görünsün.
  const splitAt = Math.max(0, points.length - highlightLast - 1);
  const context = highlightLast > 0 ? points.slice(0, splitAt + 1) : points;
  const recent = highlightLast > 0 ? points.slice(splitAt) : [];
  const last = points[points.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("h-7 w-full overflow-visible", className)}
      role={ariaLabel ? "img" : "presentation"}
      {...(ariaLabel ? { "aria-label": ariaLabel } : { "aria-hidden": true })}
    >
      <path
        d={toPath(context)}
        fill="none"
        stroke={highlightLast > 0 ? "var(--chart-muted)" : "var(--chart-1)"}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />

      {recent.length > 1 && (
        <path
          d={toPath(recent)}
          fill="none"
          stroke="var(--chart-1)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Bitiş noktası: yüzey rengi halkasıyla, çizgiyi kestiği yerde okunur kalır. */}
      <circle
        cx={last.x}
        cy={last.y}
        r={2.5}
        fill="var(--chart-1)"
        stroke="var(--surface)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
