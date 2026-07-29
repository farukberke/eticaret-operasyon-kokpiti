import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * KÖK `<html lang>` — her rota `[locale]` altında yaşadığı için (`proxy.ts`
 * her zaman `/tr` veya `/en`'e yönlendirir) `<html>`/`<body>` kökü
 * `app/[locale]/layout.tsx` içinde kurulur, ayrı bir `app/layout.tsx` içinde
 * değil. Aksi halde EN rotası `lang="tr"` ile servis edilir — ekran okuyucu
 * ve arama motorları için bir dil uyuşmazlığı olurdu.
 */
describe("kök layout — locale uyuşmazlığı", () => {
  it("app/[locale]/layout.tsx `lang` değerini gerçek locale'den okur, sabit yazmaz", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../app/[locale]/layout.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toMatch(/<html\s+lang=\{locale\}/);
    expect(source).not.toMatch(/<html\s+lang="(tr|en)"/);
  });

  it("ayrı bir kök app/layout.tsx yoktur — tek `<html>` kaynağı locale layout'tur", () => {
    expect(() =>
      readFileSync(fileURLToPath(new URL("../../app/layout.tsx", import.meta.url))),
    ).toThrow();
  });
});
