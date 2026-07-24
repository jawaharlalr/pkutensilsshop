"use client";

import React, { useEffect, useState, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Product, type InvoiceItem } from "@/lib/db/dexie-db";
import { saveInvoice } from "@/lib/db/sync-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSetting, SETTINGS_KEYS } from "@/lib/db/dexie-db";
import { Search, ShoppingCart, Trash2, Plus, Minus, Receipt, CheckCircle, RefreshCw, Printer } from "lucide-react";
import { usePWA } from "@/components/PWAProvider";

export default function POSPage() {
  const { t, language } = usePWA();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [cart, setCart] = useState<{ product: Product; quantity: number; customizedPrice?: number }[]>([]);
  
  // Invoice details
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // Store information for printed invoice
  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [printerSize, setPrinterSize] = useState("80mm");

  // Print datetime state (only evaluated when printing starts)
  const [printDateTime, setPrintDateTime] = useState("");

  // Dialog overlays
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [lastSavedInvoice, setLastSavedInvoice] = useState<any>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load products reactively
  const products = useLiveQuery(() => db.products.toArray(), []);

  // Fetch shop metadata and generate next invoice number
  useEffect(() => {
    async function loadMeta() {
      setShopName(await getSetting(SETTINGS_KEYS.SHOP_NAME, "Prem's World Utensils Shop"));
      setShopAddress(await getSetting(SETTINGS_KEYS.SHOP_ADDRESS, "123 Retail Bazar, Shop Road"));
      setShopPhone(await getSetting(SETTINGS_KEYS.SHOP_PHONE, "9876543210"));
      setInvoiceFooter(await getSetting(SETTINGS_KEYS.INVOICE_FOOTER, "Thank You, Visit Again!"));
      setPrinterSize(await getSetting(SETTINGS_KEYS.PRINTER_SIZE, "80mm"));

      const nextNum = await generateNextInvoiceNumber();
      setInvoiceNumber(nextNum);
    }
    loadMeta();
    
    // Focus search input on mount
    searchInputRef.current?.focus();
  }, []);

  // Search logic
  useEffect(() => {
    if (!products || searchQuery.trim() === "") {
      setSearchResults([]);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    
    // Check if barcode exact match
    const exactMatch = products.find((p) => p.code.toLowerCase() === query);
    if (exactMatch) {
      addToCart(exactMatch);
      setSearchQuery("");
      return;
    }

    const matches = products.filter(
      (p) => p.name.toLowerCase().includes(query) || 
             p.code.toLowerCase().includes(query) || 
             (p.nameTamil && p.nameTamil.toLowerCase().includes(query))
    );
    setSearchResults(matches.slice(0, 5)); // Limit to 5 results
  }, [searchQuery, products]);

  const generateNextInvoiceNumber = async () => {
    const prefix = await getSetting(SETTINGS_KEYS.INVOICE_PREFIX, "INV");
    const startingVal = await getSetting(SETTINGS_KEYS.STARTING_INVOICE_NUM, "1");
    const startingNum = parseInt(startingVal, 10) || 1;

    const invoices = await db.invoices.toArray();
    if (invoices.length === 0) {
      return `${prefix}-${String(startingNum).padStart(6, "0")}`;
    }

    let maxNum = startingNum - 1;
    const prefixRegex = new RegExp(`^${prefix}-(\\d+)$`);
    for (const inv of invoices) {
      const match = inv.invoiceNumber.match(prefixRegex);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    return `${prefix}-${String(maxNum + 1).padStart(6, "0")}`;
  };

  const addToCart = (product: Product) => {
    const existing = cart.find((item) => item.product.code === product.code);
    if (existing) {
      setCart(
        cart.map((item) =>
          item.product.code === product.code
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
    searchInputRef.current?.focus();
  };

  const updateQuantity = (code: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(code);
      return;
    }
    setCart(
      cart.map((item) =>
        item.product.code === code ? { ...item, quantity: newQty } : item
      )
    );
  };

  const updatePrice = (code: string, newPriceStr: string) => {
    const priceNum = Number(newPriceStr);
    setCart(
      cart.map((item) =>
        item.product.code === code
          ? { ...item, customizedPrice: isNaN(priceNum) ? undefined : priceNum }
          : item
      )
    );
  };

  const removeFromCart = (code: string) => {
    setCart(cart.filter((item) => item.product.code !== code));
  };

  const calculateSubtotal = () => {
    return cart.reduce((total, item) => {
      const price = item.customizedPrice !== undefined ? item.customizedPrice : item.product.sellingPrice;
      return total + price * item.quantity;
    }, 0);
  };

  const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
  const totalItems = cart.length;
  const grandTotal = calculateSubtotal();

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    const date = new Date();
    const formattedDate = date.toISOString().split("T")[0]; // YYYY-MM-DD
    const formattedTime = date.toTimeString().split(" ")[0]; // HH:MM:SS

    const invoiceItems: InvoiceItem[] = cart.map((item) => {
      const price = item.customizedPrice !== undefined ? item.customizedPrice : item.product.sellingPrice;
      return {
        code: item.product.code,
        name: item.product.name,
        nameTamil: item.product.nameTamil,
        sellingPrice: price,
        quantity: item.quantity,
        amount: price * item.quantity,
      };
    });

    const newInvoice = {
      invoiceNumber,
      date: formattedDate,
      time: formattedTime,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      items: invoiceItems,
      grandTotal,
      synced: 0,
      isDeleted: 0,
      lastUpdated: Date.now(),
    };

    try {
      await saveInvoice(newInvoice);

      setLastSavedInvoice(newInvoice);
      setPrintDateTime(`${formattedDate}  ${formattedTime}`);

      // Auto-trigger browser print dialog for immediate printing
      setTimeout(() => {
        window.print();
      }, 100);

      setIsSuccessModalOpen(true);

      // Reset cart and invoice number
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      const nextNum = await generateNextInvoiceNumber();
      setInvoiceNumber(nextNum);
    } catch (err) {
      alert("Failed to process transaction.");
    }
  };

  const handleCancelBill = () => {
    if (cart.length === 0) return;
    if (confirm(t("pos.cancelConfirm"))) {
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
    }
  };

  const handlePrint = () => {
    const now = new Date();
    const formattedDate = now.toISOString().split("T")[0];
    const formattedTime = now.toTimeString().split(" ")[0];
    setPrintDateTime(`${formattedDate}  ${formattedTime}`);
    
    // Tiny timeout ensures the printDateTime state propagates to the print container layout before print triggers
    setTimeout(() => {
      window.print();
    }, 100);
  };

  return (
    <div className="space-y-6">
      <div className="no-print space-y-6">
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{t("pos.title")}</h1>
          </div>
          <div className="text-right">
            <span className="text-sm font-semibold text-muted-foreground">{t("pos.invoiceNo")}:</span>
            <div className="text-lg font-mono font-bold text-primary">{invoiceNumber}</div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
        {/* Left Side: Product Search panel */}
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-primary" /> {t("pos.addProducts")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3.5 h-4.5 w-4.5 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  placeholder={t("pos.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-11 text-base"
                />
              </div>

              {/* Live Search dropdown */}
              {searchResults.length > 0 && (
                <div className="border rounded-md divide-y bg-background shadow-sm animate-in fade-in-50">
                  {searchResults.map((p) => {
                    const dispName = p.name;
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          addToCart(p);
                          setSearchQuery("");
                        }}
                        className="w-full flex items-center justify-between p-3.5 hover:bg-muted text-left cursor-pointer"
                      >
                        <div>
                          <div className="font-semibold">{p.name}</div>
                          {p.nameTamil && <div className="text-xs font-normal text-muted-foreground">{p.nameTamil}</div>}
                          <div className="text-xs font-mono text-muted-foreground">{p.code}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-primary">₹{p.sellingPrice.toFixed(2)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cart Table panel */}
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table className="w-full text-xs sm:text-sm">
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-7 sm:w-12 text-center py-2 px-1 text-[11px] sm:text-xs">{t("pos.thSNo")}</TableHead>
                    <TableHead className="py-2 px-1 sm:px-3 text-[11px] sm:text-xs">{t("pos.thProduct")}</TableHead>
                    <TableHead className="text-center w-14 sm:w-24 py-2 px-1 text-[11px] sm:text-xs">{t("pos.thPrice")}</TableHead>
                    <TableHead className="text-center w-20 sm:w-32 py-2 px-1 text-[11px] sm:text-xs">{t("pos.thQty")}</TableHead>
                    <TableHead className="text-right w-16 sm:w-24 py-2 px-1 text-[11px] sm:text-xs">{t("pos.thAmt")}</TableHead>
                    <TableHead className="w-7 sm:w-12 py-2 px-0.5"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center h-48 text-muted-foreground">
                        {t("pos.emptyCart")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    cart.map((item, idx) => {
                      const activePrice = item.customizedPrice !== undefined ? item.customizedPrice : item.product.sellingPrice;
                      return (
                        <TableRow key={item.product.id} className="align-middle">
                          <TableCell className="text-center font-medium text-muted-foreground align-middle py-2 px-1 text-[10px] sm:text-xs">{idx + 1}</TableCell>
                          <TableCell className="align-middle py-2 px-1 sm:px-3">
                            <div className="flex flex-col gap-0.5 max-w-[110px] sm:max-w-none">
                              <span className="font-semibold text-xs sm:text-sm leading-tight break-words">{item.product.name}</span>
                              {item.product.nameTamil && (
                                <span className="text-[11px] text-muted-foreground leading-tight break-words">{item.product.nameTamil}</span>
                              )}
                              <span className="text-[10px] font-mono text-muted-foreground/80">{item.product.code}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center align-middle py-2 px-0.5">
                            <Input
                              type="number"
                              value={activePrice}
                              onChange={(e) => updatePrice(item.product.code, e.target.value)}
                              className="w-14 sm:w-20 text-center h-7 sm:h-8 px-0.5 font-semibold text-xs mx-auto"
                            />
                          </TableCell>
                          <TableCell className="text-center align-middle py-2 px-0.5">
                            <div className="flex items-center justify-center gap-0.5 sm:gap-1">
                              <Button
                                onClick={() => updateQuantity(item.product.code, item.quantity - 1)}
                                variant="outline"
                                size="icon"
                                className="h-6 w-6 sm:h-7 sm:w-7 shrink-0 p-0"
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateQuantity(item.product.code, parseInt(e.target.value, 10) || 0)}
                                className="w-8 sm:w-12 text-center h-6 sm:h-7 px-0 font-bold text-xs"
                              />
                              <Button
                                onClick={() => updateQuantity(item.product.code, item.quantity + 1)}
                                variant="outline"
                                size="icon"
                                className="h-6 w-6 sm:h-7 sm:w-7 shrink-0 p-0"
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-bold text-xs sm:text-sm align-middle py-2 px-1 whitespace-nowrap">
                            ₹{(activePrice * item.quantity).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-center align-middle py-2 px-0.5">
                            <Button
                              onClick={() => removeFromCart(item.product.code)}
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Billing summary panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("pos.checkoutSummary")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("pos.custName")}</label>
                <Input
                  placeholder="e.g. John Doe"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("pos.custPhone")}</label>
                <Input
                  placeholder="e.g. 9876543210"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>

              <hr className="my-2 border-dashed" />

              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{t("pos.totalItems")}:</span>
                <span className="font-semibold">{totalItems}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">{t("pos.totalQty")}:</span>
                <span className="font-semibold">{totalQty}</span>
              </div>
              <div className="flex justify-between items-center text-lg font-bold">
                <span>{t("pos.grandTotal")}:</span>
                <span className="text-primary text-xl">₹{grandTotal.toFixed(2)}</span>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button
                onClick={handleCheckout}
                disabled={cart.length === 0}
                className="w-full h-12 text-base font-bold gap-2"
                variant="success"
              >
                <Printer className="h-5 w-5" /> {t("pos.saveBill")}
              </Button>
              <Button
                onClick={handleCancelBill}
                disabled={cart.length === 0}
                className="w-full"
                variant="outline"
              >
                {t("pos.cancelBill")}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
      </div>

      {/* Success Dialog overlay */}
      <Dialog open={isSuccessModalOpen} onOpenChange={setIsSuccessModalOpen}>
        <DialogHeader>
          <div className="flex items-center gap-2 text-success">
            <CheckCircle className="h-6 w-6" />
            <DialogTitle>{t("pos.invoiceSaved")}</DialogTitle>
          </div>
          <DialogDescription>{t("pos.invoiceSavedSub")}</DialogDescription>
        </DialogHeader>
        <DialogContent>
          {lastSavedInvoice && (
            <div className="border p-4 rounded-md bg-muted/20 font-mono text-sm max-h-[50vh] overflow-y-auto">
              <div className="text-center font-bold border-b pb-2 mb-2">
                <h3 className="text-lg">{shopName}</h3>
                <p className="text-xs font-normal whitespace-pre-line">{shopAddress}</p>
                <p className="text-xs font-normal">{t("inv.lblPhone")}: {shopPhone}</p>
              </div>
              <div className="space-y-1 text-xs border-b pb-2 mb-2">
                <div><b>{t("pos.invoiceNo")}:</b> {lastSavedInvoice.invoiceNumber}</div>
                <div><b>{t("inv.lblDate")}:</b> {lastSavedInvoice.date} {lastSavedInvoice.time}</div>
                {lastSavedInvoice.customerName && <div><b>{t("inv.lblCustomer")}:</b> {lastSavedInvoice.customerName}</div>}
                {lastSavedInvoice.customerPhone && <div><b>{t("inv.lblPhone")}:</b> {lastSavedInvoice.customerPhone}</div>}
              </div>
              {/* Lined Grid Preview in Success Modal */}
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
                  {lastSavedInvoice.items.map((item: any, idx: number) => {
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
                  <span>{lastSavedInvoice.items.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t("pos.totalQty")}:</span>
                  <span>{lastSavedInvoice.items.reduce((s: number, i: any) => s + i.quantity, 0)}</span>
                </div>
                <div className="flex justify-between font-bold text-sm border-t pt-1">
                  <span>{t("inv.lblGrand")}:</span>
                  <span>₹{lastSavedInvoice.grandTotal.toFixed(2)}</span>
                </div>
              </div>
              <div className="text-center text-xs font-normal border-t mt-4 pt-2">
                {invoiceFooter}
              </div>
            </div>
          )}
        </DialogContent>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setIsSuccessModalOpen(false)}>
            {t("pos.close")}
          </Button>
          <Button type="button" onClick={handlePrint} className="gap-1.5">
            <Receipt className="h-4 w-4" /> {t("pos.printInvoice")}
          </Button>
        </DialogFooter>
      </Dialog>

      {/* PRINT-ONLY CONTAINER (Completely hidden on screen, visible only during print) */}
      {lastSavedInvoice && (
        <div className={`hidden print-area print-${printerSize} font-mono text-black`}>
          <div style={{ textAlign: "center", borderBottom: "1px dashed black", paddingBottom: "10px", marginBottom: "10px" }}>
            <h2 style={{ margin: "0 0 5px 0", fontSize: "16px", fontWeight: "bold" }}>{shopName}</h2>
            <p style={{ margin: "0 0 5px 0", fontSize: "12px", whiteSpace: "pre-line" }}>{shopAddress}</p>
            <p style={{ margin: "0", fontSize: "12px" }}>PH: {shopPhone}</p>
          </div>
          <div style={{ fontSize: "12px", borderBottom: "1px dashed black", paddingBottom: "5px", marginBottom: "10px" }}>
            <div><b>{t("pos.invoiceNo")}:</b> {lastSavedInvoice.invoiceNumber}</div>
            <div><b>Date & Time:</b> {printDateTime || `${lastSavedInvoice.date}  ${lastSavedInvoice.time}`}</div>
            {lastSavedInvoice.customerName && <div><b>Customer:</b> {lastSavedInvoice.customerName}</div>}
            {lastSavedInvoice.customerPhone && <div><b>Phone:</b> {lastSavedInvoice.customerPhone}</div>}
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
              {lastSavedInvoice.items.map((item: any, idx: number) => {
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
              <span>{lastSavedInvoice.items.length}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>TOTAL QTY:</span>
              <span>{lastSavedInvoice.items.reduce((s: number, i: any) => s + i.quantity, 0)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "13px", marginTop: "5px", borderTop: "1px solid black", paddingTop: "5px" }}>
              <span>{t("inv.lblGrand")}:</span>
              <span>₹{lastSavedInvoice.grandTotal.toFixed(2)}</span>
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
