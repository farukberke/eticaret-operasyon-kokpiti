import type { MorningBriefNarrationInput } from "../domain/morning-brief";

/**
 * SABAH ÖZETİ → LLM PROMPT'U VE GÜVENLİK FİLTRESİ.
 *
 * `MorningBriefNarratorPort`in iki saf yarısı burada yaşar: modele ne
 * sorulacağı (`buildMorningBriefPrompt`) ve modelin cevabının ekrana
 * çıkmadan önce nasıl temizleneceği (`sanitizeNarration`). Ağ çağrısının
 * kendisi `data/adapters/local/ollama-morning-brief-narrator.adapter.ts`de —
 * burası hiçbir I/O yapmaz, bu yüzden ağ mocklamadan test edilir.
 *
 * `fallbackNarration` modelin susması/zaman aşımına uğraması durumunda
 * gösterilecek metni üretir; port sözleşmesi bunun asla `throw` etmemesini
 * gerektirir (bkz. `MorningBriefNarratorPort` yorumu).
 */

const MAX_NARRATION_LENGTH = 220;

export function buildMorningBriefPrompt(input: MorningBriefNarrationInput): string {
  const { summary, focus, locale } = input;
  const languageName = locale === "tr" ? "Türkçe" : "English";

  const facts = [
    `Aktif satın alma aksiyonu: ${summary.activeActions}`,
    `Acil/kritik aksiyon: ${summary.criticalActions}`,
    `Tamamlanan: ${summary.completedActions}`,
    `Ertelenen: ${summary.snoozedActions}`,
  ];
  if (focus) {
    facts.push(`En öncelikli iş: "${focus.actionLabel}" — gerekçe: "${focus.reasonText}"`);
  }

  /**
   * Dil talimatı hem en başta hem en sonda tekrarlanıyor: qwen2.5:7b tek
   * seferlik bir talimatı uzun listenin ortasında kaybedip cevabı başka bir
   * dilde yazabiliyor (bkz. `sanitizeNarration`daki dil kayması notu).
   * Tekrar bu ihtimali azaltır ama sıfırlamaz — asıl güvence çıktı filtresi.
   */
  return [
    `Sen bir e-ticaret operasyon panelinin sabah özetini yazan bir asistansın. Yalnızca ${languageName} yazarsın.`,
    "Aşağıdaki sayılar ve metinler zaten hesaplanmış GERÇEKTİR — hiçbirini değiştirme, yeni sayı ya da ürün adı uydurma.",
    "",
    ...facts.map((line) => `- ${line}`),
    "",
    "Görev: Bu bilgileri TEK, kısa bir doğal cümleyle özetle.",
    "Kurallar:",
    "- Sadece yukarıda verilen sayı ve isimleri kullan.",
    "- Yalnızca cümlenin kendisini yaz; bu talimatları tekrarlama.",
    "- Tırnak işareti, markdown, emoji kullanma.",
    "- Karakter sayısı, kelime sayısı ya da bu talimatlar hakkında hiçbir şey yazma.",
    `- Cevabın tamamı ${languageName} olmalı. Başka bir dile geçme.`,
  ].join("\n");
}

/**
 * Beklenen alfabenin dışına çıkan karakterler.
 *
 * Hedef diller (tr/en) Latin alfabesi kullanır; Türkçe'ye özgü ı/ş/ğ/ç/ö/ü de
 * Latin scriptindedir. Aşağıdaki scriptlerden **tek bir karakter** görülmesi
 * bile cevabın dil kaydettiğinin kanıtıdır (bkz. `sanitizeNarration`).
 */
const FOREIGN_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}]/u;

/**
 * Prompt'un kendi başlıkları. Model cevap üretmek yerine talimatı geri
 * yazdığında bunlar metnin içinde görünür.
 */
const INSTRUCTION_ECHO = /(Görev|Kurallar|Task|Rules)\s*:/i;

/**
 * Modelin ham cevabını ekrana çıkacak hale getirir.
 *
 * Sayı doğrulaması yapmaz (model serbest metin ürettiği için genel bir
 * "uydurma sayı" kontrolü güvenilir değildir) — biçimsel temizlik ve
 * **cevabın hiç kullanılamaz olduğu** durumların reddi. `null` dönerse
 * çağıran taraf `fallbackNarration`a düşer.
 */
export function sanitizeNarration(raw: string): string | null {
  let text = raw
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.startsWith('"') && text.endsWith('"') && text.length > 1) {
    text = text.slice(1, -1).trim();
  }

  /**
   * Küçük yerel modeller ("en fazla N karakter" gibi talimatları) ara sıra
   * cevabın sonuna "(123 karakter)" / "(123 chars)" gibi bir not olarak sızdırıyor.
   * Bu bir içerik hatası değil, model kaprisidir — ekrana çıkmadan kesilir.
   */
  text = text.replace(/\s*\(\s*\d+\s*(karakter|char(acter)?s?)\s*\)\s*$/i, "").trim();

  if (text.length === 0) return null;

  /**
   * DİL KAYMASI — canlıda görüldü, bu yüzden burada.
   *
   * qwen2.5:7b "Türkçe yaz" talimatına rağmen cevabın tamamını Çinceye
   * çevirebiliyor ve aynı anda prompt'taki kural listesini cevap sanıp geri
   * yazabiliyor. Sayılar doğru olsa bile bu metin kullanıcıya gösterilemez;
   * kısmen kurtarmaya çalışmak da yanlış olur — cevap bütünüyle çöpe atılır
   * ve deterministik şablon devreye girer.
   */
  if (FOREIGN_SCRIPT.test(text)) return null;
  if (INSTRUCTION_ECHO.test(text)) return null;

  if (text.length > MAX_NARRATION_LENGTH) {
    text = `${text.slice(0, MAX_NARRATION_LENGTH - 1).trimEnd()}…`;
  }

  return text;
}

export function fallbackNarration(input: MorningBriefNarrationInput): string {
  const { summary, focus, locale } = input;

  if (summary.activeActions === 0) {
    return locale === "tr"
      ? "Bugün satın alma tarafında öncelikli bir aksiyon yok."
      : "No priority purchase action today.";
  }

  if (locale === "en") {
    const urgent =
      summary.criticalActions > 0 ? `, ${summary.criticalActions} of them urgent` : "";
    const focusPart = focus ? ` Top priority: ${focus.actionLabel}.` : "";
    return `${summary.activeActions} purchase action(s) need attention today${urgent}.${focusPart}`;
  }

  const urgent = summary.criticalActions > 0 ? `, ${summary.criticalActions} tanesi acil` : "";
  const focusPart = focus ? ` En öncelikli iş: ${focus.actionLabel}.` : "";
  return `Bugün ${summary.activeActions} satın alma aksiyonu bekliyor${urgent}.${focusPart}`;
}
