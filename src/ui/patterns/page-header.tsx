import type { ReactNode } from "react";

/** Detay sayfalarının ortak başlığı — yedi sayfa aynı iskeleti paylaşır. */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-fg text-lg font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-fg-muted mt-0.5 text-sm">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
