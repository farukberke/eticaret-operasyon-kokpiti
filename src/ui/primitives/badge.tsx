import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/cn";

/**
 * Durum rozeti.
 *
 * Renk hiçbir zaman tek başına anlam taşımaz — rozetin içinde her zaman
 * metin vardır. Renk körü bir kullanıcı için "kırmızı" bilgisi kaybolur,
 * "Kritik" yazısı kaybolmaz.
 */
const badge = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-muted text-fg-muted",
        danger: "border-danger-border bg-danger-soft text-danger",
        warning: "border-warning-border bg-warning-soft text-warning",
        success: "border-success-border bg-success-soft text-success",
        info: "border-info-border bg-info-soft text-info",
        accent: "border-accent bg-accent-soft text-accent",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badge>["tone"]>;

export interface BadgeProps
  extends ComponentPropsWithoutRef<"span">, VariantProps<typeof badge> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone }), className)} {...props} />;
}
