import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

// Self-hosted at build time by next/font: no requests to Google at runtime.
const sans = Instrument_Sans({ variable: "--font-sans", subsets: ["latin"], display: "swap" });
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ERD Studio — entity relationship diagrams in your browser",
  description:
    "Sketch database tables, mark primary and foreign keys, link them with crow's-foot relationships and check your design against 1NF–BCNF. Everything stays in your browser.",
  applicationName: "ERD Studio",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#161e25" },
  ],
};

/**
 * Applies the saved theme before first paint so there is no light→dark flash.
 * Reads the same localStorage key as src/store/settings.ts.
 */
const themeScript = `(function(){try{var s=JSON.parse(localStorage.getItem("erd-studio:settings")||"null");var t=s&&s.state&&s.state.settings&&s.state.settings.theme;if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
