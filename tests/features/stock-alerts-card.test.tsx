// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { IsoDate } from "@/core/domain";
import type { LeadTimeRisk } from "@/core/services/lead-time-risk";
import type { PurchaseActionPlanBatch } from "@/core/services/purchase-action-plan";
import type { PurchasePriorityItem } from "@/core/services/purchase-priority";
import type { ReorderRecommendation } from "@/core/services/reorder-suggestion";
import type { StockAlert } from "@/core/services/stock-alerts";
import type { AnalysisSelection } from "@/core/services/analysis-window";
import { DEFAULT_RULES } from "@/core/services/rules.config";
import { StockAlertsCard } from "@/features/cockpit/stock-alerts-card";
import type { Locale } from "@/i18n/routing";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

import { installMemoryStorage } from "../data/memory-storage";

/**
 * KOKPİTİN STOK UYARISI KARTI.
 *
 * Kart hiçbir şey hesaplamaz ya da sıralamaz; `buildStockAlerts` ne verdiyse
 * onu, verdiği sırayla gösterir. Testler bu yüzden servisin kararına
 * dokunulmadığını, CTA'nın doğru ürünü açtığını ve analiz penceresini
 * taşıdığını kovalıyor.
 */

const MESSAGES = { tr, en };

function alert(overrides: Partial<StockAlert> = {}): StockAlert {
  return {
    productId: "p1",
    productName: "Yazlık Elbise",
    stock: 5,
    level: "critical",
    daysRemaining: 5,
    ...overrides,
  };
}

const DEFAULT_WINDOW: AnalysisSelection = { preset: "last30" };

const EMPTY_RECOMMENDATIONS: ReadonlyMap<string, ReorderRecommendation> = new Map();

const EMPTY_PRIORITIES: readonly PurchasePriorityItem[] = [];

const EMPTY_LEAD_TIME_RISKS: ReadonlyMap<string, LeadTimeRisk> = new Map();

const TODAY: IsoDate = "2026-07-29";

type ActionPlanItem = PurchaseActionPlanBatch["items"][number];

function actionPlanBatch(
  items: readonly ActionPlanItem[] = [],
): PurchaseActionPlanBatch {
  return {
    items,
    summary: {
      total: items.length,
      actNowCount: items.filter((item) => item.action === "actNow").length,
      decideTodayCount: items.filter((item) => item.action === "decideToday").length,
      planSoonCount: items.filter((item) => item.action === "planSoon").length,
      completeDataCount: items.filter((item) => item.action === "completeData").length,
      reviewCount: items.filter((item) => item.action === "review").length,
    },
  };
}

function renderCard(
  alerts: readonly StockAlert[],
  options: {
    locale?: Locale;
    selection?: AnalysisSelection;
    hasData?: boolean;
    windowDays?: number;
    reorderRecommendations?: ReadonlyMap<string, ReorderRecommendation>;
    purchasePriorities?: readonly PurchasePriorityItem[];
    leadTimeRisks?: ReadonlyMap<string, LeadTimeRisk>;
    actionPlan?: PurchaseActionPlanBatch;
    today?: IsoDate;
  } = {},
) {
  const {
    locale = "tr",
    selection = DEFAULT_WINDOW,
    hasData = true,
    windowDays = 30,
    reorderRecommendations = EMPTY_RECOMMENDATIONS,
    purchasePriorities = EMPTY_PRIORITIES,
    leadTimeRisks = EMPTY_LEAD_TIME_RISKS,
    actionPlan,
    today = TODAY,
  } = options;

  return render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      <StockAlertsCard
        alerts={alerts}
        windowDays={windowDays}
        hasData={hasData}
        locale={locale}
        selection={selection}
        reorderRecommendations={reorderRecommendations}
        purchasePriorities={purchasePriorities}
        leadTimeRisks={leadTimeRisks}
        {...(actionPlan ? { actionPlan } : {})}
        today={today}
      />
    </NextIntlClientProvider>,
  );
}

/**
 * Ürün satırları — özet kutusundaki eylem-türü satırları da `<li>` kullanır
 * (`actionPlanSummary.rows`), bu yüzden yalnızca `role="listitem"` yeterli
 * ayırt edici değil. Her ürün satırı her zaman bir CTA bağlantısı taşır,
 * özet satırları hiç taşımaz — ayrım oradan yapılır.
 */
function rows(): HTMLElement[] {
  return screen
    .getAllByRole("listitem")
    .filter((row) => within(row).queryByRole("link") !== null);
}

beforeEach(() => {
  installMemoryStorage();
});

afterEach(cleanup);

describe("kokpit stok uyarısı kartı", () => {
  it("servisin sırasını yeniden sıralamaz", () => {
    // Servis "negative" önce sıralar diyor olsaydı bile kart kendi başına
    // sıralamaz — verilen sırayı olduğu gibi basar.
    renderCard([
      alert({
        productId: "p2",
        productName: "İkinci",
        level: "low",
        daysRemaining: 15,
      }),
      alert({
        productId: "p1",
        productName: "Birinci",
        level: "negative",
        daysRemaining: null,
      }),
      alert({
        productId: "p3",
        productName: "Üçüncü",
        level: "critical",
        daysRemaining: 2,
      }),
    ]);

    expect(rows().map((row) => row.textContent?.includes("İkinci"))).toEqual([
      true,
      false,
      false,
    ]);
    expect(rows().map((row) => row.textContent?.includes("Birinci"))).toEqual([
      false,
      true,
      false,
    ]);
    expect(rows().map((row) => row.textContent?.includes("Üçüncü"))).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("başlıktaki sayaç uyarı sayısını gösterir", () => {
    renderCard([alert({ productId: "p1" }), alert({ productId: "p2" })]);
    expect(screen.getByText("(2)")).toBeDefined();
  });

  it("CTA doğru ürünü odaklayan bağlantıyı taşır ve analiz penceresini korur", () => {
    renderCard([alert({ productId: "p1" })], { selection: { preset: "last7" } });

    const cta = screen.getByRole("link", { name: "Ürüne git" });
    expect(cta.getAttribute("href")).toBe(
      "/tr/products?product=p1&period=last7#product-p1",
    );
  });

  it("özel aralıkta iki ucu da bağlantıya yazar", () => {
    renderCard([alert({ productId: "p1" })], {
      selection: { preset: "custom", from: "2026-05-01", to: "2026-05-31" },
    });

    const cta = screen.getByRole("link", { name: "Ürüne git" });
    expect(cta.getAttribute("href")).toBe(
      "/tr/products?product=p1&period=custom&from=2026-05-01&to=2026-05-31#product-p1",
    );
  });

  it("her satır mevcut stoğu, durumu, gerekçeyi ve aksiyonu gösterir", () => {
    renderCard([alert({ level: "critical", daysRemaining: 3, stock: 5 })]);

    const row = rows()[0]!;
    expect(within(row).getByText("5 adet")).toBeDefined();
    expect(within(row).getByText(tr.products.coverage.critical)).toBeDefined();
    expect(within(row).getByText(tr.stockAlerts.reason.critical)).toBeDefined();
    expect(within(row).getByText(tr.stockAlerts.action.critical)).toBeDefined();
  });

  it("ölçülemeyen durumda kalan gün yerine durum kelimesi gösterilir", () => {
    renderCard([alert({ level: "unknown", daysRemaining: null })]);

    const row = rows()[0]!;
    // "Hesaplanamıyor" hem rozette hem gün satırında görünür — ikinci bir
    // "ölçülemedi" cümlesi icat edilmez.
    expect(
      within(row).getAllByText(tr.products.coverage.unknown).length,
    ).toBeGreaterThan(1);
  });

  it("uyarı yoksa aşırı iddiasız bir başarı metni gösterir", () => {
    renderCard([]);

    expect(screen.getByText(tr.stockAlerts.empty)).toBeDefined();
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.queryByText("(0)")).toBeNull();
  });

  it("katalogda hiç ürün yoksa boş durumla çelişmez", () => {
    renderCard([], { hasData: false });

    expect(screen.getByText(tr.stockAlerts.noData)).toBeDefined();
    expect(screen.queryByText(tr.stockAlerts.empty)).toBeNull();
  });

  it("en üstteki uyarı critical ya da negatifse kart uyarı kenarlığına geçer", () => {
    const { container } = renderCard([
      alert({ level: "negative", daysRemaining: null }),
    ]);
    expect(container.querySelector(".border-danger-border")).not.toBeNull();

    cleanup();

    const calm = renderCard([alert({ level: "low", daysRemaining: 15 })]);
    expect(calm.container.querySelector(".border-danger-border")).toBeNull();
  });

  it("İngilizce: metinler ve bağlantı locale'i takip eder", () => {
    renderCard([alert({ productId: "p1" })], { locale: "en" });

    expect(screen.getByText(en.stockAlerts.title)).toBeDefined();
    const cta = screen.getByRole("link", { name: "Go to product" });
    expect(cta.getAttribute("href")).toBe("/en/products?product=p1#product-p1");
  });

  it("İngilizce boş durum da çevrilidir", () => {
    renderCard([], { locale: "en" });
    expect(screen.getByText(en.stockAlerts.empty)).toBeDefined();
  });

  describe("yeniden sipariş önerisi", () => {
    const SUGGESTED: ReorderRecommendation = {
      kind: "suggested",
      quantity: 39,
      targetStockUnits: 50.4,
      dailyVelocity: 2.4,
      targetCoverageDays: 21,
      currentStock: 12,
    };

    it("critical satırında öneri varsa 'Önerilen sipariş' satırını gösterir", () => {
      renderCard([alert({ productId: "p1", level: "critical", daysRemaining: 5 })], {
        reorderRecommendations: new Map([["p1", SUGGESTED]]),
      });

      const row = rows()[0]!;
      expect(within(row).getByText(/Önerilen sipariş: 39 adet/)).toBeDefined();
    });

    it("öneri yoksa satır hiç gösterilmez", () => {
      renderCard([alert({ productId: "p1", level: "critical", daysRemaining: 5 })]);

      const row = rows()[0]!;
      expect(within(row).queryByText(/Önerilen sipariş/)).toBeNull();
    });

    it("negative/unknown satırlarında öneri satırı gösterilmez", () => {
      renderCard(
        [
          alert({ productId: "p1", level: "negative", daysRemaining: null }),
          alert({ productId: "p2", level: "unknown", daysRemaining: null }),
        ],
        {
          reorderRecommendations: new Map([
            ["p1", { kind: "correctStock" }],
            ["p2", { kind: "needsStockData" }],
          ]),
        },
      );

      for (const row of rows()) {
        expect(within(row).queryByText(/Önerilen sipariş/)).toBeNull();
      }
    });

    it("öneri satırı eklendiğinde CTA analiz penceresini korumaya devam eder", () => {
      renderCard([alert({ productId: "p1", level: "critical", daysRemaining: 5 })], {
        reorderRecommendations: new Map([["p1", SUGGESTED]]),
        selection: { preset: "last7" },
      });

      const cta = screen.getByRole("link", { name: "Ürüne git" });
      expect(cta.getAttribute("href")).toBe(
        "/tr/products?product=p1&period=last7#product-p1",
      );
    });

    it("İngilizce: öneri metni çeviridir", () => {
      renderCard([alert({ productId: "p1", level: "critical", daysRemaining: 5 })], {
        locale: "en",
        reorderRecommendations: new Map([["p1", SUGGESTED]]),
      });

      const row = rows()[0]!;
      expect(within(row).getByText(/Suggested reorder: 39 units/)).toBeDefined();
    });
  });

  describe("satın alma öncelik rozeti ve etki metni", () => {
    function priority(
      overrides: Partial<PurchasePriorityItem> = {},
    ): PurchasePriorityItem {
      return {
        productId: "p1",
        productName: "Test Ürünü",
        level: "critical",
        stock: 5,
        daysRemaining: 5,
        dailyVelocity: 2,
        reorderQuantity: 10,
        leadTimeStatus: "safe",
        orderDecisionDays: 10,
        shortageGapDays: null,
        rank: 1,
        ...overrides,
      };
    }

    it("kart sıralama yapmaz — çağıranın verdiği sırayı basar (rütbe rozeti olsa bile)", () => {
      // Kart, `purchasePriorities` verilse dahi `alerts`i olduğu gibi basar;
      // sıralama sorumluluğu `orderStockAlertsByPriority`de, kartta değil.
      renderCard(
        [
          alert({ productId: "ikinci", productName: "İkinci", level: "low" }),
          alert({ productId: "birinci", productName: "Birinci", level: "critical" }),
        ],
        {
          purchasePriorities: [
            priority({ productId: "birinci", level: "critical", rank: 1 }),
            priority({ productId: "ikinci", level: "low", rank: 2 }),
          ],
        },
      );

      expect(rows()[0]!.textContent).toContain("İkinci");
      expect(rows()[1]!.textContent).toContain("Birinci");
    });

    it("ilk üç rütbeye 'Öncelik #N' rozeti gösterir", () => {
      renderCard(
        [
          alert({
            productId: "p1",
            productName: "Bir",
            level: "negative",
            daysRemaining: null,
          }),
        ],
        {
          purchasePriorities: [
            priority({ productId: "p1", level: "negative", rank: 1 }),
          ],
        },
      );

      expect(within(rows()[0]!).getByText("Öncelik #1")).toBeDefined();
    });

    it("dördüncü ve sonraki rütbelerde rozet gösterilmez", () => {
      renderCard([alert({ productId: "p4" })], {
        purchasePriorities: [priority({ productId: "p4", rank: 4 })],
      });

      expect(within(rows()[0]!).queryByText(/Öncelik #/)).toBeNull();
    });

    it("rütbeli satırda 'ertelenirse ne olur' etki metni gösterilir", () => {
      renderCard([alert({ productId: "p1", level: "critical" })], {
        purchasePriorities: [priority({ productId: "p1", level: "critical", rank: 1 })],
      });

      expect(
        within(rows()[0]!).getByText(tr.purchasePriority.impact.critical),
      ).toBeDefined();
    });

    it("purchasePriorities'te bulunmayan (unknown) satırda rozet ya da etki metni gösterilmez", () => {
      renderCard([alert({ productId: "p1", level: "unknown", daysRemaining: null })], {
        purchasePriorities: [],
      });

      const row = rows()[0]!;
      expect(within(row).queryByText(/Öncelik #/)).toBeNull();
      expect(within(row).queryByText(tr.purchasePriority.impact.critical)).toBeNull();
    });

    it("purchasePriorities verilmezse eski davranış değişmez (rozet/etki yok)", () => {
      renderCard([alert({ productId: "p1", level: "critical" })]);

      const row = rows()[0]!;
      expect(within(row).queryByText(/Öncelik #/)).toBeNull();
    });
  });

  describe("tedarik süresi riski", () => {
    function risk(overrides: Partial<LeadTimeRisk> = {}): LeadTimeRisk {
      return {
        state: "late",
        leadTimeDays: 7,
        daysOfCover: 4,
        shortageGapDays: 3,
        orderDecisionDays: -3,
        ...overrides,
      };
    }

    it("late satırında stok boşluğu mesajı ve tedarik süresi detayı gösterilir", () => {
      renderCard([alert({ productId: "p1", level: "critical", daysRemaining: 4 })], {
        leadTimeRisks: new Map([["p1", risk()]]),
      });

      const row = rows()[0]!;
      expect(within(row).getByText(/3/)).toBeDefined();
      expect(within(row).getByText(/Tedarik süresi: 7 gün/)).toBeDefined();
    });

    it("dueToday satırında sabit uyarı metni gösterilir", () => {
      renderCard([alert({ productId: "p1", level: "critical" })], {
        leadTimeRisks: new Map([
          [
            "p1",
            risk({
              state: "dueToday",
              shortageGapDays: null,
              orderDecisionDays: 0,
            }),
          ],
        ]),
      });

      const row = rows()[0]!;
      expect(within(row).getByText(tr.stockAlerts.leadTime.dueToday)).toBeDefined();
    });

    it("unknownLeadTime satırında kısa veri tamamlama mesajı gösterilir, detay yok", () => {
      renderCard([alert({ productId: "p1", level: "low" })], {
        leadTimeRisks: new Map([
          [
            "p1",
            risk({
              state: "unknownLeadTime",
              leadTimeDays: null,
              shortageGapDays: null,
              orderDecisionDays: null,
            }),
          ],
        ]),
      });

      const row = rows()[0]!;
      expect(
        within(row).getByText(tr.stockAlerts.leadTime.unknownLeadTime),
      ).toBeDefined();
      expect(within(row).queryByText(/Tedarik süresi:/)).toBeNull();
    });

    it("safe satırında hiçbir tedarik süresi metni gösterilmez", () => {
      renderCard([alert({ productId: "p1", level: "low" })], {
        leadTimeRisks: new Map([
          [
            "p1",
            risk({
              state: "safe",
              shortageGapDays: null,
              orderDecisionDays: 40,
            }),
          ],
        ]),
      });

      const row = rows()[0]!;
      expect(within(row).queryByText(/Tedarik süresi:/)).toBeNull();
      expect(within(row).queryByText(tr.stockAlerts.leadTime.dueToday)).toBeNull();
    });

    it("leadTimeRisks verilmezse eski davranış değişmez", () => {
      renderCard([alert({ productId: "p1", level: "critical" })]);

      const row = rows()[0]!;
      expect(within(row).queryByText(/Tedarik süresi:/)).toBeNull();
    });

    it("İngilizce: tedarik süresi mesajı çeviridir", () => {
      renderCard([alert({ productId: "p1", level: "critical" })], {
        locale: "en",
        leadTimeRisks: new Map([
          [
            "p1",
            risk({
              state: "dueToday",
              shortageGapDays: null,
              orderDecisionDays: 0,
            }),
          ],
        ]),
      });

      const row = rows()[0]!;
      expect(within(row).getByText(en.stockAlerts.leadTime.dueToday)).toBeDefined();
    });
  });

  describe("operasyon durumu (yapıldı/ertele/yoksay)", () => {
    function actionItem(overrides: Partial<ActionPlanItem> = {}): ActionPlanItem {
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

    it("satın alma planındaki üründe durum rozeti ve üç aksiyon düğmesi görünür", () => {
      renderCard([alert({ productId: "p1", level: "critical" })], {
        actionPlan: actionPlanBatch([actionItem()]),
      });

      const row = rows()[0]!;
      expect(
        within(row).getByText(tr.stockAlerts.actionPlan.status.pending),
      ).toBeDefined();
      expect(
        within(row).getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.done,
        }),
      ).toBeDefined();
      expect(
        within(row).getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.snooze,
        }),
      ).toBeDefined();
      expect(
        within(row).getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.ignore,
        }),
      ).toBeDefined();
    });

    it("planda olmayan (unknown) üründe durum kontrolleri hiç gösterilmez", () => {
      renderCard([alert({ productId: "p1", level: "unknown", daysRemaining: null })], {
        actionPlan: actionPlanBatch([]),
      });

      const row = rows()[0]!;
      expect(
        within(row).queryByText(tr.stockAlerts.actionPlan.status.pending),
      ).toBeNull();
      expect(
        within(row).queryByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.done,
        }),
      ).toBeNull();
    });

    it("'Yapıldı' tıklanınca satır varsayılan görünümden gizlenir, özette sayılır", () => {
      renderCard([alert({ productId: "p1", level: "critical" })], {
        actionPlan: actionPlanBatch([actionItem()]),
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.done,
        }),
      );

      expect(rows()).toHaveLength(0);
      expect(
        screen.getByText(
          new RegExp(`${tr.stockAlerts.actionPlan.statusSummary.done}: 1`),
        ),
      ).toBeDefined();
    });

    it("'Ertele' tıklanınca satır görünmeye devam eder, rozeti 'Ertelendi' olur", () => {
      renderCard([alert({ productId: "p1", level: "critical" })], {
        actionPlan: actionPlanBatch([actionItem()]),
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.snooze,
        }),
      );

      const row = rows()[0]!;
      expect(
        within(row).getByText(tr.stockAlerts.actionPlan.status.snoozed),
      ).toBeDefined();
    });

    it("'Yoksay' tıklanınca satır gizlenir, özette sayılır", () => {
      renderCard([alert({ productId: "p1", level: "critical" })], {
        actionPlan: actionPlanBatch([actionItem()]),
      });

      fireEvent.click(
        screen.getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.ignore,
        }),
      );

      expect(rows()).toHaveLength(0);
      expect(
        screen.getByText(
          new RegExp(`${tr.stockAlerts.actionPlan.statusSummary.ignored}: 1`),
        ),
      ).toBeDefined();
    });

    it("aynı ürün için tek satır render edilir", () => {
      renderCard([alert({ productId: "p1", level: "critical" })], {
        actionPlan: actionPlanBatch([actionItem()]),
      });

      expect(rows().length).toBe(1);
    });

    it("durum kontrolleri eklenince rütbe, aksiyon rozeti, yeniden sipariş ve tedarik süresi görünümleri değişmez", () => {
      renderCard(
        [alert({ productId: "p1", level: "critical", daysRemaining: 5, stock: 5 })],
        {
          actionPlan: actionPlanBatch([actionItem({ recommendedQuantity: 24 })]),
          purchasePriorities: [
            {
              productId: "p1",
              productName: "Test",
              level: "critical",
              stock: 5,
              daysRemaining: 5,
              dailyVelocity: 2,
              reorderQuantity: 24,
              leadTimeStatus: "late",
              orderDecisionDays: -2,
              shortageGapDays: 2,
              rank: 1,
            },
          ],
          reorderRecommendations: new Map([
            [
              "p1",
              {
                kind: "suggested",
                quantity: 24,
                targetStockUnits: 30,
                dailyVelocity: 2,
                targetCoverageDays: 15,
                currentStock: 5,
              },
            ],
          ]),
          leadTimeRisks: new Map([
            [
              "p1",
              {
                state: "late",
                leadTimeDays: 7,
                daysOfCover: 4,
                shortageGapDays: 2,
                orderDecisionDays: -2,
              },
            ],
          ]),
        },
      );

      const row = rows()[0]!;
      expect(within(row).getByText("Öncelik #1")).toBeDefined();
      expect(
        within(row).getByText(tr.stockAlerts.actionPlan.action.actNow),
      ).toBeDefined();
      expect(within(row).getByText(/Önerilen sipariş: 24 adet/)).toBeDefined();
      expect(within(row).getByText(/Tedarik süresi: 7 gün/)).toBeDefined();
    });
  });

  describe("Sabah Özeti kartı", () => {
    it("Sabah Özeti kartı görünür, mevcut satın alma planı bozulmadan yanında durur", () => {
      renderCard(
        [alert({ productId: "p1", level: "critical", daysRemaining: 5, stock: 5 })],
        {
          actionPlan: actionPlanBatch([
            {
              productId: "p1",
              rank: 1,
              action: "actNow",
              recommendedQuantity: 24,
              alertState: "critical",
              leadTimeState: "late",
              daysRemaining: 5,
              orderDecisionDays: -2,
              shortageGapDays: 2,
              reason: "leadTimeAlreadyLate",
            },
          ]),
          purchasePriorities: [
            {
              productId: "p1",
              productName: "Test",
              level: "critical",
              stock: 5,
              daysRemaining: 5,
              dailyVelocity: 2,
              reorderQuantity: 24,
              leadTimeStatus: "late",
              orderDecisionDays: -2,
              shortageGapDays: 2,
              rank: 1,
            },
          ],
          reorderRecommendations: new Map([
            [
              "p1",
              {
                kind: "suggested",
                quantity: 24,
                targetStockUnits: 30,
                dailyVelocity: 2,
                targetCoverageDays: 15,
                currentStock: 5,
              },
            ],
          ]),
          leadTimeRisks: new Map([
            [
              "p1",
              {
                state: "late",
                leadTimeDays: 7,
                daysOfCover: 4,
                shortageGapDays: 2,
                orderDecisionDays: -2,
              },
            ],
          ]),
        },
      );

      expect(screen.getByText(tr.morningBrief.title)).toBeDefined();

      // Mevcut satır (rütbe, aksiyon rozeti, miktar, tedarik süresi) değişmez.
      const row = rows()[0]!;
      expect(within(row).getByText("Öncelik #1")).toBeDefined();
      expect(
        within(row).getByText(tr.stockAlerts.actionPlan.action.actNow),
      ).toBeDefined();
      expect(within(row).getByText(/Önerilen sipariş: 24 adet/)).toBeDefined();
      expect(within(row).getByText(/Tedarik süresi: 7 gün/)).toBeDefined();

      // Ürün yalnızca bir kez render edilir.
      expect(rows().length).toBe(1);
    });

    it("actionPlan verilmezse (eski davranış) Sabah Özeti sakin metinle görünür", () => {
      renderCard([alert({ productId: "p1", level: "critical" })]);
      expect(screen.getByText(tr.morningBrief.title)).toBeDefined();
      expect(screen.getByText(tr.morningBrief.allClear)).toBeDefined();
    });
  });

  describe("Günlük Zaman Akışı (Task Timeline)", () => {
    const NOW_LIMIT = DEFAULT_RULES.taskTimeline.nowLimit;

    function timelineActionItem(
      overrides: Partial<ActionPlanItem> = {},
    ): ActionPlanItem {
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

    /** `count` adet ürün + eşleşen alert/actionPlan girdisi — rank 1..count. */
    function pendingSet(count: number) {
      const alerts = Array.from({ length: count }, (_, i) =>
        alert({
          productId: `p${i + 1}`,
          productName: `Ürün ${i + 1}`,
          level: "critical",
          daysRemaining: 5,
        }),
      );
      const items = Array.from({ length: count }, (_, i) =>
        timelineActionItem({ productId: `p${i + 1}`, rank: i + 1 }),
      );
      return { alerts, actionPlan: actionPlanBatch(items) };
    }

    function timeline(): HTMLElement {
      return screen.getByTestId("task-timeline");
    }

    it("kart görünür: başlık ve yardımcı metin basılır", () => {
      const { alerts, actionPlan } = pendingSet(1);
      renderCard(alerts, { actionPlan });

      expect(within(timeline()).getByText(tr.taskTimeline.title)).toBeDefined();
      expect(within(timeline()).getByText(tr.taskTimeline.helperText)).toBeDefined();
    });

    it("Sabah Özeti ve ayrıntılı Satın Alma Planı Task Timeline'ın yanında görünmeye devam eder", () => {
      const { alerts, actionPlan } = pendingSet(1);
      renderCard(alerts, { actionPlan });

      expect(screen.getByText(tr.morningBrief.title)).toBeDefined();
      expect(rows()).toHaveLength(1);
    });

    it("now grubu: en yüksek rütbeli pending aksiyonlar 'Şimdi' altında görünür", () => {
      const { alerts, actionPlan } = pendingSet(1);
      renderCard(alerts, { actionPlan });

      const card = timeline();
      expect(within(card).getByText(tr.taskTimeline.group.now)).toBeDefined();
      expect(within(card).getByText("Ürün 1")).toBeDefined();
    });

    it("today grubu: now sınırını aşan pending aksiyon 'Bugün' altında görünür", () => {
      const { alerts, actionPlan } = pendingSet(NOW_LIMIT + 1);
      renderCard(alerts, { actionPlan });

      const card = timeline();
      expect(within(card).getByText(tr.taskTimeline.group.today)).toBeDefined();
      expect(within(card).getByText(`Ürün ${NOW_LIMIT + 1}`)).toBeDefined();
    });

    it("later grubu: ertelenen aksiyon rütbesinden bağımsız 'Daha Sonra' altında görünür", () => {
      const { alerts, actionPlan } = pendingSet(1);
      renderCard(alerts, { actionPlan });

      fireEvent.click(
        screen.getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.snooze,
        }),
      );

      const card = timeline();
      expect(within(card).getByText(tr.taskTimeline.group.later)).toBeDefined();
      expect(within(card).getByText("Ürün 1")).toBeDefined();
      expect(within(card).queryByText(tr.taskTimeline.group.now)).toBeNull();
    });

    it("completed grubu: yapıldı işaretlenen aksiyon 'Tamamlananlar' altında görünür, aktif gruplarda görünmez", () => {
      const { alerts, actionPlan } = pendingSet(1);
      renderCard(alerts, { actionPlan });

      fireEvent.click(
        screen.getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.done,
        }),
      );

      const card = timeline();
      expect(within(card).getByText(tr.taskTimeline.emptyActive)).toBeDefined();
      expect(within(card).getByText("Ürün 1")).toBeDefined();
      expect(within(card).queryByText(tr.taskTimeline.group.now)).toBeNull();
    });

    it("ignored aksiyon Task Timeline içinde hiç görünmez", () => {
      const { alerts, actionPlan } = pendingSet(1);
      renderCard(alerts, { actionPlan });

      fireEvent.click(
        screen.getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.ignore,
        }),
      );

      expect(screen.queryByText("Ürün 1")).toBeNull();
    });

    it("aynı aksiyon Task Timeline içinde yalnızca bir kez render edilir", () => {
      const { alerts, actionPlan } = pendingSet(1);
      renderCard(alerts, { actionPlan });

      // Biri ayrıntılı satır listesinde, biri Task Timeline'da — toplam iki.
      expect(screen.getAllByText("Ürün 1")).toHaveLength(2);
    });

    it("rank (Öncelik #N rozeti) Task Timeline satırında korunur", () => {
      const { alerts, actionPlan } = pendingSet(1);
      renderCard(alerts, {
        actionPlan,
        purchasePriorities: [
          {
            productId: "p1",
            productName: "Ürün 1",
            level: "critical",
            stock: 5,
            daysRemaining: 5,
            dailyVelocity: 2,
            reorderQuantity: null,
            leadTimeStatus: "late",
            orderDecisionDays: -2,
            shortageGapDays: 2,
            rank: 1,
          },
        ],
      });

      expect(within(timeline()).getByText("Öncelik #1")).toBeDefined();
    });

    it("önerilen miktar Task Timeline satırında korunur", () => {
      const { alerts } = pendingSet(1);
      renderCard(alerts, {
        actionPlan: actionPlanBatch([timelineActionItem({ recommendedQuantity: 24 })]),
        reorderRecommendations: new Map([
          [
            "p1",
            {
              kind: "suggested",
              quantity: 24,
              targetStockUnits: 30,
              dailyVelocity: 2,
              targetCoverageDays: 15,
              currentStock: 5,
            },
          ],
        ]),
      });

      expect(within(timeline()).getByText(/Önerilen sipariş: 24 adet/)).toBeDefined();
    });

    it("tedarik süresi görünümü Task Timeline satırında korunur", () => {
      const { alerts, actionPlan } = pendingSet(1);
      renderCard(alerts, {
        actionPlan,
        leadTimeRisks: new Map([
          [
            "p1",
            {
              state: "late",
              leadTimeDays: 7,
              daysOfCover: 4,
              shortageGapDays: 3,
              orderDecisionDays: -3,
            },
          ],
        ]),
      });

      expect(within(timeline()).getByText(/3/)).toBeDefined();
    });

    it("status değiştiğinde Task Timeline aynı provider üzerinden güncellenir", () => {
      const { alerts, actionPlan } = pendingSet(1);
      renderCard(alerts, { actionPlan });

      const card = timeline();
      expect(within(card).getByText(tr.taskTimeline.group.now)).toBeDefined();
      expect(
        within(card).getByText(tr.stockAlerts.actionPlan.status.pending),
      ).toBeDefined();

      fireEvent.click(
        screen.getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.snooze,
        }),
      );

      expect(within(card).getByText(tr.taskTimeline.group.later)).toBeDefined();
      expect(
        within(card).getByText(tr.stockAlerts.actionPlan.status.snoozed),
      ).toBeDefined();
    });

    it("İngilizce: başlık, grup başlıkları ve boş durum metni çeviridir", () => {
      const { alerts, actionPlan } = pendingSet(1);
      renderCard(alerts, { actionPlan, locale: "en" });

      const card = timeline();
      expect(within(card).getByText(en.taskTimeline.title)).toBeDefined();
      expect(within(card).getByText(en.taskTimeline.group.now)).toBeDefined();
    });
  });

  describe("Akıllı İçgörüler (Smart Insights)", () => {
    const CRITICAL_MIN = DEFAULT_RULES.smartInsights.criticalStockPressureMinCount;

    function insightsSection(): HTMLElement {
      return screen.getByTestId("smart-insights");
    }

    function insightActionItem(
      overrides: Partial<ActionPlanItem> = {},
    ): ActionPlanItem {
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

    /** `count` adet sakin (planSoon, low) aktif ürün — yalnızca operationsClear tetikler. */
    function calmSet(count: number) {
      const alerts = Array.from({ length: count }, (_, i) =>
        alert({
          productId: `p${i + 1}`,
          productName: `Ürün ${i + 1}`,
          level: "low",
          daysRemaining: 20,
        }),
      );
      const items = Array.from({ length: count }, (_, i) =>
        insightActionItem({
          productId: `p${i + 1}`,
          rank: i + 1,
          action: "planSoon",
          alertState: "low",
          leadTimeState: "safe",
        }),
      );
      return { alerts, actionPlan: actionPlanBatch(items) };
    }

    function criticalSet(count: number) {
      const alerts = Array.from({ length: count }, (_, i) =>
        alert({
          productId: `p${i + 1}`,
          productName: `Ürün ${i + 1}`,
          level: "critical",
          daysRemaining: 3,
        }),
      );
      const items = Array.from({ length: count }, (_, i) =>
        insightActionItem({
          productId: `p${i + 1}`,
          rank: i + 1,
          alertState: "critical",
          action: "planSoon",
        }),
      );
      return { alerts, actionPlan: actionPlanBatch(items) };
    }

    it("bölüm görünür: başlık ve alt başlık basılır, Morning Brief/Task Timeline/Purchase Action Plan bozulmadan yanında durur", () => {
      const { alerts, actionPlan } = calmSet(1);
      renderCard(alerts, { actionPlan });

      expect(within(insightsSection()).getByText(tr.smartInsights.title)).toBeDefined();
      expect(
        within(insightsSection()).getByText(tr.smartInsights.subtitle),
      ).toBeDefined();
      expect(screen.getByText(tr.morningBrief.title)).toBeDefined();
      expect(screen.getByText(tr.taskTimeline.title)).toBeDefined();
      expect(rows()).toHaveLength(1);
    });

    it("kritik içgörü: birden fazla kritik aktif aksiyon varsa Kritik rozetiyle görünür", () => {
      const { alerts, actionPlan } = criticalSet(CRITICAL_MIN);
      renderCard(alerts, { actionPlan });

      const section = insightsSection();
      expect(
        within(section).getByText(tr.smartInsights.item.criticalStockPressure.title),
      ).toBeDefined();
      expect(
        within(section).getByText(tr.smartInsights.severity.critical),
      ).toBeDefined();
    });

    it("uyarı içgörüsü: tedarik süresi riski taşıyan aktif aksiyon varsa Dikkat rozetiyle görünür", () => {
      const items = [
        insightActionItem({ productId: "p1", rank: 1, leadTimeState: "late" }),
      ];
      renderCard([alert({ productId: "p1", level: "critical", daysRemaining: 3 })], {
        actionPlan: actionPlanBatch(items),
      });

      const section = insightsSection();
      expect(
        within(section).getByText(tr.smartInsights.item.leadTimeExposure.title),
      ).toBeDefined();
      expect(
        within(section).getByText(tr.smartInsights.severity.warning),
      ).toBeDefined();
    });

    it("olumlu içgörü: tamamlanan görev varsa Olumlu rozetiyle görünür", () => {
      const { alerts, actionPlan } = calmSet(1);
      renderCard(alerts, { actionPlan });

      fireEvent.click(
        screen.getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.done,
        }),
      );

      const section = insightsSection();
      expect(
        within(section).getByText(tr.smartInsights.item.executionProgress.title),
      ).toBeDefined();
      expect(
        within(section).getByText(tr.smartInsights.severity.positive),
      ).toBeDefined();
    });

    it("nötr içgörü: kritik/uyarı yoksa ve aktif aksiyon sayısı düşükse Bilgi rozetiyle 'operasyon net' görünür", () => {
      const { alerts, actionPlan } = calmSet(1);
      renderCard(alerts, { actionPlan });

      const section = insightsSection();
      expect(
        within(section).getByText(tr.smartInsights.item.operationsClear.title),
      ).toBeDefined();
      expect(
        within(section).getByText(tr.smartInsights.severity.neutral),
      ).toBeDefined();
    });

    it("boş durum: actionPlan verilmezse (eski davranış) sakin bir metin gösterilir", () => {
      renderCard([alert({ productId: "p1", level: "critical" })]);

      expect(screen.getByText(tr.smartInsights.empty)).toBeDefined();
    });

    it("ignored aksiyondan içgörü üretilmez: yoksayılan tek aksiyon 'operasyon net' olarak kalır", () => {
      const { alerts, actionPlan } = calmSet(1);
      renderCard(alerts, { actionPlan });

      fireEvent.click(
        screen.getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.ignore,
        }),
      );

      const section = insightsSection();
      expect(
        within(section).getByText(tr.smartInsights.item.operationsClear.title),
      ).toBeDefined();
    });

    it("aynı içgörü iki kez render edilmez", () => {
      const { alerts, actionPlan } = criticalSet(CRITICAL_MIN);
      renderCard(alerts, { actionPlan });

      const section = insightsSection();
      expect(
        within(section).getAllByText(tr.smartInsights.item.criticalStockPressure.title),
      ).toHaveLength(1);
    });

    it("status değiştiğinde Smart Insights aynı provider üzerinden güncellenir", () => {
      const { alerts, actionPlan } = calmSet(1);
      renderCard(alerts, { actionPlan });

      const section = insightsSection();
      expect(
        within(section).getByText(tr.smartInsights.item.operationsClear.title),
      ).toBeDefined();

      fireEvent.click(
        screen.getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.done,
        }),
      );

      expect(
        within(section).getByText(tr.smartInsights.item.executionProgress.title),
      ).toBeDefined();
    });

    it("deterministik render: aynı plan/durumla iki render aynı içgörüyü üretir", () => {
      // Component hesap yapmıyorsa, aynı `actionPlan`/durum iki ayrı
      // render'da her zaman aynı içgörü metnini üretmeli.
      const { alerts, actionPlan } = criticalSet(CRITICAL_MIN);
      renderCard(alerts, { actionPlan });
      const firstText = within(insightsSection()).getByText(
        tr.smartInsights.item.criticalStockPressure.title,
      ).textContent;
      cleanup();

      renderCard(alerts, { actionPlan });
      const secondText = within(insightsSection()).getByText(
        tr.smartInsights.item.criticalStockPressure.title,
      ).textContent;

      expect(firstText).toBe(secondText);
    });

    it("İngilizce: başlık ve içgörü metinleri çeviridir", () => {
      const { alerts, actionPlan } = criticalSet(CRITICAL_MIN);
      renderCard(alerts, { actionPlan, locale: "en" });

      const section = insightsSection();
      expect(within(section).getByText(en.smartInsights.title)).toBeDefined();
      expect(
        within(section).getByText(en.smartInsights.item.criticalStockPressure.title),
      ).toBeDefined();
    });
  });

  describe("Uyarı Merkezi (Notification Center)", () => {
    function centerSection(): HTMLElement {
      return screen.getByTestId("notification-center");
    }

    function notificationActionItem(
      overrides: Partial<ActionPlanItem> = {},
    ): ActionPlanItem {
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

    /** `count` adet sakin (planSoon, low) aktif ürün — yalnızca operationsClear tetikler. */
    function calmNotificationSet(count: number) {
      const alerts = Array.from({ length: count }, (_, i) =>
        alert({
          productId: `p${i + 1}`,
          productName: `Ürün ${i + 1}`,
          level: "low",
          daysRemaining: 20,
        }),
      );
      const items = Array.from({ length: count }, (_, i) =>
        notificationActionItem({
          productId: `p${i + 1}`,
          rank: i + 1,
          action: "planSoon",
          alertState: "low",
          leadTimeState: "safe",
        }),
      );
      return { alerts, actionPlan: actionPlanBatch(items) };
    }

    it("bölüm görünür: başlık ve alt başlık basılır, Morning Brief/Smart Insights/Task Timeline/Purchase Action Plan bozulmadan yanında durur", () => {
      const { alerts, actionPlan } = calmNotificationSet(1);
      renderCard(alerts, { actionPlan });

      expect(
        within(centerSection()).getByText(tr.notificationCenter.title),
      ).toBeDefined();
      expect(
        within(centerSection()).getByText(tr.notificationCenter.subtitle),
      ).toBeDefined();
      expect(screen.getByText(tr.morningBrief.title)).toBeDefined();
      expect(screen.getByText(tr.smartInsights.title)).toBeDefined();
      expect(screen.getByText(tr.taskTimeline.title)).toBeDefined();
      expect(rows()).toHaveLength(1);
    });

    it("kritik satın alma aksiyonu: pending + actNow ürün Kritik rozetiyle görünür, ürün adını taşır", () => {
      renderCard(
        [alert({ productId: "p1", productName: "Acil Ürün", level: "critical" })],
        {
          actionPlan: actionPlanBatch([notificationActionItem({ productId: "p1" })]),
        },
      );

      const section = centerSection();
      expect(
        within(section).getByText(tr.notificationCenter.item.criticalAction.title),
      ).toBeDefined();
      expect(within(section).getByText(/Acil Ürün/)).toBeDefined();
      expect(
        within(section).getByText(tr.smartInsights.severity.critical),
      ).toBeDefined();
    });

    it("tedarik süresi riski: actNow olmayan ama late/dueToday olan ürün Dikkat rozetiyle görünür", () => {
      renderCard(
        [alert({ productId: "p1", productName: "Riskli Ürün", level: "low" })],
        {
          actionPlan: actionPlanBatch([
            notificationActionItem({
              productId: "p1",
              action: "decideToday",
              leadTimeState: "dueToday",
            }),
          ]),
        },
      );

      const section = centerSection();
      expect(
        within(section).getByText(tr.notificationCenter.item.leadTimeRisk.title),
      ).toBeDefined();
      expect(within(section).getByText(/Riskli Ürün/)).toBeDefined();
      expect(
        within(section).getByText(tr.smartInsights.severity.warning),
      ).toBeDefined();
    });

    it("ertelenmiş görev: 'Ertele' tıklanınca snoozedAction bildirimi görünür", () => {
      const { alerts, actionPlan } = calmNotificationSet(1);
      renderCard(alerts, { actionPlan });

      fireEvent.click(
        screen.getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.snooze,
        }),
      );

      const section = centerSection();
      expect(
        within(section).getByText(tr.notificationCenter.item.snoozedAction.title),
      ).toBeDefined();
      expect(within(section).getByText(/1 görev ertelendi/)).toBeDefined();
    });

    it("tamamlanan görev: 'Yapıldı' tıklanınca completedAction bildirimi Olumlu rozetiyle görünür", () => {
      const { alerts, actionPlan } = calmNotificationSet(1);
      renderCard(alerts, { actionPlan });

      fireEvent.click(
        screen.getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.done,
        }),
      );

      const section = centerSection();
      expect(
        within(section).getByText(tr.notificationCenter.item.completedAction.title),
      ).toBeDefined();
      expect(
        within(section).getByText(tr.smartInsights.severity.positive),
      ).toBeDefined();
    });

    it("operasyon net: kritik/uyarı yoksa ve aktif aksiyon sayısı düşükse 'Tüm operasyonlar kontrol altında' görünür", () => {
      const { alerts, actionPlan } = calmNotificationSet(1);
      renderCard(alerts, { actionPlan });

      const section = centerSection();
      expect(
        within(section).getByText(tr.notificationCenter.item.operationsClear.title),
      ).toBeDefined();
      expect(
        within(section).getByText(tr.smartInsights.severity.neutral),
      ).toBeDefined();
    });

    it("boş durum: actionPlan verilmezse (eski davranış) sakin bir metin gösterilir", () => {
      renderCard([alert({ productId: "p1", level: "critical" })]);

      expect(screen.getByText(tr.notificationCenter.empty)).toBeDefined();
    });

    it("yoksayılan aksiyondan bildirim üretilmez: tek aksiyon yoksayılınca 'operasyon kontrol altında' olarak kalır", () => {
      const { alerts, actionPlan } = calmNotificationSet(1);
      renderCard(alerts, { actionPlan });

      fireEvent.click(
        screen.getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.ignore,
        }),
      );

      const section = centerSection();
      expect(
        within(section).getByText(tr.notificationCenter.item.operationsClear.title),
      ).toBeDefined();
    });

    it("aynı bildirim iki kez render edilmez", () => {
      renderCard(
        [alert({ productId: "p1", productName: "Acil Ürün", level: "critical" })],
        { actionPlan: actionPlanBatch([notificationActionItem({ productId: "p1" })]) },
      );

      const section = centerSection();
      expect(
        within(section).getAllByText(tr.notificationCenter.item.criticalAction.title),
      ).toHaveLength(1);
    });

    it("bildirim sayısına göre bir aktif sayaç gösterilir, 'okunmadı' olarak etiketlenmez", () => {
      renderCard(
        [alert({ productId: "p1", productName: "Acil Ürün", level: "critical" })],
        { actionPlan: actionPlanBatch([notificationActionItem({ productId: "p1" })]) },
      );

      const section = centerSection();
      expect(
        within(section).getByText(`${tr.notificationCenter.activeCountLabel}: 1`),
      ).toBeDefined();
      expect(section.textContent?.toLowerCase()).not.toMatch(/unread|okunmadı/);
    });

    it("sahte bir zaman damgası (ör. 'dakika önce', saat) hiç gösterilmez", () => {
      renderCard(
        [alert({ productId: "p1", productName: "Acil Ürün", level: "critical" })],
        { actionPlan: actionPlanBatch([notificationActionItem({ productId: "p1" })]) },
      );

      const section = centerSection();
      expect(section.textContent).not.toMatch(/dakika önce|saat önce|\d{2}:\d{2}/);
    });

    it("status değiştiğinde Notification Center aynı provider üzerinden güncellenir", () => {
      const { alerts, actionPlan } = calmNotificationSet(1);
      renderCard(alerts, { actionPlan });

      const section = centerSection();
      expect(
        within(section).getByText(tr.notificationCenter.item.operationsClear.title),
      ).toBeDefined();

      fireEvent.click(
        screen.getByRole("button", {
          name: tr.stockAlerts.actionPlan.statusActions.done,
        }),
      );

      expect(
        within(section).getByText(tr.notificationCenter.item.completedAction.title),
      ).toBeDefined();
    });

    it("İngilizce: başlık ve bildirim metinleri çeviridir", () => {
      renderCard(
        [alert({ productId: "p1", productName: "Acil Ürün", level: "critical" })],
        {
          actionPlan: actionPlanBatch([notificationActionItem({ productId: "p1" })]),
          locale: "en",
        },
      );

      const section = centerSection();
      expect(within(section).getByText(en.notificationCenter.title)).toBeDefined();
      expect(
        within(section).getByText(en.notificationCenter.item.criticalAction.title),
      ).toBeDefined();
    });
  });

  describe("erişilebilirlik: bölüm başlıkları", () => {
    it("kart h2, dört alt bölüm (Sabah Özeti/İçgörüler/Uyarı Merkezi/Zaman Akışı) h3 başlık kullanır", () => {
      renderCard([alert({ productId: "p1", level: "critical" })], {
        actionPlan: actionPlanBatch([
          {
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
          },
        ]),
      });

      expect(
        screen.getByRole("heading", {
          level: 2,
          name: new RegExp(`^${tr.stockAlerts.title}`),
        }),
      ).toBeDefined();
      expect(
        screen.getByRole("heading", { level: 3, name: tr.morningBrief.title }),
      ).toBeDefined();
      expect(
        screen.getByRole("heading", { level: 3, name: tr.smartInsights.title }),
      ).toBeDefined();
      expect(
        screen.getByRole("heading", { level: 3, name: tr.notificationCenter.title }),
      ).toBeDefined();
      expect(
        screen.getByRole("heading", { level: 3, name: tr.taskTimeline.title }),
      ).toBeDefined();
    });

    it("her dekoratif ikon aria-hidden taşır", () => {
      const { container } = renderCard(
        [alert({ productId: "p1", level: "critical" })],
        {
          actionPlan: actionPlanBatch([
            {
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
            },
          ]),
        },
      );

      const icons = container.querySelectorAll("svg");
      expect(icons.length).toBeGreaterThan(0);
      for (const icon of icons) {
        expect(icon.getAttribute("aria-hidden")).toBe("true");
      }
    });

    it("durum yalnızca renkle değil, rozet metniyle de anlatılır", () => {
      renderCard([alert({ productId: "p1", level: "critical" })], {
        actionPlan: actionPlanBatch([
          {
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
          },
        ]),
      });

      // Durum rozeti her zaman metin taşır — renk tek başına anlam taşımaz.
      expect(
        screen.getAllByText(tr.stockAlerts.actionPlan.status.pending).length,
      ).toBeGreaterThan(0);
    });
  });
});
