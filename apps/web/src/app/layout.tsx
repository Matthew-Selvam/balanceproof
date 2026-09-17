import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-jet",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "BalanceProof — bank statements that reconcile, not just convert",
    template: "%s · BalanceProof",
  },
  description:
    "Convert PDF bank statements to Excel, CSV, QBO and OFX. Every export is reconciled against the printed opening and closing balance, and rows that don't prove out are flagged with an explanation.",
  keywords: [
    "bank statement to excel",
    "bank statement converter",
    "pdf bank statement to csv",
    "reconcile bank statement",
    "qbo ofx export",
  ],
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "BalanceProof — bank statements that reconcile",
    description:
      "PDF → Excel/CSV/QBO/OFX with a reconciliation guarantee. Opening + transactions = closing, proven per statement.",
    siteName: "BalanceProof",
  },
  twitter: {
    card: "summary_large_image",
    title: "BalanceProof — bank statements that reconcile",
    description:
      "Every export is balance-checked before you download it. Rows that don't prove out get flagged.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#070a12",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        <a
          href="#main"
          className="sr-only-focusable focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent-500 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
