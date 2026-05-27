import type { Metadata } from "next";
import { Cormorant_Garamond } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

// Display serif used only for the ceremonial section headers ("II. THE
// SENTRY'S CHALLENGE"). Body copy and code keep the existing sans/mono.
const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-display-serif",
});

const siteUrl = "https://halberd-keep.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Halberd — a JSON-RPC firewall for MCP agents",
    template: "%s — Halberd",
  },
  description:
    "Halberd inspects every tools/call between an LLM agent and its MCP servers, blocking argument injection, capability creep, and tool-poisoning before they reach the host. Try it in the browser.",
  keywords: [
    "MCP",
    "Model Context Protocol",
    "LLM security",
    "prompt injection",
    "agentic AI",
    "JSON-RPC",
    "policy proxy",
    "Claude Desktop",
    "Cursor",
    "Windsurf",
  ],
  authors: [{ name: "Yinka Vaughan", url: "https://github.com/Builder106" }],
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: "Halberd — a JSON-RPC firewall for MCP agents",
    description:
      "Inspect every tools/call between an LLM and its MCP servers. Block argument injection, capability creep, and tool-poisoning before they reach the host.",
    siteName: "Halberd",
    images: [
      {
        url: "/social-preview.png",
        width: 1200,
        height: 630,
        alt: "Halberd — a JSON-RPC firewall for MCP agents",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Halberd — a JSON-RPC firewall for MCP agents",
    description:
      "Inspect every tools/call between an LLM and its MCP servers. Block argument injection, capability creep, and tool-poisoning before they reach the host.",
    images: ["/social-preview.png"],
  },
  alternates: {
    canonical: siteUrl,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased dark ${cormorant.variable}`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Privacy-friendly page-view + Web Vitals telemetry. No
            cookies, no fingerprinting; surfaces in the Vercel
            dashboard under the project's Analytics / Speed Insights
            tabs. Both components no-op outside production. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
