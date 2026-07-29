import { describe, expect, it, vi } from "vitest";

import type { MorningBriefNarrationInput } from "@/core/domain";
import { fallbackNarration } from "@/core/services/morning-brief-narration";
import { createOllamaMorningBriefNarrator } from "@/data/adapters/local/ollama-morning-brief-narrator.adapter";

/**
 * OLLAMA ADAPTER.
 *
 * `fetchImpl` enjekte edilir, gerçek bir Ollama sunucusuna hiçbir zaman
 * bağlanılmaz — bu makinede biri çalışıyor olsa bile testler ondan
 * etkilenmemeli. Üç yol da doğrulanır: başarı, HTTP hatası, ağ hatası/zaman
 * aşımı — üçü de `MorningBriefNarratorPort`in "asla throw etme" sözleşmesine
 * uymalı.
 */

function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
  return vi.fn((url: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(url), init ?? {})),
  );
}

const INPUT: MorningBriefNarrationInput = {
  locale: "tr",
  summary: {
    total: 2,
    activeActions: 2,
    completedActions: 0,
    snoozedActions: 0,
    ignoredActions: 0,
    criticalActions: 1,
  },
  focus: null,
};

describe("createOllamaMorningBriefNarrator", () => {
  it("başarılı cevabı temizleyip döner", async () => {
    const fetchImpl = fakeFetch(
      () => new Response(JSON.stringify({ response: '"Bugün 2 iş var."' }), { status: 200 }),
    );

    const narrator = createOllamaMorningBriefNarrator({ fetchImpl });
    const text = await narrator.narrate(INPUT);

    expect(text).toBe("Bugün 2 iş var.");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain("/api/generate");
    const body = JSON.parse(requestInit!.body as string) as {
      model: string;
      stream: boolean;
    };
    expect(body.stream).toBe(false);
    expect(body.model).toBeTruthy();
  });

  it("HTTP hatasında (ör. 404) throw etmez, deterministik metne düşer", async () => {
    const fetchImpl = fakeFetch(() => new Response("not found", { status: 404 }));
    const narrator = createOllamaMorningBriefNarrator({ fetchImpl });

    const text = await narrator.narrate(INPUT);

    expect(text).toBe(fallbackNarration(INPUT));
  });

  it("ağ hatasında throw etmez, deterministik metne düşer", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("ECONNREFUSED")));
    const narrator = createOllamaMorningBriefNarrator({ fetchImpl });

    const text = await narrator.narrate(INPUT);

    expect(text).toBe(fallbackNarration(INPUT));
  });

  it("model boş/anlamsız cevap dönerse deterministik metne düşer", async () => {
    const fetchImpl = fakeFetch(
      () => new Response(JSON.stringify({ response: "   " }), { status: 200 }),
    );
    const narrator = createOllamaMorningBriefNarrator({ fetchImpl });

    const text = await narrator.narrate(INPUT);

    expect(text).toBe(fallbackNarration(INPUT));
  });

  it("host ve model seçenekleri istek URL'sine ve gövdesine yansır", async () => {
    const fetchImpl = fakeFetch(
      () => new Response(JSON.stringify({ response: "ok" }), { status: 200 }),
    );
    const narrator = createOllamaMorningBriefNarrator({
      fetchImpl,
      host: "http://example-host:11434",
      model: "custom-model",
    });

    await narrator.narrate(INPUT);

    const [url, requestInit] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("http://example-host:11434/api/generate");
    const body = JSON.parse(requestInit!.body as string) as { model: string };
    expect(body.model).toBe("custom-model");
  });
});
