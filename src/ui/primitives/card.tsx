import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/cn";

/**
 * Kart yüzeyi — panelin temel yapı taşı.
 *
 * Gölge yok, yalnızca hairline kenarlık. Yoğun bir veri panelinde gölgeler
 * üst üste binerek görsel gürültü üretir; kenarlık sınırı aynı işi
 * daha sessiz yapar.
 */
export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn("border-border bg-surface rounded-lg border", className)}
      {...props}
    />
  );
}
