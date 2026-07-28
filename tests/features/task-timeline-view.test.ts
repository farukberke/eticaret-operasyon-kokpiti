import { describe, expect, it } from "vitest";

import type { TaskTimelineBatch, TaskTimelineItem } from "@/core/domain";
import { buildPurchaseActionStatusTexts } from "@/features/cockpit/purchase-action-status-view";
import {
  buildTaskTimelineTexts,
  toTaskTimelineView,
  type TaskTimelineRowLookups,
} from "@/features/cockpit/task-timeline-view";
import type { Locale } from "@/i18n/routing";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * GÜNLÜK ZAMAN AKIŞI → GÖRÜNÜM.
 *
 * `toTaskTimelineView` hiçbir grup/rütbe/durum hesaplamaz: girdisi
 * `buildTaskTimeline`in çıktısıdır (zaten gruplanmış). Testler bu yüzden
 * yalnızca çeviriyi, grup başlıklarının sırasını, boş durumların hangi
 * senaryoda göründüğünü ve satır zenginleştirmesinin (ürün adı, aksiyon,
 * rütbe, durum) mevcut haritalardan olduğu gibi okunduğunu kovalıyor.
 */

const DICTIONARIES = { tr, en } as const;

function mockTranslator(messages: Record<string, unknown>) {
  return (key: string): string => {
    let node: unknown = messages;
    for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
    return String(node);
  };
}

function taskTimelineTextsFor(locale: keyof typeof DICTIONARIES) {
  const translate = mockTranslator(DICTIONARIES[locale].taskTimeline);
  return buildTaskTimelineTexts(
    translate as Parameters<typeof buildTaskTimelineTexts>[0],
  );
}

function statusTextsFor(locale: keyof typeof DICTIONARIES) {
  const translate = mockTranslator(DICTIONARIES[locale].stockAlerts);
  return buildPurchaseActionStatusTexts(
    translate as Parameters<typeof buildPurchaseActionStatusTexts>[0],
  );
}

const EMPTY_LOOKUPS: TaskTimelineRowLookups = {
  productNames: new Map(),
  actionPlanRowViews: new Map(),
  priorityViews: new Map(),
  leadTimeViews: new Map(),
};

function item(overrides: Partial<TaskTimelineItem> = {}): TaskTimelineItem {
  return {
    actionId: "p1",
    productId: "p1",
    rank: 1,
    status: "pending",
    group: "now",
    estimatedOrder: 1,
    ...overrides,
  };
}

function batchOf(items: readonly TaskTimelineItem[]): TaskTimelineBatch {
  const counts = { now: 0, today: 0, later: 0, completed: 0 };
  for (const i of items) counts[i.group] += 1;
  return {
    items,
    summary: {
      totalItems: items.length,
      activeItems: counts.now + counts.today + counts.later,
      nowItems: counts.now,
      todayItems: counts.today,
      laterItems: counts.later,
      completedItems: counts.completed,
    },
  };
}

const LOCALE: Locale = "tr";

describe("toTaskTimelineView — başlık ve dil", () => {
  it("TR: başlık ve yardımcı metin çeviridir", () => {
    const view = toTaskTimelineView(
      batchOf([]),
      LOCALE,
      EMPTY_LOOKUPS,
      statusTextsFor("tr"),
      taskTimelineTextsFor("tr"),
    );
    expect(view.title).toBe(tr.taskTimeline.title);
    expect(view.helperText).toBe(tr.taskTimeline.helperText);
  });

  it("EN: başlık ve yardımcı metin çeviridir", () => {
    const view = toTaskTimelineView(
      batchOf([]),
      "en",
      EMPTY_LOOKUPS,
      statusTextsFor("en"),
      taskTimelineTextsFor("en"),
    );
    expect(view.title).toBe(en.taskTimeline.title);
    expect(view.helperText).toBe(en.taskTimeline.helperText);
  });
});

describe("toTaskTimelineView — grup başlıkları ve sırası", () => {
  it("dolu gruplar now → today → later sırasıyla, doğru başlık ve sayımla görünür", () => {
    const batch = batchOf([
      item({ productId: "a", group: "now", estimatedOrder: 1 }),
      item({ productId: "b", group: "today", estimatedOrder: 1 }),
      item({ productId: "c", group: "later", estimatedOrder: 1 }),
    ]);
    const view = toTaskTimelineView(
      batch,
      LOCALE,
      EMPTY_LOOKUPS,
      statusTextsFor("tr"),
      taskTimelineTextsFor("tr"),
    );

    expect(view.activeGroups.map((g) => g.group)).toEqual(["now", "today", "later"]);
    expect(view.activeGroups[0]!.title).toBe(tr.taskTimeline.group.now);
    expect(view.activeGroups[1]!.title).toBe(tr.taskTimeline.group.today);
    expect(view.activeGroups[2]!.title).toBe(tr.taskTimeline.group.later);
    expect(view.activeGroups.map((g) => g.count)).toEqual([1, 1, 1]);
  });

  it("görünmeyen boş section davranışı: boş grup activeGroups'ta hiç yer almaz", () => {
    const batch = batchOf([
      item({ productId: "a", group: "now", estimatedOrder: 1 }),
      // today boş bırakılıyor
      item({ productId: "c", group: "later", estimatedOrder: 1 }),
    ]);
    const view = toTaskTimelineView(
      batch,
      LOCALE,
      EMPTY_LOOKUPS,
      statusTextsFor("tr"),
      taskTimelineTextsFor("tr"),
    );

    expect(view.activeGroups.map((g) => g.group)).toEqual(["now", "later"]);
    expect(view.activeGroups.some((g) => g.group === "today")).toBe(false);
  });

  it("presentation sırası korunur: satırlar grup içinde girdi sırasıyla aynı", () => {
    const batch = batchOf([
      item({ productId: "z", group: "now", estimatedOrder: 1 }),
      item({ productId: "a", group: "now", estimatedOrder: 2 }),
      item({ productId: "m", group: "now", estimatedOrder: 3 }),
    ]);
    const view = toTaskTimelineView(
      batch,
      LOCALE,
      EMPTY_LOOKUPS,
      statusTextsFor("tr"),
      taskTimelineTextsFor("tr"),
    );

    expect(view.activeGroups[0]!.rows.map((r) => r.productId)).toEqual(["z", "a", "m"]);
  });
});

describe("toTaskTimelineView — boş durum metinleri", () => {
  it("aktif aksiyon yoksa emptyActiveText kullanılır, activeGroups boştur", () => {
    const batch = batchOf([item({ group: "completed" })]);
    const view = toTaskTimelineView(
      batch,
      LOCALE,
      EMPTY_LOOKUPS,
      statusTextsFor("tr"),
      taskTimelineTextsFor("tr"),
    );
    expect(view.hasActiveItems).toBe(false);
    expect(view.activeGroups).toEqual([]);
    expect(view.emptyActiveText).toBe(tr.taskTimeline.emptyActive);
  });

  it("completed section görünürlüğü: tamamlanan varsa satırları taşır", () => {
    const batch = batchOf([
      item({ productId: "a", group: "completed", estimatedOrder: 1 }),
    ]);
    const view = toTaskTimelineView(
      batch,
      LOCALE,
      EMPTY_LOOKUPS,
      statusTextsFor("tr"),
      taskTimelineTextsFor("tr"),
    );
    expect(view.completedRows).toHaveLength(1);
    expect(view.completedTitle).toBe(tr.taskTimeline.group.completed);
  });

  it("completed section görünürlüğü: tamamlanan yoksa emptyCompletedText kullanılır", () => {
    const batch = batchOf([item({ group: "now" })]);
    const view = toTaskTimelineView(
      batch,
      LOCALE,
      EMPTY_LOOKUPS,
      statusTextsFor("tr"),
      taskTimelineTextsFor("tr"),
    );
    expect(view.completedRows).toEqual([]);
    expect(view.emptyCompletedText).toBe(tr.taskTimeline.emptyCompleted);
  });
});

describe("toTaskTimelineView — satır zenginleştirme (mevcut haritalardan okunur)", () => {
  it("ürün adı productNames haritasından okunur", () => {
    const lookups: TaskTimelineRowLookups = {
      ...EMPTY_LOOKUPS,
      productNames: new Map([["p1", "Yazlık Elbise"]]),
    };
    const view = toTaskTimelineView(
      batchOf([item()]),
      LOCALE,
      lookups,
      statusTextsFor("tr"),
      taskTimelineTextsFor("tr"),
    );
    expect(view.activeGroups[0]!.rows[0]!.productName).toBe("Yazlık Elbise");
  });

  it("rank olduğu gibi taşınır", () => {
    const view = toTaskTimelineView(
      batchOf([item({ rank: 7 })]),
      LOCALE,
      EMPTY_LOOKUPS,
      statusTextsFor("tr"),
      taskTimelineTextsFor("tr"),
    );
    expect(view.activeGroups[0]!.rows[0]!.rank).toBe(7);
  });

  it("priority/severity rozeti (rankLabel) priorityViews haritasından okunur, ikinci kez hesaplanmaz", () => {
    const lookups: TaskTimelineRowLookups = {
      ...EMPTY_LOOKUPS,
      priorityViews: new Map([
        ["p1", { rank: 1, rankLabel: "Öncelik #1", impact: "etki metni" }],
      ]),
    };
    const view = toTaskTimelineView(
      batchOf([item()]),
      LOCALE,
      lookups,
      statusTextsFor("tr"),
      taskTimelineTextsFor("tr"),
    );
    expect(view.activeGroups[0]!.rows[0]!.rankLabel).toBe("Öncelik #1");
  });

  it("haritada karşılığı olmayan satırda rankLabel/actionLabel/leadTimeText null olur", () => {
    const view = toTaskTimelineView(
      batchOf([item()]),
      LOCALE,
      EMPTY_LOOKUPS,
      statusTextsFor("tr"),
      taskTimelineTextsFor("tr"),
    );
    const row = view.activeGroups[0]!.rows[0]!;
    expect(row.rankLabel).toBeNull();
    expect(row.actionLabel).toBeNull();
    expect(row.leadTimeText).toBeNull();
    expect(row.quantityText).toBeNull();
  });

  it("aksiyon rozeti actionPlanRowViews haritasından okunur", () => {
    const lookups: TaskTimelineRowLookups = {
      ...EMPTY_LOOKUPS,
      actionPlanRowViews: new Map([
        [
          "p1",
          {
            productId: "p1",
            rank: 1,
            actionLabel: "Hemen ele al",
            tone: "danger",
            reasonText: "gerekçe",
            quantityText: "Önerilen sipariş: 24 adet",
          },
        ],
      ]),
    };
    const view = toTaskTimelineView(
      batchOf([item()]),
      LOCALE,
      lookups,
      statusTextsFor("tr"),
      taskTimelineTextsFor("tr"),
    );
    const row = view.activeGroups[0]!.rows[0]!;
    expect(row.actionLabel).toBe("Hemen ele al");
    expect(row.actionTone).toBe("danger");
    expect(row.quantityText).toBe("Önerilen sipariş: 24 adet");
  });

  it("lead time metni yalnızca visible: true ise okunur", () => {
    const lookups: TaskTimelineRowLookups = {
      ...EMPTY_LOOKUPS,
      leadTimeViews: new Map([
        ["p1", { visible: true, tone: "danger", message: "gecikti", detail: null }],
      ]),
    };
    const view = toTaskTimelineView(
      batchOf([item()]),
      LOCALE,
      lookups,
      statusTextsFor("tr"),
      taskTimelineTextsFor("tr"),
    );
    expect(view.activeGroups[0]!.rows[0]!.leadTimeText).toBe("gecikti");
  });

  it("status badge dönüşümü: pending/snoozed/done/ilgili durum etiketleri doğru çevrilir", () => {
    const batch = batchOf([
      item({ productId: "a", status: "pending", group: "now", estimatedOrder: 1 }),
      item({ productId: "b", status: "snoozed", group: "later", estimatedOrder: 1 }),
      item({ productId: "c", status: "done", group: "completed", estimatedOrder: 1 }),
    ]);
    const view = toTaskTimelineView(
      batch,
      LOCALE,
      EMPTY_LOOKUPS,
      statusTextsFor("tr"),
      taskTimelineTextsFor("tr"),
    );

    const now = view.activeGroups.find((g) => g.group === "now")!;
    const later = view.activeGroups.find((g) => g.group === "later")!;
    expect(now.rows[0]!.statusLabel).toBe(tr.stockAlerts.actionPlan.status.pending);
    expect(later.rows[0]!.statusLabel).toBe(tr.stockAlerts.actionPlan.status.snoozed);
    expect(view.completedRows[0]!.statusLabel).toBe(
      tr.stockAlerts.actionPlan.status.done,
    );
  });

  it("marker estimatedOrder'dan üretilir", () => {
    const view = toTaskTimelineView(
      batchOf([item({ estimatedOrder: 3 })]),
      LOCALE,
      EMPTY_LOOKUPS,
      statusTextsFor("tr"),
      taskTimelineTextsFor("tr"),
    );
    expect(view.activeGroups[0]!.rows[0]!.marker).toBe("3");
  });
});
