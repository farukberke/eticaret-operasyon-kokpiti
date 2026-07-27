import createMiddleware from "next-intl/middleware";

import { routing } from "./src/i18n/routing";

/**
 * Next.js 16'da `middleware.ts` yerini `proxy.ts` aldı; export edilen
 * fonksiyonun adı da `proxy` olmak zorunda.
 *
 * Şimdilik tek işi dil yönlendirmesi: `/` → `/tr`. İleride oturum kontrolü
 * de bu dosyaya eklenecek — auth guard'ın doğal yeri burasıdır.
 */
export const proxy = createMiddleware(routing);

export const config = {
  /**
   * Statik dosyalar, Next.js iç yolları ve API rotaları dışındaki her şey.
   * `.*\\..*` uzantılı istekleri (favicon, resim) dışarıda bırakır.
   */
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
