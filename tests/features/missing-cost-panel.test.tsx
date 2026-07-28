// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MissingCostPanel,
  type MissingCostRow,
} from "@/features/costs/missing-cost-panel.client";
import tr from "@/i18n/messages/tr.json";

/**
 * KOKPİTTEN GELEN BAĞLANTININ VARIŞ NOKTASI.
 *
 * Kokpitteki "Tamamla" adresi doğru üretse bile, maliyet ekranı o adresi
 * okuyup ilgili formu açmazsa kullanıcı yine listede ürün arar. Bu dosya
 * yolculuğun ikinci yarısını doğruluyor.
 *
 * Kaydetme akışı burada test edilmiyor — sunucu eylemi taklit ediliyor;
 * sorulan soru "hangi satırın formu açık geldi".
 */
vi.mock("@/features/costs/actions", () => ({
  saveCost: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function row(productId: string, name: string): MissingCostRow {
  return {
    productId,
    name,
    sku: `SKU-${productId}`,
    identifier: `SKU-${productId}`,
    level: "high",
    tone: "warning",
    reason: "revenue",
    orders: 4,
    lines: 5,
    unitsLabel: "9",
    revenueLabel: "₺12.500",
    firstDateLabel: "3 Tem",
    lastDateLabel: "12 Tem",
    unitCostValue: "",
    commissionValue: "",
    missing: true,
  };
}

const ROWS = [row("p1", "Ürün 1"), row("p2", "Ürün 2"), row("p3", "Ürün 3")];

function renderPanel(focusProductId?: string) {
  return render(
    <NextIntlClientProvider locale="tr" messages={tr}>
      <MissingCostPanel
        rows={ROWS}
        today="2026-07-28"
        remaining={2}
        focusProductId={focusProductId}
      />
    </NextIntlClientProvider>,
  );
}

/** Maliyet formunun ayırt edici alanı. */
function formIn(item: HTMLElement) {
  return within(item).queryByText(tr.costs.unitCost);
}

afterEach(cleanup);

describe("maliyet ekranı öncelik paneli", () => {
  it("kokpitten gelen ürünün formunu açık başlatır", () => {
    renderPanel("p2");

    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.id)).toEqual(["cost-p1", "cost-p2", "cost-p3"]);

    expect(formIn(items[1]!)).not.toBeNull();
    expect(formIn(items[0]!)).toBeNull();
    expect(formIn(items[2]!)).toBeNull();

    // Açık satırın kendi düğmesi "Vazgeç"e döner: kullanıcı formu kapatabilsin.
    expect(items[1]!.querySelector("button")?.textContent).toBe(tr.costs.cancel);
    expect(items[0]!.querySelector("button")?.textContent).toBe(tr.costs.priorityCta);
  });

  it("ürün belirtilmemişse hiçbir form açılmaz", () => {
    renderPanel();

    for (const item of screen.getAllByRole("listitem")) {
      expect(formIn(item)).toBeNull();
    }
  });

  it("kuyrukta olmayan bir ürün istenirse liste sessizce olduğu gibi kalır", () => {
    renderPanel("silinmis-urun");

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(formIn(item)).toBeNull();
    }
  });

  it("gösterilmeyen ürünlerin sayısını söyler", () => {
    renderPanel();
    expect(screen.getByText(/2 ürün daha var/)).toBeDefined();
  });
});
