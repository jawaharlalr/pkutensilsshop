# Tasks

- `[x]` Initialize Next.js project
- `[x]` Install key dependencies (`dexie`, `dexie-react-hooks`, `firebase`, `xlsx`, `lucide-react`)
- `[x]` Set up Tailwind CSS & shadcn/ui
- `[x]` Create local IndexedDB schemas & Dexie manager (`dexie-db.ts`)
- `[x]` Set up Firebase & Sync Engine (`sync-engine.ts`)
- `[x]` Configure PWA manifest & custom service worker (`sw.js`)
- `[x]` Build layout, theme configuration, and Navbar
- `[x]` Build Settings & Profile controls (receipt styles, shop profile, JSON back-up)
- `[x]` Build Product Management (CRUD, Excel/CSV importer/exporter)
- `[x]` Build POS Billing Terminal (product search, cart adjustments, invoice generator)
- `[x]` Build Sales History & Invoice Log (filters, reprints, void/delete)
- `[x]` Create Thermal & A4 print stylesheets (`@media print`)
- `[x]` Build Dashboard (sales graphs, counters, sync queue log)
- `[x]` Run build & verify compilation checks

## Iteration 2: Bilingual Translation, S.No & Print Fixes
- `[x]` Update default settings & DB setup (Prem's World Utensils Shop & language setting)
- `[x]` Create bilingual dictionary library (`i18n.ts`)
- `[x]` Integrate language selectors & translators in PWAProvider/Navbar
- `[x]` Update POS Billing Terminal (S.No, Total Qty & Items, translations, print date/time)
- `[x]` Update Sales History (remove Cloud Sync, add S.No, translations)
- `[x]` Update Product Management (add S.No, translations)
- `[x]` Update Dashboard (add S.No, translations)
- `[x]` Update Settings page (translations, name default)
- `[x]` Update print CSS (remove browser margins/headers)
- `[x]` Run build & verify compilation checks

## Iteration 3: Tamil Names, Stock Removal & Full Page Width
- `[x]` Update layout.tsx (full page fluid width)
- `[x]` Update dexie-db.ts (add `nameTamil` to Product schema)
- `[x]` Update POS Billing Terminal (remove stock displays and checkout logic, add nameTamil support)
- `[x]` Update Product Management page (add Tamil name input, remove stock displays, edit dialog, imports/exports)
- `[x]` Update Sales History page (remove stock rollback, add nameTamil support)
- `[x]` Run build & verify compilation checks

## Iteration 4: Category, Clean Printing & Tamil Alignments
- `[x]` Update dexie-db.ts (add `category` to Product interface)
- `[x]` Update i18n.ts (add Category translations)
- `[x]` Update Product Management page (form fields, columns, imports/exports for Category)
- `[x]` Update globals.css (refine media print overrides using visibility styles and Tamil fonts)
- `[x]` Run build & verify compilation checks

## Iteration 5: Logo, Radix Modal Hiding, and Sales Table Status Removal
- `[x]` Create logo using generate_image and copy to public/logo.png & favicon.ico
- `[x]` Update manifest.json name properties and layout title details
- `[x]` Refine globals.css to hide Radix Dialog modals during printing
- `[x]` Remove Status column from Sales History table
- `[x]` Run build & verify compilation checks

## Iteration 6: Print Date & Lined Invoice Table
- `[x]` Update POS Billing Terminal (printDateTime state, 5-column lined table structure, remove code)
- `[x]` Update Sales History logs (printDateTime state, 5-column lined table structure, remove code)
- `[x]` Run build & verify compilation checks

## Iteration 7: Color Theme, Dashboard Live Clock & Text Cleanup
- `[x]` Update globals.css (purple & gold theme variables and status animations)
- `[x]` Update Navbar.tsx (status indicator dot with pulse animation)
- `[x]` Update page.tsx (Dashboard live clock, remove subtitles, remove Sync Queue card, remove System Sync card)
- `[x]` Update settings/page.tsx (add System Sync card, remove subtitles)
- `[x]` Update pos/page.tsx, products/page.tsx, sales/page.tsx (remove subtitles)
- `[x]` Run build & verify compilation checks

## Iteration 8: Navbar Name Layout & Dashboard Print Actions
- `[x]` Update Navbar.tsx (two lines shop name, remove U box logo)
- `[x]` Update page.tsx (add Quick-Print button column in Recent Invoices, load settings, render print layout)
- `[x]` Create local .env.local file and configure config.ts to read from env variables
- `[x]` Run build & verify compilation checks

## Iteration 9: Payload Sanitization, Print Isolation, Schema Nesting & Remote Reset
- `[x]` Add sanitizePayload helper in sync-engine.ts to strip undefined keys
- `[x]` Comment out preventDefault in beforeinstallprompt listener to fix PWA console warnings
- `[x]` Wrap page-level screen elements in a unified no-print wrapper to isolate print-area receipts
- `[x]` Nest invoice line items directly inside Sales documents, deprecating separate Sale Items collection
- `[x]` Rename Sync Queue to SyncQueue (removing spaces in collection names)
- `[x]` Pull Sales/Invoices downstream from Firestore to support multi-device history loads
- `[x]` Preserve nameTamil and category during product downstream sync pulls
- `[x]` Implement clearRemoteFirestore to delete all remote documents when performing Database Resets
- `[x]` Configure active realtime Firestore snapshot listeners (onSnapshot) to support instant two-way sync
- `[x]` Trigger all-collections downstream sync checks at the beginning of syncAll to guarantee complete synchronization
- `[x]` Implement strict index verification checks in downstream pull and onSnapshot to prevent Dexie DataErrors
- `[x]` Queue restored backup datasets automatically into syncQueue to sync backup imports to Firestore
- `[x]` Override default Next.js/Vercel favicon in src/app/favicon.ico with the custom shop brand logo
- `[x]` Render the custom circular brand logo badge next to the shop title in the header navbar
- `[x]` Generate old logo on transparent background (without bg) for logo file
- `[x]` Generate old logo on transparent background with text removed (without bg and name) for favicon file
- `[x]` Verify build compilation checks pass
