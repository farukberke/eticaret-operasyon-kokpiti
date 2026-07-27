import {
  basisPoints,
  costKeyOf,
  type BasisPoints,
  type IsoDate,
  type Money,
  type ProductCost,
} from "../domain";

import { parseCsv } from "./csv-parse";

/**
 * MALİYET İÇE AKTARMA — saf servis.
 *
 * Dosya okuma, ekran, sunucu yok: girdi metin, çıktı önizleme nesnesi.
 * Aynı fonksiyon hem tarayıcıda önizleme üretiyor hem sunucuda yazma
 * öncesi doğrulama yapıyor — **istemciden gelen veriye güvenilmediği için**
 * ikinci kez çalışması bir israf değil, güvenlik gereği.
 *
 * Hiçbir satır kullanıcı onaylamadan yazılmaz; bu dosya yalnızca "ne
 * olacağını" hesaplar.
 */

/** Ayrıştırıcının bildiği ürün alanları — tam `Product` gerekmez. */
export interface ImportProduct {
  readonly id: string;
  readonly sku: string;
  readonly barcode?: string | undefined;
  readonly name: string;
}

export interface ImportContext {
  readonly products: readonly ImportProduct[];
  readonly existing: readonly ProductCost[];
  readonly today: IsoDate;
}

/**
 * Opsiyonel alanların **üç** durumu var ve karıştırılmaları veri kaybıdır:
 *
 *   `undefined` → sütun yok ya da hücre boş → mevcut değere DOKUNMA
 *   `null`      → hücrede `-` var           → mevcut değeri TEMİZLE
 *   değer       → yeni değer
 *
 * Boş hücreyi "temizle" saymak, kullanıcının yalnızca maliyet güncellemek
 * için hazırladığı bir dosyanın tüm komisyon override'larını sessizce
 * silmesi demek olurdu.
 */
export type OptionalUpdate<T> = T | null | undefined;

/** Temizleme işareti. Şablonda ve arayüzde açıkça belirtilir. */
export const CLEAR_MARKER = "-";

export interface ImportRowValues {
  readonly unitCost: Money;
  readonly commissionRate: OptionalUpdate<BasisPoints>;
  readonly shippingCost: OptionalUpdate<Money>;
  readonly packagingPerUnit: OptionalUpdate<Money>;
  readonly effectiveFrom: IsoDate;
  /** Tarih sütunu boştu ve bugün varsayıldı — önizlemede gösterilir. */
  readonly effectiveFromAssumed: boolean;
}

export interface PreviewRow {
  /** CSV satır numarası (başlık satırı 1'dir). */
  readonly line: number;
  readonly productId: string;
  readonly productName: string;
  readonly values: ImportRowValues;
  /** Aynı anahtarda hâlihazırda duran kayıt — eski/yeni karşılaştırması için. */
  readonly current: ProductCost | undefined;
}

export type ImportErrorCode =
  | "missingIdentifier"
  | "productNotFound"
  | "identifierConflict"
  | "duplicateRow"
  | "missingUnitCost"
  | "invalidUnitCost"
  | "unitCostNotPositive"
  | "invalidCommission"
  | "invalidShipping"
  | "invalidPackaging"
  | "invalidDate";

export interface InvalidRow {
  readonly line: number;
  /** Hangi sütun — kullanıcı dosyada nereye bakacağını bilsin. */
  readonly field: string;
  readonly code: ImportErrorCode;
  /** Kullanıcının yazdığı ham değer; hatayı görmesi için. */
  readonly value: string;
}

export interface ImportPreview {
  /** Yazılacak satırlar: yeni kayıt ya da değeri değişen kayıt. */
  readonly toWrite: readonly PreviewRow[];
  /** Kayıt zaten aynı — yazmaya gerek yok. */
  readonly unchanged: readonly PreviewRow[];
  /** SKU/barkod hiçbir ürüne uymadı. */
  readonly unmatched: readonly InvalidRow[];
  readonly invalid: readonly InvalidRow[];
  /**
   * Aynı ürünün dosyada birden fazla (farklı tarihli) satırı.
   * Hata değil — maliyet geçmişi içe aktarmak meşru — ama bildirilir.
   */
  readonly repeatedProducts: readonly { productName: string; count: number }[];
  readonly totalRows: number;
  /** Başlıkta tanınmayan sütunlar; sessizce yok sayıldıklarını bildirir. */
  readonly unknownColumns: readonly string[];
}

/* ── Başlık eşleme ──────────────────────────────────────────────────── */

type FieldName =
  | "sku"
  | "barcode"
  | "unitCost"
  | "commissionRate"
  | "shipping"
  | "packaging"
  | "effectiveFrom";

/**
 * Başlıkları normalize eder: küçük harf, Türkçe karakterler sadeleşir,
 * boşluk/tire alt çizgi olur.
 *
 * Böylece `"Alış Maliyeti"`, `"alis maliyeti"` ve `"alis_maliyeti"` aynı
 * sütuna düşer. Kullanıcı Excel'den dışa aktarırken başlığı elle yazmış
 * olabilir; katı davranmak dosyayı boş yere reddetmek olurdu.
 */
function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[\s-]+/g, "_");
}

const HEADER_ALIASES: Readonly<Record<string, FieldName>> = {
  sku: "sku",
  stok_kodu: "sku",
  barkod: "barcode",
  barcode: "barcode",
  alis_maliyeti: "unitCost",
  unit_cost: "unitCost",
  maliyet: "unitCost",
  cost: "unitCost",
  komisyon_orani: "commissionRate",
  commission_rate: "commissionRate",
  komisyon: "commissionRate",
  commission: "commissionRate",
  kargo: "shipping",
  shipping: "shipping",
  paketleme: "packaging",
  packaging: "packaging",
  gecerlilik_tarihi: "effectiveFrom",
  effective_from: "effectiveFrom",
};

/** Şablon başlıkları — indirilebilir örnek dosya bunu kullanır. */
export const TEMPLATE_HEADERS = [
  "sku",
  "barkod",
  "alis_maliyeti",
  "komisyon_orani",
  "kargo",
  "paketleme",
  "gecerlilik_tarihi",
] as const;

/* ── Değer ayrıştırma (kayan nokta YOK) ─────────────────────────────── */

/**
 * Metni kuruşa çevirir; hiçbir aşamada ondalık sayı oluşmaz.
 *
 * `lib/format/parse-money.ts` ile aynı mantık, ama burada tekrarlanıyor
 * çünkü `core` katmanı `lib`e bağlanabilse de ayrıştırma kuralları
 * içe aktarmanın **sözleşmesinin parçası** ve testleri buraya ait.
 * Desteklenen biçimler: `1.234,56` · `1234,56` · `1,234.56` · `1234.56`
 */
export function parseMinor(input: string): number | null {
  const cleaned = input.trim().replace(/[^\d.,-]/g, "");
  if (cleaned === "") return null;
  if (cleaned.startsWith("-")) return null;
  if (!/^[\d.,]+$/.test(cleaned)) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const separator = Math.max(lastComma, lastDot);

  let whole: string;
  let fraction: string;

  if (separator === -1) {
    whole = cleaned;
    fraction = "";
  } else {
    const tail = cleaned.slice(separator + 1);
    if (tail.length === 3) {
      // Üç basamak → binlik ayracı. "1.234" = 1234, 1,234 değil.
      whole = cleaned.replace(/[.,]/g, "");
      fraction = "";
    } else if (tail.length === 0 || tail.length > 2) {
      return null;
    } else {
      whole = cleaned.slice(0, separator).replace(/[.,]/g, "");
      fraction = tail;
    }
  }

  if (whole === "") whole = "0";
  if (!/^\d+$/.test(whole)) return null;

  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0") || "0");
  return Number.isSafeInteger(minor) ? minor : null;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/* ── Ana akış ───────────────────────────────────────────────────────── */

interface StagedRow {
  readonly line: number;
  readonly productId: string;
  readonly productName: string;
  readonly values: ImportRowValues;
}

export function buildImportPreview(
  csvText: string,
  context: ImportContext,
): ImportPreview {
  const { rows } = parseCsv(csvText);
  if (rows.length === 0) {
    return emptyPreview();
  }

  const headerRow = rows[0]!;
  const columns = headerRow.map((raw) => HEADER_ALIASES[normalizeHeader(raw)]);
  const unknownColumns = headerRow.filter(
    (raw, index) => raw.trim() !== "" && columns[index] === undefined,
  );

  const indexOf = (field: FieldName): number => columns.indexOf(field);
  const cellAt = (row: CsvRowLike, field: FieldName): string | undefined => {
    const index = indexOf(field);
    // Sütun hiç yoksa `undefined` — "boş hücre"den farklı.
    if (index === -1) return undefined;
    return row[index]?.trim() ?? "";
  };

  const bySku = new Map(
    context.products.map((p) => [p.sku.trim().toLocaleLowerCase("tr"), p] as const),
  );
  const byBarcode = new Map(
    context.products
      .filter((p) => p.barcode)
      .map((p) => [p.barcode!.trim().toLocaleLowerCase("tr"), p] as const),
  );

  const staged: StagedRow[] = [];
  const invalid: InvalidRow[] = [];
  const unmatched: InvalidRow[] = [];

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r]!;
    const line = r + 1; // başlık 1. satır

    const skuCell = cellAt(row, "sku") ?? "";
    const barcodeCell = cellAt(row, "barcode") ?? "";

    if (skuCell === "" && barcodeCell === "") {
      invalid.push({ line, field: "sku", code: "missingIdentifier", value: "" });
      continue;
    }

    const bySkuMatch = skuCell ? bySku.get(skuCell.toLocaleLowerCase("tr")) : undefined;
    const byBarcodeMatch = barcodeCell
      ? byBarcode.get(barcodeCell.toLocaleLowerCase("tr"))
      : undefined;

    // İkisi de eşleşiyorsa aynı ürüne işaret etmek zorunda.
    if (bySkuMatch && byBarcodeMatch && bySkuMatch.id !== byBarcodeMatch.id) {
      invalid.push({
        line,
        field: "sku/barkod",
        code: "identifierConflict",
        value: `${skuCell} / ${barcodeCell}`,
      });
      continue;
    }

    // SKU öncelikli, barkod ikincil.
    const product = bySkuMatch ?? byBarcodeMatch;
    if (!product) {
      unmatched.push({
        line,
        field: skuCell ? "sku" : "barkod",
        code: "productNotFound",
        value: skuCell || barcodeCell,
      });
      continue;
    }

    /* — alış maliyeti: zorunlu, pozitif — */
    const unitCostCell = cellAt(row, "unitCost");
    if (unitCostCell === undefined || unitCostCell === "") {
      invalid.push({
        line,
        field: "alis_maliyeti",
        code: "missingUnitCost",
        value: unitCostCell ?? "",
      });
      continue;
    }
    const unitCostMinor = parseMinor(unitCostCell);
    if (unitCostMinor === null) {
      invalid.push({
        line,
        field: "alis_maliyeti",
        code: "invalidUnitCost",
        value: unitCostCell,
      });
      continue;
    }
    if (unitCostMinor <= 0) {
      invalid.push({
        line,
        field: "alis_maliyeti",
        code: "unitCostNotPositive",
        value: unitCostCell,
      });
      continue;
    }

    /* — opsiyonel para alanları: boş = dokunma, "-" = temizle — */
    const optionalMoney = (
      field: FieldName,
      label: string,
      code: ImportErrorCode,
    ): OptionalUpdate<Money> | "error" => {
      const cell = cellAt(row, field);
      if (cell === undefined || cell === "") return undefined;
      if (cell === CLEAR_MARKER) return null;
      const minor = parseMinor(cell);
      if (minor === null) {
        invalid.push({ line, field: label, code, value: cell });
        return "error";
      }
      return { minor, currency: "TRY" };
    };

    const shipping = optionalMoney("shipping", "kargo", "invalidShipping");
    if (shipping === "error") continue;
    const packaging = optionalMoney("packaging", "paketleme", "invalidPackaging");
    if (packaging === "error") continue;

    /* — komisyon: 0–100 — */
    let commission: OptionalUpdate<BasisPoints> = undefined;
    const commissionCell = cellAt(row, "commissionRate");
    if (commissionCell !== undefined && commissionCell !== "") {
      if (commissionCell === CLEAR_MARKER) {
        commission = null;
      } else {
        const percent = Number(
          commissionCell.replace(/%/g, "").replace(",", ".").trim(),
        );
        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
          invalid.push({
            line,
            field: "komisyon_orani",
            code: "invalidCommission",
            value: commissionCell,
          });
          continue;
        }
        commission = basisPoints(percent);
      }
    }

    /* — geçerlilik tarihi: boşsa bugün varsayılır — */
    const dateCell = cellAt(row, "effectiveFrom");
    const dateGiven = dateCell !== undefined && dateCell !== "";
    if (dateGiven && !isValidDate(dateCell)) {
      invalid.push({
        line,
        field: "gecerlilik_tarihi",
        code: "invalidDate",
        value: dateCell,
      });
      continue;
    }

    staged.push({
      line,
      productId: product.id,
      productName: product.name,
      values: {
        unitCost: { minor: unitCostMinor, currency: "TRY" },
        commissionRate: commission,
        shippingCost: shipping,
        packagingPerUnit: packaging,
        effectiveFrom: dateGiven ? dateCell : context.today,
        effectiveFromAssumed: !dateGiven,
      },
    });
  }

  return classify(staged, invalid, unmatched, context, unknownColumns, rows.length - 1);
}

type CsvRowLike = readonly string[];

function emptyPreview(): ImportPreview {
  return {
    toWrite: [],
    unchanged: [],
    unmatched: [],
    invalid: [],
    repeatedProducts: [],
    totalRows: 0,
    unknownColumns: [],
  };
}

/**
 * Aynı (ürün, tarih) anahtarı iki kez geçiyorsa **her iki satır da**
 * geçersiz sayılır.
 *
 * Sessizce sonuncuyu almak keyfî bir seçim olurdu ve kullanıcı hangi
 * değerin yazıldığını bilemezdi. Aynı ürünün farklı tarihli satırları ise
 * meşrudur (maliyet geçmişi içe aktarma) — yalnızca bilgi olarak raporlanır.
 */
function classify(
  staged: readonly StagedRow[],
  invalid: InvalidRow[],
  unmatched: readonly InvalidRow[],
  context: ImportContext,
  unknownColumns: readonly string[],
  totalRows: number,
): ImportPreview {
  const byKey = new Map<string, StagedRow[]>();
  for (const row of staged) {
    const key = costKeyOf({
      productId: row.productId,
      effectiveFrom: row.values.effectiveFrom,
    });
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }

  const accepted: StagedRow[] = [];
  for (const group of byKey.values()) {
    if (group.length === 1) {
      accepted.push(group[0]!);
      continue;
    }
    for (const row of group) {
      invalid.push({
        line: row.line,
        field: "sku",
        code: "duplicateRow",
        value: row.productName,
      });
    }
  }

  const existingByKey = new Map(
    context.existing.map((cost) => [costKeyOf(cost), cost] as const),
  );

  const toWrite: PreviewRow[] = [];
  const unchanged: PreviewRow[] = [];

  for (const row of accepted) {
    const key = costKeyOf({
      productId: row.productId,
      effectiveFrom: row.values.effectiveFrom,
    });
    const current = existingByKey.get(key);
    const preview: PreviewRow = { ...row, current };

    if (current && isSameCost(current, row.values)) unchanged.push(preview);
    else toWrite.push(preview);
  }

  // Aynı ürünün birden fazla satırı (farklı tarihlerle) — bilgi notu.
  const perProduct = new Map<string, { productName: string; count: number }>();
  for (const row of accepted) {
    const entry = perProduct.get(row.productId);
    if (entry) entry.count += 1;
    else perProduct.set(row.productId, { productName: row.productName, count: 1 });
  }

  return {
    toWrite,
    unchanged,
    unmatched,
    invalid: [...invalid].sort((a, b) => a.line - b.line),
    repeatedProducts: [...perProduct.values()].filter((entry) => entry.count > 1),
    totalRows,
    unknownColumns,
  };
}

/**
 * Kayıt gerçekten değişiyor mu.
 *
 * `undefined` (dokunma) mevcut değeri koruduğu için farklılık saymaz;
 * yalnızca açıkça verilen bir değer ya da temizleme farkı sayılır.
 */
function isSameCost(current: ProductCost, next: ImportRowValues): boolean {
  if (current.unitCost.minor !== next.unitCost.minor) return false;

  const sameOptional = <T>(
    existing: T | undefined,
    update: OptionalUpdate<T>,
    equals: (a: T, b: T) => boolean,
  ): boolean => {
    if (update === undefined) return true;
    if (update === null) return existing === undefined;
    return existing !== undefined && equals(existing, update);
  };

  return (
    sameOptional(current.commissionRate, next.commissionRate, (a, b) => a === b) &&
    sameOptional(
      current.shippingCost,
      next.shippingCost,
      (a, b) => a.minor === b.minor,
    ) &&
    sameOptional(
      current.packagingPerUnit,
      next.packagingPerUnit,
      (a, b) => a.minor === b.minor,
    )
  );
}

/**
 * Önizleme satırını yazılacak kayda çevirir.
 *
 * `undefined` alanlar mevcut kayıttan devralınır — boş hücre yüzünden
 * override'ın silinmemesini garanti eden yer burasıdır.
 */
export function toProductCost(row: PreviewRow): ProductCost {
  const merge = <T>(
    update: OptionalUpdate<T>,
    existing: T | undefined,
  ): T | undefined => (update === undefined ? existing : (update ?? undefined));

  const commissionRate = merge(row.values.commissionRate, row.current?.commissionRate);
  const shippingCost = merge(row.values.shippingCost, row.current?.shippingCost);
  const packagingPerUnit = merge(
    row.values.packagingPerUnit,
    row.current?.packagingPerUnit,
  );

  return {
    productId: row.productId,
    effectiveFrom: row.values.effectiveFrom,
    unitCost: row.values.unitCost,
    ...(commissionRate !== undefined ? { commissionRate } : {}),
    ...(shippingCost !== undefined ? { shippingCost } : {}),
    ...(packagingPerUnit !== undefined ? { packagingPerUnit } : {}),
    source: "import",
  };
}

/** İndirilebilir örnek şablon. */
export function buildTemplateCsv(sample: {
  sku: string;
  barcode: string;
  today: IsoDate;
}): string {
  return [
    TEMPLATE_HEADERS.join(","),
    `${sample.sku},${sample.barcode},"1.234,56",15,34.9,2.5,${sample.today}`,
    `${sample.sku}-2,,890,,,,`,
  ].join("\r\n");
}
