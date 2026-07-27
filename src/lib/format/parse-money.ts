/**
 * Kullanıcı girdisini kuruşa çevirir — **kayan nokta kullanmadan**.
 *
 * `parseFloat("1234.56") * 100` yazmak sonucu 123455.99999999999 yapabilir
 * ve `Math.round` bunu kurtarsa bile alışkanlık tehlikelidir. Burada sayı
 * hiçbir aşamada ondalık olmaz: metin tamsayı parçalara bölünür ve
 * `tam × 100 + kesir` ile birleştirilir.
 *
 * Türkçe ve İngilizce biçimlerin ikisi de kabul edilir:
 *   "1.234,56" · "1,234.56" · "1234,5" · "1234" · "₺1.234,56"
 */

export interface ParsedMoney {
  readonly ok: boolean;
  /** Kuruş cinsinden tamsayı. Hata durumunda 0. */
  readonly minor: number;
  readonly error?: "empty" | "invalid" | "negative";
}

const INVALID: ParsedMoney = { ok: false, minor: 0, error: "invalid" };

/**
 * Hangi ayracın ondalık olduğunu belirler.
 *
 * Kural: **son geçen** ayraç ondalıktır — ama yalnızca ardından 1–2 basamak
 * geliyorsa. "1.234" binlik ayraçtır, "1.23" ondalıktır. Bu ayrım olmadan
 * ₺1.234 girişi ₺1,23 olarak kaydedilirdi.
 */
function splitDecimal(cleaned: string): { whole: string; fraction: string } | null {
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const separator = Math.max(lastComma, lastDot);

  if (separator === -1) return { whole: cleaned, fraction: "" };

  const tail = cleaned.slice(separator + 1);
  // Ayraçtan sonra 3 basamak varsa bu binlik ayracıdır, ondalık değil.
  if (tail.length === 3) return { whole: cleaned.replace(/[.,]/g, ""), fraction: "" };
  if (tail.length === 0 || tail.length > 2) return null;

  return {
    whole: cleaned.slice(0, separator).replace(/[.,]/g, ""),
    fraction: tail,
  };
}

export function parseMoneyToMinor(input: string): ParsedMoney {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, minor: 0, error: "empty" };

  // Para simgesi ve boşlukları at; işaret ve rakamları koru.
  const cleaned = trimmed.replace(/[^\d.,-]/g, "");
  if (cleaned === "") return INVALID;

  const negative = cleaned.startsWith("-");
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  if (!/^[\d.,]+$/.test(unsigned)) return INVALID;

  const parts = splitDecimal(unsigned);
  if (!parts) return INVALID;

  const whole = parts.whole === "" ? "0" : parts.whole;
  if (!/^\d+$/.test(whole)) return INVALID;

  // Kesir iki basamağa tamamlanır: "5" → 50 kuruş, "05" → 5 kuruş.
  const fraction = parts.fraction.padEnd(2, "0").slice(0, 2);
  if (fraction !== "" && !/^\d{2}$/.test(fraction)) return INVALID;

  const minor = Number(whole) * 100 + Number(fraction || "0");
  if (!Number.isSafeInteger(minor)) return INVALID;
  if (negative) return { ok: false, minor: 0, error: "negative" };

  return { ok: true, minor };
}

/**
 * Yüzde girdisini sayıya çevirir: `"%15"`, `"15"`, `"15,5"` → 15 / 15.5.
 *
 * Baz puana çevirme `basisPoints()` işi; burada yalnızca metin ayrıştırılır.
 */
export function parsePercent(input: string): { ok: boolean; value: number } {
  const trimmed = input.trim().replace(/%/g, "").replace(",", ".");
  if (trimmed === "") return { ok: false, value: 0 };

  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    return { ok: false, value: 0 };
  }
  return { ok: true, value };
}
