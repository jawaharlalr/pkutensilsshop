"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Home, 
  ShoppingCart, 
  Package, 
  History, 
  Settings as SettingsIcon, 
  Cloud, 
  CloudOff, 
  RefreshCw,
  Sun,
  Moon
} from "lucide-react";
import { usePWA } from "./PWAProvider";
import { cn } from "@/lib/utils";
import { getSetting, setSetting, SETTINGS_KEYS } from "@/lib/db/dexie-db";

export default function Navbar() {
  const pathname = usePathname();
  const { isOnline, lastSyncTime, syncStatus, performManualSync, language, changeLanguage, t } = usePWA();
  const [theme, setTheme] = useState<"light" | "dark">("light");

  // Load initial theme setting
  useEffect(() => {
    getSetting(SETTINGS_KEYS.THEME, "light").then((t) => {
      setTheme(t as "light" | "dark");
      if (t === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    });
  }, []);

  const toggleTheme = async () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    await setSetting(SETTINGS_KEYS.THEME, nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const navItems = [
    { label: t("nav.dashboard"), href: "/", icon: Home },
    { label: t("nav.pos"), href: "/pos", icon: ShoppingCart },
    { label: t("nav.products"), href: "/products", icon: Package },
    { label: t("nav.sales"), href: "/sales", icon: History },
    { label: t("nav.settings"), href: "/settings", icon: SettingsIcon },
  ];

  return (
    <>
      {/* Top Header / Desktop Navbar */}
      <header className="no-print sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-3 md:px-8">
          <div className="flex items-center gap-2">
            <img src="/favicon.ico" alt="Logo" className="h-8 w-8 rounded-full border border-primary/20 object-cover" />
            <div className="flex flex-col leading-none text-left select-none">
              <span className="font-black text-sm md:text-base text-primary tracking-tight">Prem's World</span>
              <span className="text-[9px] md:text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">Utensils Shop</span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 transition-colors hover:text-primary py-1 border-b-2 text-sm select-none",
                    isActive 
                      ? "border-primary text-foreground font-semibold" 
                      : "border-transparent text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Status Details */}
          <div className="flex items-center gap-2">
            {/* Language Selector */}
            <div className="flex items-center border rounded-md overflow-hidden bg-background h-8 shrink-0">
              <button
                onClick={() => changeLanguage("en")}
                className={cn(
                  "px-2 h-full text-[10px] md:text-xs font-semibold transition-colors cursor-pointer select-none",
                  language === "en" 
                    ? "bg-primary text-primary-foreground font-bold" 
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                EN
              </button>
              <button
                onClick={() => changeLanguage("ta")}
                className={cn(
                  "px-2 h-full text-[10px] md:text-xs font-semibold transition-colors cursor-pointer select-none",
                  language === "ta" 
                    ? "bg-primary text-primary-foreground font-bold" 
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                தமிழ்
              </button>
            </div>

            {/* Sync trigger */}
            {isOnline && (
              <button
                onClick={performManualSync}
                disabled={syncStatus === "syncing"}
                title="Sync Now"
                className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50 flex items-center justify-center cursor-pointer h-8 w-8"
              >
                <RefreshCw className={cn("h-4 w-4", syncStatus === "syncing" && "animate-spin")} />
              </button>
            )}

            {/* Offline/Online status dot */}
            <div
              className="flex items-center justify-center h-8 w-8 select-none"
              title={isOnline ? "Online" : "Offline"}
            >
              <span
                className={cn(
                  "h-3 w-3 rounded-full shrink-0 border border-background shadow-sm transition-all",
                  isOnline ? "bg-success status-dot-pulse" : "bg-destructive"
                )}
              />
            </div>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              aria-label="Toggle Theme"
              className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors flex items-center justify-center cursor-pointer h-8 w-8"
            >
              {theme === "light" ? <Moon className="h-4.5 w-4.5" /> : <Sun className="h-4.5 w-4.5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Bottom navbar for Mobile Screens */}
      <nav className="no-print md:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/60 shadow-lg px-2 py-1 flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 py-1 rounded-md transition-colors",
                isActive 
                  ? "text-primary font-semibold" 
                  : "text-muted-foreground"
              )}
            >
              <Icon className="h-5.5 w-5.5" />
              <span className="text-[10px] tracking-wide">{item.label === t("nav.pos") ? "POS" : item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
