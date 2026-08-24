import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { PwaRegister } from "../components/PwaRegister";
import "./globals.css";

const inlineStyles = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

export const metadata: Metadata = {
  title: "AI 随身同传",
  description: "手机可用的 AI 随身同传工具。",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AI 随身同传"
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#116045"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <style dangerouslySetInnerHTML={{ __html: inlineStyles }} />
      </head>
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
