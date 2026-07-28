import { costKeyOf, toRatio, type IsoDate, type ProductCost } from "@/core/domain";
import { findEffectiveProductCost } from "@/core/services/cost-resolver";
import { formatMoney, formatPercent, formatShortDate } from "@/lib/format";

/**
 * MALİYET GEÇMİŞİ — domain → görünüm çevirisi.
 *
 * Sistem maliyeti zaten tarihsel çözümlüyor: dünkü siparişin kârı dünkü
 * maliyetle hesaplanıyor. Ama kullanıcı bugüne kadar yalnızca **sonucu**
 * görüyordu; hangi kaydın hangi tarihten beri hesaba girdiğini göremiyordu.
 * Bu dosya o defteri açıyor.
 *
 * İki karar burada veriliyor:
 *
 * 1. **Yürürlükteki kayıt sorusu çekirdeğe sorulur.** "Şu anda kullanılıyor"
 *    rozeti `findEffectiveProductCost` ile belirlenir; ekran kendi yürürlük
 *    kuralını icat etmez. Ederse zamanla kâr hesabının kullandığından başka bir
 *    kaydı işaretler ve ekran yalan söylemeye başlar.
 *
 * 2. **Sıralama görünüm kararıdır.** En yeni üstte, çünkü kullanıcı önce "şu an
 *    ne geçerli" diye bakıyor; geçmişe inmek ikinci adım.
 *
 * Çözümleyici yeniden çalıştırılmaz, hiçbir kâr yeniden hesaplanmaz: burada
 * yapılan iş tek bir ürünün kayıtlarını süzüp biçimlendirmekten ibaret.
 */

/**
 * Kaydın zaman içindeki yeri.
 *
 * `upcoming` bilinçli olarak ayrı: geçerlilik tarihi gelecekte olan bir kaydı
 * "Geçmiş" diye göstermek, kullanıcıya henüz hiçbir hesaba girmemiş bir kayıt
 * için "kullanıldı" demek olurdu. İki durum yerine üç durum, doğru cümleyi
 * kurabilmenin bedeli.
 */
export type CostHistoryStatus = "active" | "past" | "upcoming";

export interface CostHistoryEntryView {
  /** React anahtarı — `ürün@tarih`, domain'in kimlik anlayışıyla aynı. */
  readonly key: string;
  readonly effectiveFromLabel: string;
  readonly unitCostLabel: string;
  /**
   * Kayıtta tanımlı değilse `null`.
   *
   * Sıfır basmak yalan olurdu: alan boşsa değer kategori ya da mağaza
   * varsayılanından iniyor, o kayıtta "komisyon yok" demek değil.
   */
  readonly commissionLabel: string | null;
  readonly shippingLabel: string | null;
  readonly packagingLabel: string | null;
  readonly source: ProductCost["source"];
  readonly status: CostHistoryStatus;
}

export interface CostHistoryView {
  readonly productId: string;
  /** En yeni kayıt başta. */
  readonly entries: readonly CostHistoryEntryView[];
}

/**
 * Maliyet kayıtlarında kuruş **her zaman** gösterilir.
 *
 * Varsayılan biçimlendirme 100 ₺ üstünde kuruşu atıyor; alış maliyetinde bu
 * kabul edilemez, çünkü kullanıcı ekrandaki rakamla girdiği rakamı
 * karşılaştırıp "yanlış kaydedilmiş" diye düşünür.
 */
const MONEY = { decimals: 2 } as const;

function statusOf(
  entry: ProductCost,
  activeKey: string | null,
  today: IsoDate,
): CostHistoryStatus {
  if (costKeyOf(entry) === activeKey) return "active";
  return entry.effectiveFrom > today ? "upcoming" : "past";
}

export function buildCostHistoryView(params: {
  /** Tüm tablo verilebilir; süzme burada yapılır. */
  readonly costs: readonly ProductCost[];
  readonly productId: string;
  /** Yürürlük referansı — "şu an hangi kayıt geçerli". */
  readonly today: IsoDate;
  readonly locale: string;
}): CostHistoryView {
  const { costs, productId, today, locale } = params;

  const active = findEffectiveProductCost(costs, productId, today);
  const activeKey = active ? costKeyOf(active) : null;

  const entries = costs
    .filter((entry) => entry.productId === productId)
    // `costKeyOf` aynı ürün + aynı tarih için iki kayda izin vermiyor;
    // dolayısıyla bu sıralamada eşitlik yok ve sonuç deterministik.
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
    .map((entry) => ({
      key: costKeyOf(entry),
      effectiveFromLabel: formatShortDate(entry.effectiveFrom, locale),
      unitCostLabel: formatMoney(entry.unitCost, locale, MONEY),
      commissionLabel:
        entry.commissionRate === undefined
          ? null
          : formatPercent(toRatio(entry.commissionRate), locale),
      shippingLabel: entry.shippingCost
        ? formatMoney(entry.shippingCost, locale, MONEY)
        : null,
      packagingLabel: entry.packagingPerUnit
        ? formatMoney(entry.packagingPerUnit, locale, MONEY)
        : null,
      source: entry.source,
      status: statusOf(entry, activeKey, today),
    }));

  return { productId, entries };
}
