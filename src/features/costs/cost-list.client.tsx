"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Badge } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";
import { Card } from "@/ui/primitives/card";

import { CostEditor, type CostEditorRow } from "./cost-editor.client";

/**
 * Maliyet listesi.
 *
 * Maliyeti eksik ürünler **üstte**: kullanıcının burada yapacağı iş onlar.
 * Girilmiş olanlar aşağıda, doğrulama ve düzeltme için erişilebilir kalır.
 */
export interface CostListRow extends CostEditorRow {
  readonly unitCostLabel: string;
  readonly commissionLabel: string;
  readonly effectiveFromLabel: string;
}

export function CostList({
  rows,
  today,
}: {
  rows: readonly CostListRow[];
  today: string;
}) {
  const t = useTranslations("costs");
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.productId}>
          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <p className="text-fg truncate text-sm font-medium">{row.name}</p>
                <p className="text-fg-subtle text-xs">{row.sku}</p>
              </div>

              <div className="text-right">
                <p className="text-fg-subtle text-[11px]">{t("unitCost")}</p>
                {row.missing ? (
                  <Badge tone="warning">{t("missing")}</Badge>
                ) : (
                  <p className="text-fg tabular text-sm font-semibold">
                    {row.unitCostLabel}
                  </p>
                )}
              </div>

              <div className="w-24 text-right">
                <p className="text-fg-subtle text-[11px]">{t("commission")}</p>
                <p className="text-fg-muted tabular text-sm">{row.commissionLabel}</p>
              </div>

              <div className="w-28 text-right">
                <p className="text-fg-subtle text-[11px]">{t("effectiveFrom")}</p>
                <p className="text-fg-muted tabular text-sm">
                  {row.effectiveFromLabel}
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setEditing((current) =>
                    current === row.productId ? null : row.productId,
                  )
                }
              >
                {t("edit")}
              </Button>
            </div>

            {editing === row.productId && (
              <div className="mt-3">
                <CostEditor row={row} today={today} onDone={() => setEditing(null)} />
              </div>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}
