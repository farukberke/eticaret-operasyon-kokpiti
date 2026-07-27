/**
 * CSV AYRIŞTIRICI.
 *
 * Neden hazır kütüphane değil: ihtiyacımız olan davranış (tırnak, kaçış,
 * CRLF, BOM, otomatik ayraç tespiti) yüz satırla karşılanıyor ve bu kod
 * `core` katmanında yaşamak zorunda — orada dış paket kullanılamıyor.
 *
 * Kapsanan gerçek dünya durumları:
 * • Excel'in dosya başına eklediği BOM (`﻿`)
 * • Windows satır sonu (`\r\n`)
 * • Tırnak içinde ayraç ve satır sonu: `"Elbise, kırmızı"`
 * • Tırnak içinde tırnak: `"12"" ekran"`
 * • **Noktalı virgül ayracı** — Türkçe Windows'ta Excel varsayılanı budur;
 *   virgül beklemek Türk kullanıcıların çoğunda dosyayı tek sütun okurdu.
 */

export type CsvRow = readonly string[];

export interface CsvDocument {
  readonly rows: readonly CsvRow[];
  readonly delimiter: string;
}

const DELIMITERS = [",", ";", "\t"] as const;

/**
 * Ayracı ilk satırdaki adedine bakarak seçer.
 *
 * Tırnak içindekiler sayılmaz; `"Elbise, kırmızı";150` satırında virgülün
 * kazanmasını engeller.
 */
function detectDelimiter(text: string): string {
  const firstLine = text.slice(
    0,
    text.indexOf("\n") === -1 ? undefined : text.indexOf("\n"),
  );

  let best = ",";
  let bestCount = 0;

  for (const candidate of DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < firstLine.length; i += 1) {
      const char = firstLine[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === candidate && !inQuotes) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseCsv(input: string): CsvDocument {
  // Excel'in eklediği BOM ilk başlığı "﻿sku" yapar ve eşleşmeyi bozar.
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // Tamamen boş satırları atla (dosya sonundaki fazladan satır sonu).
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const char = text[i]!;

    if (inQuotes) {
      if (char === '"') {
        // `""` tırnak içinde tek tırnak demektir.
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field === "") {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === delimiter) {
      endField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      // CRLF ve tek başına CR, ikisi de satır sonu sayılır.
      if (text[i + 1] === "\n") i += 1;
      endRow();
      i += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  if (field !== "" || row.length > 0) endRow();

  return { rows, delimiter };
}
