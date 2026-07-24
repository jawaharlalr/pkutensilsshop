"use client";

import React, { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie-db";
import { saveProduct, deleteProduct } from "@/lib/db/sync-engine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search, Edit2, Trash2, Download, Upload, AlertCircle, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import { usePWA } from "@/components/PWAProvider";

export default function ProductsPage() {
  const { t } = usePWA();

  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);

  // Form states
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [nameTamil, setNameTamil] = useState("");
  const [category, setCategory] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Import summary states
  const [importSummary, setImportSummary] = useState<{ imported: number; updated: number; failed: number } | null>(null);

  // Load products reactively from Dexie
  const products = useLiveQuery(() => {
    return db.products.toArray();
  }, []);

  const filteredProducts = products?.filter((p) => {
    const query = searchQuery.toLowerCase().trim();
    return p.name.toLowerCase().includes(query) || 
           p.code.toLowerCase().includes(query) ||
           (p.nameTamil && p.nameTamil.toLowerCase().includes(query)) ||
           (p.category && p.category.toLowerCase().includes(query));
  }) || [];

  const resetForm = () => {
    setCode("");
    setName("");
    setNameTamil("");
    setCategory("");
    setSellingPrice("");
    setErrorMsg("");
    setEditingProduct(null);
  };

  const handleOpenAddModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (product: any) => {
    setEditingProduct(product);
    setCode(product.code);
    setName(product.name);
    setNameTamil(product.nameTamil || "");
    setCategory(product.category || "");
    setSellingPrice(String(product.sellingPrice));
    setErrorMsg("");
    setIsModalOpen(true);
  };

  const generateRandomCode = () => {
    const rand = "UT-" + Math.floor(100000 + Math.random() * 900000);
    setCode(rand);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const priceNum = Number(sellingPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      setErrorMsg(t("prod.errPrice"));
      return;
    }

    // Check code uniqueness
    const normalizedCode = code.trim().toUpperCase();
    const existing = await db.products.where("code").equals(normalizedCode).first();
    if (existing && (!editingProduct || existing.id !== editingProduct.id)) {
      setErrorMsg(t("prod.errCode"));
      return;
    }

    const productData = {
      code: normalizedCode,
      name: name.trim(),
      nameTamil: nameTamil.trim() || undefined,
      category: category.trim() || undefined,
      sellingPrice: priceNum,
      lastUpdated: Date.now()
    };

    try {
      if (editingProduct) {
        await saveProduct({ ...editingProduct, ...productData });
      } else {
        await saveProduct(productData);
      }
      setIsModalOpen(false);
      resetForm();
    } catch (err) {
      setErrorMsg(t("prod.errSave"));
    }
  };

  const handleDelete = async (productCode: string) => {
    if (confirm(t("prod.deleteConfirm"))) {
      await deleteProduct(productCode);
    }
  };

  // Bulk Excel/CSV Import
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any>(sheet);

        let imported = 0;
        let updated = 0;
        let failed = 0;

        for (const row of rows) {
          const itemCode = String(row.Code || row.code || row["Product Code"] || "").trim().toUpperCase();
          const itemName = String(row.Name || row.name || row["Product Name"] || "").trim();
          const itemNameTamil = String(row["Name Tamil"] || row.nameTamil || row["Name (Tamil)"] || row["Product Name Tamil"] || "").trim();
          const itemCategory = String(row.Category || row.category || "").trim();
          const itemPrice = Number(row.Price || row.price || row["Selling Price"] || 0);

          if (!itemCode || !itemName || isNaN(itemPrice) || itemPrice < 0) {
            failed++;
            continue;
          }

          const existing = await db.products.where("code").equals(itemCode).first();
          const productData = {
            code: itemCode,
            name: itemName,
            nameTamil: itemNameTamil || undefined,
            category: itemCategory || undefined,
            sellingPrice: itemPrice,
          };

          if (existing) {
            await saveProduct({ ...existing, ...productData });
            updated++;
          } else {
            await saveProduct(productData);
            imported++;
          }
        }

        setImportSummary({ imported, updated, failed });
        setTimeout(() => setImportSummary(null), 5000);
      } catch (error) {
        alert("Failed to parse file. Please verify column headers.");
      }
    };
    reader.readAsBinaryString(file);
  };

  // Excel/CSV Export
  const handleExportData = async (format: "excel" | "csv") => {
    const records = await db.products.toArray();
    if (records.length === 0) {
      alert("No products to export!");
      return;
    }

    const data = records.map((p) => ({
      "Product Code": p.code,
      "Product Name": p.name,
      "Product Name (Tamil)": p.nameTamil || "",
      "Category": p.category || "",
      "Selling Price": p.sellingPrice,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Products");

    if (format === "excel") {
      XLSX.writeFile(workbook, `products_export_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
      XLSX.writeFile(workbook, `products_export_${new Date().toISOString().split('T')[0]}.csv`, { bookType: "csv" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("prod.title")}</h1>
        </div>
      {/* Export & Action buttons */}
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <Button onClick={() => handleExportData("excel")} variant="outline" size="sm" className="gap-1 px-2.5 h-8 text-xs font-semibold">
          <Download className="h-3.5 w-3.5" /> {t("prod.exportExcel")}
        </Button>
        <Button onClick={() => handleExportData("csv")} variant="outline" size="sm" className="gap-1 px-2.5 h-8 text-xs font-semibold">
          <Download className="h-3.5 w-3.5" /> {t("prod.exportCsv")}
        </Button>

        {/* Import file input */}
        <div className="relative">
          <input
            type="file"
            accept=".xlsx,.csv"
            id="product-import"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button onClick={() => document.getElementById("product-import")?.click()} variant="outline" size="sm" className="gap-1 px-2.5 h-8 text-xs font-semibold">
            <Upload className="h-3.5 w-3.5" /> {t("prod.importExcel")}
          </Button>
        </div>

        <Button onClick={handleOpenAddModal} size="sm" className="gap-1 px-3 h-8 text-xs font-semibold ml-auto sm:ml-0">
          <Plus className="h-3.5 w-3.5" /> {t("prod.addBtn")}
        </Button>
      </div>
      </div>

      {importSummary && (
        <div className="p-3 bg-muted border rounded-md text-xs space-y-1 animate-in fade-in-50">
          <h4 className="font-bold flex items-center gap-1.5 text-primary"><AlertCircle className="h-4 w-4" /> {t("prod.importReport")}</h4>
          <p>{t("prod.importReportSub", { imported: importSummary.imported, updated: importSummary.updated, failed: importSummary.failed })}</p>
        </div>
      )}

      {/* Search and Table */}
      <div className="flex items-center gap-2 max-w-sm">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("prod.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-xs sm:text-sm"
          />
        </div>
      </div>

      <div className="border rounded-md bg-card overflow-x-auto">
        <Table className="w-full text-xs sm:text-sm">
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="w-6 sm:w-12 text-center py-2 px-1 text-[11px] sm:text-xs">{t("pos.thSNo")}</TableHead>
              <TableHead className="py-2 px-1 sm:px-3 text-[11px] sm:text-xs">{t("prod.thName")}</TableHead>
              <TableHead className="hidden sm:table-cell py-2 px-2 text-[11px] sm:text-xs">{t("prod.thCategory")}</TableHead>
              <TableHead className="text-right w-16 sm:w-24 py-2 px-1 text-[11px] sm:text-xs">{t("prod.thPrice")}</TableHead>
              <TableHead className="text-right w-16 sm:w-20 py-2 px-1 text-[11px] sm:text-xs">{t("prod.thActions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products === undefined ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                  <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                    <span>Loading products...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                  {t("prod.noProducts")}
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((p, idx) => (
                <TableRow key={p.id} className="align-middle">
                  <TableCell className="text-center font-medium text-muted-foreground align-middle py-2 px-1 text-[10px] sm:text-xs">{idx + 1}</TableCell>
                  <TableCell className="align-middle py-2 px-1 sm:px-3">
                    <div className="flex flex-col gap-0.5 max-w-[130px] sm:max-w-none">
                      <span className="font-semibold text-xs sm:text-sm leading-tight break-words">{p.name}</span>
                      {p.nameTamil && (
                        <span className="text-[11px] text-muted-foreground leading-tight break-words">{p.nameTamil}</span>
                      )}
                      <span className="text-[10px] font-mono text-muted-foreground/80">{p.code}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell align-middle py-2 px-2">
                    {p.category ? (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                        {p.category}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic text-xs">
                        {t("pos.printInvoice").includes("அச்சிடு") ? "வகைப்படுத்தப்படாதது" : "Unassigned"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-bold text-primary align-middle py-2 px-1 whitespace-nowrap text-xs sm:text-sm">
                    ₹{p.sellingPrice.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right align-middle py-2 px-0.5">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button onClick={() => handleOpenEditModal(p)} variant="ghost" size="icon" className="h-7 w-7 p-0 text-primary hover:bg-primary/10">
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button onClick={() => handleDelete(p.code)} variant="ghost" size="icon" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogHeader>
          <DialogTitle>{editingProduct ? t("prod.dialogEdit") : t("prod.dialogAdd")}</DialogTitle>
          <DialogDescription>{t("prod.dialogDesc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <DialogContent className="space-y-4">
            {errorMsg && (
              <div className="p-3 bg-destructive/15 text-destructive rounded-md text-xs font-semibold">
                {errorMsg}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("prod.lblCode")}</label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. UT-983718"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  disabled={!!editingProduct}
                  className="font-mono"
                />
                {!editingProduct && (
                  <Button type="button" onClick={generateRandomCode} variant="outline" className="shrink-0 gap-1">
                    <RefreshCw className="h-3.5 w-3.5" /> {t("prod.autoGen")}
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("prod.lblName")}</label>
              <Input
                placeholder="e.g. Stainless Steel Cooker 5L"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("prod.lblNameTamil") || "Product Name (Tamil)"}</label>
              <Input
                placeholder="e.g. எஃகு குக்கர் 5லி"
                value={nameTamil}
                onChange={(e) => setNameTamil(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("prod.lblCategory")}</label>
              <Input
                placeholder="e.g. Cooker, Brass, Bronze"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">{t("prod.lblPrice")}</label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="e.g. 850.00"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                required
              />
            </div>
          </DialogContent>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
              {t("prod.cancel")}
            </Button>
            <Button type="submit">
              {editingProduct ? t("prod.save") : t("prod.create")}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
