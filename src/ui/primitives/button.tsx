import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/cn";

/**
 * Düğme.
 *
 * `asChild` ile bir `<Link>` sarmalanabilir: görünüm düğme, davranış bağlantı.
 * Bu, "detaya git" bağlantılarının hem tıklanabilir hem de klavyeyle
 * gezilebilir kalmasını sağlar — `onClick` ile yönlendirme yapmanın aksine.
 */
const button = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-accent-hover",
        outline: "border-border bg-surface text-fg hover:bg-surface-muted border",
        ghost: "text-fg-muted hover:bg-surface-muted hover:text-fg",
        link: "text-accent hover:underline underline-offset-4",
      },
      size: {
        sm: "h-8 px-2.5",
        md: "h-9 px-3.5",
        // Bağlantı görünümlü düğmeler kutu dolgusu almasın.
        inline: "h-auto p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ComponentPropsWithoutRef<"button">, VariantProps<typeof button> {
  readonly asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : "button";
  return <Component className={cn(button({ variant, size }), className)} {...props} />;
}
