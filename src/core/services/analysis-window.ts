import {
  isIsoDate,
  lastDays,
  monthRange,
  type DateRange,
  type IsoDate,
} from "../domain/date-range";

/**
 * ANALİZ PENCERESİ — "hangi aralığa bakıyoruz" sorusunun **tek** cevabı.
 *
 * Panelin her ekranı aynı pencereden konuşmak zorunda. Kokpitteki "şu kadar
 * kâr korunur" cümlesi son 7 günden, hemen altındaki eksik maliyet kuyruğu son
 * 30 günden geliyorsa iki rakam birbirini yalanlar — ve kullanıcı hangisine
 * güveneceğini bilemez. Bu yüzden preset → aralık çevirisi burada, tek yerde
 * yapılır; hiçbir ekran (ve hiçbir bileşen) kendi tarih hesabını kurmaz.
 *
 * Servis bilinçli olarak **yeni bir domain modeli tanımlamıyor**: ürettiği şey
 * yine `DateRange`. Buradaki tipler kullanıcı seçimini o mevcut modele
 * çeviren ara adımlar — dedektörler, kâr hesabı ve portlar hâlâ yalnızca
 * `DateRange` görür.
 */

export const ANALYSIS_PRESETS = [
  "last7",
  "last30",
  "last90",
  "thisMonth",
  "lastMonth",
  "custom",
] as const;

export type AnalysisPreset = (typeof ANALYSIS_PRESETS)[number];

/**
 * 30 gün bilinçli: 7 gün haftalık dalgalanmada gürültülü, 90 gün ise dünün
 * sorununu ortalamanın içinde kaybediyor. 30 gün, "bu ay nasıl gidiyoruz"
 * sorusuna cevap verirken trendleri de görünür kılıyor.
 */
export const DEFAULT_ANALYSIS_PRESET = "last30" satisfies AnalysisPreset;

/**
 * Gün sayısıyla tanımlı presetler.
 *
 * Bu sayılar `rules.config.ts` içinde DEĞİL, bilerek burada: orası "stok kaç
 * gün kalınca uyaralım" gibi **karar eşiklerinin** yeri. 7/30/90 bir karar
 * eşiği değil, kullanıcıya sunulan menü — ve menü, pencereyi çözen kodun
 * yanında durmalı.
 */
const PRESET_DAYS = { last7: 7, last30: 30, last90: 90 } as const;

/** Bir preset kaç günlük pencere açar; takvim tabanlıysa `null`. */
export function analysisPresetDays(preset: AnalysisPreset): number | null {
  return preset in PRESET_DAYS ? PRESET_DAYS[preset as keyof typeof PRESET_DAYS] : null;
}

export function isAnalysisPreset(value: unknown): value is AnalysisPreset {
  return (
    typeof value === "string" && (ANALYSIS_PRESETS as readonly string[]).includes(value)
  );
}

/**
 * Kullanıcının ham niyeti — adres çubuğundan geldiği gibi, doğrulanmamış.
 * `from`/`to` yalnızca `preset === "custom"` iken anlamlıdır.
 */
export interface AnalysisSelection {
  readonly preset: AnalysisPreset;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
}

/**
 * Çözümlenmiş pencere: ekranların gördüğü hâli.
 *
 * `range` her zaman geçerlidir — geçersiz bir seçim analiz katmanına hiç
 * ulaşmaz. `draft` ise kullanıcının yazdığıdır: form alanları buradan dolar,
 * böylece hatalı bir aralık sayfa yenilendiğinde de ekranda kalır ve hata
 * mesajı sebebini göstermeye devam eder.
 */
export interface AnalysisWindow {
  readonly preset: AnalysisPreset;
  readonly range: DateRange;
  readonly draft: DateRange;
  /** Kullanıcının girdiği özel aralık geçersiz; `range` varsayılana düştü. */
  readonly invalid: boolean;
}

/**
 * Özel aralık doğrulaması — istemcideki anlık uyarı ile sunucudaki karar
 * aynı fonksiyonu çağırır. İki ayrı kontrol yazmak, formun "geçerli" dediği
 * bir aralığın sunucuda sessizce reddedilmesi demekti.
 *
 * Gün anahtarları metin olarak sıralanabilir; `"2026-07-01" <= "2026-07-31"`
 * doğru cevabı `Date` aritmetiğine hiç girmeden verir.
 */
export function isValidAnalysisRange(from: unknown, to: unknown): boolean {
  return isIsoDate(from) && isIsoDate(to) && from <= to;
}

function presetRange(
  preset: Exclude<AnalysisPreset, "custom">,
  today: IsoDate,
): DateRange {
  switch (preset) {
    case "thisMonth":
      /**
       * "Bu ay" ayın 1'inden **bugüne** kadardır, ay sonuna kadar değil.
       * Ay sonunu almak pencereye henüz yaşanmamış günleri katardı: günlük
       * ortalamalar bölünen gün sayısı yüzünden olduğundan düşük çıkar ve
       * "1 – 31 Tem" etiketi ayın 3'ünde kullanıcıyı yanıltırdı.
       */
      return { from: monthRange(today).from, to: today };
    case "lastMonth":
      return monthRange(today, 1);
    default:
      return lastDays(today, PRESET_DAYS[preset]);
  }
}

/**
 * Seçimi analiz aralığına çevirir. Panelin gördüğü tek tarih hesabı budur.
 *
 * Geçersiz özel aralık **sessizce düzeltilmez** (uçlar yer değiştirilmez):
 * kullanıcı hangi aralığa baktığını bilmeli. Analiz varsayılan pencereye
 * düşer, `invalid` bayrağı ekranın hatayı göstermesini sağlar.
 */
export function resolveAnalysisWindow(
  selection: AnalysisSelection,
  today: IsoDate,
): AnalysisWindow {
  if (selection.preset !== "custom") {
    const range = presetRange(selection.preset, today);
    return { preset: selection.preset, range, draft: range, invalid: false };
  }

  const fallback = presetRange(DEFAULT_ANALYSIS_PRESET, today);

  // Eksik ya da bozuk uçlar varsayılan pencereden doldurulur; form boş bir
  // tarih alanıyla açılmaz.
  const from = isIsoDate(selection.from) ? selection.from : fallback.from;
  const to = isIsoDate(selection.to) ? selection.to : fallback.to;
  const valid = isValidAnalysisRange(from, to);

  return {
    preset: "custom",
    range: valid ? { from, to } : fallback,
    draft: { from, to },
    invalid: !valid,
  };
}

/** Varsayılan pencere — hiçbir seçim yapılmamışken panelin baktığı aralık. */
export function defaultAnalysisWindow(today: IsoDate): AnalysisWindow {
  return resolveAnalysisWindow({ preset: DEFAULT_ANALYSIS_PRESET }, today);
}

/** Pencereden, adres üretiminde kullanılacak ham seçimi geri çıkarır. */
export function selectionOf(window: AnalysisWindow): AnalysisSelection {
  return window.preset === "custom"
    ? { preset: "custom", from: window.draft.from, to: window.draft.to }
    : { preset: window.preset };
}
