"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Badge, type BadgeTone } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";

import { CostEditor, type CostEditorRow } from "./cost-editor.client";

/**
 * "ÖNCE BUNLARI TAMAMLAYIN" — maliyet ekranının eylem bölümü.
 *
 * Aşağıdaki liste katalogdur: her ürün, alfabetik düzen, tarama işi.
 * Burası kuyruktur: en çok siparişi ve en çok parayı ölçülemez bırakan eksik
 * en üstte. Kullanıcı bu bölümde yukarıdan aşağı ilerlerse doğru sırada
 * çalışmış olur.
 *
 * Form yeniden yazılmadı — CTA mevcut `CostEditor`'ı satırın altında açar.
 * İkinci bir maliyet formu, ikinci bir doğrulama ve ikinci bir hata kaynağı
 * demekti; kaydetme akışı tek yerde kalıyor. Kayıt sonrası `CostEditor`
 * `router.refresh()` çağırdığı için sunucu bileşeni yeniden çalışır, etki
 * yeniden hesaplanır ve tamamlanan ürün kuyruktan kendiliğinden düşer.
 */
export interface MissingCostRow extends CostEditorRow {
  readonly identifier: string;
  readonly level: "critical" | "high" | "normal";
  readonly tone: BadgeTone;
  readonly reason: "revenue" | "volume" | "age";

  readonly orders: number;
  readonly units: number;
  readonly lines: number;
  readonly unitsLabel: string;
  readonly revenueLabel: string;
  readonly firstDateLabel: string;
  readonly lastDateLabel: string;
}

export function MissingCostPanel({
  rows,
  today,
  remaining,
}: {
  rows: readonly MissingCostRow[];
  today: string;
  /** Kuyrukta olup burada gösterilmeyen ürün sayısı. */
  remaining: number;
}) {
  const t = useTranslations("costs");
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <li
            key={row.productId}
            className="border-border bg-surface rounded-lg border p-3"
          >
            <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
              <span
                className="text-fg-subtle tabular w-5 shrink-0 pt-0.5 text-sm font-semibold"
                aria-hidden
              >
                {index + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-fg truncate text-sm font-medium">{row.name}</p>
                  <Badge tone={row.tone}>{t(`priorityLevel.${row.level}`)}</Badge>
                </div>
                <p className="text-fg-subtle text-xs">{row.identifier}</p>

                {/* Asıl mesaj: teknik durum değil, operasyonel sonuç. */}
                <p className="text-fg-muted mt-1.5 text-sm">
                  {t("priorityImpact", {
                    orders: row.orders,
                    revenue: row.revenueLabel,
                  })}
                </p>

                <p className="text-fg-subtle mt-1 text-xs">
                  {t("priorityDetail", {
                    units: row.unitsLabel,
                    lines: row.lines,
                    from: row.firstDateLabel,
                    to: row.lastDateLabel,
                  })}
                </p>

                <p className="text-fg-subtle mt-0.5 text-xs">
                  {t(`priorityReason.${row.reason}`)}
                </p>
              </div>

              <Button
                size="sm"
                onClick={() =>
                  setEditing((current) =>
                    current === row.productId ? null : row.productId,
                  )
                }
              >
                {editing === row.productId ? t("cancel") : t("priorityCta")}
              </Button>
            </div>

            {editing === row.productId && (
              <div className="mt-3">
                <CostEditor row={row} today={today} onDone={() => setEditing(null)} />
              </div>
            )}
          </li>
        ))}
      </ol>

      {remaining > 0 && (
        <p className="text-fg-subtle text-xs">
          {t("priorityRemaining", { count: remaining })}
        </p>
      )}
    </div>
  );
}
