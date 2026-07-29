"use client";

import { useMemo } from "react";

import { buildNotificationCenter } from "@/core/services/notification-center";
import type { PurchaseActionPlanBatch } from "@/core/services/purchase-action-plan";
import type { Locale } from "@/i18n/routing";
import { Badge } from "@/ui/primitives/badge";

import {
  toNotificationCenterView,
  type NotificationCenterTexts,
} from "./notification-center-view";
import { useActionStatus } from "./purchase-action-status-provider.client";

/**
 * UYARI MERKEZİ — hazır satın alma planı ve kullanıcı kararındaki dikkat
 * gerektiren durumların tek bir yerde toplanmış, kısa ve taranabilir listesi.
 *
 * `SmartInsights`/`TaskTimeline` ile aynı gerekçeyle istemci bileşeni:
 * `buildNotificationCenter` kullanıcının kararına (`useActionStatus`) bağlıdır
 * ve bu durum yalnızca tarayıcıda (`localStorage`) yaşar. Aynı
 * `<PurchaseActionStatusProvider>`i okur — ikinci bir durum kopyası kurulmaz.
 *
 * Bileşen yalnızca render eder: sınıflandırma (`buildNotificationCenter`,
 * core) ve çeviri (`toNotificationCenterView`, view-model) burada
 * tekrarlanmaz; component içinde filter/sort/reduce, dedup ya da limit
 * hesabı yoktur. Gösterilen sayaç ("Aktif bildirimler: N") kalıcı bir
 * okunmadı/yeni durumu değildir — her render'da `core`den taze hesaplanır,
 * hiçbir `localStorage` anahtarı yazmaz.
 */
export function NotificationCenter({
  actionPlan,
  locale,
  texts,
  productNames,
}: {
  actionPlan: PurchaseActionPlanBatch;
  locale: Locale;
  texts: NotificationCenterTexts;
  /** `StockAlertsCard`de zaten kurulan ürün adı haritası — ikinci bir çeviri üretilmez. */
  productNames: ReadonlyMap<string, string>;
}) {
  const { states } = useActionStatus();

  const notificationCenter = useMemo(
    () => buildNotificationCenter(actionPlan, states),
    [actionPlan, states],
  );
  const view = useMemo(
    () => toNotificationCenterView(notificationCenter, locale, texts, productNames),
    [notificationCenter, locale, texts, productNames],
  );

  return (
    <div
      className="border-border bg-surface-muted rounded-lg border p-3"
      data-testid="notification-center"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="text-fg text-xs font-semibold">{view.title}</p>
        <span className="text-fg-subtle text-xs">{view.subtitle}</span>
        {view.hasNotifications ? (
          <span className="text-fg-subtle text-xs">{view.activeCountText}</span>
        ) : null}
      </div>

      {!view.hasNotifications ? (
        <p className="text-fg-muted mt-1.5 text-xs">{view.emptyText}</p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1.5">
          {view.rows.map((row) => (
            <li
              key={row.id}
              className="border-border bg-surface rounded-md border px-2 py-1.5 text-xs"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={row.tone}>{row.severityLabel}</Badge>
                <span className="text-fg font-medium">{row.title}</span>
              </div>
              <p className="text-fg-muted mt-0.5">{row.description}</p>
            </li>
          ))}
        </ul>
      )}

      {view.moreText ? (
        <p className="text-fg-subtle mt-1.5 text-xs">{view.moreText}</p>
      ) : null}
    </div>
  );
}
