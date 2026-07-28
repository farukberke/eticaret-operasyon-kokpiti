// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";

import type { MissingCostImpact, MissingCostReport } from "@/core/domain";
import { MissingCostCard } from "@/features/cockpit/missing-cost-card";
import type { Locale } from "@/i18n/routing";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * KOKPİTİN İLK KARTI.
 *
 * Kart hiçbir şey hesaplamaz; `getMissingCostImpacts` ne verdiyse onu, verdiği
 * sırayla gösterir. Bu yüzden buradaki testler "doğru mu hesaplıyor" değil,
 * **"servisin kararına dokunuyor mu"** sorusunu kovalıyor: sıra korunuyor mu,
 * ilk beşten sonrası nereye gidiyor, CTA doğru ürünü mü açıyor.
 */

const MESSAGES = { tr, en };

function impact(overrides: Partial<MissingCostImpact> = {}): MissingCostImpact {
  return {
    productId: "p1",
    name: "Yazlık Elbise",
    sku: "SKU-1",
    affectedLines: 3,
    affectedOrders: 2,
    affectedUnits: 7,
    uncomputableRevenue: { minor: 4_260_055, currency: "TRY" },
    firstOrderDate: "2026-07-03",
    lastOrderDate: "2026-07-12",
    level: "high",
    reason: "revenue",
    ...overrides,
  };
}

/** N ürünlük bir kuyruk: kimlikler ve adlar sıra numarasını taşır. */
function queue(count: number, overrides: Partial<MissingCostImpact> = {}) {
  return Array.from({ length: count }, (_, index) =>
    impact({ productId: `p${index + 1}`, name: `Ürün ${index + 1}`, ...overrides }),
  );
}

function report(overrides: Partial<MissingCostReport> = {}): MissingCostReport {
  return {
    items: queue(3),
    ordersConsidered: 120,
    productsInCatalog: 40,
    ...overrides,
  };
}

function renderCard(data: MissingCostReport, locale: Locale = "tr") {
  return render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      <MissingCostCard report={data} locale={locale} />
    </NextIntlClientProvider>,
  );
}

/** Kuyruk satırları — kart içindeki tek `ol`. */
function rows(): HTMLElement[] {
  return screen.getAllByRole("listitem");
}

afterEach(cleanup);

describe("kokpit eksik maliyet kartı", () => {
  it("en fazla ilk 5 ürünü gösterir, gerisini bağlantıya bırakır", () => {
    renderCard(report({ items: queue(9) }));

    expect(rows()).toHaveLength(5);
    expect(screen.getByText("Ürün 5")).toBeDefined();
    expect(screen.queryByText("Ürün 6")).toBeNull();

    // 9 − 5 = 4. Kalanın sayısı bağlantının kendisinde yazar; kullanıcı
    // tıklamadan önce ne kadar iş kaldığını bilir.
    const more = screen.getByRole("link", { name: /Diğer 4 ürün/ });
    expect(more.getAttribute("href")).toBe("/tr/costs");
  });

  it("beş ya da daha az ürün varsa 'diğer' bağlantısı çıkmaz", () => {
    renderCard(report({ items: queue(5) }));

    expect(rows()).toHaveLength(5);
    expect(screen.queryByText(/Diğer/)).toBeNull();
  });

  it("başlıktaki sayaç gösterilen değil, toplam eksik ürün sayısıdır", () => {
    renderCard(report({ items: queue(9) }));

    // "(9)" — kullanıcı ilk beşi bitirince işin bittiğini sanmasın.
    expect(screen.getByText("(9)")).toBeDefined();
  });

  it("servisin sırasını yeniden sıralamaz", () => {
    // Bilinçli olarak tutarı büyükten küçüğe DEĞİL: sıra servisin kararı,
    // kartın değil. Kart kendi başına sıralasaydı iki ekran farklı bir "önce
    // bunu yap" listesi gösterirdi.
    renderCard(
      report({
        items: [
          impact({
            productId: "p1",
            name: "Küçük",
            uncomputableRevenue: { minor: 1_000, currency: "TRY" },
          }),
          impact({
            productId: "p2",
            name: "Büyük",
            uncomputableRevenue: { minor: 90_000_00, currency: "TRY" },
          }),
          impact({
            productId: "p3",
            name: "Orta",
            uncomputableRevenue: { minor: 50_000, currency: "TRY" },
          }),
        ],
      }),
    );

    expect(rows().map((row) => row.id)).toEqual(["cost-p1", "cost-p2", "cost-p3"]);
  });

  it("CTA kullanıcıyı doğrudan o ürünün maliyet formuna götürür", () => {
    renderCard(report({ items: queue(3) }));

    const second = rows()[1]!;
    const cta = within(second).getByRole("link", { name: "Tamamla" });

    // Locale ön eki + ürün parametresi + satır çapası.
    expect(cta.getAttribute("href")).toBe("/tr/costs?product=p2#cost-p2");
    // Çapanın karşılığı gerçekten bu satır.
    expect(second.id).toBe("cost-p2");
  });

  it("her satır servisin gerekçesini ve etkisini olduğu gibi taşır", () => {
    renderCard(
      report({
        items: [impact({ affectedOrders: 12, reason: "volume", level: "critical" })],
      }),
    );

    const row = rows()[0]!;
    expect(within(row).getByText(tr.costs.priorityReason.volume)).toBeDefined();
    expect(within(row).getByText(tr.costs.priorityLevel.critical)).toBeDefined();
    // Etki cümlesi sipariş sayısını ve tutarı birlikte söyler.
    expect(row.textContent).toContain("12 siparişin");
    expect(row.textContent).toContain("₺");
  });

  it("ilk iş kritikse kart uyarı kenarlığına geçer", () => {
    const { container } = renderCard(
      report({ items: [impact({ level: "critical" }), impact({ productId: "p2" })] }),
    );
    expect(container.querySelector(".border-danger-border")).not.toBeNull();

    cleanup();

    const calm = renderCard(report({ items: [impact({ level: "high" })] }));
    expect(calm.container.querySelector(".border-danger-border")).toBeNull();
  });

  it("eksik maliyet kalmadıysa kutlar, iş üretmez", () => {
    renderCard(report({ items: [] }));

    expect(screen.getByText("Harika!")).toBeDefined();
    expect(
      screen.getByText("Tüm ürünlerin alış maliyetleri tamamlanmış."),
    ).toBeDefined();
    expect(screen.queryByRole("listitem")).toBeNull();
    // Boş kuyruk sayaç göstermez: "(0)" bir bilgi değil, gürültüdür.
    expect(screen.queryByText("(0)")).toBeNull();
  });

  it("hiç sipariş yokken 'tamamlandı' demez", () => {
    // Boş bir defteri temiz sanmak: maliyetler eksiksiz değil, ölçülmüş
    // hiçbir şey yok.
    renderCard(report({ items: [], ordersConsidered: 0 }));

    expect(screen.queryByText("Harika!")).toBeNull();
    expect(screen.getByText(tr.costs.priorityNoData)).toBeDefined();
  });

  it("katalog boşsa da 'tamamlandı' demez", () => {
    renderCard(report({ items: [], productsInCatalog: 0 }));

    expect(screen.queryByText("Harika!")).toBeNull();
    expect(screen.getByText(tr.costs.priorityNoData)).toBeDefined();
  });

  it("İngilizce: metinler ve para birimi locale'i takip eder", () => {
    renderCard(report({ items: queue(7) }), "en");

    expect(screen.getByText(en.costs.priorityTitle)).toBeDefined();
    expect(screen.getAllByRole("link", { name: "Complete" })).toHaveLength(5);

    const more = screen.getByRole("link", { name: /2 more products/ });
    expect(more.getAttribute("href")).toBe("/en/costs");
    // CTA adresi de İngilizce ön ek alır.
    expect(rows()[0]!.querySelector("a")?.getAttribute("href")).toBe(
      "/en/costs?product=p1#cost-p1",
    );
    // Tutar İngilizce yazımla: "TRY", "₺" değil.
    expect(rows()[0]!.textContent).toContain("TRY");
  });

  it("İngilizce boş durum da çevrilidir", () => {
    renderCard(report({ items: [] }), "en");

    expect(screen.getByText(en.cockpit.missingCostDone)).toBeDefined();
    expect(screen.getByText(en.cockpit.missingCostDoneHint)).toBeDefined();
  });
});
