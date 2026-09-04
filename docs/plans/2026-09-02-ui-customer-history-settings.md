# UI Overhaul, Customer History & Service Settings Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Enhance the mobile application with a modern visual UI theme, customer order history auto-lookup on Intake, and a dedicated Settings tab to manage services and dynamic pricing.

**Architecture:** Create `SettingsScreen` and add it to `AppNavigator` bottom tab bar. Update `ordersApi.js` to support service CRUD and customer order lookup with persistent local storage fallback (`AsyncStorage`). Refactor UI components and screens with modern design system tokens.

**Tech Stack:** React Native, Expo, React Navigation, Supabase JS, `@react-native-async-storage/async-storage`.

---

### Task 1: Theme & Design System Upgrade
**Files:**
- Modify: `laundry-tracker/src/theme.js`

**Steps:**
1. Update `theme.js` to include modern color palettes (elevated navy/slate cards, vibrant primary blues, emerald success, amber badges, slate subtle text), rounded corner scale, card shadow helper styles, and badge theme helpers.

---

### Task 2: Service CRUD & Customer History API Layer
**Files:**
- Modify: `laundry-tracker/src/lib/ordersApi.js`

**Steps:**
1. Add `fetchCustomerHistory(phoneNumber)` to query past orders for a specific customer with fallback to local store.
2. Add `addServiceItem(newService)` and `updateServiceItem(id, updates)` and `deleteServiceItem(id)` with Supabase sync and `@react-native-async-storage/async-storage` local fallback.
3. Enhance `fetchItemTypes()` to check local cached service prices/items first, fallback to Supabase, then default array.

---

### Task 3: Settings Screen Creation
**Files:**
- Create: `laundry-tracker/src/screens/SettingsScreen.js`

**Steps:**
1. Create `SettingsScreen` with tabs/sections for "Services & Pricing" management.
2. Display service cards with current name, unit type, and price ($).
3. Add inline editing for price and modal for adding new services.
4. Call `ordersApi` functions to update state seamlessly.

---

### Task 4: Navigation Bar & App Integration
**Files:**
- Modify: `laundry-tracker/src/navigation/AppNavigator.js`

**Steps:**
1. Import `SettingsScreen`.
2. Add `SettingsTab` to `MainTabs` with icon (⚙️) and label "Settings".
3. Polish bottom tab bar styling (height, padding, active tint, border shadow).

---

### Task 5: Customer History Card on Intake Screen
**Files:**
- Modify: `laundry-tracker/src/screens/IntakeScreen.js`

**Steps:**
1. Add live customer history lookup when customer phone number is entered or selected from suggestions.
2. Render "Customer History Panel" showing total past orders, total spent, and collapsible accordion list of past orders (Date, Code, Status badge, Items breakdown, Total bill).
3. Add quick "Re-order Previous Items" button to pre-fill garment counters.
4. Ensure live service price changes from Settings reflect in real-time when loading IntakeScreen.

---

### Task 6: Visual Polish Across Screens
**Files:**
- Modify: `laundry-tracker/src/screens/OrdersScreen.js`
- Modify: `laundry-tracker/src/screens/QuickPressScreen.js`
- Modify: `laundry-tracker/src/screens/SortingScreen.js`

**Steps:**
1. Update card layout, status badges, headers, and buttons across screens to match updated theme design system.
