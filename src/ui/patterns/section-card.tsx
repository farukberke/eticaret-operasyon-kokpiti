import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { Card } from "../primitives/card";

/**
 * Kokpitteki her bölümün ortak kabuğu.
 *
 * Altı bölümün altı ayrı başlık/çerçeve/aksiyon-linki kodu yazması yerine
 * hepsi bunu kullanır. Bir bölüm eklemek artık kabuk kopyalamak değil,
 * `<SectionCard>` içine içerik koymak demek.
 */
export interface SectionCardProps {
  readonly title: string;
  /** Başlığın yanındaki sayaç: "Riskler (5)" — bakmadan hacmi belli olsun. */
  readonly count?: number;
  readonly description?: string;
  /** Sağ üstteki detay bağlantısı. */
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  /** İçerik kenardan kenara uzansın (tablolar için). */
  readonly flush?: boolean;
}

export function SectionCard({
  title,
  count,
  description,
  action,
  children,
  className,
  flush = false,
}: SectionCardProps) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h2 className="text-fg flex items-baseline gap-1.5 text-sm font-semibold">
            {title}
            {count !== undefined && (
              <span className="text-fg-subtle text-xs font-normal">({count})</span>
            )}
          </h2>
          {description && <p className="text-fg-muted mt-0.5 text-xs">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      <div className={cn("flex-1", flush ? "pb-0" : "px-4 pb-4")}>{children}</div>
    </Card>
  );
}
