import type { getTranslations } from "next-intl/server";

import type {
  NotificationCenter,
  OperationalNotification,
  OperationalNotificationSeverity,
  OperationalNotificationType,
} from "@/core/domain";
import type { Locale } from "@/i18n/routing";
import { formatNumber } from "@/lib/format";
import type { BadgeTone } from "@/ui/primitives/badge";

/**
 * UYARI MERKEZİ → GÖRÜNÜM.
 *
 * `core` (`buildNotificationCenter`) sınıflandırmayı zaten yaptı; burada
 * eklenen şey yalnızca **çeviri**: başlık/açıklama şablonları, şiddet rozeti
 * ve (`criticalAction`/`leadTimeRisk` için) ürün adı eşleştirmesi. Business
 * hesabı burada yapılmaz — filtre, sıralama, tekrarsızlık ya da limit kararı
 * component tarafında da burada da yoktur, `core`de bitmiş durumda.
 *
 * Şiddet etiketleri (`Kritik`/`Dikkat`/`Olumlu`/`Bilgi`) yeni bir sözlük
 * anahtarı açmadan `smartInsights.severity`den okunur — aynı dört semantic
 * kavram iki özellikte de aynı kelimelerle karşılığa sahip, ikinci bir
 * çeviri kümesi icat edilmez (`purchase-action-plan-view.ts`nin
 * `stockAlerts.reorder.quantity`yi tekrar kullanmasıyla aynı ilke).
 */

const SEVERITY_TONE: Record<OperationalNotificationSeverity, BadgeTone> = {
  critical: "danger",
  warning: "warning",
  positive: "success",
  neutral: "neutral",
};

/**
 * Sayı/ürün adı yerini tutan işaretçiler. `buildNotificationCenterTexts`
 * şablonu bu değerlerle doldurur, `descriptionFor` gerçek değeri `.replace`
 * ile yerleştirir — satır metni yalnızca Client Component'te, kullanıcının
 * kararına bağlı sayı bilindiğinde tamamlanır. Fonksiyon değil düz metin
 * taşındığı için bu obje sunucu→istemci sınırını geçebilir.
 */
const COUNT_PLACEHOLDER = "__COUNT__";
const PRODUCT_NAME_PLACEHOLDER = "__PRODUCT_NAME__";

export interface NotificationCenterTexts {
  readonly title: string;
  readonly subtitle: string;
  readonly empty: string;
  readonly activeCountLabel: string;
  readonly moreNotifications: string;
  readonly severity: Record<OperationalNotificationSeverity, string>;
  readonly itemTitle: Record<OperationalNotificationType, string>;
  readonly description: {
    readonly criticalAction: string;
    readonly leadTimeRisk: string;
    readonly snoozedAction: string;
    readonly completedAction: string;
    readonly operationsClear: string;
  };
}

export function buildNotificationCenterTexts(
  notificationCenter: Awaited<ReturnType<typeof getTranslations<"notificationCenter">>>,
  smartInsights: Awaited<ReturnType<typeof getTranslations<"smartInsights">>>,
): NotificationCenterTexts {
  return {
    title: notificationCenter("title"),
    subtitle: notificationCenter("subtitle"),
    empty: notificationCenter("empty"),
    activeCountLabel: notificationCenter("activeCountLabel"),
    moreNotifications: notificationCenter("moreNotifications", {
      count: COUNT_PLACEHOLDER,
    }),
    severity: {
      critical: smartInsights("severity.critical"),
      warning: smartInsights("severity.warning"),
      positive: smartInsights("severity.positive"),
      neutral: smartInsights("severity.neutral"),
    },
    itemTitle: {
      criticalAction: notificationCenter("item.criticalAction.title"),
      leadTimeRisk: notificationCenter("item.leadTimeRisk.title"),
      snoozedAction: notificationCenter("item.snoozedAction.title"),
      completedAction: notificationCenter("item.completedAction.title"),
      operationsClear: notificationCenter("item.operationsClear.title"),
    },
    description: {
      criticalAction: notificationCenter("item.criticalAction.description", {
        productName: PRODUCT_NAME_PLACEHOLDER,
      }),
      leadTimeRisk: notificationCenter("item.leadTimeRisk.description", {
        productName: PRODUCT_NAME_PLACEHOLDER,
      }),
      snoozedAction: notificationCenter("item.snoozedAction.description", {
        count: COUNT_PLACEHOLDER,
      }),
      completedAction: notificationCenter("item.completedAction.description", {
        count: COUNT_PLACEHOLDER,
      }),
      operationsClear: notificationCenter("item.operationsClear.description"),
    },
  };
}

export interface NotificationRowView {
  readonly id: string;
  readonly type: OperationalNotificationType;
  readonly title: string;
  readonly description: string;
  readonly severityLabel: string;
  readonly tone: BadgeTone;
}

export interface NotificationCenterView {
  readonly title: string;
  readonly subtitle: string;
  readonly hasNotifications: boolean;
  /** Sabit tür sırasıyla — `core`teki sıra burada yeniden dizilmez. */
  readonly rows: readonly NotificationRowView[];
  readonly emptyText: string;
  /** "Aktif bildirimler: 3" — kalıcı olmayan, salt görüntüleme amaçlı sayaç; "okunmadı" değildir. */
  readonly activeCountText: string;
  /** `summary.hiddenByLimit > 0` ise dolu, aksi halde `null`. */
  readonly moreText: string | null;
}

/**
 * Yalnızca `criticalAction`/`leadTimeRisk` bir ürün adı ister — diğer üç tür
 * sayım tabanlıdır ve `productNames` haritasına hiç bakmaz.
 */
function descriptionFor(
  notification: OperationalNotification,
  locale: Locale,
  texts: NotificationCenterTexts,
  productNames: ReadonlyMap<string, string>,
): string {
  switch (notification.type) {
    case "criticalAction":
      return texts.description.criticalAction.replace(
        PRODUCT_NAME_PLACEHOLDER,
        (notification.productId
          ? productNames.get(notification.productId)
          : undefined) ?? "",
      );
    case "leadTimeRisk":
      return texts.description.leadTimeRisk.replace(
        PRODUCT_NAME_PLACEHOLDER,
        (notification.productId
          ? productNames.get(notification.productId)
          : undefined) ?? "",
      );
    case "snoozedAction":
      return texts.description.snoozedAction.replace(
        COUNT_PLACEHOLDER,
        formatNumber(notification.evidence.count, locale),
      );
    case "completedAction":
      return texts.description.completedAction.replace(
        COUNT_PLACEHOLDER,
        formatNumber(notification.evidence.count, locale),
      );
    case "operationsClear":
      return texts.description.operationsClear;
  }
}

export function toNotificationRowView(
  notification: OperationalNotification,
  locale: Locale,
  texts: NotificationCenterTexts,
  productNames: ReadonlyMap<string, string>,
): NotificationRowView {
  return {
    id: notification.id,
    type: notification.type,
    title: texts.itemTitle[notification.type],
    description: descriptionFor(notification, locale, texts, productNames),
    severityLabel: texts.severity[notification.severity],
    tone: SEVERITY_TONE[notification.severity],
  };
}

export function toNotificationCenterView(
  notificationCenter: NotificationCenter,
  locale: Locale,
  texts: NotificationCenterTexts,
  productNames: ReadonlyMap<string, string>,
): NotificationCenterView {
  const rows = notificationCenter.notifications.map((notification) =>
    toNotificationRowView(notification, locale, texts, productNames),
  );

  return {
    title: texts.title,
    subtitle: texts.subtitle,
    hasNotifications: rows.length > 0,
    rows,
    emptyText: texts.empty,
    activeCountText: `${texts.activeCountLabel}: ${formatNumber(
      notificationCenter.summary.activeRelatedActions,
      locale,
    )}`,
    moreText:
      notificationCenter.summary.hiddenByLimit > 0
        ? texts.moreNotifications.replace(
            COUNT_PLACEHOLDER,
            formatNumber(notificationCenter.summary.hiddenByLimit, locale),
          )
        : null,
  };
}
