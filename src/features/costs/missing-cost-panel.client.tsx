"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/ui/primitives/button";

import { CostEditor, type CostEditorRow } from "./cost-editor.client";
import { MissingCostItem, type MissingCostItemView } from "./missing-cost-item";

/**
 * "ÖNCE BUNLARI TAMAMLAYIN" — maliyet ekranının eylem bölümü.
 *
 * Aşağıdaki liste katalogdur: her ürün, alfabetik düzen, tarama işi.
 * Burası kuyruktur: en çok siparişi ve en çok parayı ölçülemez bırakan eksik
 * en üstte. Kullanıcı bu bölümde yukarıdan aşağı ilerlerse doğru sırada
 * çalışmış olur.
 *
 * Satırın kendisi `MissingCostItem`'da; aynı satır kokpitteki görev kartında
 * da görünüyor. Burada kalan tek şey **eylem**: form yeniden yazılmadı, CTA
 * mevcut `CostEditor`'ı satırın altında açar. İkinci bir maliyet formu,
 * ikinci bir doğrulama ve ikinci bir hata kaynağı demekti; kaydetme akışı tek
 * yerde kalıyor. Kayıt sonrası `CostEditor` `router.refresh()` çağırdığı için
 * sunucu bileşeni yeniden çalışır, etki yeniden hesaplanır ve tamamlanan ürün
 * kuyruktan kendiliğinden düşer.
 */
export interface MissingCostRow extends CostEditorRow, MissingCostItemView {}

export function MissingCostPanel({
  rows,
  today,
  remaining,
  focusProductId,
}: {
  rows: readonly MissingCostRow[];
  today: string;
  /** Kuyrukta olup burada gösterilmeyen ürün sayısı. */
  remaining: number;
  /**
   * Kokpitten "Tamamla" ile gelindiğinde formu açık başlayacak ürün.
   *
   * Kullanıcı kokpitte kararını çoktan verdi; burada aynı ürünü bir daha
   * bulup bir daha tıklaması, iki ekran arasında kaybedilmiş bir adım olurdu.
   */
  focusProductId?: string | undefined;
}) {
  const t = useTranslations("costs");
  const [editing, setEditing] = useState<string | null>(focusProductId ?? null);

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <MissingCostItem
            key={row.productId}
            row={row}
            rank={index + 1}
            action={
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
            }
          >
            {editing === row.productId && (
              <CostEditor row={row} today={today} onDone={() => setEditing(null)} />
            )}
          </MissingCostItem>
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
