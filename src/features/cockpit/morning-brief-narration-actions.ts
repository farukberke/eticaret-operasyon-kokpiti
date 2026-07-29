"use server";

import type { MorningBriefNarrationInput } from "@/core/domain";
import { container } from "@/data/container";

/**
 * SABAH ÖZETİ → AI ANLATIMI — sunucu eylemi.
 *
 * `MorningBriefSummary` istemci bileşeni; özet localStorage'daki kullanıcı
 * kararlarına bağlı olduğu için sunucuda önceden hesaplanamaz (bkz. o
 * dosyanın üst yorumu). Bu yüzden anlatım da istemcinin elindeki özet
 * hazır olduğunda, bu eylemle istenir.
 *
 * `container.morningBriefNarrator.narrate` asla throw etmez (port
 * sözleşmesi) — bu fonksiyon da bir try/catch'e ihtiyaç duymaz.
 */
export async function narrateMorningBrief(
  input: MorningBriefNarrationInput,
): Promise<string> {
  return container.morningBriefNarrator.narrate(input);
}
