"use client";

import { useEffect, useState } from "react";

export default function PWARegistration() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Only register in production
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      console.log("[PWA] Skipping registration on localhost");
      return;
    }

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        
        console.log("[PWA] ServiceWorker registered:", reg.scope);
        setRegistration(reg);

        // Check for updates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                console.log("[PWA] New version available!");
                setUpdateAvailable(true);
              }
            });
          }
        });

        // Listen for controller change (new SW took over)
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          window.location.reload();
        });

      } catch (err) {
        console.error("[PWA] ServiceWorker registration failed:", err);
      }
    };

    // Register after load
    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW);
    }

    // Handle update prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      // Store for later use
      (window as any).deferredPrompt = e;
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  // Show update banner
  if (updateAvailable) {
    // This would render a banner - simplified for now
    // In production, you'd want a proper toast/banner component
    if (typeof window !== "undefined" && window.confirm("A new version of VitalCore is available. Reload to update?")) {
      if (registration?.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      window.location.reload();
    }
  }

  return null;
}
