"use server";

import { container, loadCostSource } from "@/data/container";

import { buildCostHistoryView, type CostHistoryView } from "./history-view";

/**
 * MALİYET GEÇMİŞİ — sunucu eylemi.
 *
 * **Neden sayfa bileşeninde değil:** maliyet listesi katalogdaki her ürünü
 * gösteriyor. Geçmişi sunucuda hazırlasaydık her render'da yüzlerce ürünün
 * kayıtları biçimlendirilip istemciye gönderilirdi — kullanıcı bunların en
 * fazla birine bakacakken. Geçmiş, ancak kullanıcı o ürünün formunu açtığında
 * ve yalnızca o ürün için yükleniyor.
 *
 * Kaynak `loadCostSource`: kâr hesabının gördüğü **aynı** tablo (tohumlanan
 * kayıtlar + kullanıcının kaydettikleri). Yalnızca kullanıcı dosyasını okumak,
 * hesaba giren tohumlu kayıtları geçmişten silmek olurdu.
 *
 * Yazma yok, çözümleyici yeniden çalışmıyor, kâr yeniden hesaplanmıyor.
 */
export async function loadCostHistory(
  productId: string,
  /** Para ve tarih biçimlendirmesi sunucuda yapılıyor; locale istemciden gelir. */
  locale: string,
): Promise<CostHistoryView> {
  const source = await loadCostSource();

  return buildCostHistoryView({
    costs: source.costs.products,
    productId,
    today: container.clock.today(),
    locale,
  });
}
