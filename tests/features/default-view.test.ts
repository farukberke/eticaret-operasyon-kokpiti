import { describe, expect, it } from "vitest";

import { basisPoints, lira, type CostDefault, type Product } from "@/core/domain";
import { buildCostDefaultsView } from "@/features/costs/default-view";

/**
 * VARSAYILAN AYARLARIN GÖRÜNÜMÜ.
 *
 * Sınanan asıl şey biçimlendirme değil, **kaynak izlenebilirliği**. Bir
 * kategori satırında ₺34,90 görünüyorsa kullanıcı onun o kategoriye mi ait
 * yoksa mağazadan mı indiğini bilmek zorunda; bilmezse olmayan bir ayarı
 * silmeye çalışır.
 *
 * İkinci sınanan: miras alınan değer **form alanına yazılmaz**. Yazılsaydı,
 * yalnızca komisyonu değiştirip kaydeden kullanıcı kargoyu da o kategoriye
 * sabitlemiş olurdu ve mağaza varsayılanı sonradan değişince o kategori
 * sessizce geride kalırdı.
 */

const TODAY = "2026-07-27";

function makeProduct(id: string, category: string): Product {
  return {
    id,
    sku: `SKU-${id}`,
    name: id,
    category,
    price: lira(100),
    stock: 10,
    listedAt: "2026-01-01",
  };
}

const PRODUCTS: readonly Product[] = [
  makeProduct("a", "Elektronik"),
  makeProduct("b", "Elektronik"),
  makeProduct("c", "Giyim"),
];

const STORE: CostDefault = {
  scope: { kind: "store" },
  effectiveFrom: "2026-01-01",
  commissionRate: basisPoints(15),
  shippingCost: lira(34.9),
  packagingPerUnit: lira(2.5),
};

const ELECTRONICS: CostDefault = {
  scope: { kind: "category", category: "Elektronik" },
  effectiveFrom: "2026-02-01",
  commissionRate: basisPoints(11),
};

const view = buildCostDefaultsView({
  defaults: [STORE, ELECTRONICS],
  products: PRODUCTS,
  today: TODAY,
  locale: "tr",
});

const electronics = view.categories.find((row) => row.category === "Elektronik")!;
const clothing = view.categories.find((row) => row.category === "Giyim")!;

describe("Mağaza satırı", () => {
  it("kendi kaydından gelen değerleri taşır", () => {
    expect(view.store.kind).toBe("store");
    expect(view.store.category).toBeNull();
    expect(view.store.commission.source).toBe("own");
    expect(view.store.commission.label).not.toBeNull();
  });

  it("form alanına ham değeri koyar, biçimlenmiş metni değil", () => {
    // Kullanıcı "₺34,90" metnini silip yeniden yazmak zorunda kalmasın.
    expect(view.store.shipping.value).toBe("34.9");
    expect(view.store.commission.value).toBe("15");
    expect(view.store.packaging.value).toBe("2.5");
  });

  it("katalogdaki tüm ürünleri kapsar", () => {
    expect(view.store.productCount).toBe(3);
  });

  it("yürürlükteki kaydın tarihini gösterir", () => {
    expect(view.store.effectiveFromLabel).not.toBeNull();
  });
});

describe("Kategori satırları", () => {
  it("katalogdaki her kategori için bir satır üretir", () => {
    expect(view.categories.map((row) => row.category)).toEqual(["Elektronik", "Giyim"]);
  });

  it("kategorideki ürün sayısını söyler — ayarın yarıçapı", () => {
    expect(electronics.productCount).toBe(2);
    expect(clothing.productCount).toBe(1);
  });

  it("kendi tanımladığı alanı 'own' olarak işaretler", () => {
    expect(electronics.commission.source).toBe("own");
    expect(electronics.commission.value).toBe("11");
  });

  it("tanımlamadığı alanı mağazadan miras alır ve kaynağını söyler", () => {
    expect(electronics.shipping.source).toBe("store");
    expect(electronics.shipping.label).toBe(view.store.shipping.label);
  });

  it("miras alınan değeri form alanına yazmaz", () => {
    expect(electronics.shipping.value).toBe("");
    expect(electronics.packaging.value).toBe("");
  });

  it("hiç kaydı olmayan kategori her alanı mağazadan alır", () => {
    expect(clothing.commission.source).toBe("store");
    expect(clothing.commission.label).toBe(view.store.commission.label);
    expect(clothing.effectiveFromLabel).toBeNull();
  });
});

describe("Açıkça yazılmış sıfır", () => {
  /**
   * `0` bir değerdir, yokluk değil.
   *
   * Görünüm bunu "Tanımlı değil" diye gösterseydi, kullanıcı komisyonsuz
   * çalıştığını bildirdiği kategoriyi her açılışta yeniden tanımlamak zorunda
   * kalır ve formu boş görüp kaydettiğinde ayarı sessizce kaybederdi.
   */
  const zeroed = buildCostDefaultsView({
    defaults: [
      STORE,
      {
        scope: { kind: "category", category: "Elektronik" },
        effectiveFrom: "2026-02-01",
        commissionRate: basisPoints(0),
        shippingCost: lira(0),
      },
    ],
    products: PRODUCTS,
    today: TODAY,
    locale: "tr",
  });

  const row = zeroed.categories.find((entry) => entry.category === "Elektronik")!;

  it("sıfır komisyonu kendi kaydı sayar, tanımsız değil", () => {
    expect(row.commission.source).toBe("own");
    expect(row.commission.label).not.toBeNull();
  });

  it("sıfırı form alanına geri yazar — açılışta boş görünmez", () => {
    expect(row.commission.value).toBe("0");
    expect(row.shipping.value).toBe("0");
  });

  it("sıfır kargo mağazanınkini miras alıyormuş gibi görünmez", () => {
    expect(row.shipping.source).toBe("own");
    expect(row.shipping.label).not.toBe(zeroed.store.shipping.label);
  });

  it("tanımlanmayan alan yine mağazadan iner", () => {
    // Aynı kayıtta sıfırlanmış kargo ile tanımsız paketleme bir arada.
    expect(row.packaging.source).toBe("store");
    expect(row.packaging.value).toBe("");
  });
});

describe("Boş durumlar", () => {
  it("hiç varsayılan yoksa her alan 'tanımlı değil' olur", () => {
    const bare = buildCostDefaultsView({
      defaults: [],
      products: PRODUCTS,
      today: TODAY,
      locale: "tr",
    });

    for (const value of [
      bare.store.commission,
      bare.store.shipping,
      bare.store.packaging,
    ]) {
      expect(value.source).toBe("none");
      expect(value.label).toBeNull();
      expect(value.value).toBe("");
    }
    expect(bare.store.effectiveFromLabel).toBeNull();
  });

  it("katalog boşsa kategori satırı üretmez", () => {
    const empty = buildCostDefaultsView({
      defaults: [STORE],
      products: [],
      today: TODAY,
      locale: "tr",
    });

    expect(empty.categories).toEqual([]);
    expect(empty.store.productCount).toBe(0);
  });

  it("kategorisi boş bırakılmış ürün sahte bir kategori satırı açmaz", () => {
    const withBlank = buildCostDefaultsView({
      defaults: [STORE],
      products: [...PRODUCTS, makeProduct("d", "  ")],
      today: TODAY,
      locale: "tr",
    });

    expect(withBlank.categories.map((row) => row.category)).toEqual([
      "Elektronik",
      "Giyim",
    ]);
  });
});

describe("Yürürlük tarihi", () => {
  it("kayıt yürürlüğe girmeden önce görünmez", () => {
    // Kategori kaydı 1 Şubat'ta başlıyor; ocakta henüz mağaza geçerli.
    const january = buildCostDefaultsView({
      defaults: [STORE, ELECTRONICS],
      products: PRODUCTS,
      today: "2026-01-15",
      locale: "tr",
    });

    const row = january.categories.find((entry) => entry.category === "Elektronik")!;
    expect(row.commission.source).toBe("store");
    expect(row.effectiveFromLabel).toBeNull();
  });
});
