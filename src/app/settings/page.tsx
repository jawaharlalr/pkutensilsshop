"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { db, SETTINGS_KEYS, getSetting } from "@/lib/db/dexie-db";
import { saveSetting, clearRemoteFirestore, triggerSync, sanitizePayload } from "@/lib/db/sync-engine";
import { Download, Upload, Trash2, CheckCircle2, RefreshCw, Activity } from "lucide-react";
import { usePWA } from "@/components/PWAProvider";

export default function SettingsPage() {
  const { 
    isOnline, 
    lastSyncTime, 
    syncStatus, 
    performManualSync, 
    t 
  } = usePWA();

  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("");
  const [startingNum, setStartingNum] = useState("");
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [printerSize, setPrinterSize] = useState("80mm");
  
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      setShopName(await getSetting(SETTINGS_KEYS.SHOP_NAME, "Prem's World Utensils Shop"));
      setShopAddress(await getSetting(SETTINGS_KEYS.SHOP_ADDRESS, "123 Retail Bazar, Shop Road"));
      setShopPhone(await getSetting(SETTINGS_KEYS.SHOP_PHONE, "9876543210"));
      setInvoicePrefix(await getSetting(SETTINGS_KEYS.INVOICE_PREFIX, "INV"));
      setStartingNum(await getSetting(SETTINGS_KEYS.STARTING_INVOICE_NUM, "1"));
      setInvoiceFooter(await getSetting(SETTINGS_KEYS.INVOICE_FOOTER, "Thank You, Visit Again!"));
      setPrinterSize(await getSetting(SETTINGS_KEYS.PRINTER_SIZE, "80mm"));
    }
    loadSettings();
  }, []);

  const showStatus = (type: "success" | "error", text: string) => {
    setStatusMessage({ type, text });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveSetting(SETTINGS_KEYS.SHOP_NAME, shopName);
      await saveSetting(SETTINGS_KEYS.SHOP_ADDRESS, shopAddress);
      await saveSetting(SETTINGS_KEYS.SHOP_PHONE, shopPhone);
      showStatus("success", t("set.successProfile"));
    } catch (err) {
      showStatus("error", t("set.errProfile"));
    }
  };

  const handleSaveInvoiceSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveSetting(SETTINGS_KEYS.INVOICE_PREFIX, invoicePrefix);
      await saveSetting(SETTINGS_KEYS.STARTING_INVOICE_NUM, startingNum);
      await saveSetting(SETTINGS_KEYS.INVOICE_FOOTER, invoiceFooter);
      await saveSetting(SETTINGS_KEYS.PRINTER_SIZE, printerSize);
      showStatus("success", t("set.successInvoice"));
    } catch (err) {
      showStatus("error", t("set.errInvoice"));
    }
  };

  // Backup data to JSON
  const handleExportBackup = async () => {
    try {
      const products = await db.products.toArray();
      const invoices = await db.invoices.toArray();
      const settings = await db.settings.toArray();

      const backupData = {
        version: 1,
        exportedAt: Date.now(),
        products,
        invoices,
        settings
      };

      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(backupData, null, 2)
      )}`;
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", jsonString);
      downloadAnchor.setAttribute("download", `utensils_pos_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showStatus("success", t("set.successBackup"));
    } catch (err) {
      showStatus("error", t("set.errBackup"));
    }
  };

  // Restore data from JSON
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json.products || !json.invoices || !json.settings) {
          showStatus("error", t("set.errStructure"));
          return;
        }

        // Restore to DB
        // Restore to DB and queue for Firestore sync
        await db.transaction("rw", [db.products, db.invoices, db.settings, db.syncQueue], async () => {
          await db.products.clear();
          await db.invoices.clear();
          await db.settings.clear();
          await db.syncQueue.clear();

          if (json.products && json.products.length > 0) {
            await db.products.bulkAdd(json.products);
            for (const prod of json.products) {
              await db.syncQueue.put({
                action: "update",
                collection: "products",
                docId: prod.code,
                payload: sanitizePayload(prod),
                timestamp: Date.now(),
              });
            }
          }

          if (json.invoices && json.invoices.length > 0) {
            await db.invoices.bulkAdd(json.invoices);
            for (const inv of json.invoices) {
              await db.syncQueue.put({
                action: "create",
                collection: "sales",
                docId: inv.invoiceNumber,
                payload: sanitizePayload(inv),
                timestamp: Date.now(),
              });
            }
          }

          if (json.settings && json.settings.length > 0) {
            await db.settings.bulkAdd(json.settings);
            for (const set of json.settings) {
              await db.syncQueue.put({
                action: "update",
                collection: "settings",
                docId: set.key,
                payload: sanitizePayload(set),
                timestamp: Date.now(),
              });
            }
          }
        });

        // Trigger background sync uploads immediately
        triggerSync();

        showStatus("success", t("set.successRestore"));
      } catch (err) {
        showStatus("error", t("set.errRestore"));
      }
    };
    reader.readAsText(file);
  };

  // Clear all local database and remote Firestore
  const handleClearDatabase = async () => {
    if (!confirm(t("set.clearConfirm"))) {
      return;
    }

    setIsClearing(true);
    try {
      // 1. Wipe remote Firestore data first
      await clearRemoteFirestore();

      // 2. Wipe local database tables
      await db.transaction("rw", [db.products, db.invoices, db.settings, db.syncQueue], async () => {
        await db.products.clear();
        await db.invoices.clear();
        await db.settings.clear();
        await db.syncQueue.clear();
      });
      showStatus("success", t("set.successClear"));
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      showStatus("error", t("set.errClear"));
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header (Subtitles removed) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("set.title")}</h1>
        </div>
      </div>

      {statusMessage && (
        <div className={`p-4 rounded-md flex items-center gap-2 text-sm font-semibold animate-in fade-in-50 ${
          statusMessage.type === "success" 
            ? "bg-success/15 text-success border border-success/20" 
            : "bg-destructive/15 text-destructive border border-destructive/20"
        }`}>
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{statusMessage.text}</span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Shop Profile settings card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("set.profileTitle")}</CardTitle>
            <CardDescription>{t("set.profileDesc")}</CardDescription>
          </CardHeader>
          <form onSubmit={handleSaveProfile}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("set.lblShopName")}</label>
                <Input value={shopName} onChange={(e) => setShopName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("set.lblAddress")}</label>
                <Input value={shopAddress} onChange={(e) => setShopAddress(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("set.lblPhone")}</label>
                <Input value={shopPhone} onChange={(e) => setShopPhone(e.target.value)} required />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" variant="default" className="w-full font-semibold">{t("set.btnSaveProfile")}</Button>
            </CardFooter>
          </form>
        </Card>

        {/* Invoice configuration settings card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("set.invoiceTitle")}</CardTitle>
            <CardDescription>{t("set.invoiceDesc")}</CardDescription>
          </CardHeader>
          <form onSubmit={handleSaveInvoiceSettings}>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("set.lblPrefix")}</label>
                  <Input value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("set.lblStarting")}</label>
                  <Input type="number" min="1" value={startingNum} onChange={(e) => setStartingNum(e.target.value)} required />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("set.lblPrinter")}</label>
                <Select value={printerSize} onChange={(e) => setPrinterSize(e.target.value)}>
                  <option value="58mm">58mm (Thermal)</option>
                  <option value="80mm">80mm (Thermal)</option>
                  <option value="A4">A4 (Standard Page)</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("set.lblFooter")}</label>
                <Input value={invoiceFooter} onChange={(e) => setInvoiceFooter(e.target.value)} required />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" variant="default" className="w-full font-semibold">{t("set.btnSaveInvoice")}</Button>
            </CardFooter>
          </form>
        </Card>

        {/* System & Sync Controls (Moved from Dashboard to Settings page) */}
        <Card>
          <CardHeader>
            <CardTitle>{t("dash.systemSync") || "System & Sync"}</CardTitle>
            <CardDescription>Monitor connectivity status and data integrity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm border-b pb-2">
                <span className="text-muted-foreground">{t("dash.internetStatus") || "Internet Status"}:</span>
                <span className={`font-semibold ${isOnline ? "text-success" : "text-destructive"}`}>
                  {isOnline ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm border-b pb-2">
                <span className="text-muted-foreground">{t("dash.syncEngine") || "Sync Engine"}:</span>
                <span className="font-semibold text-muted-foreground capitalize">
                  {syncStatus}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm border-b pb-2">
                <span className="text-muted-foreground">{t("dash.lastSyncTime") || "Last Sync Time"}:</span>
                <span className="font-semibold text-muted-foreground">
                  {lastSyncTime || "No sync yet"}
                </span>
              </div>
            </div>

            {isOnline && (
              <Button 
                onClick={performManualSync} 
                disabled={syncStatus === "syncing"} 
                variant="outline"
                className="w-full gap-2 font-semibold"
              >
                <RefreshCw className={`h-4 w-4 ${syncStatus === "syncing" && "animate-spin"}`} />
                {t("dash.forceSync") || "Force Sync Data"}
              </Button>
            )}

            <div className="p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground flex gap-2">
              <Activity className="h-4.5 w-4.5 shrink-0 text-primary" />
              <span>{t("dash.systemNote") || "All updates sync when online."}</span>
            </div>
          </CardContent>
        </Card>

        {/* Database backup and reset settings card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("set.dataTitle")}</CardTitle>
            <CardDescription>{t("set.dataDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-3 gap-4">
            {/* Export */}
            <div className="flex flex-col justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors">
              <div className="mb-4">
                <h4 className="font-semibold flex items-center gap-1.5"><Download className="h-4.5 w-4.5 text-primary" /> {t("set.backupCard")}</h4>
              </div>
              <Button onClick={handleExportBackup} variant="outline" className="w-full font-semibold">{t("set.btnBackup")}</Button>
            </div>

            {/* Import */}
            <div className="flex flex-col justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors">
              <div className="mb-4">
                <h4 className="font-semibold flex items-center gap-1.5"><Upload className="h-4.5 w-4.5 text-success" /> {t("set.restoreCard")}</h4>
              </div>
              <div className="relative">
                <input
                  type="file"
                  accept=".json"
                  id="backup-upload"
                  className="hidden"
                  onChange={handleImportBackup}
                />
                <Button 
                  onClick={() => document.getElementById("backup-upload")?.click()} 
                  variant="outline" 
                  className="w-full cursor-pointer font-semibold"
                >
                  {t("set.btnRestore")}
                </Button>
              </div>
            </div>

            {/* Clear Database (Warning subtitle stripped) */}
            <div className="flex flex-col justify-between p-4 border border-destructive/20 rounded-lg hover:bg-destructive/5 transition-colors">
              <div className="mb-4">
                <h4 className="font-semibold text-destructive flex items-center gap-1.5"><Trash2 className="h-4.5 w-4.5" /> {t("set.resetCard")}</h4>
              </div>
              <Button onClick={handleClearDatabase} disabled={isClearing} variant="destructive" className="w-full font-semibold">
                {t("set.btnReset")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
