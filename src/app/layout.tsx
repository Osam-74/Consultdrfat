import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "ConsultDrFat — Expert Medical Consultations",
  description: "Book private, secure medical consultations with Dr. Fat. Voice & chat sessions, confirmed slots, pay in naira.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "ConsultDrFat" },
};

export const viewport: Viewport = {
  themeColor: "#0B2B4A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Fonts served locally — no Google Fonts dependency */}
        <link rel="stylesheet" href="/fonts/fonts.css" />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
