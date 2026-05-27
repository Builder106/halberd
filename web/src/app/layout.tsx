import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://halberd-six.vercel.app";

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
    <html lang="en" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
