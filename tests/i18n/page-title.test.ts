import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";
import tr from "@/i18n/messages/tr.json";

/**
 * SEKME BAŞLIĞI — /costs kendi başlığını taşır.
 *
 * `app/[locale]/costs/page.tsx` içindeki `generateMetadata` başlığı
 * `costs.title` anahtarından okur. Anahtar bir locale'de eksik kalırsa sayfa
 * hata vermez, sessizce anahtar adını basar — bu yüzden varlığı burada
 * doğrulanıyor. `generateMetadata`'nın kendisi Next istek bağlamına bağlı
 * olduğu için tarayıcıda kontrol ediliyor.
 */
const dictionaries = { tr, en };

describe("sayfa başlıkları", () => {
  for (const [locale, messages] of Object.entries(dictionaries)) {
    it(`${locale}: costs.title dolu ve kokpit başlığından ayrı`, () => {
      expect(messages.costs.title.trim()).not.toBe("");
      expect(messages.costs.title).not.toBe(messages.app.title);
    });
  }
});
