/**
 * EKSİK MALİYET İŞİNİN ADRESİ.
 *
 * Kokpitteki "Tamamla" düğmesi kullanıcıyı maliyet ekranına götürüyor; oraya
 * "bir yerlere" değil, **tam o ürünün formuna** götürmesi gerekiyor. Aksi
 * hâlde kokpitte sırayı gösterip kullanıcıyı 200 satırlık listede ürün
 * aramaya bırakırdık ve kazanılan saniyeler orada geri kaybolurdu.
 *
 * Bağlantının iki parçası var ve ikisi de gerekli:
 *
 * • `?product=` → sunucu bileşeni hangi satırın formunun **açık** geleceğini
 *   buradan bilir. Durum URL'de olduğu için bağlantı paylaşılabilir ve
 *   yenilendiğinde kaybolmaz.
 * • `#cost-…`   → tarayıcı ilgili satıra kendi kaydırır. JavaScript ile
 *   `scrollIntoView` yazmak yerine platformun kendi davranışı kullanılıyor.
 *
 * Adres üretimi tek yerde: hem bağlantıyı kuran kokpit hem çapayı basan satır
 * bileşeni aynı fonksiyonu çağırır, yoksa ikisi sessizce ayrışır ve bağlantı
 * hiçbir yere kaydırmaz.
 */

/** Maliyet ekranında formu açık gelecek ürünün sorgu parametresi. */
export const COST_FOCUS_PARAM = "product";

/** Kuyruktaki satırın DOM çapası. */
export function missingCostAnchorId(productId: string): string {
  return `cost-${productId}`;
}

/**
 * Maliyet ekranındaki ilgili ürünün formuna giden adres.
 *
 * Locale ön eki bilinçli olarak YOK: bağlantı `@/i18n/navigation` içindeki
 * `Link` ile kurulur ve dili o ekler. Burada `/tr/costs` üretmek, İngilizce
 * gezinen kullanıcıyı sessizce Türkçeye düşürürdü.
 */
export function costFocusHref(productId: string): string {
  const query = `${COST_FOCUS_PARAM}=${encodeURIComponent(productId)}`;
  return `/costs?${query}#${missingCostAnchorId(productId)}`;
}

/**
 * URL'den gelen değer güvenilmezdir: `?product=a&product=b` dizi, eksikse
 * `undefined` gelir. Ekranlar tek bir ürün kimliği ya da hiçbir şey görür.
 */
export function readFocusProductId(
  searchParams: Record<string, string | readonly string[] | undefined>,
): string | undefined {
  const value = searchParams[COST_FOCUS_PARAM];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}
