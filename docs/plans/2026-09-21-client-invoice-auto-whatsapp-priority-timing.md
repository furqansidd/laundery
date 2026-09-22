# Client Invoice, Auto WhatsApp, & Priority Timing Implementation Plan

> **For Antigravity:** REQUIRED WORKFLOW: Use `.agent/workflows/execute-plan.md` to execute this plan in single-flow mode.

**Goal:** Provide a modern printable & shareable client invoice slip, auto WhatsApp notifications when an order is marked ready, and configurable priority turnaround timing with auto-delivery calculation.

**Architecture:** 
- `src/utils/whatsapp.js`: Add modern thermal/card receipt HTML generator, `printInvoiceSlip` (using `expo-print`), `shareInvoiceSlipPdf` (using `expo-sharing`), and `sendOrderReadyWhatsApp` for ready notification.
- `src/lib/ordersApi.js`: Add Priority & Timing persistence layer (`fetchPriorityTiers`, `updatePriorityTier`, `savePriorityTiers`) using `AsyncStorage` (`@laundry_tracker_priorities`).
- `src/screens/SettingsScreen.js`: Add 3rd tab "Priorities & Timing" to view, edit hours, and manage priority tiers.
- `src/screens/IntakeScreen.js`: Load dynamic priority options, auto-calculate delivery date & time when a priority is selected (`now + hours`), and add "🖨️ Print Slip" & "📲 Share WhatsApp" on completion.
- `src/screens/OrdersScreen.js` & `src/screens/SortingScreen.js`: Integrate "Print Slip" & "Share WhatsApp" in order detail modal, and trigger prompt to send WhatsApp ready notification when order status becomes `ready_for_delivery`.

**Tech Stack:** React Native, Expo Print (`expo-print`), Expo Sharing (`expo-sharing`), AsyncStorage, Linking API, Supabase.

---

### Task 1: Priority & Timing Config API in `ordersApi.js`
**Files:**
- Modify: `c:/Users/hafiz/Desktop/laudary_managemnet/laundry-tracker/src/lib/ordersApi.js`

**Step 1:** Define default priority tiers with customizable turnaround hours:
- `instant`: 2 hours, icon: "⚡", label: "Instant", desc: "Super rush service"
- `urgent`: 4 hours, icon: "🔥", label: "Urgent", desc: "Express turnaround"
- `express`: 24 hours, icon: "🚀", label: "Express", desc: "Same day / 24h"
- `normal`: 48 hours, icon: "📦", label: "Normal", desc: "Standard delivery"

**Step 2:** Implement `fetchPriorityTiers()`, `savePriorityTiers(tiers)`, and `updatePriorityTier(key, updates)` with `AsyncStorage` caching.

**Step 3:** Verify syntax with node check: `node -c src/lib/ordersApi.js`.

---

### Task 2: Priorities & Timing Tab in `SettingsScreen.js`
**Files:**
- Modify: `c:/Users/hafiz/Desktop/laudary_managemnet/laundry-tracker/src/screens/SettingsScreen.js`

**Step 1:** Add 3rd segment tab `priorities` to the top tab selector: "Garment Rates", "Customer Khata", "Priorities & SLA".
**Step 2:** Render priority tiers list showing title, icon, hours duration badge, and description.
**Step 3:** Add quick edit modal / dialog to allow admin to modify hours (e.g. changing 4 hours to 3 hours or 6 hours) and save.
**Step 4:** Verify syntax with node check: `node -c src/screens/SettingsScreen.js`.

---

### Task 3: Modern Client Invoice Slip & Auto WhatsApp in `whatsapp.js`
**Files:**
- Modify: `c:/Users/hafiz/Desktop/laudary_managemnet/laundry-tracker/src/utils/whatsapp.js`

**Step 1:** Build `generateInvoiceSlipHtml({ order, items, photoUrls })`:
- Sleek 80mm thermal/card slip format.
- Store branding, receipt date/time, customer contact.
- Code128 vector barcode with readable order code.
- Priority badge (e.g. `🔥 URGENT • 4h`).
- Promised delivery date & time slot.
- Clear itemized table (Garment, Service Pill, Qty, Rate, Amount).
- Totals block with `PAID` / `UNPAID` badge.
- Optional intake proof photos gallery.
**Step 2:** Implement `printInvoiceSlip({ order, items, photoUrls })` using `Print.printAsync({ html })`.
**Step 3:** Implement `shareInvoiceSlipPdf({ order, items, photoUrls })` using `Print.printToFileAsync({ html })` and `Sharing.shareAsync`.
**Step 4:** Implement `sendOrderReadyWhatsApp(order)`:
- Formats message:
  "🧺 *CleanWave Laundry*\nHello *[Name]*! ✨\nYour laundry order *[OrderCode]* is now *READY* for pickup!\n..."
- Opens WhatsApp chat directly with the customer.
**Step 5:** Verify syntax with node check: `node -c src/utils/whatsapp.js`.

---

### Task 4: IntakeScreen Integration (Dynamic Priorities, Auto-Calculated Timing, & Invoice Actions)
**Files:**
- Modify: `c:/Users/hafiz/Desktop/laudary_managemnet/laundry-tracker/src/screens/IntakeScreen.js`

**Step 1:** Fetch active priorities from `fetchPriorityTiers()` on screen focus.
**Step 2:** In `handleSelectOrderType(tierKey)`:
- Look up the selected tier's duration hours.
- Compute target delivery timestamp: `new Date(Date.now() + tier.hours * 3600 * 1000)`.
- Set `deliveryDate` (e.g., "Today", "Tomorrow", or formatted date) and `deliveryTimeSlot` (e.g., "6:00 PM (Next 4 Hrs)").
- Keep manual date/time picker accessible so staff can adjust if necessary.
**Step 3:** In the intake completion view (`STEPS.DONE`), add dual actions:
- 🖨️ **Print Invoice Slip**
- 📲 **Share via WhatsApp** (with formatted text & PDF options)
**Step 4:** Verify syntax with node check: `node -c src/screens/IntakeScreen.js`.

---

### Task 5: OrdersScreen & SortingScreen Integration (Auto WhatsApp on Ready & Invoice Actions)
**Files:**
- Modify: `c:/Users/hafiz/Desktop/laudary_managemnet/laundry-tracker/src/screens/OrdersScreen.js`
- Modify: `c:/Users/hafiz/Desktop/laudary_managemnet/laundry-tracker/src/screens/SortingScreen.js`

**Step 1:** In `OrdersScreen.js`:
- In Order Details Sheet, provide "🖨️ Print Slip" and "📲 Share PDF / WhatsApp".
- In status advancement handler (`handleAdvanceStage`), when an order reaches `ready_for_delivery` or its final stage, prompt:
  `Alert.alert("Order Ready! 📦", "Order LN-XXXX is marked Ready! Would you like to notify the customer on WhatsApp?", [{ text: "Later", style: "cancel" }, { text: "📲 Send WhatsApp", onPress: () => sendOrderReadyWhatsApp(order) }])`.
**Step 2:** In `SortingScreen.js`:
- When an order is marked ready via `handleMarkReadyPress` / `executeMarkReady`, display the same prompt to notify the customer on WhatsApp.
**Step 3:** Verify syntax with node check: `node -c src/screens/OrdersScreen.js` and `node -c src/screens/SortingScreen.js`.

---

### Task 6: Final Verification & Testing
**Files:**
- Verify all modified files with `node -c` syntax check.
- Update `docs/plans/task.md`.
- Verify app bundling in terminal.
