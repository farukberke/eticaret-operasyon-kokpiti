import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * MALİYET GEÇMİŞİNİN SÖZLÜĞÜ.
 *
 * Anahtar varlığından fazlası sınanıyor: bu bölümün metinleri bir **zaman
 * iddiası** taşıyor. "Şu anda kullanılıyor" ile "Geçmiş" arasındaki fark,
 * kullanıcının kâr rakamını hangi maliyetle okuyacağını belirliyor; üç durumun
 * cümlesi birbirine karışırsa rozet bilgi değil gürültü olur.
 *
 * Gelecek tarihli kayıt bu yüzden ayrı bir durum: henüz hiçbir hesaba girmemiş
 * bir kayıt için "kullanıldı" demek, olmamış bir şeyi olmuş göstermek olurdu.
 */

const KEYS = [
  "historyTitle",
  "historyDescription",
  "historyLoading",
  "historyError",
  "historyEmpty",
  "historyEmptyHint",
  "historySourceLabel",
] as const;

const GROUPS = {
  historyStatus: ["active", "past", "upcoming"],
  historyUsed: ["active", "past", "upcoming"],
  historySource: ["manual", "import", "seed"],
} as const;

const dictionaries = { tr, en };

describe("costs.history sözlüğü", () => {
  for (const [locale, messages] of Object.entries(dictionaries)) {
    const costs = messages.costs as unknown as Record<string, unknown>;

    it(`${locale}: bölüm metinleri dolu`, () => {
      for (const key of KEYS) {
        expect(typeof costs[key], `${locale}.costs.${key}`).toBe("string");
        expect(String(costs[key]).trim(), `${locale}.costs.${key}`).not.toBe("");
      }
    });

    it(`${locale}: durum, cümle ve kaynak grupları eksiksiz`, () => {
      for (const [group, members] of Object.entries(GROUPS)) {
        const entry = costs[group] as Record<string, string>;
        expect(Object.keys(entry).sort(), `${locale}.costs.${group}`).toEqual(
          [...members].sort(),
        );
        for (const member of members) {
          expect(entry[member]?.trim(), `${locale}.costs.${group}.${member}`).not.toBe(
            "",
          );
        }
      }
    });

    it(`${locale}: her kayıt cümlesi tarihi yer tutucuyla alıyor`, () => {
      // Tarih cümlenin içinde geçmezse "şu tarihten itibaren" sorusu
      // cevapsız kalır ve rozet tek başına yeterli olmaz.
      const used = costs["historyUsed"] as Record<string, string>;
      for (const member of GROUPS.historyUsed) {
        expect(used[member], `${locale}.costs.historyUsed.${member}`).toContain(
          "{date}",
        );
      }
    });

    it(`${locale}: üç durumun rozeti ve cümlesi birbirinden farklı`, () => {
      for (const group of ["historyStatus", "historyUsed"] as const) {
        const entry = costs[group] as Record<string, string>;
        const values = GROUPS[group].map((member) => entry[member]);
        expect(new Set(values).size, `${locale}.costs.${group}`).toBe(values.length);
      }
    });
  }

  it("iki dil aynı anahtar kümesini taşıyor", () => {
    const keysOf = (messages: typeof tr | typeof en) =>
      Object.keys(messages.costs as unknown as Record<string, unknown>)
        .filter((key) => key.startsWith("history"))
        .sort();

    expect(keysOf(tr)).toEqual(keysOf(en));
    expect(keysOf(tr)).toEqual([...KEYS, ...Object.keys(GROUPS)].sort());
  });

  it("yürürlükteki kayıt şimdiki zamanda konuşuyor", () => {
    expect(tr.costs.historyUsed.active).toContain("kullanılıyor");
    expect(tr.costs.historyUsed.past).toContain("kullanıldı");
    expect(tr.costs.historyUsed.upcoming).toContain("kullanılacak");

    expect(en.costs.historyUsed.active.toLowerCase()).toContain("has been used");
    expect(en.costs.historyUsed.past.toLowerCase()).toContain("was used");
    expect(en.costs.historyUsed.upcoming.toLowerCase()).toContain("will be used");
  });

  it("boş durum bir hata gibi okunmuyor", () => {
    // Geçmişin olmaması bir arıza değil; kullanıcı henüz kayıt girmemiştir.
    for (const phrase of ["hata", "bulunamadı"]) {
      expect(tr.costs.historyEmpty.toLowerCase()).not.toContain(phrase);
    }
    for (const phrase of ["error", "not found", "failed"]) {
      expect(en.costs.historyEmpty.toLowerCase()).not.toContain(phrase);
    }
  });

  it("geçmişin salt okunur olduğunu söylüyor", () => {
    // Kullanıcı geçmiş bir kaydı düzenlemeyi denemeden önce bilsin.
    expect(tr.costs.historyDescription.toLowerCase()).toContain("salt okunur");
    expect(en.costs.historyDescription.toLowerCase()).toContain("read-only");
  });
});
