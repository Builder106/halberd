import type { Metadata, Viewport } from "next";
import { Archivo, Fragment_Mono } from "next/font/google";
import { Corners } from "../components/Corners";
import { LaneHeader } from "../components/LaneHeader";
import { Motion } from "../components/Motion";
import { site } from "../data/session";
import "./globals.css";

// Archivo carries everything but the wire traffic; its width axis gives the
// display line (wdth 112) and the lane labels (wdth 80) one family.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-archivo",
});

// Fragment Mono is reserved for JSON-RPC envelopes and rule names.
const fragment = Fragment_Mono({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
  variable: "--font-fragment",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Halberd: every MCP tool call meets this line first",
    template: "%s | Halberd",
  },
  description: site.description,
  authors: [{ name: "Yinka Vaughan", url: "https://github.com/Builder106" }],
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    siteName: "Halberd",
    images: [{ url: "/social-preview.png", width: 1200, height: 630, alt: "Halberd: every tool call meets this line first" }],
  },
  twitter: { card: "summary_large_image", images: ["/social-preview.png"] },
};

export const viewport: Viewport = { themeColor: "#F1F2F4" };

// Runs before first paint: hidden-until-played styles apply only when JS runs and motion is allowed.
const flags = `document.documentElement.classList.add('js');if(!matchMedia('(prefers-reduced-motion: reduce)').matches)document.documentElement.classList.add('motion')`;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  name: "Halberd",
  description: site.description,
  codeRepository: site.repo,
  programmingLanguage: "Go",
  license: "https://opensource.org/licenses/MIT",
  url: site.url,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${fragment.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: flags }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <div id="curtain" aria-hidden="true">
          <div className="curtain__panel" />
        </div>
        <LaneHeader />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <Corners />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
        <Motion />
      </body>
    </html>
  );
}
