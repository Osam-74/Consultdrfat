import type { Metadata, Viewport } from "next";
import "./globals.css";
import { plusJakartaSans, lora } from "@/lib/fonts";
import { AuthProvider } from "@/lib/auth";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import GlobalShell from "@/components/GlobalShell";

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

// ── Service Worker Kill Switch ──────────────────────────────────────────────
// Runs BEFORE React hydrates. Unregisters ALL existing service workers and
// clears ALL caches. This fixes the "stale JS chunk" problem where the old
// mindbridge-v1/v2 SW (cache-first) was serving outdated JS after new deploys,
// causing React error #310 (Too many re-renders / hydration mismatch).
// The new SW (mindbridge-v3, network-first) is registered afterwards by
// ServiceWorkerRegister. The kill switch only runs once per SW_VERSION.
const SW_KILL_SWITCH = `
(function() {
  var SW_VERSION = 'mindbridge-v3';
  var KEY = 'consultdrfat-sw-cleaned-' + SW_VERSION;
  try {
    if (localStorage.getItem(KEY)) {
      // Already cleaned for this version — just nuke stray caches silently
      if ('caches' in window) {
        caches.keys().then(function(keys) {
          keys.forEach(function(k) { if (k !== SW_VERSION) caches.delete(k); });
        });
      }
      return;
    }
    // Full nuke: unregister ALL service workers + delete ALL caches
    if ('caches' in window) {
      caches.keys().then(function(keys) {
        keys.forEach(function(k) { caches.delete(k); });
      });
    }
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(function(regs) {
        if (!regs.length) {
          localStorage.setItem(KEY, '1');
          return;
        }
        Promise.all(regs.map(function(r) { return r.unregister(); })).then(function() {
          localStorage.setItem(KEY, '1');
          // Hard reload to ensure fresh JS chunks load without SW interference
          window.location.reload();
        });
      });
    } else {
      localStorage.setItem(KEY, '1');
    }
  } catch(e) {
    // Non-fatal — don't block page load
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plusJakartaSans.variable} ${lora.variable}`}>
      <head>
        {/* Kill switch must run before any JS loads to prevent stale SW from
            serving old chunks that cause React hydration errors */}
        <script dangerouslySetInnerHTML={{ __html: SW_KILL_SWITCH }} />
      </head>
      <body>
        <AuthProvider>
          <GlobalShell>
            {children}
          </GlobalShell>
        </AuthProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
