import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // tsconfig.json "paths" ile birebir aynı tutulmalı.
    alias: {
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
  },
});
