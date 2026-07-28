// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";

import type { StockAlert } from "@/core/services/stock-alerts";
import type { AnalysisSelection } from "@/core/services/analysis-window";
import { StockAlertsCard } from "@/features/cockpit/stock-alerts-card";
import type { Locale } from "@/i18n/routing";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

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

function renderCard(
  alerts: readonly StockAlert[],
  options: {
    locale?: Locale;
    selection?: AnalysisSelection;
    hasData?: boolean;
    windowDays?: number;
  } = {},
) {
  const {
    locale = "tr",
    selection = DEFAULT_WINDOW,
    hasData = true,
    windowDays = 30,
  } = options;

  return render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      <StockAlertsCard
        alerts={alerts}
        windowDays={windowDays}
        hasData={hasData}
        locale={locale}
        selection={selection}
      />
    </NextIntlClientProvider>,
  );
}

function rows(): HTMLElement[] {
  return screen.getAllByRole("listitem");
}

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
});
