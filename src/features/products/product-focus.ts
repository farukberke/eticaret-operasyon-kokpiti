/**
 * KOKPİTTEN ÜRÜN TABLOSUNA GEÇİŞ.
 *
 * `cost-focus.ts` ile aynı sözleşme: kokpitteki bir uyarıdan tıklanan
 * kullanıcı "bir yerlere" değil, **tam o ürünün satırına** inmeli. Aksi
 * hâlde stok uyarısı kartı bir sıra gösterip kullanıcıyı tablo içinde ürün
 * aramaya bırakırdı.
 *
 * İki parça da gerekli:
 *
 * • `?product=` → hangi satırın vurgulanacağını sunucu bileşeni buradan bilir.
 * • `#product-…` → tarayıcı satıra kendi kaydırır.
 *
 * Adres üretimi ile onu okuyan taraf ayrı tutulmaz: ikisi aynı sözleşmeyi
 * konuşmazsa bağlantı hiçbir yere kaydırmaz.
 */

/** Ürün tablosunda hangi satırın vurgulanacağının sorgu parametresi. */
export const PRODUCT_FOCUS_PARAM = "product";

/** Vurgulanacak satırın DOM çapası. */
export function productAnchorId(productId: string): string {
  return `product-${productId}`;
}

/**
 * Ürün tablosundaki ilgili satıra giden adres.
 *
 * Locale ön eki bilinçli olarak YOK: bağlantı `@/i18n/navigation` içindeki
 * `Link` ile kurulur ve dili o ekler.
 */
export function productFocusHref(productId: string): string {
  const query = `${PRODUCT_FOCUS_PARAM}=${encodeURIComponent(productId)}`;
  return `/products?${query}#${productAnchorId(productId)}`;
}

/**
 * URL'den gelen değer güvenilmezdir: `?product=a&product=b` dizi, eksikse
 * `undefined` gelir. Ekran tek bir ürün kimliği ya da hiçbir şey görür.
 */
export function readFocusProductId(
  searchParams: Record<string, string | readonly string[] | undefined>,
): string | undefined {
  const value = searchParams[PRODUCT_FOCUS_PARAM];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
