import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Boş durum.
 *
 * Bir operasyon panelinde boşluk çoğu zaman **iyi haberdir**: "hiç risk yok"
 * bir hata değil, kutlanacak bir durumdur. Bu yüzden bileşen nötr/olumlu bir
 * dil taşır; "veri bulunamadı" gibi hata gibi okunan ifadeler kullanılmaz.
 */
export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly icon?: ReactNode;
  readonly className?: string;
}

export function EmptyState({ title, description, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 px-4 py-8 text-center",
        className,
      )}
    >
      {icon && <div className="text-fg-subtle mb-1">{icon}</div>}
      <p className="text-fg text-sm font-medium">{title}</p>
      {description && <p className="text-fg-muted max-w-xs text-xs">{description}</p>}
    </div>
  );
}
