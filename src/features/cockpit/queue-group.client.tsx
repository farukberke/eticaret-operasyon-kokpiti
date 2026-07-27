"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { Card } from "@/ui/primitives/card";

/**
 * Kuyruk grubu kabuğu.
 *
 * "Takipte" grubu 25–30 iş barındırabilir; hepsini açık göstermek kokpiti
 * boğar ve "Bugün"ün üstünlüğünü yok eder. Bu yüzden grup katlanabilir ve
 * takip listesi kapalı başlar — açmak kullanıcının kararı.
 *
 * Boş gruplar hiç render edilmez: yer kaplamayan bir başlık bile okurun
 * gözünü yorar.
 */
export function QueueGroup({
  label,
  count,
  tone = "neutral",
  collapsible = false,
  children,
}: {
  label: string;
  count: number;
  /** "Bugün" grubu dikkat çeker; diğerleri sakin durur. */
  tone?: "urgent" | "neutral";
  collapsible?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!collapsible);

  if (count === 0) return null;

  const header = (
    <>
      <span
        className={cn(
          "text-[11px] font-semibold tracking-wide uppercase",
          tone === "urgent" ? "text-danger" : "text-fg-muted",
        )}
      >
        {label}
      </span>
      <span className="text-fg-subtle tabular text-xs">{count}</span>
    </>
  );

  return (
    <section className="flex flex-col gap-1.5">
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="hover:text-fg flex items-center gap-1.5 self-start rounded-sm transition-colors"
        >
          {open ? (
            <ChevronDown className="text-fg-subtle size-3.5" aria-hidden />
          ) : (
            <ChevronRight className="text-fg-subtle size-3.5" aria-hidden />
          )}
          {header}
        </button>
      ) : (
        <div className="flex items-center gap-1.5 px-0.5">{header}</div>
      )}

      {open && <Card className="px-4">{children}</Card>}
    </section>
  );
}
