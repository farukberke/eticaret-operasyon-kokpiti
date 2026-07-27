import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * Katman sınırları burada ZORLANIR.
 *
 * Mimari, dokümanda yazan bir temenni değil, `npm run lint` ile kırılan bir kuraldır.
 * Bağımlılık yönü tek yönlüdür ve içeriye doğru akar:
 *
 *   app      → features, ui, core, i18n, lib
 *   features → core, data, ui, i18n, lib      (her şeyi birleştiren tek katman)
 *   data     → core, lib                      (features ve ui'yi GÖREMEZ)
 *   ui       → lib                            (core, data ve features'ı GÖREMEZ)
 *   core     → core, lib                      (dış paket dahil hiçbir şeye bağlanmaz)
 *
 * `core` katmanının React/Next/HTTP bilmemesi, gerçek API'ye geçtiğimizde
 * iş mantığının hiç değişmeden kalmasını garanti eder.
 */

/** Bir katmanın hangi katmanları görebileceğini tanımlar. */
const layerPolicy = (from, allowed) => ({
  from: { element: { type: from } },
  allow: { to: { element: { types: { anyOf: allowed } } } },
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    plugins: { boundaries },
    settings: {
      "boundaries/legacy-warnings": false,
      "import/resolver": {
        typescript: { alwaysTryTypes: true, project: "./tsconfig.json" },
      },
      "boundaries/elements": [
        { type: "app", pattern: "app/**", partialMatch: false },
        { type: "core", pattern: "src/core/**", partialMatch: false },
        { type: "data", pattern: "src/data/**", partialMatch: false },
        { type: "features", pattern: "src/features/**", partialMatch: false },
        { type: "ui", pattern: "src/ui/**", partialMatch: false },
        { type: "i18n", pattern: "src/i18n/**", partialMatch: false },
        { type: "lib", pattern: "src/lib/**", partialMatch: false },
      ],
    },
    rules: {
      "boundaries/no-unknown-files": "off",

      // Katmanlar arası bağımlılık yönü.
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message:
            "Katman ihlali: '{{from.element.types.[0]}}' katmanı '{{to.element.types.[0]}}' katmanını içe aktaramaz.",
          policies: [
            // Dış paketler (react, next, recharts…) `core` dışında serbest.
            { allow: { to: { module: { origin: "external" } } } },

            layerPolicy("core", ["core", "lib"]),
            layerPolicy("lib", ["lib"]),
            layerPolicy("ui", ["ui", "lib"]),
            layerPolicy("i18n", ["i18n", "lib"]),
            layerPolicy("data", ["core", "data", "lib"]),
            layerPolicy("features", ["features", "core", "data", "ui", "i18n", "lib"]),
            layerPolicy("app", ["features", "ui", "core", "i18n", "lib"]),
          ],
        },
      ],

      /**
       * `core` katmanının saflığı.
       *
       * Not: dış modüller `boundaries/dependencies` tarafından "unknown element"
       * sayıldığı için orada yakalanamıyor; bu iş için `boundaries/external`
       * kuralı kullanılıyor (bu sürümde çalışan tek yol).
       */
      "boundaries/external": [
        "error",
        {
          default: "allow",
          rules: [
            {
              from: ["core"],
              disallow: ["*"],
              message:
                "`core` saf TypeScript kalmalı — '${dependency.source}' paketi burada kullanılamaz. Bağımlılığı bir port arkasına al.",
            },
          ],
        },
      ],
    },
  },

  globalIgnores([".next/**", "out/**", "build/**", "node_modules/**", "next-env.d.ts"]),
]);

export default eslintConfig;
