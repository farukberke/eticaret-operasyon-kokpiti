import type { IsoDate } from "./date-range";
import type { Money } from "./money";

/**
 * SİNYAL — bu mimarinin taşıyıcı kolonu.
 *
 * Risk, fırsat ve öncelik listesi aslında aynı şeyin üç görünümüdür:
 * "bir varlık hakkında, para değeri olan, aciliyeti olan bir gözlem".
 * Üçünü tek tiple modellemek üç ayrı tip + üç ayrı kart bileşeni + üç ayrı
 * sıralama mantığı yazmayı gereksiz kılar.
 */

export type SignalKind = "risk" | "opportunity";

export type RiskCode =
  /** Stok yeterlilik günü eşiğin altında ve ürün satmaya devam ediyor. */
  | "STOCKOUT_IMMINENT"
  /** Uzun süredir satılmayan, sermayeyi bağlayan stok. */
  | "DEAD_STOCK"
  /** Marj kritik seviyeye indi ya da önceki döneme göre sert düştü. */
  | "MARGIN_EROSION"
  /** İade oranı kabul edilebilir sınırın üstünde. */
  | "HIGH_RETURN_RATE"
  /** Birim başına net kâr sıfır veya negatif — satış yaptıkça zarar ediliyor. */
  | "SELLING_AT_LOSS"
  /** Reklam harcaması yapılıyor ama getirisi harcamayı karşılamıyor. */
  | "AD_SPEND_LEAK"
  /** Mağaza genelinde ciro önceki döneme göre sert düştü. */
  | "REVENUE_DROP";

export type OpportunityCode =
  /** Satış hızı önceki döneme göre belirgin arttı. */
  | "TRENDING_UP"
  /** Yüksek marjlı, hızlı satan ürünün stoğu azalıyor — kaçan satış riski. */
  | "RESTOCK_WINNER"
  /** Marj çok yüksek; fiyat esnekliği test edilebilir. */
  | "PRICE_TEST_CANDIDATE"
  /** Marjı yüksek ama neredeyse hiç reklam bütçesi almayan ürün. */
  | "HIGH_MARGIN_LOW_ADSPEND"
  /** Sık birlikte satın alınan ürün çifti — paket adayı. */
  | "BUNDLE_CANDIDATE";

export type SignalCode = RiskCode | OpportunityCode;

/** Aciliyetten türetilir; renk ve sıralama bunu kullanır. */
export type Severity = "critical" | "high" | "medium" | "low";

/**
 * Kanıt değeri. `Money` de olabilir çünkü "₺48.000 risk altında" ifadesindeki
 * tutar, dile göre farklı biçimlenmek zorunda (₺48.000 / ₺48,000).
 */
export type EvidenceValue = string | number | Money;

/**
 * "Bunu neden söylüyorsun?" sorusunun cevabı.
 *
 * Kritik tasarım kararı: kanıt **hazır cümle olarak değil**, kod + değerler
 * olarak taşınır. Böylece aynı dedektör mantığı hem Türkçe hem İngilizce
 * arayüzü besler; çeviri sözlükte yaşar, iş mantığında değil.
 *
 * Örnek: { code: "velocityVsStock", values: { perDay: 12, stock: 31 } }
 *        tr → "günde 12 adet satıyor · 31 adet kaldı"
 *        en → "sells 12/day · 31 left"
 */
export interface Evidence {
  readonly code: string;
  readonly values: Readonly<Record<string, EvidenceValue>>;
}

/** Sinyalin ilgili olduğu varlık. Mağaza geneli sinyaller için `store`. */
export type SignalSubject =
  | { readonly type: "product"; readonly id: string; readonly label: string }
  | { readonly type: "store"; readonly label: string };

export interface Signal {
  readonly id: string;
  readonly kind: SignalKind;
  readonly code: SignalCode;
  readonly severity: Severity;
  readonly subject: SignalSubject;

  /**
   * Masadaki para: risk için kaybedilebilecek, fırsat için kazanılabilecek tutar.
   * Öncelik motorunun "etki" bileşeni doğrudan bundan türer.
   *
   * **Her zaman KÂR cinsindendir, ciro değil.** Bir satıcı için "₺1 milyon
   * ciro kaçırdın" ile "₺40 bin kâr kaçırdın" arasında 25 katlık fark var;
   * ilkini yazmak paneli inandırıcılıktan düşürür.
   */
  readonly moneyAtStake: Money;

  /**
   * Gecikilen her günün maliyeti. Kararı bugün değil yarın vermenin farkı.
   *
   * "₺40.000 riskte" soyut; "her gün ₺8.240" acildir. Aciliyeti hissettiren
   * sayı toplam değil, bu türevdir.
   */
  readonly dailyImpact?: Money | undefined;

  /**
   * Kararın en geç verilmesi gereken gün.
   *
   * Tedarik süresi hesaba katılarak bulunur: stok 2 gün yeter ama tedarik
   * 7 gün sürüyorsa son karar günü **dündü**. Bir listeyi operasyona
   * çeviren alan budur.
   */
  readonly deadline?: IsoDate | undefined;

  /** 0–10. Ne kadar acil? (yarın mı patlar, üç ay sonra mı) */
  readonly urgency: number;
  /** 0–10. Ne kadar büyük? `moneyAtStake` değerinden türetilir. */
  readonly impact: number;

  readonly evidence: readonly Evidence[];
  readonly detectedAt: IsoDate;
}

/**
 * Önerilen aksiyonun çeviri anahtarı.
 *
 * Aksiyon metni sinyal koduyla birebir eşleştiği için ayrı bir alanda
 * saklanmaz — türetilir. Bir kod eklendiğinde sözlüğe tek satır eklemek yeter.
 */
export function actionKeyOf(signal: Signal): string {
  return `action.${signal.code}`;
}

/**
 * Bağlı sermaye ölçen kodlar.
 *
 * `moneyAtStake` çoğu sinyalde bir **akış**tır: dönemde kaybedilen ya da
 * kazanılan kâr. `DEAD_STOCK` ise bir **stok**tur: rafta duran sermaye.
 * O para kaybolmadı, sıkıştı.
 *
 * Ayrım kâr defteri için zorunlu: ₺491.790'lık ölü stoğu "korunan kâr"
 * saymak, tutarları abartma hatasını geri getirirdi.
 */
const CAPITAL_CODES: ReadonlySet<SignalCode> = new Set<SignalCode>(["DEAD_STOCK"]);

export function isCapitalSignal(code: SignalCode): boolean {
  return CAPITAL_CODES.has(code);
}

/**
 * Sinyalin **kâr** cinsinden değeri. Bağlı sermaye sinyallerinde sıfırdır.
 *
 * Bir görev tamamlandığında deftere yazılacak tutar budur.
 */
export function profitGainOf(signal: Signal): Money {
  if (isCapitalSignal(signal.code)) {
    return { minor: 0, currency: signal.moneyAtStake.currency };
  }
  return signal.moneyAtStake;
}

export function isRisk(signal: Signal): boolean {
  return signal.kind === "risk";
}

export function isOpportunity(signal: Signal): boolean {
  return signal.kind === "opportunity";
}
