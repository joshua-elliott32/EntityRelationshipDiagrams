import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { PrivateTelemetry } from "@/components/PrivateTelemetry";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
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
    "Sketch database tables, mark primary and foreign keys, link them with crow's-foot relationships and check your design against 1NF–BCNF. Your diagrams stay in your browser.",
  applicationName: "ERD Studio",
  // Makes the Open Graph image and canonical URLs absolute. The image itself
  // comes from src/app/opengraph-image.png (Next adds the og:image tags).
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE.toLowerCase()}`,
    description: SITE_DESCRIPTION,
    locale: "en_GB",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE.toLowerCase()}`,
    description: SITE_DESCRIPTION,
  },
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
        <PrivateTelemetry />
      </body>
    </html>
  );
}
