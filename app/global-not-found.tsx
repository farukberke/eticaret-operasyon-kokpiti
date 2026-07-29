import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { routing } from "@/i18n/routing";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sayfa bulunamadı",
  description: "Aradığınız sayfa mevcut değil.",
};

/**
 * `app/[locale]/layout.tsx` kök layout'u `[locale]` dinamik segmentinde
 * yaşadığı için (bkz. o dosyadaki not), tamamen eşleşmeyen bir adres
 * (`/does-not-exist` gibi, hiçbir rota segmentine uymayan) o layout'u hiç
 * çağırmadan buraya düşer — Next.js bunu `global-not-found.js` ile
 * belgeliyor (`node_modules/next/dist/docs/.../not-found.md`: "Your root
 * layout is defined using top-level dynamic segments... global-not-found.js
 * is useful"). Locale bilinmediği için tek bir varsayılan dil kullanılır;
 * bu sayfa route ağacını atladığından stil/font kendi başına yüklenir.
 */
export default function GlobalNotFound() {
  return (
    <html
      lang={routing.defaultLocale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <div className="flex min-h-full flex-col items-center justify-center gap-2 px-4 text-center">
          <h1 className="text-fg text-lg font-semibold tracking-tight">
            Sayfa bulunamadı
          </h1>
          <p className="text-fg-muted text-sm">Aradığınız sayfa mevcut değil.</p>
          <a
            href={`/${routing.defaultLocale}`}
            className="text-accent mt-2 text-sm font-medium hover:underline"
          >
            Kokpite dön
          </a>
        </div>
      </body>
    </html>
  );
}
