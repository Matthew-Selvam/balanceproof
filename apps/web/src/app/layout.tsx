import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BalanceProof — Verified bank statement conversion",
  description:
    "Convert PDF bank statements to Excel and CSV with a reconciliation guarantee. Every export is balance-checked before you download it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-50 text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
