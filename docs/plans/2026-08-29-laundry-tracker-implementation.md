# Laundry Order Tracking & Verification System Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Build a production-ready React Native (Expo) mobile application for laundry staff to create quick tap-tap orders with dual wide-angle photo verification, customer phone auto-lookup, barcode generation/printing, instant WhatsApp receipt sharing, and barcode-scanned sorting verification.

**Architecture:** Frontend built with Expo SDK 52 (TypeScript, Expo Router, Lucide icons, Expo Camera, Haptics). Backend and media storage powered by Supabase (PostgreSQL + Storage buckets) with offline fallback storage via AsyncStorage. Dynamic barcode rendering via SVG/JSBarcode and thermal printing / PDF generation via Expo Print.

**Tech Stack:** React Native, Expo SDK, TypeScript, Supabase JS, Expo Camera, Expo Print, Expo Sharing, Lucide React Native, Async Storage.

---

### Task 1: Initialize Expo React Native Project Structure & Dependencies

**Files:**
- Create: `package.json`
- Create: `app.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `src/config/supabase.ts`

**Step 1: Initialize project configuration files**
Scaffold `package.json`, `app.json`, and TypeScript config with required Expo SDK 52 packages:
- `expo`, `react-native`, `expo-router`, `expo-camera`, `expo-sharing`, `expo-print`, `expo-haptics`, `expo-file-system`, `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `react-native-svg`, `lucide-react-native`.

**Step 2: Create Supabase client configuration**
Set up `src/config/supabase.ts` with local cache fallback and environment variable loader.

**Step 3: Verify configuration & dependencies**
Verify that configuration files and modules parse cleanly.

---

### Task 2: Database Schema, SQL Migrations & TypeScript Types

**Files:**
- Create: `src/types/database.ts`
- Create: `supabase/migrations/20260829_init_laundry_schema.sql`

**Step 1: Define TypeScript models and enums**
Define types for `Customer`, `Order`, `OrderItem`, `OrderStatus` (`intake`, `washing`, `sorting`, `ready_for_delivery`, `delivered`), and `GarmentCategory`.

**Step 2: Create SQL migration script**
Create SQL migration file with `customers`, `orders`, and `order_items` tables, indexes on `phone` and `order_code`, and storage bucket policy for `order-photos`.

**Step 3: Verify types**
Run TypeScript type-check to confirm types are sound.

---

### Task 3: Local Storage & Supabase Service Layer (Offline-First)

**Files:**
- Create: `src/services/customerService.ts`
- Create: `src/services/orderService.ts`
- Create: `src/services/storageService.ts`

**Step 1: Implement Customer Service**
- `searchCustomerByPhone(phone: string)`: checks local AsyncStorage cache first, then Supabase.
- `saveOrUpdateCustomer(customer: Partial<Customer>)`: updates Supabase and caches locally.

**Step 2: Implement Order & Image Storage Service**
- `createOrder(orderData, photos)`: saves order to Supabase (or offline queue if offline) and uploads photos to `order-photos` bucket.
- `getOrderByIdOrCode(code: string)`: fetches order with items and photo URLs.
- `updateOrderStatus(orderId, status)`: marks order as ready for delivery with verification timestamp.

**Step 3: Test service layer operations**
Verify mock service execution for creating and retrieving orders with customer association.

---

### Task 4: UI Design System & Component Library

**Files:**
- Create: `src/theme/colors.ts`
- Create: `src/components/Header.tsx`
- Create: `src/components/GarmentCounterItem.tsx`
- Create: `src/components/CameraDualCaptureModal.tsx`
- Create: `src/components/BarcodeRenderer.tsx`
- Create: `src/components/OrderStatusBadge.tsx`

**Step 1: Create Color Palette & UI Tokens**
Sleek dark/light theme tokens, vibrant status colors (Navy Blue, Emerald Green, Indigo), tactile haptic triggers.

**Step 2: Build Tap-Tap Garment Counter Component**
Large touchable card with icon (👕, 👖, 🥻, 🛏️, 🧥, etc.), garment title, price, quantity counter (`-`, count, `+`), and haptic click.

**Step 3: Build Dual Wide-Angle Camera Capture Component**
Modal viewfinder with 2-shot counter ("Photo 1: Laid-out Clothes", "Photo 2: Care tags / Second layout"), retake options, and photo previews.

**Step 4: Build Barcode & QR Code Renderer Component**
SVG-based Code128 and QR code renderer for order tags.

---

### Task 5: Intake & Order Creation Screen (Step 1 & 2)

**Files:**
- Create: `app/_layout.tsx`
- Create: `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/index.tsx` (Intake Screen)
- Create: `src/components/OrderSummarySheet.tsx`

**Step 1: Implement Phone Number Auto-Complete Bar**
Input field with quick suggestions from saved customers, auto-populating Name and Address.

**Step 2: Implement Garment Matrix & Live Order Total**
Grid of garment counters updating Total Pieces and Total Price in real time with haptic response.

**Step 3: Implement Dual Photo Intake Integration**
Photo capture triggers, local thumbnail previews, and order submission pipeline.

**Step 4: Implement Receipt Modal & WhatsApp Sharing**
- Formats receipt markdown.
- Opens `whatsapp://send?phone=...&text=...`.
- "Share Direct Photos" button triggering native OS share sheet.
- "Print Basket Sticker" button generating thermal label / printable PDF.

---

### Task 6: Barcode Scanner & Sorting Verification Screen (Step 3 & 4)

**Files:**
- Create: `app/(tabs)/verify.tsx` (Verification Station)
- Create: `src/components/VerificationDetailModal.tsx`

**Step 1: Implement Continuous Camera Barcode Scanner**
Full-screen barcode viewfinder with laser target guide and instant beep/haptic detection.

**Step 2: Implement Verification Detail View**
- Displays Customer Name, Phone, and Order ID.
- Displays Piece Breakdown (e.g. `3 Shirts, 2 Pants, 1 Bed Sheet`).
- Interactive packing checklist (tap items to verify count).
- Side-by-side high-resolution intake photo viewer with pinch-to-zoom.

**Step 3: Implement "Mark Ready for Delivery" Action**
Updates order status to `ready_for_delivery`, sets audit timestamp, and prompts staff to print final delivery bag tag.

---

### Task 7: Order Management & Pipeline Screen

**Files:**
- Create: `app/(tabs)/orders.tsx`
- Create: `src/components/OrderListItem.tsx`
- Create: `app/order/[id].tsx`

**Step 1: Implement Pipeline Filter Tabs**
Filter active orders by status: `All`, `Intake`, `Washing`, `Sorting`, `Ready for Delivery`.

**Step 2: Implement Search & Filter**
Filter orders by Customer Name, Phone Number, or Barcode ID.

**Step 3: Implement Detailed Order View & Re-share Receipt**
Allows re-printing tags, re-sending WhatsApp receipts, and viewing past verification history.

---

### Task 8: Settings, Custom Pricing & Supabase Connection Screen

**Files:**
- Create: `app/(tabs)/settings.tsx`

**Step 1: Implement Supabase Configuration Manager**
Allows staff/business owner to input or update Supabase URL and Anon Key directly inside the app.

**Step 2: Implement Garment Pricing & Category Manager**
Allows editing prices per garment type (e.g., Shirt: $3, Pants: $4, Blanket: $8) and adding custom item types.

**Step 3: Implement WhatsApp Business Message Template Editor**
Custom header, footer, and store name customization for WhatsApp receipts.

---

### Task 9: End-to-End Verification & Walkthrough

**Files:**
- Create: `docs/plans/walkthrough.md`

**Step 1: Verify Intake Flow**
Create a test order with customer phone auto-lookup, tap counters, dual photos, and barcode generation.

**Step 2: Verify WhatsApp Receipt & Tag Printing**
Test message formatting, URL resolution, and print output generation.

**Step 3: Verify Sorting Scanner & Photo Inspection**
Scan barcode, inspect side-by-side photos, check off packed items, and mark ready for delivery.
