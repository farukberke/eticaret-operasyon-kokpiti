import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/cn";

/**
 * Tablo primitifleri.
 *
 * Sarmalayıcı `overflow-x-auto` taşır: dar ekranda **tablo** yatay kayar,
 * sayfa değil. Bir panelde gövdenin yatay kayması, kullanıcıyı içeriğin
 * yarısından koparan en yaygın mobil hatadır.
 */
export function TableWrapper({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("w-full overflow-x-auto", className)} {...props} />;
}

export function Table({ className, ...props }: ComponentPropsWithoutRef<"table">) {
  return (
    <table className={cn("w-full border-collapse text-sm", className)} {...props} />
  );
}

export function THead({ className, ...props }: ComponentPropsWithoutRef<"thead">) {
  return (
    <thead className={cn("border-border border-b text-left", className)} {...props} />
  );
}

export function TBody({ className, ...props }: ComponentPropsWithoutRef<"tbody">) {
  return <tbody className={cn("divide-border divide-y", className)} {...props} />;
}

export function TR({ className, ...props }: ComponentPropsWithoutRef<"tr">) {
  return (
    <tr
      className={cn("hover:bg-surface-muted transition-colors", className)}
      {...props}
    />
  );
}

export function TH({ className, ...props }: ComponentPropsWithoutRef<"th">) {
  return (
    <th
      scope="col"
      className={cn(
        "text-fg-muted px-3 py-2 text-xs font-medium tracking-wide whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: ComponentPropsWithoutRef<"td">) {
  return (
    <td className={cn("text-fg px-3 py-2.5 whitespace-nowrap", className)} {...props} />
  );
}
