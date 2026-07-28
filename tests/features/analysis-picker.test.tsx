// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resolveAnalysisWindow,
  type AnalysisSelection,
  type AnalysisWindow,
} from "@/core/services/analysis-window";
import { AnalysisPicker } from "@/features/analysis/analysis-picker.client";
import type { Locale } from "@/i18n/routing";
import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * ANALİZ DÖNEMİ SEÇİCİSİ.
 *
 * İki şey doğrulanıyor: (a) her seçenek doğru adrese gidiyor mu — pencerenin
 * tek kaynağı URL olduğu için gezinme, seçimin kendisidir; (b) **gereksiz**
 * gezinme olmuyor mu — aynı pencereye yeniden gitmek sunucudaki tüm
 * dedektörleri boşuna bir kez daha çalıştırırdı.
 */

const replace = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/",
}));

const MESSAGES = { tr, en };
const TODAY = "2026-07-28";

function windowOf(selection: AnalysisSelection): AnalysisWindow {
  return resolveAnalysisWindow(selection, TODAY);
}

function renderPicker(
  selection: AnalysisSelection = { preset: "last30" },
  locale: Locale = "tr",
) {
  const window = windowOf(selection);
  return render(
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
      <AnalysisPicker window={window} rangeLabel="1 – 30 Tem" />
    </NextIntlClientProvider>,
  );
}

const presetSelect = () =>
  screen.getByLabelText(tr.analysis.label) as HTMLSelectElement;
const dateInput = (label: string) => screen.getByLabelText(label) as HTMLInputElement;

beforeEach(() => replace.mockClear());
afterEach(cleanup);

describe("analiz dönemi seçicisi", () => {
  it("altı seçeneğin tamamını sunar", () => {
    renderPicker();

    expect([...presetSelect().options].map((option) => option.value)).toEqual([
      "last7",
      "last30",
      "last90",
      "thisMonth",
      "lastMonth",
      "custom",
    ]);
  });

  it("her preset kendi adresine götürür", () => {
    for (const [preset, href] of [
      ["last7", "/?period=last7"],
      ["last90", "/?period=last90"],
      ["thisMonth", "/?period=thisMonth"],
      ["lastMonth", "/?period=lastMonth"],
    ] as const) {
      cleanup();
      replace.mockClear();
      renderPicker();

      fireEvent.change(presetSelect(), { target: { value: preset } });

      expect(replace, preset).toHaveBeenCalledWith(href, { scroll: false });
    }
  });

  it("varsayılana dönüş adresi temizler", () => {
    renderPicker({ preset: "last7" });

    fireEvent.change(presetSelect(), { target: { value: "last30" } });

    // `?period=last30` yazmak, aynı pencerenin iki farklı adresi olması demek.
    expect(replace).toHaveBeenCalledWith("/", { scroll: false });
  });

  it("aynı pencere yeniden seçilirse gezinmez", () => {
    renderPicker({ preset: "last7" });

    fireEvent.change(presetSelect(), { target: { value: "last7" } });

    // Sunucu analizi yeniden çalışmasın: tüm dedektörler, kâr hesabı ve
    // eksik maliyet raporu aynı sonucu üretecekti.
    expect(replace).not.toHaveBeenCalled();
  });

  it("'Özel' seçmek tek başına analizi yeniden çalıştırmaz — önce tarih girilir", () => {
    renderPicker();

    fireEvent.change(presetSelect(), { target: { value: "custom" } });

    expect(replace).not.toHaveBeenCalled();
    expect(dateInput(tr.analysis.from)).toBeDefined();
    expect(dateInput(tr.analysis.to)).toBeDefined();
  });

  it("özel form yürürlükteki aralıkla dolu açılır", () => {
    renderPicker({ preset: "last7" });

    fireEvent.change(presetSelect(), { target: { value: "custom" } });

    // Kullanıcı sıfırdan tarih yazmaz; mevcut pencereyi daraltır/genişletir.
    expect(dateInput(tr.analysis.from).value).toBe("2026-07-22");
    expect(dateInput(tr.analysis.to).value).toBe(TODAY);
  });

  it("özel aralığı uygulayınca iki ucu da adrese yazar", () => {
    renderPicker();

    fireEvent.change(presetSelect(), { target: { value: "custom" } });
    fireEvent.change(dateInput(tr.analysis.from), {
      target: { value: "2026-05-01" },
    });
    fireEvent.change(dateInput(tr.analysis.to), { target: { value: "2026-05-31" } });
    fireEvent.click(screen.getByRole("button", { name: tr.analysis.apply }));

    expect(replace).toHaveBeenCalledWith(
      "/?period=custom&from=2026-05-01&to=2026-05-31",
      { scroll: false },
    );
  });

  it("aynı özel aralık ikinci kez uygulanırsa gezinmez", () => {
    renderPicker({ preset: "custom", from: "2026-05-01", to: "2026-05-31" });

    fireEvent.click(screen.getByRole("button", { name: tr.analysis.apply }));

    expect(replace).not.toHaveBeenCalled();
  });

  it("başlangıç bitişten sonraysa anında uyarır ve uygulamayı kilitler", () => {
    renderPicker({ preset: "custom", from: "2026-05-01", to: "2026-05-31" });

    // Tek tuş: uyarı "Uygula"ya basmadan görünmeli.
    fireEvent.change(dateInput(tr.analysis.from), {
      target: { value: "2026-06-15" },
    });

    expect(screen.getByRole("alert").textContent).toBe(tr.analysis.invalidRange);
    const apply = screen.getByRole("button", { name: tr.analysis.apply });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    expect(dateInput(tr.analysis.from).getAttribute("aria-invalid")).toBe("true");

    fireEvent.click(apply);
    expect(replace).not.toHaveBeenCalled();
  });

  it("düzeltilen aralıkta uyarı kalkar ve gezinme yeniden açılır", () => {
    renderPicker({ preset: "custom", from: "2026-05-01", to: "2026-05-31" });

    fireEvent.change(dateInput(tr.analysis.to), { target: { value: "2026-04-01" } });
    expect(screen.queryByRole("alert")).not.toBeNull();

    fireEvent.change(dateInput(tr.analysis.to), { target: { value: "2026-06-30" } });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: tr.analysis.apply }));
    expect(replace).toHaveBeenCalledWith(
      "/?period=custom&from=2026-05-01&to=2026-06-30",
      { scroll: false },
    );
  });

  it("boş bırakılan tarih de geçersizdir", () => {
    renderPicker({ preset: "custom", from: "2026-05-01", to: "2026-05-31" });

    fireEvent.change(dateInput(tr.analysis.to), { target: { value: "" } });

    expect(screen.queryByRole("alert")).not.toBeNull();
    expect(
      (screen.getByRole("button", { name: tr.analysis.apply }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("bozuk bağlantıyla gelindiğinde de hatayı söyler", () => {
    // `?from=2026-07-20&to=2026-07-01` paylaşılmış olabilir: analiz varsayılana
    // düştü ve kullanıcı bunu bilmeli.
    renderPicker({ preset: "custom", from: "2026-07-20", to: "2026-07-01" });

    expect(screen.getByRole("alert").textContent).toBe(tr.analysis.invalidRange);
  });

  it("yürürlükteki aralığı sunucudan geldiği gibi yazar", () => {
    renderPicker({ preset: "last30" });
    // Tarih biçimlendirmesi sunucuda yapılır: tarayıcı ve sunucu Intl
    // sürümleri ayrışırsa hidrasyon uyuşmazlığı çıkardı.
    expect(screen.getByText("1 – 30 Tem")).toBeDefined();
  });

  it("İngilizce: etiketler ve seçenekler locale'i takip eder", () => {
    renderPicker({ preset: "custom", from: "2026-05-01", to: "2026-05-31" }, "en");

    expect(screen.getByLabelText(en.analysis.label)).toBeDefined();
    expect(screen.getByLabelText(en.analysis.from)).toBeDefined();
    expect(screen.getByRole("button", { name: en.analysis.apply })).toBeDefined();
    expect(
      [...(screen.getByLabelText(en.analysis.label) as HTMLSelectElement).options].map(
        (option) => option.textContent,
      ),
    ).toEqual([
      en.analysis.preset.last7,
      en.analysis.preset.last30,
      en.analysis.preset.last90,
      en.analysis.preset.thisMonth,
      en.analysis.preset.lastMonth,
      en.analysis.preset.custom,
    ]);
  });

  it("İngilizce: geçersiz aralık uyarısı da çevrilidir", () => {
    renderPicker({ preset: "custom", from: "2026-07-20", to: "2026-07-01" }, "en");
    expect(screen.getByRole("alert").textContent).toBe(en.analysis.invalidRange);
  });
});
