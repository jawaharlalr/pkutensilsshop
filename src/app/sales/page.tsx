"use client";

import React, { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Invoice } from "@/lib/db/dexie-db";
import { deleteInvoice } from "@/lib/db/sync-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSetting, SETTINGS_KEYS } from "@/lib/db/dexie-db";
import { Search, History, Calendar, Printer, Trash2, Eye, ShieldAlert } from "lucide-react";
import { usePWA } from "@/components/PWAProvider";

export default function SalesHistoryPage() {
  const { t, language } = usePWA();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [showVoided, setShowVoided] = useState(false);

  // Shop details for printing
  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [printerSize, setPrinterSize] = useState("80mm");

  // Print datetime state (only evaluated when printing starts)
  const [printDateTime, setPrintDateTime] = useState("");

  // Load invoices reactively from Dexie
  const invoices = useLiveQuery(() => {
    return db.invoices.toArray();
  }, []);

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

  const filteredInvoices = invoices?.filter((inv) => {
    // Filter out voided unless checked
    if (!showVoided && inv.isDeleted === 1) return false;
    
    // Search filter
    const matchesQuery = inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase().trim());
    
    // Date filter
    const matchesDate = filterDate === "" ? true : inv.date === filterDate;
    
    return matchesQuery && matchesDate;
  }) || [];

  // Calculate totals of filtered records
  const totalSalesAmount = filteredInvoices
    .filter((i) => i.isDeleted === 0)
    .reduce((sum, inv) => sum + inv.grandTotal, 0);

  const handleOpenDetails = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setIsDetailOpen(true);
  };

  const handleVoidInvoice = async (invoiceNumber: string) => {
    if (confirm(t("sales.voidConfirm"))) {
      try {
        await deleteInvoice(invoiceNumber);
        setIsDetailOpen(false);
        setSelectedInvoice(null);
      } catch (err) {
        alert("Failed to void invoice.");
      }
    }
  };

  const handlePrint = () => {
    const now = new Date();
    const formattedDate = now.toISOString().split("T")[0];
    const formattedTime = now.toTimeString().split(" ")[0];
    setPrintDateTime(`${formattedDate}  ${formattedTime}`);
    
    setTimeout(() => {
      window.print();
    }, 100);
  };

  return (
    <div className="space-y-6">
      <div className="no-print space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("sales.title")}</h1>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
        {/* Left column: Filters & stats card */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{t("sales.filterTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("sales.lblInvoiceNo")}</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search invoice number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("sales.lblFilterDate")}</label>
                <div className="relative">
                  <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="show-voided"
                  checked={showVoided}
                  onChange={(e) => setShowVoided(e.target.checked)}
                  className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                />
                <label htmlFor="show-voided" className="text-sm font-medium text-muted-foreground select-none cursor-pointer">
                  {t("sales.lblShowVoided")}
                </label>
              </div>

              <hr className="my-2 border-dashed" />

              <div className="p-3 bg-primary/10 rounded-md border border-primary/20">
                <div className="text-xs text-muted-foreground">{t("sales.lblFilteredSales")}</div>
                <div className="text-2xl font-bold text-primary mt-1">₹{totalSalesAmount.toFixed(2)}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {t("sales.lblActiveInv")}: {filteredInvoices.filter((i) => i.isDeleted === 0).length}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right columns: Invoices Table */}
        <div className="md:col-span-3 border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("sales.thInvoiceNo")}</TableHead>
                <TableHead>{t("sales.thDateTime")}</TableHead>
                <TableHead className="text-right">{t("sales.thGrandTotal")}</TableHead>
                <TableHead className="text-right">{t("sales.thActions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                    {t("sales.noInvoices")}
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono font-semibold">{inv.invoiceNumber}</TableCell>
                    <TableCell>
                      <div className="font-medium">{inv.date}</div>
                      <div className="text-xs text-muted-foreground">{inv.time}</div>
                    </TableCell>
                    <TableCell className="text-right font-bold">₹{inv.grandTotal.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          onClick={() => handleOpenDetails(inv)}
                          variant="outline"
                          size="sm"
                          className="gap-1 px-2.5 h-8 text-primary border-primary/20 hover:bg-primary/5"
                        >
                          <Eye className="h-3.5 w-3.5" /> {t("sales.btnView")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      </div>

      {/* Invoice Detail modal */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogHeader>
          <div className="flex justify-between items-center mr-6">
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" /> {t("sales.dialogTitle")}
            </DialogTitle>
            {selectedInvoice?.isDeleted === 1 && (
              <span className="bg-destructive/15 text-destructive px-2.5 py-0.5 rounded-full text-xs font-bold border border-destructive/30">
                {t("sales.voidedTag")}
              </span>
            )}
          </div>
          <DialogDescription>{t("sales.dialogDesc")}</DialogDescription>
        </DialogHeader>
        <DialogContent>
          {selectedInvoice && (
            <div className="border p-4 rounded-md bg-muted/20 font-mono text-sm max-h-[50vh] overflow-y-auto">
              <div className="text-center font-bold border-b pb-2 mb-2">
                <h3 className="text-lg">{shopName}</h3>
                <p className="text-xs font-normal whitespace-pre-line">{shopAddress}</p>
                <p className="text-xs font-normal">{t("inv.lblPhone")}: {shopPhone}</p>
              </div>
              <div className="space-y-1 text-xs border-b pb-2 mb-2">
                <div><b>{t("pos.invoiceNo")}:</b> {selectedInvoice.invoiceNumber}</div>
                <div><b>{t("inv.lblDate")}:</b> {selectedInvoice.date} {selectedInvoice.time}</div>
              </div>
              {/* Lined Grid Preview in Detail Dialog */}
              <table className="w-full text-xs mb-2 border-collapse">
                <thead>
                  <tr className="border-y border-black bg-muted/50">
                    <th className="text-center py-1.5 px-1 border border-black w-8">{t("pos.thSNo")}</th>
                    <th className="text-left py-1.5 px-1 border border-black">{t("inv.lblItem")}</th>
                    <th className="text-right py-1.5 px-1 border border-black w-14">{t("pos.thPrice")}</th>
                    <th className="text-center py-1.5 px-1 border border-black w-10">{t("inv.lblQty")}</th>
                    <th className="text-right py-1.5 px-1 border border-black w-16">{t("inv.lblAmt")}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.items.map((item, idx) => {
                    const dispName = language === "ta" && item.nameTamil ? item.nameTamil : item.name;
                    return (
                      <tr key={idx}>
                        <td className="text-center py-1 px-1 border border-black">{idx + 1}</td>
                        <td className="py-1 px-1 border border-black">{dispName}</td>
                        <td className="text-right py-1 px-1 border border-black">₹{item.sellingPrice.toFixed(2)}</td>
                        <td className="text-center py-1 px-1 border border-black">{item.quantity}</td>
                        <td className="text-right py-1 px-1 border border-black">₹{item.amount.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="border-t pt-2 space-y-1 text-xs font-normal">
                <div className="flex justify-between">
                  <span>{t("pos.totalItems")}:</span>
                  <span>{selectedInvoice.items.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t("pos.totalQty")}:</span>
                  <span>{selectedInvoice.items.reduce((s, i) => s + i.quantity, 0)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t pt-1">
                  <span>{t("inv.lblGrand")}:</span>
                  <span>₹{selectedInvoice.grandTotal.toFixed(2)}</span>
                </div>
              </div>
              <div className="text-center text-xs font-normal border-t mt-4 pt-2">
                {invoiceFooter}
              </div>
            </div>
          )}
        </DialogContent>
        <DialogFooter className="flex justify-between items-center w-full">
          {selectedInvoice && selectedInvoice.isDeleted === 0 ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => handleVoidInvoice(selectedInvoice.invoiceNumber)}
              className="gap-1.5 shrink-0"
            >
              <Trash2 className="h-4 w-4" /> {t("sales.btnVoid")}
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
              <ShieldAlert className="h-4 w-4 text-amber-500" /> {t("sales.cannotModify")}
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setIsDetailOpen(false)}>
              {t("pos.close")}
            </Button>
            <Button type="button" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-4 w-4" /> {t("sales.reprint")}
            </Button>
          </div>
        </DialogFooter>
      </Dialog>

      {/* PRINT-ONLY CONTAINER */}
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
          
          {/* Lined Grid Invoice Table - 5 Columns: S.No, Item, Price, Qty, Amount (No Code) */}
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
              {selectedInvoice.items.map((item, idx) => {
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
              <span>{selectedInvoice.items.reduce((s, i) => s + i.quantity, 0)}</span>
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
