import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * VARSAYILAN MALİYET AYARLARININ SÖZLÜĞÜ.
 *
 * Anahtar varlığından fazlasını sınıyor: bu bölümün metinleri **bir söz
 * veriyor**. Kullanıcı buradan bir değer değiştirdiğinde ürüne özel
 * maliyetlerinin ezildiğini düşünürse, girdiği en değerli veriye güvenmeyi
 * bırakır. Bu yüzden "yalnızca ... yoksa" kaydı ve "ürüne özel maliyetler
 * değişmez" güvencesi iki dilde de zorunlu tutuluyor.
 */

const KEYS = [
  "defaultsTitle",
  "defaultsDescription",
  "defaultsPrecedenceNote",
  "defaultsPrecedenceProduct",
  "defaultsPrecedenceCategory",
  "defaultsPrecedenceStore",
  "defaultsNoEffect",
  "defaultsStore",
  "defaultsCategories",
  "defaultsProductCount",
  "defaultsSince",
  "defaultsInherited",
  "defaultsUnset",
  "defaultsInheritHint",
  "defaultsStoreBlankHint",
  "defaultsCommissionZeroWarning",
  "defaultsEffectiveHint",
  "defaultsPastDateWarning",
  "defaultsNoCategories",
  "defaultsNoCategoriesHint",
] as const;

const dictionaries = { tr, en };

describe("costs.defaults sözlüğü", () => {
  for (const [locale, messages] of Object.entries(dictionaries)) {
    const costs = messages.costs as unknown as Record<string, unknown>;

    it(`${locale}: bölüm metinleri dolu`, () => {
      for (const key of KEYS) {
        expect(typeof costs[key], `${locale}.costs.${key}`).toBe("string");
        expect(String(costs[key]).trim(), `${locale}.costs.${key}`).not.toBe("");
      }
    });

    it(`${locale}: yer tutucular arayüzün gönderdiği değişkenlerle eşleşiyor`, () => {
      expect(String(costs["defaultsProductCount"])).toContain("{count");
      expect(String(costs["defaultsSince"])).toContain("{date}");
    });
  }

  it("iki dil aynı anahtar kümesini taşıyor", () => {
    const keysOf = (messages: typeof tr | typeof en) =>
      Object.keys(messages.costs as unknown as Record<string, unknown>)
        .filter((key) => key.startsWith("defaults"))
        .sort();

    expect(keysOf(tr)).toEqual(keysOf(en));
    expect(keysOf(tr)).toEqual([...KEYS].sort());
  });

  it("öncelik sırası üç basamağı da adlandırıyor", () => {
    // Sıra ekranda numaralı okunuyor; bir basamağın adı eksikse kullanıcı
    // hangi kaydın kazandığını tahmin etmek zorunda kalır.
    expect(tr.costs.defaultsPrecedenceProduct.toLowerCase()).toContain("ürün");
    expect(tr.costs.defaultsPrecedenceCategory.toLowerCase()).toContain("kategori");
    expect(tr.costs.defaultsPrecedenceStore.toLowerCase()).toContain("mağaza");

    expect(en.costs.defaultsPrecedenceProduct.toLowerCase()).toContain("product");
    expect(en.costs.defaultsPrecedenceCategory.toLowerCase()).toContain("category");
    expect(en.costs.defaultsPrecedenceStore.toLowerCase()).toContain("store");
  });

  it("ürüne özel maliyetlerin korunduğunu açıkça söylüyor", () => {
    expect(tr.costs.defaultsPrecedenceNote).toContain("değiştirmez");
    expect(tr.costs.defaultsPastDateWarning).toContain("değişmez");

    expect(en.costs.defaultsPrecedenceNote.toLowerCase()).toContain("never change");
    expect(en.costs.defaultsPastDateWarning.toLowerCase()).toContain("untouched");
  });

  it("varsayılanın yalnızca boşluğu doldurduğunu söylüyor", () => {
    expect(tr.costs.defaultsDescription).toContain("kendi kaydı olmayan");
    expect(tr.costs.defaultsInheritHint).toContain("Boş bırakılırsa");

    expect(en.costs.defaultsDescription.toLowerCase()).toContain(
      "no record of its own",
    );
    expect(en.costs.defaultsInheritHint.toLowerCase()).toContain("left empty");
  });

  it("boş alanın anlamı iki kapsamda da yazılı ve farklı", () => {
    /**
     * Aynı boş alan iki kapsamda iki farklı şey yapar: kategoride zincir
     * mağazaya iner, mağazada inecek yer kalmadığı için kalem hesaba
     * katılmaz. Tek bir cümleyle ikisini anlatmak, birinde yalan söylemek
     * olurdu — bu yüzden iki ayrı metin var ve ikisi aynı olamaz.
     */
    expect(tr.costs.defaultsStoreBlankHint).toContain("Boş bırakılırsa");
    expect(tr.costs.defaultsStoreBlankHint).toContain("hesaba katılmaz");
    expect(tr.costs.defaultsStoreBlankHint).not.toBe(tr.costs.defaultsInheritHint);

    expect(en.costs.defaultsStoreBlankHint.toLowerCase()).toContain("left empty");
    expect(en.costs.defaultsStoreBlankHint.toLowerCase()).toContain("not counted");
    expect(en.costs.defaultsStoreBlankHint).not.toBe(en.costs.defaultsInheritHint);
  });

  it("mağaza komisyonu uyarısı sonucu ve etkisini birlikte söylüyor", () => {
    // "%0 sayılır" tek başına yetmez; kullanıcının umursaması için kârın
    // olduğundan yüksek görüneceğini de söylemek gerekiyor.
    expect(tr.costs.defaultsCommissionZeroWarning).toContain("%0");
    expect(tr.costs.defaultsCommissionZeroWarning).toContain("yüksek");

    expect(en.costs.defaultsCommissionZeroWarning).toContain("0%");
    expect(en.costs.defaultsCommissionZeroWarning.toLowerCase()).toContain("higher");
  });

  it("eksik maliyet kuyruğunu kısaltma vaadi vermiyor", () => {
    // Varsayılanın alış maliyeti yoktur; kuyruk yalnızca ürün bazlı kayıtla erir.
    expect(tr.costs.defaultsNoEffect).toContain("kısaltmaz");
    expect(en.costs.defaultsNoEffect.toLowerCase()).toContain("does not shorten");
  });

  it("hiçbir metin ürün maliyetlerinin toplu güncelleneceğini ima etmiyor", () => {
    const forbidden = {
      tr: ["ürün maliyetlerini güncelle", "tüm maliyetleri değiştir"],
      en: ["update product costs", "overwrite product costs"],
    };

    for (const phrase of forbidden.tr) {
      for (const key of KEYS) {
        expect(String(tr.costs[key]).toLowerCase(), key).not.toContain(phrase);
      }
    }
    for (const phrase of forbidden.en) {
      for (const key of KEYS) {
        expect(String(en.costs[key]).toLowerCase(), key).not.toContain(phrase);
      }
    }
  });
});
