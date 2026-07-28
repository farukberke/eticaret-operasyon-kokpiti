"use client";

import { Ban, Check, Clock } from "lucide-react";
import type { ReactNode } from "react";

import { statusOf } from "@/core/services/purchase-action-status";
import { Badge } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";

import { useActionStatus } from "./purchase-action-status-provider.client";
import {
  toPurchaseActionStatusRowView,
  type PurchaseActionStatusTexts,
} from "./purchase-action-status-view";

/**
 * Bir satırın operasyon durumu sarmalayıcısı.
 *
 * `<li>` etiketini burada kurar (sunucudaki içerik yalnızca `children`
 * olarak gelir) çünkü görünürlük kararı — satırın hiç basılıp basılmayacağı —
 * durum değiştikçe **istemcide** değişmeli. İçerik (ürün adı, stok, tedarik
 * süresi, CTA) sunucuda hazırlanmış olarak `children`den geçer; bu bileşen
 * onu ikinci kez üretmez, yalnızca durum rozeti ve üç aksiyon düğmesini ekler.
 *
 * `hasAction` yoksa (ürün satın alma planında yok — `unknown` seviye gibi)
 * satır her zaman görünür ve kontroller hiç basılmaz; bu satırın operasyon
 * durumu diye bir şey yok.
 */
export function PurchaseActionStatusRow({
  productId,
  hasAction,
  texts,
  children,
}: {
  productId: string;
  hasAction: boolean;
  texts: PurchaseActionStatusTexts;
  children: ReactNode;
}) {
  const { states, markDone, snooze, ignore } = useActionStatus();
  const status = statusOf(states, productId);
  const view = toPurchaseActionStatusRowView(status, texts);

  if (hasAction && !view.visible) return null;

  return (
    <li className="border-border bg-surface rounded-lg border p-3">
      {children}
      {hasAction ? (
        <div className="border-border mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
          <Badge tone={view.tone}>{view.label}</Badge>
          <Button size="sm" variant="outline" onClick={() => markDone(productId)}>
            <Check className="size-3.5" aria-hidden />
            {texts.actions.done}
          </Button>
          <Button size="sm" variant="outline" onClick={() => snooze(productId)}>
            <Clock className="size-3.5" aria-hidden />
            {texts.actions.snooze}
          </Button>
          <Button size="sm" variant="outline" onClick={() => ignore(productId)}>
            <Ban className="size-3.5" aria-hidden />
            {texts.actions.ignore}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
