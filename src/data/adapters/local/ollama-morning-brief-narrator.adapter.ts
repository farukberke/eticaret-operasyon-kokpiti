import type { MorningBriefNarrationInput } from "@/core/domain";
import type { MorningBriefNarratorPort } from "@/core/ports";
import {
  buildMorningBriefPrompt,
  fallbackNarration,
  sanitizeNarration,
} from "@/core/services/morning-brief-narration";

/**
 * OLLAMA ADAPTER — sabah özetini yerel bir LLM ile doğal dile çevirir.
 *
 * `MorningBriefNarratorPort`in v1 uygulaması. Kural motorunun ürettiği
 * sayılar (`buildMorningBrief`) burada **yeniden hesaplanmaz** — model
 * yalnızca zaten doğru olan sayıları tek cümlede birleştirir
 * (`buildMorningBriefPrompt`). Model susarsa, zaman aşımına uğrarsa ya da
 * Ollama ayakta değilse bu fonksiyon **throw etmez**: deterministik
 * `fallbackNarration`a düşer, kokpit hiçbir zaman bu satır yüzünden hata
 * ekranına düşmez.
 *
 * `fetchImpl` enjekte edilir ki testler gerçek bir Ollama sunucusuna
 * bağlanmadan (ve geliştiricinin makinesinde bir tane çalışıyor olsa bile
 * ona bağlanmadan) hem başarı hem hata yollarını deterministik doğrulasın.
 */

const DEFAULT_HOST = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "qwen2.5:7b";
const REQUEST_TIMEOUT_MS = 8000;

interface OllamaGenerateResponse {
  readonly response?: string;
}

export function createOllamaMorningBriefNarrator(
  options: {
    readonly host?: string;
    readonly model?: string;
    readonly fetchImpl?: typeof fetch;
    readonly timeoutMs?: number;
  } = {},
): MorningBriefNarratorPort {
  const host = options.host ?? process.env.OLLAMA_HOST ?? DEFAULT_HOST;
  const model = options.model ?? process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  return {
    async narrate(input: MorningBriefNarrationInput): Promise<string> {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(`${host}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            prompt: buildMorningBriefPrompt(input),
            stream: false,
            // Düşük sıcaklık: bu bir yaratıcılık işi değil, sayıları cümleye
            // dökme işi. Yüksek sıcaklık dil kaymasını da besliyordu.
            options: { temperature: 0.2 },
          }),
          signal: controller.signal,
        });

        if (!response.ok) return fallbackNarration(input);

        const data = (await response.json()) as OllamaGenerateResponse;
        const sanitized = sanitizeNarration(data.response ?? "");
        return sanitized ?? fallbackNarration(input);
      } catch {
        return fallbackNarration(input);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
