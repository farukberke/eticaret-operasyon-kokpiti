import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      /**
       * `next-intl` gezinme bileşenleri `next/navigation`ı uzantısız içe
       * aktarıyor. Next paketinde `exports` alanı olmadığı için Node'un ESM
       * çözümleyicisi bunu bulamıyor — Next'in kendi derleyicisi bulur, testler
       * bulamaz. Bu satır yalnızca test çalıştırıcısını Next'in derleyicisiyle
       * aynı hizaya getirir; uygulama derlemesine dokunmaz.
       */
      "next/navigation": r("./node_modules/next/navigation.js"),

      // Aşağısı tsconfig.json "paths" ile birebir aynı tutulmalı.
      "@/core": r("./src/core"),
      "@/data": r("./src/data"),
      "@/features": r("./src/features"),
      "@/ui": r("./src/ui"),
      "@/lib": r("./src/lib"),
      "@/i18n": r("./src/i18n"),
      "@/styles": r("./src/styles"),
    },
  },
  test: {
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
    // Varsayılan `node`: testlerin ağırlığı `core` katmanındaki saf mantıkta.
    // DOM gereken bir test dosyasının başına `// @vitest-environment jsdom` yazılır.
    environment: "node",

    /**
     * `next-intl` dış bağımlılık olarak dışarıda bırakılırsa Node'un ESM
     * çözümleyicisine düşer ve yukarıdaki `next/navigation` takması işlemez.
     * Vite'ın içinden geçirmek, bileşen testlerinin uygulamadaki gezinme
     * bileşenlerini gerçekten render edebilmesinin şartı.
     */
    server: { deps: { inline: ["next-intl"] } },
  },
});
