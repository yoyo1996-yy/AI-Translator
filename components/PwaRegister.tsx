"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") {
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // PWA enhancement only; translation must keep working without SW.
    });
  }, []);

  return null;
}
