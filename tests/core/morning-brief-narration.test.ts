import { describe, expect, it } from "vitest";

import type { MorningBriefNarrationInput } from "@/core/domain";
import {
  buildMorningBriefPrompt,
  fallbackNarration,
  sanitizeNarration,
} from "@/core/services/morning-brief-narration";

/**
 * SABAH ÖZETİ → LLM PROMPT'U VE GÜVENLİK FİLTRESİ.
 *
 * Ağ çağrısı yok — yalnızca metin üretimi ve model cevabının temizlenmesi.
 * Bu yüzden bu dosya hiçbir mock'a ihtiyaç duymaz.
 */

function input(overrides: Partial<MorningBriefNarrationInput> = {}): MorningBriefNarrationInput {
  return {
    locale: "tr",
    summary: {
      total: 3,
      activeActions: 2,
      completedActions: 1,
      snoozedActions: 0,
      ignoredActions: 0,
      criticalActions: 1,
    },
    focus: null,
    ...overrides,
  };
}

describe("buildMorningBriefPrompt", () => {
  it("özetteki sayıların tamamını metne gömer", () => {
    const prompt = buildMorningBriefPrompt(input());
    expect(prompt).toContain("Aktif satın alma aksiyonu: 2");
    expect(prompt).toContain("Acil/kritik aksiyon: 1");
    expect(prompt).toContain("Tamamlanan: 1");
  });

  it("focus varsa eylem/gerekçe metnini taşır", () => {
    const prompt = buildMorningBriefPrompt(
      input({ focus: { actionLabel: "X ürününü sipariş et", reasonText: "3 gün yeter" } }),
    );
    expect(prompt).toContain("X ürününü sipariş et");
    expect(prompt).toContain("3 gün yeter");
  });

  it("locale'e göre hedef dili belirtir", () => {
    expect(buildMorningBriefPrompt(input({ locale: "tr" }))).toContain("Türkçe yaz");
    expect(buildMorningBriefPrompt(input({ locale: "en" }))).toContain("English yaz");
  });
});

describe("sanitizeNarration", () => {
  it("markdown ve tırnak işaretlerini temizler", () => {
    expect(sanitizeNarration('"**Bugün 2 iş var.**"')).toBe("Bugün 2 iş var.");
  });

  it("birden fazla satırı/boşluğu tek boşluğa indirger", () => {
    expect(sanitizeNarration("Bugün\n\n  2   iş   var.")).toBe("Bugün 2 iş var.");
  });

  it("boş cevabı reddeder (null döner)", () => {
    expect(sanitizeNarration("   ")).toBeNull();
    expect(sanitizeNarration("")).toBeNull();
  });

  it("modelin sızdırdığı karakter sayısı notunu keser", () => {
    expect(sanitizeNarration("Bugün 2 iş var. (218 chars)")).toBe("Bugün 2 iş var.");
    expect(sanitizeNarration("Bugün 2 iş var. (45 karakter)")).toBe("Bugün 2 iş var.");
  });

  it("çok uzun cevabı sınırda keser", () => {
    const long = "a".repeat(300);
    const result = sanitizeNarration(long);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(220);
    expect(result!.endsWith("…")).toBe(true);
  });
});

describe("fallbackNarration", () => {
  it("aktif aksiyon yoksa sakin gün cümlesi döner", () => {
    expect(fallbackNarration(input({ summary: { ...input().summary, activeActions: 0 } }))).toBe(
      "Bugün satın alma tarafında öncelikli bir aksiyon yok.",
    );
  });

  it("aktif aksiyon varsa sayıyı ve aciliyeti cümleye döker", () => {
    const text = fallbackNarration(input());
    expect(text).toContain("2");
    expect(text).toContain("1 tanesi acil");
  });

  it("focus varsa cümleye eklenir", () => {
    const text = fallbackNarration(
      input({ focus: { actionLabel: "X ürününü sipariş et", reasonText: "3 gün yeter" } }),
    );
    expect(text).toContain("X ürününü sipariş et");
  });

  it("İngilizce locale'de İngilizce cümle üretir", () => {
    const text = fallbackNarration(input({ locale: "en" }));
    expect(text).toContain("purchase action");
  });
});
