import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

const sans = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const cond = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-cond" });

export const metadata: Metadata = {
  title: "SDR Certification Board",
  description: "Spyne SDR training: weekly tests, results and go-live readiness.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${cond.variable}`}>
      <body>
        <div className="wrap">{children}</div>
      </body>
    </html>
  );
}
