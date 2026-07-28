// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CostHistory } from "@/features/costs/cost-history.client";
import { CostEditor } from "@/features/costs/cost-editor.client";
import { CostList, type CostListRow } from "@/features/costs/cost-list.client";
import type { CostHistoryView } from "@/features/costs/history-view";
import tr from "@/i18n/messages/tr.json";

/**
 * MALİYET GEÇMİŞİ BÖLÜMÜ.
 *
 * Sunucu eylemi taklit ediliyor; sorulan soru veri değil **davranış**:
 * geçmiş hangi anda isteniyor, hangi sırada çiziliyor, yürürlükteki kayıt
 * ayırt ediliyor mu ve boş defter nasıl anlatılıyor.
 *
 * En kritiği ilk test: geçmiş, ürünün formu açılmadan **istenmiyor**.
 * Listedeki her ürünün geçmişini önden yüklemek, kullanıcının en fazla birine
 * bakacağı veriyi yüzlerce kez hesaplamak olurdu.
 */

const { loadCostHistory } = vi.hoisted(() => ({ loadCostHistory: vi.fn() }));

vi.mock("@/features/costs/history-actions", () => ({ loadCostHistory }));

vi.mock("@/features/costs/actions", () => ({
  saveCost: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function entry(
  key: string,
  status: "active" | "past" | "upcoming",
  overrides: Partial<CostHistoryView["entries"][number]> = {},
): CostHistoryView["entries"][number] {
  return {
    key,
    effectiveFromLabel: "1 Tem",
    unitCostLabel: "₺124,50",
    commissionLabel: "%15,0",
    shippingLabel: "₺34,90",
    packagingLabel: null,
    source: "manual",
    status,
    ...overrides,
  };
}

const VIEW: CostHistoryView = {
  productId: "p1",
  entries: [
    entry("p1@2026-07-01", "active", { effectiveFromLabel: "1 Tem" }),
    entry("p1@2026-03-15", "past", {
      effectiveFromLabel: "15 Mar",
      unitCostLabel: "₺110,00",
      source: "import",
    }),
    entry("p1@2026-01-01", "past", {
      effectiveFromLabel: "1 Oca",
      unitCostLabel: "₺100,00",
      source: "seed",
      commissionLabel: null,
      shippingLabel: null,
    }),
  ],
};

/** Maliyet listesindeki bir satır — geçmişin ne zaman istendiğini ölçmek için. */
function listRow(productId: string): CostListRow {
  return {
    productId,
    name: `Ürün ${productId}`,
    sku: `SKU-${productId}`,
    missing: false,
    unitCostValue: "124.5",
    commissionValue: "",
    unitCostLabel: "₺124,50",
    commissionLabel: "%15,0",
    effectiveFromLabel: "1 Tem",
  };
}

function renderHistory(productId = "p1") {
  return render(
    <NextIntlClientProvider locale="tr" messages={tr}>
      <CostHistory productId={productId} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  loadCostHistory.mockReset();
  loadCostHistory.mockResolvedValue(VIEW);
});

afterEach(cleanup);

describe("Yükleme anı", () => {
  it("geçmişi yalnızca açılan ürün için ister", async () => {
    renderHistory("p1");
    await screen.findAllByRole("listitem");

    expect(loadCostHistory).toHaveBeenCalledTimes(1);
    expect(loadCostHistory.mock.calls[0]?.[0]).toBe("p1");
  });

  it("liste açılışında hiçbir ürünün geçmişi istenmez", async () => {
    render(
      <NextIntlClientProvider locale="tr" messages={tr}>
        <CostList rows={[listRow("p1"), listRow("p2")]} today="2026-07-28" />
      </NextIntlClientProvider>,
    );

    // Katalog yüzlerce satır olabilir; hepsinin geçmişini önden hesaplamak,
    // kullanıcının en fazla birine bakacağı veriyi boşuna üretmek olurdu.
    expect(loadCostHistory).not.toHaveBeenCalled();

    // Yalnızca düzenlemeye açılan ürün için istek gider.
    fireEvent.click(screen.getAllByRole("button", { name: tr.costs.edit })[1]!);
    await screen.findByText(tr.costs.historyStatus.active);

    expect(loadCostHistory).toHaveBeenCalledTimes(1);
    expect(loadCostHistory.mock.calls[0]?.[0]).toBe("p2");
  });

  it("form açıldığında geçmiş de o ürünle birlikte gelir", async () => {
    render(
      <NextIntlClientProvider locale="tr" messages={tr}>
        <CostEditor
          row={{
            productId: "p9",
            name: "Ürün 9",
            sku: "SKU-9",
            unitCostValue: "",
            commissionValue: "",
            missing: true,
          }}
          today="2026-07-28"
          onDone={() => {}}
        />
      </NextIntlClientProvider>,
    );

    expect(await screen.findByText(tr.costs.historyTitle)).toBeDefined();
    expect(loadCostHistory).toHaveBeenCalledTimes(1);
    expect(loadCostHistory.mock.calls[0]?.[0]).toBe("p9");
  });

  it("cevap gelene kadar yükleniyor der", () => {
    loadCostHistory.mockReturnValue(new Promise(() => {}));
    renderHistory();

    expect(screen.getByText(tr.costs.historyLoading)).toBeDefined();
  });

  it("istek başarısız olursa sessizce boş görünmez", async () => {
    loadCostHistory.mockRejectedValue(new Error("ağ"));
    renderHistory();

    // "Geçmiş yok" ile "geçmiş yüklenemedi" aynı şey değil: ilki kullanıcıyı
    // kayıt girmediğine ikna eder, oysa kayıtlar duruyor olabilir.
    expect(await screen.findByText(tr.costs.historyError)).toBeDefined();
    expect(screen.queryByText(tr.costs.historyEmpty)).toBeNull();
  });
});

describe("Zaman çizelgesi", () => {
  it("kayıtları geldiği sırayla, en yeni üstte çizer", async () => {
    renderHistory();
    const items = await screen.findAllByRole("listitem");

    expect(items).toHaveLength(3);
    for (const [index, label] of ["1 Tem", "15 Mar", "1 Oca"].entries()) {
      expect(within(items[index]!).getByText(label)).toBeDefined();
    }
  });

  it("yürürlükteki kaydı tek başına rozetler", async () => {
    renderHistory();
    const items = await screen.findAllByRole("listitem");

    expect(within(items[0]!).getByText(tr.costs.historyStatus.active)).toBeDefined();
    expect(screen.getAllByText(tr.costs.historyStatus.active)).toHaveLength(1);
    expect(screen.getAllByText(tr.costs.historyStatus.past)).toHaveLength(2);
  });

  it("her kayıtta ne zamandan beri kullanıldığını yazar", async () => {
    renderHistory();
    const items = await screen.findAllByRole("listitem");

    // Aktif kayıt şimdiki zamanda, geçmiş kayıt geçmiş zamanda konuşur.
    expect(
      within(items[0]!).getByText(/1 Tem tarihinden itibaren .* kullanılıyor/),
    ).toBeDefined();
    expect(
      within(items[1]!).getByText(/15 Mar tarihinden itibaren .* kullanıldı/),
    ).toBeDefined();
  });

  it("gelecek tarihli kayda 'kullanıldı' demez", async () => {
    loadCostHistory.mockResolvedValue({
      productId: "p1",
      entries: [entry("p1@2026-09-01", "upcoming", { effectiveFromLabel: "1 Eyl" })],
    } satisfies CostHistoryView);
    renderHistory();

    const item = (await screen.findAllByRole("listitem"))[0]!;
    expect(within(item).getByText(tr.costs.historyStatus.upcoming)).toBeDefined();
    expect(within(item).getByText(/kullanılacak/)).toBeDefined();
  });

  it("para, oran ve kaynağı kayıt başına gösterir", async () => {
    renderHistory();
    const items = await screen.findAllByRole("listitem");

    expect(within(items[0]!).getByText("₺124,50")).toBeDefined();
    expect(within(items[0]!).getByText("%15,0")).toBeDefined();
    expect(within(items[0]!).getByText("₺34,90")).toBeDefined();
    expect(
      within(items[0]!).getByText(new RegExp(tr.costs.historySource.manual)),
    ).toBeDefined();
    expect(
      within(items[1]!).getByText(new RegExp(tr.costs.historySource.import)),
    ).toBeDefined();
  });

  it("kayıtta tanımlı olmayan alanı sıfır göstermez", async () => {
    renderHistory();
    const items = await screen.findAllByRole("listitem");

    // Paketleme bu kayıtta yok: "₺0,00" yazmak, olmayan bir gideri hesaba
    // katılmış gibi göstermek olurdu.
    expect(within(items[0]!).getAllByText(tr.costs.defaultsUnset)).toHaveLength(1);
    expect(within(items[2]!).getAllByText(tr.costs.defaultsUnset)).toHaveLength(3);
  });

  it("geçmiş kayıtlar salt okunur — düzenleme düğmesi yoktur", async () => {
    renderHistory();
    const items = await screen.findAllByRole("listitem");

    for (const item of items) {
      expect(within(item).queryByRole("button")).toBeNull();
    }
  });
});

describe("Boş durum", () => {
  it("hiç kayıt yoksa açıkça söyler", async () => {
    loadCostHistory.mockResolvedValue({
      productId: "p1",
      entries: [],
    } satisfies CostHistoryView);
    renderHistory();

    expect(await screen.findByText(tr.costs.historyEmpty)).toBeDefined();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });
});
