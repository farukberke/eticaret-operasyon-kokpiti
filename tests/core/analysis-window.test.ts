import { describe, expect, it } from "vitest";

import { daysInRange, isIsoDate, monthRange } from "@/core/domain";
import {
  ANALYSIS_PRESETS,
  analysisPresetDays,
  DEFAULT_ANALYSIS_PRESET,
  defaultAnalysisWindow,
  isAnalysisPreset,
  isValidAnalysisRange,
  resolveAnalysisWindow,
  selectionOf,
  type AnalysisPreset,
} from "@/core/services/analysis-window";

/**
 * ANALİZ PENCERESİ — panelin tek tarih hesabı.
 *
 * Buradaki testler "aralık doğru mu" sorusundan çok, **ekranların aynı
 * pencereden konuştuğunu** garanti etmeye çalışıyor: bir preset her çağrıda
 * aynı aralığı vermeli, geçersiz bir seçim analiz katmanına hiç ulaşmamalı ve
 * çözümleyici hiçbir girdide istisna atmamalı.
 */

const TODAY = "2026-07-28";

describe("Ay aralığı", () => {
  it("ayın ilk ve son gününü kapsar", () => {
    expect(monthRange("2026-07-28")).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("30 ve 28 günlük ayları elle yazmadan bulur", () => {
    expect(monthRange("2026-06-15").to).toBe("2026-06-30");
    expect(monthRange("2026-02-10").to).toBe("2026-02-28");
  });

  it("artık yılın şubatını bilir", () => {
    expect(monthRange("2028-02-01")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("bir önceki ay yıl sınırını geriye aşar", () => {
    expect(monthRange("2026-01-15", 1)).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("ay uzunluğu farkından etkilenmez — 31 Mart'ın öncesi şubattır", () => {
    // `Date.setMonth` burada 3 Mart üretirdi: 31 Şubat yok.
    expect(monthRange("2026-03-31", 1)).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
  });
});

describe("Gün anahtarı doğrulaması", () => {
  it("biçime uyan ama takvimde olmayan günü reddeder", () => {
    // `new Date("2026-02-31")` sessizce 3 Mart'a kayar; kullanıcının yazdığı
    // tarih bu kapıdan geçmeden aralık hesabına giremez.
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-02-28")).toBe(true);
  });

  it("biçimsiz ve metin olmayan girdileri reddeder", () => {
    expect(isIsoDate("28.07.2026")).toBe(false);
    expect(isIsoDate("2026-7-1")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
    expect(isIsoDate(20260728)).toBe(false);
  });
});

describe("Preset pencereleri", () => {
  it("gün tabanlı presetler bugünü dahil eder ve tam uzunlukta olur", () => {
    for (const [preset, days] of [
      ["last7", 7],
      ["last30", 30],
      ["last90", 90],
    ] as const) {
      const { range } = resolveAnalysisWindow({ preset }, TODAY);

      expect(range.to, preset).toBe(TODAY);
      expect(daysInRange(range), preset).toBe(days);
      expect(analysisPresetDays(preset), preset).toBe(days);
    }
  });

  it("'Bu ay' ayın 1'inden bugüne kadardır — ay sonuna kadar değil", () => {
    // Ay sonunu almak, henüz yaşanmamış günleri paydaya katardı: günlük
    // ortalamalar olduğundan düşük çıkar.
    expect(resolveAnalysisWindow({ preset: "thisMonth" }, TODAY).range).toEqual({
      from: "2026-07-01",
      to: TODAY,
    });
  });

  it("ayın ilk günü 'Bu ay' tek günlük penceredir, boş değil", () => {
    const { range } = resolveAnalysisWindow({ preset: "thisMonth" }, "2026-07-01");
    expect(range).toEqual({ from: "2026-07-01", to: "2026-07-01" });
    expect(daysInRange(range)).toBe(1);
  });

  it("'Geçen ay' tam takvim ayıdır", () => {
    expect(resolveAnalysisWindow({ preset: "lastMonth" }, TODAY).range).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });

  it("takvim tabanlı presetlerin sabit gün sayısı yoktur", () => {
    expect(analysisPresetDays("thisMonth")).toBeNull();
    expect(analysisPresetDays("lastMonth")).toBeNull();
    expect(analysisPresetDays("custom")).toBeNull();
  });

  it("her preset geçerli bir aralık üretir — hiçbiri çözümleyiciyi kıramaz", () => {
    for (const preset of ANALYSIS_PRESETS) {
      const window = resolveAnalysisWindow({ preset }, TODAY);
      expect(isValidAnalysisRange(window.range.from, window.range.to), preset).toBe(
        true,
      );
    }
  });

  it("aynı girdi her zaman aynı aralığı verir", () => {
    // İki ekran aynı pencereyi ayrı ayrı çözümlüyor; sonuç birebir aynı olmalı.
    expect(resolveAnalysisWindow({ preset: "last7" }, TODAY)).toEqual(
      resolveAnalysisWindow({ preset: "last7" }, TODAY),
    );
  });
});

describe("Özel tarih aralığı", () => {
  it("geçerli aralığı olduğu gibi kullanır", () => {
    const window = resolveAnalysisWindow(
      { preset: "custom", from: "2026-05-01", to: "2026-05-31" },
      TODAY,
    );

    expect(window.range).toEqual({ from: "2026-05-01", to: "2026-05-31" });
    expect(window.invalid).toBe(false);
  });

  it("tek günlük aralık geçerlidir", () => {
    const window = resolveAnalysisWindow(
      { preset: "custom", from: TODAY, to: TODAY },
      TODAY,
    );

    expect(window.invalid).toBe(false);
    expect(daysInRange(window.range)).toBe(1);
  });

  it("ters aralıkta analizi varsayılan pencereye düşürür ve uçları takas ETMEZ", () => {
    const window = resolveAnalysisWindow(
      { preset: "custom", from: "2026-07-20", to: "2026-07-01" },
      TODAY,
    );

    expect(window.invalid).toBe(true);
    // Sessizce düzeltmek, kullanıcının istemediği bir aralığı doğruymuş gibi
    // göstermek olurdu.
    expect(window.range).toEqual(defaultAnalysisWindow(TODAY).range);
    // Yazdığı tarihler formda durmaya devam eder; hatayı görüp düzeltebilsin.
    expect(window.draft).toEqual({ from: "2026-07-20", to: "2026-07-01" });
  });

  it("bozuk ya da eksik uçları varsayılan pencereden doldurur", () => {
    const fallback = defaultAnalysisWindow(TODAY).range;

    expect(
      resolveAnalysisWindow(
        { preset: "custom", from: "yarın", to: "2026-07-10" },
        TODAY,
      ).draft,
    ).toEqual({ from: fallback.from, to: "2026-07-10" });

    // Hiçbir uç verilmemişse "özel" seçimi varsayılanla aynı aralığı gösterir;
    // form boş bir tarih alanıyla açılmaz.
    expect(resolveAnalysisWindow({ preset: "custom" }, TODAY).range).toEqual(fallback);
  });

  it("geleceğe ya da çok geriye uzanan aralığı reddetmez — sonucu boş ekran söyler", () => {
    const window = resolveAnalysisWindow(
      { preset: "custom", from: "2020-01-01", to: "2030-12-31" },
      TODAY,
    );

    expect(window.invalid).toBe(false);
    expect(window.range).toEqual({ from: "2020-01-01", to: "2030-12-31" });
  });
});

describe("Varsayılan pencere ve seçim", () => {
  it("varsayılan, seçicideki aynı adlı seçenekle birebir aynı aralığı verir", () => {
    // Farklı olsalardı "hiç seçim yapılmamış" ekran ile "Son 30 gün" seçilmiş
    // ekran farklı veri gösterirdi.
    expect(defaultAnalysisWindow(TODAY)).toEqual(
      resolveAnalysisWindow({ preset: DEFAULT_ANALYSIS_PRESET }, TODAY),
    );
  });

  it("pencereden geri çıkarılan seçim aynı pencereyi yeniden üretir", () => {
    for (const preset of ANALYSIS_PRESETS) {
      const window = resolveAnalysisWindow(
        preset === "custom"
          ? { preset, from: "2026-01-05", to: "2026-02-09" }
          : { preset },
        TODAY,
      );

      expect(resolveAnalysisWindow(selectionOf(window), TODAY), preset).toEqual(window);
    }
  });

  it("tanınmayan preset adını kabul etmez", () => {
    expect(isAnalysisPreset("last7")).toBe(true);
    expect(isAnalysisPreset("last365")).toBe(false);
    expect(isAnalysisPreset(undefined)).toBe(false);
  });

  it("preset listesi ürünün vaat ettiği altı seçeneği taşır", () => {
    expect([...ANALYSIS_PRESETS]).toEqual([
      "last7",
      "last30",
      "last90",
      "thisMonth",
      "lastMonth",
      "custom",
    ] satisfies AnalysisPreset[]);
  });
});
