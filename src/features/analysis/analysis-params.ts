import type { IsoDate } from "@/core/domain";
import {
  DEFAULT_ANALYSIS_PRESET,
  isAnalysisPreset,
  resolveAnalysisWindow,
  type AnalysisSelection,
  type AnalysisWindow,
} from "@/core/services/analysis-window";

/**
 * ANALİZ PENCERESİNİN ADRESİ.
 *
 * Pencere neden URL'de yaşıyor:
 *
 * • **Tek kaynak.** Sunucu bileşenleri veriyi seçilen aralıkla çekiyor; bir
 *   istemci store'unda tutulsaydı sunucu onu hiç göremez, her ekran kendi
 *   aralığıyla render edilirdi. Yeni bir state yönetimi de gerekmiyor —
 *   adres çubuğu zaten paylaşılan durumdur.
 * • **Paylaşılabilir ve kalıcı.** "Şu 90 güne bak" bir bağlantı olarak
 *   gönderilebilir, yenilemede kaybolmaz.
 * • **Ekranlar arası taşınabilir.** Kokpitten maliyet ekranına giden her
 *   bağlantı pencereyi yanında götürür (`withAnalysisQuery`); iki ekran aynı
 *   kuyruğu görür.
 *
 * Varsayılan pencere **hiçbir parametre yazmaz**: `/tr` temiz kalır ve
 * "seçim değişti mi" karşılaştırması metin eşitliğine iner.
 */

/** Adres çubuğundaki parametre adları. */
export const ANALYSIS_PARAM = "period";
export const ANALYSIS_FROM_PARAM = "from";
export const ANALYSIS_TO_PARAM = "to";

/** Next.js `searchParams` — çoklu değer dizi olarak gelir. */
export type SearchParamsRecord = Record<string, string | readonly string[] | undefined>;

/**
 * URL'den gelen değer güvenilmezdir: `?period=a&period=b` dizi, eksikse
 * `undefined` gelir. `cost-focus.ts` ile aynı kural — belirsizse yok sayılır.
 */
function single(params: SearchParamsRecord, key: string): string | undefined {
  const value = params[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** Adresi ham seçime çevirir; tanınmayan preset varsayılana düşer. */
export function readAnalysisSelection(
  searchParams: SearchParamsRecord,
): AnalysisSelection {
  const preset = single(searchParams, ANALYSIS_PARAM);
  if (!isAnalysisPreset(preset)) return { preset: DEFAULT_ANALYSIS_PRESET };
  if (preset !== "custom") return { preset };

  return {
    preset,
    from: single(searchParams, ANALYSIS_FROM_PARAM),
    to: single(searchParams, ANALYSIS_TO_PARAM),
  };
}

/**
 * Sayfaların tek satırı: adres → çözümlenmiş pencere.
 *
 * `today` dışarıdan geliyor çünkü "bugün" de bir bağımlılık (`ClockPort`);
 * fonksiyon saf kalınca test takvime bağlanmaz.
 */
export function readAnalysisWindow(
  searchParams: SearchParamsRecord,
  today: IsoDate,
): AnalysisWindow {
  return resolveAnalysisWindow(readAnalysisSelection(searchParams), today);
}

/**
 * Seçimin sorgu metni. Varsayılan pencere için boş — adres kirlenmesin.
 *
 * Geçersiz özel aralık da yazılır: kullanıcı yanlış tarihi düzeltmek için
 * onu ekranda görmeli, adres sessizce varsayılana dönmemeli.
 */
export function analysisQuery(selection: AnalysisSelection): string {
  if (selection.preset === "custom") {
    const { from, to } = selection;
    // Uçları olmayan bir "özel" seçim hiçbir aralık tarif etmiyor.
    if (!from || !to) return "";
    return [
      `${ANALYSIS_PARAM}=custom`,
      `${ANALYSIS_FROM_PARAM}=${encodeURIComponent(from)}`,
      `${ANALYSIS_TO_PARAM}=${encodeURIComponent(to)}`,
    ].join("&");
  }

  return selection.preset === DEFAULT_ANALYSIS_PRESET
    ? ""
    : `${ANALYSIS_PARAM}=${selection.preset}`;
}

/**
 * Var olan bir adrese pencereyi ekler.
 *
 * Çapa (`#cost-p2`) her zaman sonda kalmalı, sorgu ondan önce gelmeli; aksi
 * hâlde tarayıcı çapayı sorgunun parçası sanar ve satıra kaydırmaz.
 */
export function withAnalysisQuery(href: string, selection: AnalysisSelection): string {
  const query = analysisQuery(selection);
  if (query === "") return href;

  const hashAt = href.indexOf("#");
  const base = hashAt === -1 ? href : href.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : href.slice(hashAt);

  return `${base}${base.includes("?") ? "&" : "?"}${query}${hash}`;
}

/** Seçiciden gezinilecek adres. */
export function analysisHref(pathname: string, selection: AnalysisSelection): string {
  return withAnalysisQuery(pathname, selection);
}

/**
 * İki seçim aynı analizi mi tarif ediyor.
 *
 * Karşılaştırma sorgu metni üzerinden: aynı adres → aynı sunucu render'ı →
 * gezinmenin hiçbir getirisi yok. Preset alanlarını tek tek karşılaştırmak,
 * adres üretimiyle ayrışabilecek ikinci bir kural yazmak olurdu.
 */
export function isSameAnalysisSelection(
  a: AnalysisSelection,
  b: AnalysisSelection,
): boolean {
  return analysisQuery(a) === analysisQuery(b);
}
