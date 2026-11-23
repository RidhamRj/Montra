# RupeeTrack: Offline-First Personal Finance Tracker with Android UPI Integration

A lightweight, production-quality personal finance application built with an offline-first architecture, featuring a React PWA web application and a native Kotlin Jetpack Compose Android companion app.

---

## Architecture Overview

```
                      ┌────────────────────────────────────────┐
                      │          Supabase PostgreSQL           │
                      │  - Row Level Security (RLS)            │
                      │  - Integer Paise Financial Precision   │
                      │  - Two-Way Delta Sync                  │
                      └───────────────────▲────────────────────┘
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   │ (HTTPS / WebSockets Sync via Outbox)        │
                   ▼                                             ▼
       ┌───────────────────────┐                     ┌───────────────────────┐
       │     React PWA Web     │                     │   Android Companion   │
       │                       │                     │                       │
       │ - Dexie.js IndexedDB  │                     │ - Room SQLite DB      │
       │ - Outbox Queue        │                     │ - WorkManager Sync    │
       │ - Tailwind CSS        │                     │ - Jetpack Compose     │
       │ - Offline Fallback    │                     │ - NotificationListener│
       └───────────────────────┘                     └───────────▲───────────┘
                                                                 │ (Notification Events)
                                                     ┌───────────┴───────────┐
                                                     │ PhonePe / GPay / Paytm│
                                                     └───────────────────────┘
```

---

## 1. Core Financial Features

* **Integer Paise Precision:** Never uses floating-point arithmetic. All monetary values are calculated and stored in integer paise (e.g. ₹150.50 = 15050 paise).
* **Indian Rupee (₹) & Asia/Kolkata Timezone:** Formatted using native `Intl.NumberFormat('en-IN')` and localized date displays.
* **Offline-First Guarantee:**
  * Web transactions are saved immediately to local IndexedDB via **Dexie.js**.
  * Android transactions are saved immediately to local **Room SQLite**.
  * All mutations are staged in an idempotent `sync_outbox` queue.
  * When internet is restored, changes are flushed to Supabase and remote updates are pulled.
  * Soft deletion with `deleted_at` tombstones ensures deletes synchronize reliably across multiple devices without data loss.
* **UPI Auto-Detection:**
  * Native Android `NotificationListenerService` parses transactions from **PhonePe**, **Google Pay**, and **Paytm**.
  * Extracts amount, payment direction (Debit vs Credit), party/merchant name, and UPI Reference / UTR.
  * Enters transactions into a **Pending Review** state so users can confirm, adjust category, or reject without unverified entries corrupting financial reports.
  * Deduplication guards prevent double-counting when both app and bank notifications arrive.

---

## 2. Directory Structure

```
├── web/                             # React + TypeScript + Vite + Tailwind CSS PWA
│   ├── src/
│   │   ├── components/              # Dashboard, Navbar, TransactionList, AddModal, etc.
│   │   ├── db/                      # Dexie.js database schema & indexed outbox
│   │   ├── services/                # Transaction CRUD, Category seeder, Sync service
│   │   ├── utils/                   # Integer paise to INR & date formatters
│   │   ├── types/                   # TypeScript domain models
│   │   └── App.tsx                  # Main application orchestrator
│   └── package.json
├── android/                         # Native Kotlin Android Companion App
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml      # Notification listener & network permissions
│   │   └── java/.../companion/
│   │       ├── data/local/          # Room DB, Entity, DAO
│   │       ├── service/             # NotificationListenerService & UPI Parsers
│   │       │   └── parser/          # PhonePe, Google Pay, Paytm regex parsers
│   │       ├── sync/                # WorkManager background sync worker
│   │       └── MainActivity.kt      # Jetpack Compose UI (Dashboard, Review, Settings)
├── supabase/
│   └── migrations/                  # PostgreSQL schema, RLS policies & category seeds
├── tests/                           # Automated finance & UPI parser test suite
└── README.md
```

---

## 3. Web Application Setup & Run

### Prerequisites
* Node.js v18+ and npm v9+

### Quick Start
```bash
cd web
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### Production Build
```bash
npm run build
```
The optimized static bundle is output to `web/dist/` ready for Vercel, Netlify, or GitHub Pages.

---

## 4. Android Companion Setup & Run

### Prerequisites
* Android Studio Iguana / Jellyfish (or higher)
* Android SDK 34 (Min SDK 26)
* JDK 17

### Build & Run APK
1. Open the `/android` folder in Android Studio.
2. Let Gradle sync dependencies (Jetpack Compose, Room, WorkManager).
3. Connect an Android device or emulator.
4. Run the app (`Run > Run 'app'`).
5. **Enable Notification Access:**
   * In the app, click **Enable Access** on the Dashboard banner (or go to Android Settings > Apps > Special App Access > Notification Access).
   * Toggle on **Expense Tracker Companion**.

### Testing Without Real UPI Notifications
* Go to the **Settings** tab in the Android app.
* Tap **"Trigger Simulated PhonePe Payment (₹249)"**.
* Watch the payment appear instantly under the **Review** tab with pending status!

---

## 5. Supabase Backend Setup

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** in the Supabase dashboard.
3. Paste and run the contents of [supabase/migrations/20261123000001_initial_schema.sql](supabase/migrations/20261123000001_initial_schema.sql).
4. Copy your **Project URL** and **Anon Key** into `web/.env`:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

---

## 6. Running Automated Tests

Run the built-in financial arithmetic, UPI regex parsing, deduplication, and tombstone deletion test suite:
```bash
node tests/verify_all.js
```
All 7 TAP test suites verify integer paise precision, PhonePe / GPay / Paytm regex extraction, and conflict handling.

