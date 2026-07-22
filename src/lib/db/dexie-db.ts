import Dexie, { type Table } from "dexie";

export interface Product {
  id?: number;
  code: string;
  name: string;
  nameTamil?: string;
  category?: string;
  sellingPrice: number;
  stock?: number;
  lastUpdated?: number;
}

export interface InvoiceItem {
  code: string;
  name: string;
  nameTamil?: string;
  sellingPrice: number;
  quantity: number;
  amount: number;
}

export interface Invoice {
  id?: number;
  invoiceNumber: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  items: InvoiceItem[];
  grandTotal: number;
  synced: number; // 0 = unsynced, 1 = synced
  isDeleted: number; // 0 = active, 1 = deleted/voided
  lastUpdated?: number;
}

export interface Setting {
  key: string;
  value: any;
}

export interface SyncQueueItem {
  id?: number;
  action: "create" | "update" | "delete";
  collection: "products" | "sales" | "settings";
  docId: string; // Local ID or Firebase ID
  payload: any;
  timestamp: number;
}

export class UtensilsDatabase extends Dexie {
  products!: Table<Product, number>;
  invoices!: Table<Invoice, number>;
  settings!: Table<Setting, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super("UtensilsDatabase");
    this.version(1).stores({
      products: "++id, &code, name, lastUpdated",
      invoices: "++id, &invoiceNumber, date, synced, isDeleted, lastUpdated",
      settings: "key",
      syncQueue: "++id, action, collection, docId, timestamp",
    });
  }
}

export const db = new UtensilsDatabase();

// Pre-defined setting keys
export const SETTINGS_KEYS = {
  SHOP_NAME: "shopName",
  SHOP_ADDRESS: "shopAddress",
  SHOP_PHONE: "shopPhone",
  INVOICE_PREFIX: "invoicePrefix",
  STARTING_INVOICE_NUM: "startingInvoiceNumber",
  INVOICE_FOOTER: "invoiceFooter",
  PRINTER_SIZE: "printerPaperSize",
  THEME: "theme",
  LANGUAGE: "language",
};

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const record = await db.settings.get(key);
    return record !== undefined ? (record.value as T) : defaultValue;
  } catch (error) {
    console.error(`Failed to get setting ${key}:`, error);
    return defaultValue;
  }
}

export async function setSetting(key: string, value: any): Promise<void> {
  try {
    await db.settings.put({ key, value });
  } catch (error) {
    console.error(`Failed to set setting ${key}:`, error);
  }
}

// Initial setting setup helper
export async function initializeDefaultSettings() {
  const defaults = [
    { key: SETTINGS_KEYS.SHOP_NAME, value: "Prem's World Utensils Shop" },
    { key: SETTINGS_KEYS.SHOP_ADDRESS, value: "123 Retail Bazar, Shop Road" },
    { key: SETTINGS_KEYS.SHOP_PHONE, value: "9876543210" },
    { key: SETTINGS_KEYS.INVOICE_PREFIX, value: "INV" },
    { key: SETTINGS_KEYS.STARTING_INVOICE_NUM, value: "1" },
    { key: SETTINGS_KEYS.INVOICE_FOOTER, value: "Thank You, Visit Again!" },
    { key: SETTINGS_KEYS.PRINTER_SIZE, value: "80mm" },
    { key: SETTINGS_KEYS.THEME, value: "light" },
    { key: SETTINGS_KEYS.LANGUAGE, value: "en" },
  ];

  for (const item of defaults) {
    const exists = await db.settings.get(item.key);
    if (!exists) {
      await db.settings.put(item);
    }
  }
}
