import { describe, expect, it } from "vitest";

import { defaultAnalysisWindow, selectionOf } from "@/core/services/analysis-window";
import {
  ANALYSIS_FROM_PARAM,
  ANALYSIS_PARAM,
  ANALYSIS_TO_PARAM,
  analysisHref,
  analysisQuery,
  isSameAnalysisSelection,
  readAnalysisSelection,
  readAnalysisWindow,
  withAnalysisQuery,
} from "@/features/analysis/analysis-params";
import { costFocusHref } from "@/features/costs/cost-focus";

/**
 * PENCERENİN ADRESİ.
 *
 * Adres üretimi ile adresi okuyan taraf ayrı işler; ikisi ayrışırsa kokpitten
 * maliyet ekranına geçen kullanıcı sessizce başka bir dönemin kuyruğunu görür.
 * Buradaki testler bu iki tarafın **aynı sözleşmeyi** konuştuğunu kovalıyor.
 */

const TODAY = "2026-07-28";

describe("analiz penceresi adresi", () => {
  it("varsayılan pencere adrese hiçbir şey yazmaz", () => {
    // `/tr` temiz kalmalı; ayrıca "seçim değişti mi" karşılaştırması bu
    // sayede metin eşitliğine iniyor.
    expect(analysisQuery({ preset: "last30" })).toBe("");
    expect(analysisHref("/", { preset: "last30" })).toBe("/");
  });

  it("preset seçimini tek parametreyle taşır", () => {
    expect(analysisHref("/", { preset: "last7" })).toBe(`/?${ANALYSIS_PARAM}=last7`);
    expect(analysisHref("/", { preset: "lastMonth" })).toBe(
      `/?${ANALYSIS_PARAM}=lastMonth`,
    );
  });

  it("özel aralıkta iki ucu da yazar", () => {
    expect(
      analysisHref("/", { preset: "custom", from: "2026-05-01", to: "2026-05-31" }),
    ).toBe(
      `/?${ANALYSIS_PARAM}=custom&${ANALYSIS_FROM_PARAM}=2026-05-01&${ANALYSIS_TO_PARAM}=2026-05-31`,
    );
  });

  it("uçları olmayan 'özel' seçim hiçbir aralık tarif etmiyor — yazılmaz", () => {
    expect(analysisQuery({ preset: "custom" })).toBe("");
  });

  it("üretilen adres kendi okuyucusuyla aynı pencereyi verir", () => {
    for (const selection of [
      { preset: "last7" },
      { preset: "last90" },
      { preset: "thisMonth" },
      { preset: "custom", from: "2026-01-05", to: "2026-02-09" },
    ] as const) {
      const query = new URL(analysisHref("/", selection), "https://x").searchParams;
      const record = Object.fromEntries(query.entries());

      expect(readAnalysisSelection(record), selection.preset).toEqual(selection);
    }
  });

  it("var olan sorguyu ezmez, çapayı da sonda bırakır", () => {
    // `#cost-p2` sorgunun parçası olsaydı tarayıcı satıra kaydırmazdı.
    expect(withAnalysisQuery(costFocusHref("p2"), { preset: "last7" })).toBe(
      `/costs?product=p2&${ANALYSIS_PARAM}=last7#cost-p2`,
    );
    expect(withAnalysisQuery("/costs", { preset: "last7" })).toBe(
      `/costs?${ANALYSIS_PARAM}=last7`,
    );
  });

  it("varsayılan pencerede mevcut bağlantıya dokunmaz", () => {
    expect(withAnalysisQuery(costFocusHref("p2"), { preset: "last30" })).toBe(
      "/costs?product=p2#cost-p2",
    );
  });

  it("locale ön eki eklemez — dili gezinme bileşeni koyar", () => {
    expect(analysisHref("/costs", { preset: "last7" }).startsWith("/costs")).toBe(true);
  });
});

describe("adresten pencere okuma", () => {
  it("parametresiz adres varsayılan pencereyi açar", () => {
    expect(readAnalysisWindow({}, TODAY)).toEqual(defaultAnalysisWindow(TODAY));
  });

  it("tanınmayan preset adını varsayılana düşürür", () => {
    // Elle yazılmış ya da eski bir bağlantı panelin çökmesine sebep olmamalı.
    expect(readAnalysisSelection({ [ANALYSIS_PARAM]: "last365" })).toEqual({
      preset: "last30",
    });
  });

  it("eksik, boş ya da çoklu parametreyi yok sayar", () => {
    expect(readAnalysisSelection({ [ANALYSIS_PARAM]: "  " }).preset).toBe("last30");
    // `?period=last7&period=last90` — hangisi olduğu belirsiz; hiçbiri.
    expect(
      readAnalysisSelection({ [ANALYSIS_PARAM]: ["last7", "last90"] }).preset,
    ).toBe("last30");
  });

  it("preset seçiliyken tarih parametrelerini dikkate almaz", () => {
    // "Son 7 gün" + adreste kalmış eski tarihler: aralık presetten çıkmalı.
    const window = readAnalysisWindow(
      {
        [ANALYSIS_PARAM]: "last7",
        [ANALYSIS_FROM_PARAM]: "2020-01-01",
        [ANALYSIS_TO_PARAM]: "2020-12-31",
      },
      TODAY,
    );

    expect(window.range).toEqual({ from: "2026-07-22", to: TODAY });
  });

  it("geçersiz özel aralığı bayrakla birlikte taşır", () => {
    const window = readAnalysisWindow(
      {
        [ANALYSIS_PARAM]: "custom",
        [ANALYSIS_FROM_PARAM]: "2026-07-20",
        [ANALYSIS_TO_PARAM]: "2026-07-01",
      },
      TODAY,
    );

    expect(window.invalid).toBe(true);
    expect(window.range).toEqual(defaultAnalysisWindow(TODAY).range);
  });
});

describe("aynı seçim tespiti", () => {
  it("aynı pencere yeniden seçildiğinde eşit sayar", () => {
    // Gezinmeyi bu karşılaştırma engelliyor: aynı adres → aynı sunucu
    // render'ı → tüm dedektörlerin boşuna bir kez daha çalışması.
    expect(isSameAnalysisSelection({ preset: "last7" }, { preset: "last7" })).toBe(
      true,
    );
    expect(
      isSameAnalysisSelection(
        { preset: "custom", from: "2026-01-01", to: "2026-01-31" },
        { preset: "custom", from: "2026-01-01", to: "2026-01-31" },
      ),
    ).toBe(true);
  });

  it("farklı pencereleri ayırt eder", () => {
    expect(isSameAnalysisSelection({ preset: "last7" }, { preset: "last30" })).toBe(
      false,
    );
    expect(
      isSameAnalysisSelection(
        { preset: "custom", from: "2026-01-01", to: "2026-01-31" },
        { preset: "custom", from: "2026-01-01", to: "2026-02-28" },
      ),
    ).toBe(false);
  });

  it("çözümlenmiş pencereden çıkarılan seçim kendisiyle eşittir", () => {
    const window = readAnalysisWindow({ [ANALYSIS_PARAM]: "thisMonth" }, TODAY);
    expect(isSameAnalysisSelection(selectionOf(window), { preset: "thisMonth" })).toBe(
      true,
    );
  });
});
