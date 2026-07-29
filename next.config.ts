import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  /**
   * Kök layout `app/[locale]/layout.tsx` içinde, dinamik bir segmentte
   * yaşıyor — Next.js bu durumda tutarlı bir 404 sayfası kurmanın yolu
   * olarak `global-not-found.js`'i belgeliyor (bkz. `app/global-not-found.tsx`
   * içindeki not).
   */
  experimental: {
    globalNotFound: true,
  },
};

export default withNextIntl(nextConfig);
