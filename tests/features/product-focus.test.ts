import { describe, expect, it } from "vitest";

import {
  PRODUCT_FOCUS_PARAM,
  productAnchorId,
  productFocusHref,
  readFocusProductId,
} from "@/features/products/product-focus";

/**
 * KOKPİTTEN ÜRÜN TABLOSUNA GEÇİŞ.
 *
 * `cost-focus.test.ts` ile aynı sözleşme: adres üretimi ile onu okuyan taraf
 * ayrı dosyalarda yaşıyor, ikisinin aynı ürünü konuştuğu burada doğrulanıyor.
 */
describe("ürün odak bağlantısı", () => {
  it("ürünü hem sorgu parametresiyle hem çapayla taşır", () => {
    expect(productFocusHref("p-42")).toBe("/products?product=p-42#product-p-42");
    expect(productAnchorId("p-42")).toBe("product-p-42");
  });

  it("locale ön eki eklemez — dili gezinme bileşeni koyar", () => {
    expect(productFocusHref("p1").startsWith("/products")).toBe(true);
  });

  it("adres için güvenli olmayan kimlikleri kaçırır", () => {
    const href = productFocusHref("a b&c");
    expect(href).toContain(`${PRODUCT_FOCUS_PARAM}=a%20b%26c`);
  });

  it("üretilen adres kendi okuyucusuyla aynı ürünü verir", () => {
    const productId = "p-7";
    const query = new URL(productFocusHref(productId), "https://x").searchParams;

    expect(readFocusProductId({ product: query.get(PRODUCT_FOCUS_PARAM)! })).toBe(
      productId,
    );
  });

  it("eksik, boş ya da çoklu parametreyi yok sayar", () => {
    expect(readFocusProductId({})).toBeUndefined();
    expect(readFocusProductId({ product: "  " })).toBeUndefined();
    expect(readFocusProductId({ product: ["a", "b"] })).toBeUndefined();
  });
});
