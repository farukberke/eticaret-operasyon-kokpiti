import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kokpit",
  description: "E-ticaret operasyon kokpiti",
};

/**
 * Kök layout yalnızca <html>/<body> iskeletini ve fontları kurar.
 * Panel kabuğu (sidebar, topbar, dil değiştirici) `app/[locale]/layout.tsx`
 * içinde yaşayacak — çünkü o kabuk locale bilgisine ihtiyaç duyar.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="tr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
