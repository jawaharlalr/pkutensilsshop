"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getSetting, SETTINGS_KEYS } from "@/lib/db/dexie-db";
import { usePWA } from "@/components/PWAProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { 
  TrendingUp, 
  Package, 
  Receipt, 
  Plus, 
  ArrowUpRight,
  Printer
} from "lucide-react";

export default function DashboardPage() {
  const { t, language } = usePWA();
  const [currentTime, setCurrentTime] = useState("");

  // Print states
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [printDateTime, setPrintDateTime] = useState("");

  // Store metadata
  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [printerSize, setPrinterSize] = useState("80mm");

  // Live clock updates every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const dateString = now.toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric"
      });
      const timeString = now.toLocaleTimeString();
      setCurrentTime(`${dateString}  |  ${timeString}`);
    };
    updateTime();
    const clockInterval = setInterval(updateTime, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // Fetch shop metadata
  useEffect(() => {
    async function loadMeta() {
      setShopName(await getSetting(SETTINGS_KEYS.SHOP_NAME, "Prem's World Utensils Shop"));
      setShopAddress(await getSetting(SETTINGS_KEYS.SHOP_ADDRESS, "123 Retail Bazar, Shop Road"));
      setShopPhone(await getSetting(SETTINGS_KEYS.SHOP_PHONE, "9876543210"));
      setInvoiceFooter(await getSetting(SETTINGS_KEYS.INVOICE_FOOTER, "Thank You, Visit Again!"));
      setPrinterSize(await getSetting(SETTINGS_KEYS.PRINTER_SIZE, "80mm"));
    }
    loadMeta();
  }, []);

  // Load products count reactively
  const productsCount = useLiveQuery(() => db.products.count(), []);

  // Load invoices reactively
  const invoices = useLiveQuery(() => db.invoices.toArray(), []);

  const todayStr = new Date().toISOString().split("T")[0];

  // Calculations
  const todayInvoices = invoices?.filter((inv) => inv.date === todayStr && inv.isDeleted === 0) || [];
  const todaySales = todayInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);

  const activeInvoicesCount = invoices?.filter((inv) => inv.isDeleted === 0).length || 0;

  // Get recent 5 invoices
  const recentInvoices = invoices
    ? [...invoices]
        .sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0))
        .slice(0, 5)
    : [];

  const handlePrintInvoice = (inv: any) => {
    setSelectedInvoice(inv);
    const now = new Date();
    const formattedDate = now.toISOString().split("T")[0];
    const formattedTime = now.toTimeString().split(" ")[0];
    setPrintDateTime(`${formattedDate}  ${formattedTime}`);
    
    // Allow React state updates to render print layout before executing print dialog
    setTimeout(() => {
      window.print();
    }, 150);
  };

  return (
    <div className="space-y-6">
      {/* Screen-only UI Content */}
      <div className="no-print space-y-6">
        {/* Title Block with Live Clock */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-transparent">
              {t("dash.title")}
            </h1>
            <div className="text-sm font-bold text-muted-foreground mt-1 font-mono">
              {currentTime}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link 
              href="/pos" 
              className="inline-flex items-center justify-center rounded-md text-sm font-semibold transition-all bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-4 py-2 gap-1.5 shadow-sm active:scale-[0.98]"
            >
              <Plus className="h-4.5 w-4.5" /> {t("nav.pos")}
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Today's Sales */}
          <Card className="relative overflow-hidden group border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-bold text-muted-foreground">{t("dash.todaySales")}</CardTitle>
              <TrendingUp className="h-4.5 w-4.5 text-primary group-hover:scale-110 transition-transform" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black">₹{todaySales.toFixed(2)}</div>
            </CardContent>
          </Card>

          {/* Total Products */}
          <Card className="relative overflow-hidden group border-l-4 border-l-amber-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-bold text-muted-foreground">{t("dash.totalProducts")}</CardTitle>
              <Package className="h-4.5 w-4.5 text-amber-500 group-hover:scale-110 transition-transform" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black">{productsCount ?? 0}</div>
            </CardContent>
          </Card>

          {/* Total Invoices */}
          <Card className="relative overflow-hidden group border-l-4 border-l-emerald-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-bold text-muted-foreground">{t("dash.totalInvoices")}</CardTitle>
              <Receipt className="h-4.5 w-4.5 text-emerald-500 group-hover:scale-110 transition-transform" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black">{activeInvoicesCount}</div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Invoices Panel */}
        <Card className="w-full">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle>{t("dash.recentInvoices")}</CardTitle>
            </div>
            <Link 
              href="/sales" 
              className="inline-flex items-center justify-center rounded-md text-sm font-semibold transition-all hover:bg-muted text-muted-foreground h-9 px-3 gap-1 active:scale-[0.98]"
            >
              {t("dash.viewAll")} <ArrowUpRight className="h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">{t("pos.thSNo")}</TableHead>
                  <TableHead>{t("sales.thInvoiceNo")}</TableHead>
                  <TableHead>{t("sales.thDateTime")}</TableHead>
                  <TableHead className="text-right">{t("sales.thGrandTotal")}</TableHead>
                  <TableHead className="text-right w-20">{t("sales.thActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-24 text-muted-foreground text-sm">
                      {t("dash.noInvoices")}
                    </TableCell>
                  </TableRow>
                ) : (
                  recentInvoices.map((inv, idx) => (
                    <TableRow key={inv.id}>
                      <TableCell className="text-center font-medium text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-mono text-xs font-semibold">{inv.invoiceNumber}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">{inv.date} {inv.time}</TableCell>
                      <TableCell className="text-right font-bold">₹{inv.grandTotal.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          onClick={() => handlePrintInvoice(inv)}
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary hover:bg-primary/10"
                          title={t("sales.reprint")}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* PRINT-ONLY CONTAINER (quick-print reprint from dashboard) */}
      {selectedInvoice && (
        <div className={`hidden print-area print-${printerSize} font-mono text-black`}>
          <div style={{ textAlign: "center", borderBottom: "1px dashed black", paddingBottom: "10px", marginBottom: "10px" }}>
            <h2 style={{ margin: "0 0 5px 0", fontSize: "16px", fontWeight: "bold" }}>{shopName}</h2>
            <p style={{ margin: "0 0 5px 0", fontSize: "12px", whiteSpace: "pre-line" }}>{shopAddress}</p>
            <p style={{ margin: "0", fontSize: "12px" }}>PH: {shopPhone}</p>
          </div>
          <div style={{ fontSize: "12px", borderBottom: "1px dashed black", paddingBottom: "5px", marginBottom: "10px" }}>
            <div><b>{t("pos.invoiceNo")}:</b> {selectedInvoice.invoiceNumber}</div>
            <div><b>Date & Time:</b> {printDateTime || `${selectedInvoice.date}  ${selectedInvoice.time}`}</div>
            {selectedInvoice.isDeleted === 1 && <div style={{ color: "red", fontWeight: "bold", marginTop: "5px" }}>*** VOIDED BILL ***</div>}
          </div>
          
          {/* Lined Grid Invoice Table */}
          <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse", marginBottom: "10px" }}>
            <thead>
              <tr style={{ borderTop: "1px solid black", borderBottom: "1px solid black" }}>
                <th style={{ textAlign: "center", padding: "4px 2px", border: "1px solid black", width: "30px" }}>{t("pos.thSNo")}</th>
                <th style={{ textAlign: "left", padding: "4px 2px", border: "1px solid black" }}>{t("inv.lblItem")}</th>
                <th style={{ textAlign: "right", padding: "4px 2px", border: "1px solid black", width: "60px" }}>{t("pos.thPrice")}</th>
                <th style={{ textAlign: "center", padding: "4px 2px", border: "1px solid black", width: "45px" }}>{t("inv.lblQty")}</th>
                <th style={{ textAlign: "right", padding: "4px 2px", border: "1px solid black", width: "70px" }}>{t("inv.lblAmt")}</th>
              </tr>
            </thead>
            <tbody>
              {selectedInvoice.items.map((item: any, idx: number) => {
                const dispName = language === "ta" && item.nameTamil ? item.nameTamil : item.name;
                return (
                  <tr key={idx}>
                    <td style={{ textAlign: "center", padding: "4px 2px", border: "1px solid black" }}>{idx + 1}</td>
                    <td style={{ padding: "4px 2px", border: "1px solid black", wordBreak: "break-word" }}>{dispName}</td>
                    <td style={{ textAlign: "right", padding: "4px 2px", border: "1px solid black" }}>₹{item.sellingPrice.toFixed(2)}</td>
                    <td style={{ textAlign: "center", padding: "4px 2px", border: "1px solid black" }}>{item.quantity}</td>
                    <td style={{ textAlign: "right", padding: "4px 2px", border: "1px solid black" }}>₹{item.amount.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          <div style={{ borderTop: "1px dashed black", paddingTop: "5px", fontSize: "11px", display: "flex", flexDirection: "column", gap: "2px" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>TOTAL ITEMS:</span>
              <span>{selectedInvoice.items.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>TOTAL QTY:</span>
              <span>{selectedInvoice.items.reduce((s: number, i: any) => s + i.quantity, 0)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "13px", marginTop: "5px", borderTop: "1px solid black", paddingTop: "5px" }}>
              <span>{t("inv.lblGrand")}:</span>
              <span>₹{selectedInvoice.grandTotal.toFixed(2)}</span>
            </div>
          </div>
          <div style={{ textAlign: "center", borderTop: "1px dashed black", marginTop: "15px", paddingTop: "10px", fontSize: "11px" }}>
            {invoiceFooter}
          </div>
        </div>
      )}
    </div>
  );
}
