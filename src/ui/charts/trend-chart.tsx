"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { formatShortDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";

/**
 * Ana trend grafiği — ciro ve kâr, zaman içinde.
 *
 * Tasarım kuralları:
 *
 * • **Tek eksen.** Ciro ve kâr aynı birimde (₺) olduğu için tek ölçekte
 *   çizilir. İkinci bir y-ekseni eklemek, iki eğrinin kesişme noktasını
 *   tamamen keyfî hâle getiren en yaygın grafik hatasıdır.
 *
 * • **İki seri → efsane zorunlu.** Kimlik asla yalnız renge bırakılmaz.
 *
 * • **Metin seri rengini giymez.** Eksen ve tooltip yazıları metin
 *   token'larını kullanır; kimliği yanlarındaki renkli nokta taşır.
 *
 * • Biçimlendirme bileşenin içinde yapılır: fonksiyonlar sunucu→istemci
 *   sınırını geçemez, bu yüzden dışarıdan `locale` ve `currency` alınır.
 */
export interface TrendChartPoint {
  readonly date: string;
  /** Kuruş cinsinden — biçimlendirme burada yapılır. */
  readonly revenue: number;
  readonly profit: number;
}

export interface TrendChartProps {
  readonly points: readonly TrendChartPoint[];
  readonly locale: string;
  readonly currency: string;
  readonly labels: {
    readonly revenue: string;
    readonly profit: string;
  };
  readonly height?: number;
}

const AXIS_TICK = {
  fill: "var(--fg-subtle)",
  fontSize: 11,
  fontVariantNumeric: "tabular-nums",
} as const;

/**
 * Recharts'ın tooltip prop tipi sürümler arası oynadığı için ihtiyacımız olan
 * asgari şekil burada tanımlanıyor; kütüphane tipine sıkı bağlanmıyoruz.
 */
interface TooltipEntry {
  readonly name?: string | number | undefined;
  readonly value?: number | string | readonly (number | string)[] | undefined;
  readonly color?: string | undefined;
}

function ChartTooltip({
  active,
  payload,
  label,
  locale,
  currency,
}: {
  active?: boolean | undefined;
  payload?: readonly TooltipEntry[] | undefined;
  label?: string | number | undefined;
  locale: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="border-border bg-surface-raised rounded-md border px-3 py-2 shadow-sm">
      <p className="text-fg-muted mb-1 text-xs">
        {formatShortDate(String(label), locale)}
      </p>
      <ul className="flex flex-col gap-0.5">
        {payload.map((entry) => (
          <li
            key={entry.name}
            className="flex items-center gap-2 text-xs whitespace-nowrap"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
              aria-hidden
            />
            <span className="text-fg-muted">{entry.name}</span>
            <span className="text-fg tabular ml-auto font-medium">
              {formatMoney({ minor: Number(entry.value ?? 0), currency }, locale)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TrendChart({
  points,
  locale,
  currency,
  labels,
  height = 260,
}: TrendChartProps) {
  const series = [
    { key: "revenue" as const, label: labels.revenue, color: "var(--chart-1)" },
    { key: "profit" as const, label: labels.profit, color: "var(--chart-2)" },
  ];

  return (
    <figure className="m-0">
      {/* Efsane elle çiziliyor: Recharts'ınki seri rengini metne uyguluyor,
          bu da açık tonlarda okunmaz metin üretiyor. */}
      <figcaption className="mb-2 flex flex-wrap items-center gap-4">
        {series.map((s) => (
          <span key={s.key} className="text-fg-muted flex items-center gap-1.5 text-xs">
            <span
              className="h-0.5 w-3.5 rounded-full"
              style={{ backgroundColor: s.color }}
              aria-hidden
            />
            {s.label}
          </span>
        ))}
      </figcaption>

      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points as TrendChartPoint[]}
            margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
          >
            <CartesianGrid
              stroke="var(--chart-grid)"
              strokeWidth={1}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "var(--chart-axis)" }}
              minTickGap={28}
              tickFormatter={(value: string) => formatShortDate(value, locale)}
            />
            <YAxis
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(value: number) =>
                formatMoney({ minor: value, currency }, locale, {
                  compact: true,
                })
              }
            />
            <Tooltip
              cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
              content={(props: TooltipContentProps) => (
                <ChartTooltip
                  active={props.active}
                  payload={props.payload}
                  label={props.label}
                  locale={locale}
                  currency={currency}
                />
              )}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                dot={false}
                activeDot={{
                  r: 4,
                  stroke: "var(--surface)",
                  strokeWidth: 2,
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
