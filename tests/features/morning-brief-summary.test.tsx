// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IsoDate } from "@/core/domain";
import type {
  PurchaseActionPlanBatch,
  PurchaseActionPlanItem,
} from "@/core/services/purchase-action-plan";
import { buildMorningBriefTexts } from "@/features/cockpit/morning-brief-view";
import { MorningBriefSummary } from "@/features/cockpit/morning-brief-summary.client";
import {
  buildPurchaseActionPlanTexts,
  toPurchaseActionPlanRowViews,
} from "@/features/cockpit/purchase-action-plan-view";
import {
  PurchaseActionStatusProvider,
  useActionStatus,
} from "@/features/cockpit/purchase-action-status-provider.client";
import type { Locale } from "@/i18n/routing";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

import { installMemoryStorage } from "../data/memory-storage";

/**
 * AI ANLATIMI sunucu eylemi taklit ediliyor — `CostHistory` testlerindeki
 * gerekçenin aynısı: burada sorulan soru gerçek bir LLM'in ne yazdığı değil,
 * bileşenin yükleniyor → geldi geçişini doğru yönetip yönetmediği.
 */
const { narrateMorningBrief } = vi.hoisted(() => ({
  narrateMorningBrief: vi.fn(),
}));

vi.mock("@/features/cockpit/morning-brief-narration-actions", () => ({
  narrateMorningBrief,
}));

/**
 * SABAH ÖZETİ KARTI — `StockAlertsCard`in içindeki `PurchaseActionStatusProvider`
 * ile aynı bağlamı paylaşır. Testler bu yüzden `useActionStatus`u sunan bir
 * kontrol bileşeniyle birlikte render edilir: kullanıcı kararı verildiğinde
 * özetin **aynı anda** güncellendiğini doğrular — ayrı bir durum kopyası
 * kurulmadığının kanıtı.
 */

const MESSAGES = { tr, en };
const TODAY: IsoDate = "2026-07-29";

function planItem(
  overrides: Partial<PurchaseActionPlanItem> = {},
): PurchaseActionPlanItem {
  return {
    productId: "p1",
    rank: 1,
    action: "actNow",
    recommendedQuantity: null,
    alertState: "critical",
    leadTimeState: "late",
    daysRemaining: 5,
    orderDecisionDays: -2,
    shortageGapDays: 2,
    reason: "leadTimeAlreadyLate",
    ...overrides,
  };
}

function planOf(items: readonly PurchaseActionPlanItem[]): PurchaseActionPlanBatch {
  return {
    items,
    summary: {
      total: items.length,
      actNowCount: items.filter((i) => i.action === "actNow").length,
      decideTodayCount: items.filter((i) => i.action === "decideToday").length,
      planSoonCount: items.filter((i) => i.action === "planSoon").length,
      completeDataCount: items.filter((i) => i.action === "completeData").length,
      reviewCount: items.filter((i) => i.action === "review").length,
    },
  };
}

function Controls() {
  const { markDone, snooze } = useActionStatus();
  return (
    <div>
      <button onClick={() => markDone("p1")}>test-mark-done</button>
      <button onClick={() => snooze("p1")}>test-snooze</button>
    </div>
  );
}

function renderBrief(
  actionPlan: PurchaseActionPlanBatch,
  options: { locale?: Locale } = {},
) {
  const { locale = "tr" } = options;
  const messages = MESSAGES[locale];
  const actionPlanTexts = buildPurchaseActionPlanTexts(((
    key: string,
    values?: Record<string, string | number>,
  ) => {
    let node: unknown = messages.stockAlerts;
    for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
    let text = String(node);
    if (values) {
      for (const [name, value] of Object.entries(values)) {
        text = text.replace(`{${name}}`, String(value));
      }
    }
    return text;
  }) as Parameters<typeof buildPurchaseActionPlanTexts>[0]);
  const actionPlanRowViews = toPurchaseActionPlanRowViews(
    actionPlan.items,
    locale,
    actionPlanTexts,
  );

  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <PurchaseActionStatusProvider today={TODAY}>
        <Controls />
        <MorningBriefTexts
          actionPlan={actionPlan}
          locale={locale}
          actionPlanRowViews={actionPlanRowViews}
        />
      </PurchaseActionStatusProvider>
    </NextIntlClientProvider>,
  );
}

function mockTranslator(messages: Record<string, unknown>) {
  return (key: string, values?: Record<string, string | number>): string => {
    let node: unknown = messages;
    for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
    let text = String(node);
    if (values) {
      for (const [name, value] of Object.entries(values)) {
        text = text.replace(`{${name}}`, String(value));
      }
    }
    return text;
  };
}

function MorningBriefTexts({
  actionPlan,
  locale,
  actionPlanRowViews,
}: {
  actionPlan: PurchaseActionPlanBatch;
  locale: Locale;
  actionPlanRowViews: ReturnType<typeof toPurchaseActionPlanRowViews>;
}) {
  const texts = buildMorningBriefTexts(
    mockTranslator(MESSAGES[locale].morningBrief) as Parameters<
      typeof buildMorningBriefTexts
    >[0],
  );
  return (
    <MorningBriefSummary
      actionPlan={actionPlan}
      locale={locale}
      texts={texts}
      actionPlanRowViews={actionPlanRowViews}
    />
  );
}

beforeEach(() => {
  installMemoryStorage();
  narrateMorningBrief.mockReset();
  narrateMorningBrief.mockResolvedValue("AI test cümlesi.");
});

afterEach(cleanup);

describe("Sabah Özeti kartı", () => {
  it("kart görünür: başlık ve alt başlık basılır", () => {
    renderBrief(planOf([planItem()]));
    expect(screen.getByText(tr.morningBrief.title)).toBeDefined();
    expect(screen.getByText(tr.morningBrief.subtitle)).toBeDefined();
  });

  it("boş plan: sakin bir metin gösterir, rozet basmaz", () => {
    renderBrief(planOf([]));
    expect(screen.getByText(tr.morningBrief.allClear)).toBeDefined();
    expect(screen.queryByText(tr.morningBrief.severity.critical)).toBeNull();
    expect(screen.queryByText(tr.morningBrief.severity.normal)).toBeNull();
  });

  it("summary görünür: aktif aksiyon satırı sayıyı taşır", () => {
    renderBrief(planOf([planItem({ productId: "p1" }), planItem({ productId: "p2" })]));
    expect(screen.getByText("Bugün 2 satın alma aksiyonu öncelikli.")).toBeDefined();
  });

  it("kritik ürün varsa şiddet rozeti Kritik olur", () => {
    renderBrief(planOf([planItem({ alertState: "critical" })]));
    expect(screen.getByText(tr.morningBrief.severity.critical)).toBeDefined();
  });

  it("yalnızca low seviyeli ve safe tedarik süreli ürün varsa rozet Normal olur", () => {
    renderBrief(planOf([planItem({ alertState: "low", leadTimeState: "safe" })]));
    expect(screen.getByText(tr.morningBrief.severity.normal)).toBeDefined();
  });

  it("odak satırı en yüksek öncelikli ürünün eylem/gerekçe metnini gösterir", () => {
    renderBrief(planOf([planItem({ productId: "p1", rank: 1, action: "actNow" })]));
    expect(screen.getByText(tr.stockAlerts.actionPlan.action.actNow)).toBeDefined();
  });

  it("'Yapıldı' tıklanınca özet aynı anda güncellenir — ayrı bir durum kopyası yok", () => {
    renderBrief(planOf([planItem({ productId: "p1" })]));
    expect(screen.getByText(tr.morningBrief.severity.critical)).toBeDefined();
    expect(screen.getByText(tr.stockAlerts.actionPlan.action.actNow)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "test-mark-done" }));

    // Aktif aksiyon kalmadığı için artık kritik sayılmaz, odak satırı kaybolur,
    // ama plan hâlâ boş olmadığından (total>0) "tamamlandı" satırı görünür.
    expect(screen.queryByText(tr.morningBrief.severity.critical)).toBeNull();
    expect(screen.queryByText(tr.stockAlerts.actionPlan.action.actNow)).toBeNull();
    expect(screen.getByText("1 görev tamamlandı.")).toBeDefined();
  });

  it("'Ertele' tıklanınca ürün aktif kalır, odak satırı görünmeye devam eder", () => {
    renderBrief(planOf([planItem({ productId: "p1", action: "actNow" })]));
    fireEvent.click(screen.getByRole("button", { name: "test-snooze" }));
    expect(screen.getByText(tr.stockAlerts.actionPlan.action.actNow)).toBeDefined();
  });

  it("İngilizce: başlık ve satır metinleri çeviridir", () => {
    renderBrief(planOf([planItem()]), { locale: "en" });
    expect(screen.getByText(en.morningBrief.title)).toBeDefined();
    expect(screen.getByText(en.morningBrief.severity.critical)).toBeDefined();
  });
});

describe("Sabah Özeti — AI anlatımı", () => {
  it("aktif aksiyon varken önce yükleniyor metnini, sonra AI cümlesini gösterir", async () => {
    renderBrief(planOf([planItem({ productId: "p1" })]));

    expect(screen.getByText(tr.morningBrief.aiNarration.loading)).toBeDefined();
    expect(await screen.findByText("AI test cümlesi.")).toBeDefined();
    expect(narrateMorningBrief).toHaveBeenCalledTimes(1);
  });

  it("plan boşken AI eylemi hiç çağrılmaz — anlatılacak bir şey yok", () => {
    renderBrief(planOf([]));
    expect(narrateMorningBrief).not.toHaveBeenCalled();
  });

  it("AI eylemi reddedilirse sessizce yükleniyor metninde kalır, ekran çökmez", async () => {
    narrateMorningBrief.mockReset();
    narrateMorningBrief.mockRejectedValue(new Error("network"));

    renderBrief(planOf([planItem({ productId: "p1" })]));

    await waitFor(() => expect(narrateMorningBrief).toHaveBeenCalledTimes(1));
    expect(screen.getByText(tr.morningBrief.aiNarration.loading)).toBeDefined();
  });

  it("'Yapıldı' tıklanınca özet sayıları değişince AI eylemi yeniden çağrılır", async () => {
    renderBrief(planOf([planItem({ productId: "p1" })]));
    await waitFor(() => expect(narrateMorningBrief).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "test-mark-done" }));

    await waitFor(() => expect(narrateMorningBrief).toHaveBeenCalledTimes(2));
  });
});
