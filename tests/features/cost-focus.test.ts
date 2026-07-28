import { describe, expect, it } from "vitest";

import {
  COST_FOCUS_PARAM,
  costFocusHref,
  missingCostAnchorId,
  readFocusProductId,
} from "@/features/costs/cost-focus";

/**
 * KOKPİTTEN MALİYET EKRANINA GEÇİŞ.
 *
 * "Tamamla" düğmesinin tek işi var: kullanıcıyı doğru ürünün formuna
 * bırakmak. Adres üretimi ile adresi okuyan taraf ayrı dosyalarda yaşadığı
 * için ikisinin aynı sözleşmeyi konuştuğu burada doğrulanıyor.
 */
describe("maliyet odak bağlantısı", () => {
  it("ürünü hem sorgu parametresiyle hem çapayla taşır", () => {
    expect(costFocusHref("p-42")).toBe("/costs?product=p-42#cost-p-42");
    expect(missingCostAnchorId("p-42")).toBe("cost-p-42");
  });

  it("locale ön eki eklemez — dili gezinme bileşeni koyar", () => {
    // `/tr/costs` üretseydik İngilizce gezinen kullanıcı sessizce Türkçeye
    // düşerdi.
    expect(costFocusHref("p1").startsWith("/costs")).toBe(true);
  });

  it("adres için güvenli olmayan kimlikleri kaçırır", () => {
    const href = costFocusHref("a b&c");
    expect(href).toContain(`${COST_FOCUS_PARAM}=a%20b%26c`);
  });

  it("üretilen adres kendi okuyucusuyla aynı ürünü verir", () => {
    const productId = "p-7";
    const query = new URL(costFocusHref(productId), "https://x").searchParams;

    expect(readFocusProductId({ product: query.get(COST_FOCUS_PARAM)! })).toBe(
      productId,
    );
  });

  it("eksik, boş ya da çoklu parametreyi yok sayar", () => {
    expect(readFocusProductId({})).toBeUndefined();
    expect(readFocusProductId({ product: "  " })).toBeUndefined();
    // `?product=a&product=b` — hangisi olduğu belirsiz; hiçbiri açılmaz.
    expect(readFocusProductId({ product: ["a", "b"] })).toBeUndefined();
  });
});
