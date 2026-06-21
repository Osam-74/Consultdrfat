"use client";
import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // Listen for SW update notifications — auto-reload to pick up new version
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "SW_UPDATED") {
        // Force a hard reload to load the new app version
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    // Small delay to let the kill-switch (in layout.tsx <head>) finish
    // unregistering old SWs before we register the new one.
    const timer = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }, 1000);

    return () => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
  }, []);
  return null;
}
