"use client";
import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // Small delay to let the kill-switch (in layout.tsx <head>) finish
      // unregistering old SWs before we register the new one.
      const timer = setTimeout(() => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, []);
  return null;
}
