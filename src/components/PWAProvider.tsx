"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { syncAll, startRealtimeSync, stopRealtimeSync } from "@/lib/db/sync-engine";
import { initializeDefaultSettings, getSetting, setSetting, SETTINGS_KEYS } from "@/lib/db/dexie-db";
import { t as translateHelper } from "@/lib/i18n";
import { dbFirestore } from "@/lib/firebase/config";

interface PWAContextType {
  isOnline: boolean;
  installPrompt: any;
  showInstallButton: boolean;
  triggerInstall: () => Promise<void>;
  lastSyncTime: string | null;
  syncStatus: "idle" | "syncing" | "success" | "error" | "unconfigured";
  performManualSync: () => Promise<void>;
  language: "en" | "ta";
  changeLanguage: (lang: "en" | "ta") => Promise<void>;
  t: (key: string, replacements?: Record<string, string | number>) => string;
}

const PWAContext = createContext<PWAContextType | null>(null);

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const [isOnlineState, setIsOnlineState] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "success" | "error" | "unconfigured">(
    dbFirestore ? "idle" : "unconfigured"
  );
  const [language, setLanguageState] = useState<"en" | "ta">("en");

  useEffect(() => {
    // 1. Initialize default DB settings and load persistent language
    async function init() {
      await initializeDefaultSettings();
      const lang = await getSetting(SETTINGS_KEYS.LANGUAGE, "en");
      setLanguageState(lang as "en" | "ta");
    }
    init().catch(console.error);

    // 2. Set initial online status
    if (typeof window !== "undefined") {
      setIsOnlineState(navigator.onLine);
    }

    const handleOnline = async () => {
      setIsOnlineState(true);
      if (!dbFirestore) {
        setSyncStatus("unconfigured");
        return;
      }
      setSyncStatus("syncing");
      const res = await syncAll();
      if (res.success) {
        setSyncStatus("success");
        setLastSyncTime(new Date().toLocaleTimeString());
      } else {
        setSyncStatus("error");
      }
      
      // Start realtime snapshot listeners
      startRealtimeSync(() => {
        setLastSyncTime(new Date().toLocaleTimeString());
        setSyncStatus("success");
      });
    };

    const handleOffline = () => {
      setIsOnlineState(false);
      // Stop realtime snapshot listeners
      stopRealtimeSync();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // 3. Register Service Worker
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").then(
          (registration) => {
            console.log("ServiceWorker registration successful: ", registration.scope);
          },
          (err) => {
            console.error("ServiceWorker registration failed: ", err);
          }
        );
      });
    }

    // 4. Custom PWA Install Prompt Listener
    const handleBeforeInstallPrompt = (e: Event) => {
      // Allow default browser install prompt to run without console warnings
      setInstallPrompt(e);
      setShowInstallButton(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Initial background sync check
    if (navigator.onLine) {
      handleOnline();
    }

    // Set up periodic sync check every 60 seconds
    const syncInterval = setInterval(() => {
      if (navigator.onLine && dbFirestore) {
        syncAll().then((res) => {
          if (res.success && res.count > 0) {
            setLastSyncTime(new Date().toLocaleTimeString());
          }
        });
      }
    }, 60000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      clearInterval(syncInterval);
      // Clean up realtime snapshot listeners
      stopRealtimeSync();
    };
  }, []);

  const triggerInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    setInstallPrompt(null);
    setShowInstallButton(false);
  };

  const performManualSync = async () => {
    if (!navigator.onLine) return;
    if (!dbFirestore) {
      setSyncStatus("unconfigured");
      return;
    }
    setSyncStatus("syncing");
    const res = await syncAll();
    if (res.success) {
      setSyncStatus("success");
      setLastSyncTime(new Date().toLocaleTimeString());
    } else {
      setSyncStatus("error");
    }
  };

  const changeLanguage = async (newLang: "en" | "ta") => {
    setLanguageState(newLang);
    await setSetting(SETTINGS_KEYS.LANGUAGE, newLang);
  };

  const t = (key: string, replacements?: Record<string, string | number>) => {
    return translateHelper(key, language, replacements);
  };

  return (
    <PWAContext.Provider
      value={{
        isOnline: isOnlineState,
        installPrompt,
        showInstallButton,
        triggerInstall,
        lastSyncTime,
        syncStatus,
        performManualSync,
        language,
        changeLanguage,
        t,
      }}
    >
      {children}
    </PWAContext.Provider>
  );
}

export function usePWA() {
  const context = useContext(PWAContext);
  if (!context) {
    throw new Error("usePWA must be used within a PWAProvider");
  }
  return context;
}
