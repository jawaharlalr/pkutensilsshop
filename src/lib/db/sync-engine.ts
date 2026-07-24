import { doc, setDoc, deleteDoc, writeBatch, collection, getDocs, onSnapshot } from "firebase/firestore";
import { dbFirestore } from "../firebase/config";
import { db, type Product, type Invoice, type Setting } from "./dexie-db";

// Helper to check if online
export function isOnline(): boolean {
  if (typeof window === "undefined") return false;
  return navigator.onLine;
}

// Helper to clean undefined fields for Firestore compatibility
export function sanitizePayload(payload: any): any {
  if (payload === null || payload === undefined) return null;
  if (Array.isArray(payload)) {
    return payload.map(sanitizePayload);
  }
  if (typeof payload === "object") {
    const cleaned: any = {};
    for (const key of Object.keys(payload)) {
      if (payload[key] !== undefined) {
        cleaned[key] = sanitizePayload(payload[key]);
      }
    }
    return cleaned;
  }
  return payload;
}

// Queue an item for synchronization
export async function queueSyncItem(
  action: "create" | "update" | "delete",
  collectionName: "products" | "sales" | "settings",
  docId: string,
  payload: any
) {
  await db.syncQueue.put({
    action,
    collection: collectionName,
    docId,
    payload: sanitizePayload(payload),
    timestamp: Date.now(),
  });
  
  // Attempt sync immediately in background
  if (isOnline()) {
    triggerSync();
  }
}

// Helper to save a product
export async function saveProduct(product: Product) {
  const updatedProduct = {
    ...product,
    lastUpdated: Date.now(),
  };

  // 1. Save locally
  const id = await db.products.put(updatedProduct);
  
  // 2. Queue for Firebase sync (using product code as document ID)
  await queueSyncItem("update", "products", product.code, updatedProduct);
  
  return id;
}

// Helper to delete a product
export async function deleteProduct(code: string) {
  const product = await db.products.where("code").equals(code).first();
  if (product) {
    // 1. Delete locally
    await db.products.delete(product.id!);
    
    // 2. Queue for Firebase sync
    await queueSyncItem("delete", "products", code, null);
  }
}

// Helper to save an invoice (sale)
export async function saveInvoice(invoice: Invoice) {
  const updatedInvoice = {
    ...invoice,
    lastUpdated: Date.now(),
  };

  // 1. Save locally
  const id = await db.invoices.put(updatedInvoice);

  // 2. Queue for Firebase sync (using invoice number as document ID)
  await queueSyncItem("create", "sales", invoice.invoiceNumber, updatedInvoice);

  return id;
}

// Helper to void/delete an invoice (sale)
export async function deleteInvoice(invoiceNumber: string) {
  const invoice = await db.invoices.where("invoiceNumber").equals(invoiceNumber).first();
  if (invoice) {
    const updatedInvoice = {
      ...invoice,
      isDeleted: 1,
      synced: 0,
      lastUpdated: Date.now(),
    };
    
    // 1. Update locally (soft delete)
    await db.invoices.put(updatedInvoice);

    // 2. Queue for Firebase sync
    await queueSyncItem("update", "sales", invoiceNumber, updatedInvoice);
  }
}

// Helper to save a setting
export async function saveSetting(key: string, value: any) {
  const record = { key, value, lastUpdated: Date.now() };

  // 1. Save locally
  await db.settings.put(record);

  // 2. Queue for Firebase sync
  if (dbFirestore) {
    await queueSyncItem("update", "settings", key, record);
  }
}

// Background Sync execution
let isSyncingInProgress = false;

export async function syncAll(): Promise<{ success: boolean; count: number }> {
  if (isSyncingInProgress) return { success: false, count: 0 };
  if (!dbFirestore) return { success: false, count: 0 };
  if (!isOnline()) return { success: false, count: 0 };

  isSyncingInProgress = true;
  let syncedCount = 0;
  
  try {
    // 1. Pull downstream changes from Firestore first to keep all collections updated
    await pullDownstreamChanges();

    // 2. Process items queued in local syncQueue
    const queue = await db.syncQueue.orderBy("id").toArray();
    for (const item of queue) {
      try {
        if (item.collection === "products") {
          const docRef = doc(dbFirestore, "Products", item.docId);
          if (item.action === "delete") {
            await deleteDoc(docRef);
          } else {
            await setDoc(docRef, sanitizePayload(item.payload));
          }
        } 
        else if (item.collection === "sales") {
          const docRef = doc(dbFirestore, "Sales", item.docId);
          if (item.action === "create" || item.action === "update") {
            const invoice = item.payload;

            // Write Invoice to 'Sales' collection with nested items array
            await setDoc(docRef, sanitizePayload({
              invoiceNumber: invoice.invoiceNumber,
              date: invoice.date,
              time: invoice.time,
              customerName: invoice.customerName || null,
              customerPhone: invoice.customerPhone || null,
              grandTotal: invoice.grandTotal,
              isDeleted: invoice.isDeleted,
              items: invoice.items || [],
              lastUpdated: invoice.lastUpdated || Date.now(),
            }));
          }
        } 
        else if (item.collection === "settings") {
          const docRef = doc(dbFirestore, "Settings", item.docId);
          await setDoc(docRef, sanitizePayload(item.payload));
        }

        // Add to remote SyncQueue collection as audit log
        const auditRef = doc(
          dbFirestore,
          "SyncQueue",
          `${item.collection}_${item.docId}_${item.timestamp}`
        );
        await setDoc(auditRef, {
          action: item.action,
          collection: item.collection,
          docId: item.docId,
          timestamp: item.timestamp,
          status: "synced",
        });

        // Delete from local queue
        if (item.id) {
          await db.syncQueue.delete(item.id);
        }

        // Mark invoice as synced locally
        if (item.collection === "sales") {
          await db.invoices
            .where("invoiceNumber")
            .equals(item.docId)
            .modify({ synced: 1 });
        }

        syncedCount++;
      } catch (error) {
        console.error(`Sync failed for queue item ${item.id}:`, error);
        break;
      }
    }

    // 3. Scan & sync any local invoices marked unsynced (synced === 0)
    const unsyncedInvoices = await db.invoices.where("synced").equals(0).toArray();
    for (const inv of unsyncedInvoices) {
      if (inv.invoiceNumber) {
        try {
          const docRef = doc(dbFirestore, "Sales", inv.invoiceNumber);
          await setDoc(docRef, sanitizePayload({
            invoiceNumber: inv.invoiceNumber,
            date: inv.date,
            time: inv.time,
            customerName: inv.customerName || null,
            customerPhone: inv.customerPhone || null,
            grandTotal: inv.grandTotal,
            isDeleted: inv.isDeleted,
            items: inv.items || [],
            lastUpdated: inv.lastUpdated || Date.now(),
          }));
          await db.invoices.where("invoiceNumber").equals(inv.invoiceNumber).modify({ synced: 1 });
          syncedCount++;
        } catch (e) {
          console.error(`Failed to sync invoice ${inv.invoiceNumber}:`, e);
        }
      }
    }

    // 4. Scan & sync local products to Firestore
    const localProducts = await db.products.toArray();
    for (const prod of localProducts) {
      if (prod.code) {
        try {
          const docRef = doc(dbFirestore, "Products", prod.code);
          await setDoc(docRef, sanitizePayload({
            code: prod.code,
            name: prod.name,
            nameTamil: prod.nameTamil || "",
            category: prod.category || "",
            sellingPrice: prod.sellingPrice,
            lastUpdated: prod.lastUpdated || Date.now(),
          }));
          syncedCount++;
        } catch (e) {
          console.error(`Failed to sync product ${prod.code}:`, e);
        }
      }
    }

    isSyncingInProgress = false;
    return { success: true, count: syncedCount };
  } catch (error) {
    console.error("General Sync Engine error:", error);
    isSyncingInProgress = false;
    return { success: false, count: syncedCount };
  }
}

// Helper to safely extract Product from Firestore document
function parseProductDoc(docSnap: any): Product | null {
  const data = docSnap.data();
  if (!data) return null;
  const code = String(data.code || data.productCode || docSnap.id).trim().toUpperCase();
  const name = String(data.name || data.productName || docSnap.id).trim();
  const sellingPrice = Number(data.sellingPrice ?? data.price ?? data.amount ?? 0);
  if (!code || !name) return null;
  return {
    code,
    name,
    nameTamil: data.nameTamil || "",
    category: data.category || "",
    sellingPrice: isNaN(sellingPrice) ? 0 : sellingPrice,
    lastUpdated: Number(data.lastUpdated || Date.now()),
  };
}

// Pull products, settings, and sales from Firestore (downstream sync)
export async function pullDownstreamChanges() {
  if (!dbFirestore) return;
  if (!isOnline()) return;

  try {
    // 1. Pull Products (Try "Products", fallback to "products")
    let productsSnapshot = await getDocs(collection(dbFirestore, "Products"));
    if (productsSnapshot.empty) {
      productsSnapshot = await getDocs(collection(dbFirestore, "products"));
    }

    for (const docSnap of productsSnapshot.docs) {
      const fbProduct = parseProductDoc(docSnap);
      if (!fbProduct) continue;

      const localProduct = await db.products.where("code").equals(fbProduct.code).first();

      if (!localProduct || (fbProduct.lastUpdated || 0) > (localProduct.lastUpdated || 0)) {
        await db.products.put({
          ...(localProduct || {}),
          code: fbProduct.code,
          name: fbProduct.name,
          nameTamil: fbProduct.nameTamil || "",
          category: fbProduct.category || "",
          sellingPrice: fbProduct.sellingPrice,
          lastUpdated: fbProduct.lastUpdated || Date.now(),
        });
      }
    }

    // 2. Pull Settings (Try "Settings", fallback to "settings")
    let settingsSnapshot = await getDocs(collection(dbFirestore, "Settings"));
    if (settingsSnapshot.empty) {
      settingsSnapshot = await getDocs(collection(dbFirestore, "settings"));
    }
    for (const docSnap of settingsSnapshot.docs) {
      const fbSetting = docSnap.data();
      const localSetting = await db.settings.get(docSnap.id);

      if (!localSetting || fbSetting.lastUpdated > (localSetting as any).lastUpdated) {
        await db.settings.put({
          key: docSnap.id,
          value: fbSetting.value,
        });
      }
    }

    // 3. Pull Sales (Invoices) (Try "Sales", fallback to "sales")
    let salesSnapshot = await getDocs(collection(dbFirestore, "Sales"));
    if (salesSnapshot.empty) {
      salesSnapshot = await getDocs(collection(dbFirestore, "sales"));
    }
    for (const docSnap of salesSnapshot.docs) {
      const fbInvoice = docSnap.data() as Invoice;
      const invNum = fbInvoice.invoiceNumber || docSnap.id;
      if (!invNum) continue;

      const localInvoice = await db.invoices.where("invoiceNumber").equals(invNum).first();

      if (!localInvoice || (fbInvoice.lastUpdated || 0) > (localInvoice.lastUpdated || 0)) {
        await db.invoices.put({
          ...(localInvoice || {}),
          invoiceNumber: invNum,
          date: fbInvoice.date || new Date().toISOString().split("T")[0],
          time: fbInvoice.time || new Date().toTimeString().split(" ")[0],
          grandTotal: Number(fbInvoice.grandTotal || 0),
          isDeleted: Number(fbInvoice.isDeleted || 0),
          synced: 1,
          items: fbInvoice.items || [],
          lastUpdated: fbInvoice.lastUpdated || Date.now(),
        });
      }
    }
  } catch (error) {
    console.error("Failed to pull downstream changes:", error);
  }
}

// Global hook/interval trigger
let syncTimeout: NodeJS.Timeout | null = null;

export function triggerSync() {
  if (syncTimeout) clearTimeout(syncTimeout);
  
  syncTimeout = setTimeout(async () => {
    await syncAll();
  }, 100); // Debounce syncs by 100ms for instant uploads
}

// Clear all remote collections in Firestore
export async function clearRemoteFirestore() {
  if (!dbFirestore) return;
  
  const collections = ["Products", "Sales", "Settings", "SyncQueue"];
  for (const collName of collections) {
    try {
      const snap = await getDocs(collection(dbFirestore, collName));
      if (snap.empty) continue;
      
      const batch = writeBatch(dbFirestore);
      snap.docs.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
    } catch (error) {
      console.error(`Failed to clear remote collection ${collName}:`, error);
      throw error;
    }
  }
}

// Real-time Firestore downstream sync listeners
let unsubProducts: (() => void) | null = null;
let unsubSettings: (() => void) | null = null;
let unsubSales: (() => void) | null = null;

export function startRealtimeSync(onSyncSuccess?: () => void) {
  if (!dbFirestore) return;

  // Stop any existing listeners first
  stopRealtimeSync();

  try {
    // 1. Listen to Products
    unsubProducts = onSnapshot(collection(dbFirestore, "Products"), (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        const fbProduct = parseProductDoc(change.doc);
        if (!fbProduct) return;

        if (change.type === "removed") {
          const local = await db.products.where("code").equals(fbProduct.code).first();
          if (local) await db.products.delete(local.id!);
        } else {
          const localProduct = await db.products.where("code").equals(fbProduct.code).first();
          if (!localProduct || (fbProduct.lastUpdated || 0) > (localProduct.lastUpdated || 0)) {
            await db.products.put({
              ...(localProduct || {}),
              code: fbProduct.code,
              name: fbProduct.name,
              nameTamil: fbProduct.nameTamil || "",
              category: fbProduct.category || "",
              sellingPrice: fbProduct.sellingPrice,
              lastUpdated: fbProduct.lastUpdated || Date.now(),
            });
          }
        }
      });
      if (onSyncSuccess) onSyncSuccess();
    }, (error) => {
      console.error("Products realtime sync error:", error);
    });

    // 2. Listen to Settings
    unsubSettings = onSnapshot(collection(dbFirestore, "Settings"), (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "removed") {
          await db.settings.delete(change.doc.id);
        } else {
          const fbSetting = change.doc.data();
          const localSetting = await db.settings.get(change.doc.id);
          if (!localSetting || fbSetting.lastUpdated > (localSetting as any).lastUpdated) {
            await db.settings.put({
              key: change.doc.id,
              value: fbSetting.value,
            });
          }
        }
      });
      if (onSyncSuccess) onSyncSuccess();
    }, (error) => {
      console.error("Settings realtime sync error:", error);
    });

    // 3. Listen to Sales (Invoices)
    unsubSales = onSnapshot(collection(dbFirestore, "Sales"), (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        const fbInvoice = change.doc.data() as Invoice;
        const invNum = fbInvoice.invoiceNumber || change.doc.id;
        if (!invNum) return;

        if (change.type === "removed") {
          const local = await db.invoices.where("invoiceNumber").equals(invNum).first();
          if (local) await db.invoices.delete(local.id!);
        } else {
          const localInvoice = await db.invoices.where("invoiceNumber").equals(invNum).first();
          if (!localInvoice || (fbInvoice.lastUpdated || 0) > (localInvoice.lastUpdated || 0)) {
            await db.invoices.put({
              ...(localInvoice || {}),
              invoiceNumber: invNum,
              date: fbInvoice.date || new Date().toISOString().split("T")[0],
              time: fbInvoice.time || new Date().toTimeString().split(" ")[0],
              grandTotal: Number(fbInvoice.grandTotal || 0),
              isDeleted: Number(fbInvoice.isDeleted || 0),
              synced: 1,
              items: fbInvoice.items || [],
              lastUpdated: fbInvoice.lastUpdated || Date.now(),
            });
          }
        }
      });
      if (onSyncSuccess) onSyncSuccess();
    }, (error) => {
      console.error("Sales realtime sync error:", error);
    });
  } catch (error) {
    console.error("Failed to start realtime sync:", error);
  }
}

export function stopRealtimeSync() {
  if (unsubProducts) {
    unsubProducts();
    unsubProducts = null;
  }
  if (unsubSettings) {
    unsubSettings();
    unsubSettings = null;
  }
  if (unsubSales) {
    unsubSales();
    unsubSales = null;
  }
}
