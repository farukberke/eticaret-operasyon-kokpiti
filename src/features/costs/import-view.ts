import { toRatio, type Money } from "@/core/domain";
import type {
  ImportErrorCode,
  ImportPreview,
  InvalidRow,
  OptionalUpdate,
  PreviewRow,
} from "@/core/services/cost-import";
import { EMPTY, formatMoney, formatPercent, formatShortDate } from "@/lib/format";

/**
 * İÇE AKTARMA ÖNİZLEMESİ — domain → ekran çevirisi.
 *
 * `ui` katmanı `Money` ya da `BasisPoints` görmez; hazır metin alır. Bu
 * dosya çevirinin locale'i bilen tek yerde kalmasını sağlar (CLAUDE.md
 * 7. kural).
 *
 * Çevirinin **sunucuda** yapılmasının ayrı bir faydası var: 500 satırlık bir
 * dosyanın ham `Money` nesneleri yerine yalnızca gösterilecek metinler tele
 * konur.
 */

/** Bir alanın satırda ne yaptığı — kullanıcı "güncelliyor mu, siliyor mu" görmeli. */
export type ChangeAction = "set" | "clear" | "keep";

export interface FieldChangeView {
  /** `costs` sözlüğündeki alan anahtarı: unitCost · commission · shipping · packaging */
  readonly field: string;
  readonly before: string;
  readonly after: string;
  readonly action: ChangeAction;
}

export interface ImportRowView {
  readonly line: number;
  readonly productName: string;
  /** Yeni kayıt mı, mevcut kaydın üzerine mi yazılıyor. */
  readonly isNew: boolean;
  readonly effectiveFrom: string;
  readonly effectiveFromAssumed: boolean;
  readonly isPast: boolean;
  readonly changes: readonly FieldChangeView[];
}

export interface ImportIssueView {
  readonly line: number;
  readonly field: string;
  readonly code: ImportErrorCode;
  readonly value: string;
}

export interface ImportPreviewView {
  /**
   * Kovaların **gerçek** boyutları.
   *
   * Listeler ekranda kırpıldığı için sayıları listelerin uzunluğundan
   * okumak yanlış olurdu: 5.000 satırlık bir dosyada düğme "50 kaydı içe
   * aktar" der, 5.000 kayıt yazardı.
   */
  readonly counts: {
    readonly toWrite: number;
    readonly unchanged: number;
    readonly unmatched: number;
    readonly invalid: number;
  };
  readonly toWrite: readonly ImportRowView[];
  readonly unchanged: readonly ImportRowView[];
  readonly unmatched: readonly ImportIssueView[];
  readonly invalid: readonly ImportIssueView[];
  readonly repeated: readonly {
    readonly productName: string;
    readonly count: number;
  }[];
  readonly totalRows: number;
  readonly unknownColumns: readonly string[];
  /** Dosyanın ilk satırları — yazmadan önce "doğru dosya mı" kontrolü için. */
  readonly sample: {
    readonly headers: readonly string[];
    readonly rows: readonly (readonly string[])[];
  };
}

/**
 * Uzun listeleri kırpma sınırı.
 *
 * 5.000 hatalı satırı ekrana basmak ne okunur ne de hızlıdır; kullanıcının
 * ihtiyacı ilk birkaç örnek ve toplam sayı. Sayılar `ImportPreview`'dan
 * gelmeye devam ettiği için özet rakamlar kırpmadan etkilenmez.
 */
const DISPLAY_LIMIT = 50;

export function toPreviewView(
  preview: ImportPreview,
  options: {
    readonly locale: string;
    readonly today: string;
    readonly sample: ImportPreviewView["sample"];
  },
): ImportPreviewView {
  const { locale, today } = options;
  const rows = (list: readonly PreviewRow[]) =>
    list.slice(0, DISPLAY_LIMIT).map((row) => rowView(row, locale, today));

  return {
    counts: {
      toWrite: preview.toWrite.length,
      unchanged: preview.unchanged.length,
      unmatched: preview.unmatched.length,
      invalid: preview.invalid.length,
    },
    toWrite: rows(preview.toWrite),
    unchanged: rows(preview.unchanged),
    unmatched: preview.unmatched.slice(0, DISPLAY_LIMIT).map(issueView),
    invalid: preview.invalid.slice(0, DISPLAY_LIMIT).map(issueView),
    repeated: preview.repeatedProducts,
    totalRows: preview.totalRows,
    unknownColumns: preview.unknownColumns,
    sample: options.sample,
  };
}

function issueView(row: InvalidRow): ImportIssueView {
  return { line: row.line, field: row.field, code: row.code, value: row.value };
}

function rowView(row: PreviewRow, locale: string, today: string): ImportRowView {
  const current = row.current;
  const money = (value: Money | undefined): string =>
    value ? formatMoney(value, locale) : EMPTY;

  const changes: FieldChangeView[] = [
    {
      field: "unitCost",
      before: money(current?.unitCost),
      after: money(row.values.unitCost),
      action:
        current && current.unitCost.minor === row.values.unitCost.minor
          ? "keep"
          : "set",
    },
    optionalChange(
      "commission",
      current?.commissionRate,
      row.values.commissionRate,
      (bp) => formatPercent(toRatio(bp), locale),
    ),
    optionalChange("shipping", current?.shippingCost, row.values.shippingCost, money),
    optionalChange(
      "packaging",
      current?.packagingPerUnit,
      row.values.packagingPerUnit,
      money,
    ),
  ];

  return {
    line: row.line,
    productName: row.productName,
    isNew: current === undefined,
    effectiveFrom: formatShortDate(row.values.effectiveFrom, locale),
    effectiveFromAssumed: row.values.effectiveFromAssumed,
    isPast: row.values.effectiveFrom < today,
    // Değişmeyen alanları listelemek gürültü; kullanıcı neyin değiştiğini arıyor.
    changes: changes.filter((change) => change.action !== "keep"),
  };
}

/**
 * Opsiyonel alanın üç durumu ekrana böyle iner:
 *
 *   dokunma → "keep" (listelenmez)
 *   temizle → "clear", sonuç sütununda varsayılana dönüş yazar
 *   değer   → "set"
 */
function optionalChange<T>(
  field: string,
  existing: T | undefined,
  update: OptionalUpdate<T>,
  format: (value: T) => string,
): FieldChangeView {
  const before = existing === undefined ? EMPTY : format(existing);

  if (update === undefined) return { field, before, after: before, action: "keep" };
  if (update === null) {
    return {
      field,
      before,
      after: EMPTY,
      // Zaten boşsa temizlemek bir değişiklik değil.
      action: existing === undefined ? "keep" : "clear",
    };
  }

  const after = format(update);
  return { field, before, after, action: before === after ? "keep" : "set" };
}

/**
 * Yazılan satırların "eklendi / güncellendi" ayrımı.
 *
 * Ayrım `current` alanından gelir: aynı `ürün@tarih` anahtarında bir kayıt
 * varsa üzerine yazılıyordur. Kullanıcıya "42 kayıt işlendi" demek yerine
 * ne olduğunu söylemek, yanlış dosya yüklendiğinde fark edilmesini sağlar.
 */
export function countWrites(rows: readonly PreviewRow[]): {
  added: number;
  updated: number;
} {
  let added = 0;
  let updated = 0;
  for (const row of rows) {
    if (row.current === undefined) added += 1;
    else updated += 1;
  }
  return { added, updated };
}
