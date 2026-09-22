# Design Document: Client Invoice, Auto WhatsApp, & Priority Timing

## 1. Overview
This document specifies the technical design for three core workflow enhancements in the CleanWave Laundry management app:
1. **Modern Client Invoice / Slip**: A clean, professional 80mm slip layout that can be printed directly (`Print.printAsync`) and shared as a PDF on WhatsApp (`Sharing.shareAsync`).
2. **Auto WhatsApp on Ready / Completed**: A prompt dialog that triggers when an order is marked ready, sending a pre-filled WhatsApp notification to the client with order summary and pickup invitation.
3. **Priority & Timing Management**: Dynamic order priority tiers (Normal, Express, Urgent, Instant, etc.) with admin-configurable turnaround durations (in hours) stored in persistent storage. Intake screen auto-calculates promised delivery date and time based on the chosen priority.

## 2. Architecture & Data Flow

### 2.1 Priority & Timing Configuration
- **Storage**: Key `@laundry_tracker_priorities` in `AsyncStorage` with Supabase sync.
- **Default Priorities**:
  - `instant`: "Instant", 2 hours, icon: "⚡", badge: "2 Hours"
  - `urgent`: "Urgent", 4 hours, icon: "🔥", badge: "4 Hours"
  - `express`: "Express", 24 hours, icon: "🚀", badge: "24 Hours (Same Day)"
  - `normal`: "Normal", 48 hours, icon: "📦", badge: "48 Hours (Standard)"
- **Admin UI**:
  - New tab in `SettingsScreen.js`: **Priorities & Timing**.
  - Allows editing hours/duration, name, icon, and description.
- **Intake Flow**:
  - `IntakeScreen.js` reads active priority options.
  - When user taps a priority tier, delivery date & time slot are automatically calculated:
    - Target Timestamp = `Date.now() + (hours * 3600 * 1000)`.
    - Updates `deliveryDate` (e.g., "Sep 21, 2026" or "Today" / "Tomorrow") and `deliveryTimeSlot` (e.g., "7:30 PM (Next 4 Hrs)").
    - Manual overrides remain available for fine-tuning.

### 2.2 Client Invoice Slip (Printable & Shareable)
- **Functions in `src/utils/whatsapp.js` and `src/utils/print.js`**:
  - `generateInvoiceSlipHtml({ order, items, photoUrls })`: Generates a modern, compact 80mm thermal/card receipt HTML.
    - Clean branding header (`🧺 CleanWave Laundry`, contact, date/time).
    - Code128 SVG barcode + Order ID text.
    - Customer name & phone.
    - Priority pill + Promised Delivery schedule.
    - Itemized breakdown table (Item name, Service type tag, Qty, Rate, Total).
    - Payment status badge (`PAID CASH` or `UNPAID / PENDING`).
    - Intake proof photos (if any).
  - `printInvoiceSlip({ order, items, photoUrls })`: Calls `Print.printAsync({ html })` to immediately launch device print dialog (AirPrint, POS thermal printer, WiFi printer, or PDF printer).
  - `shareInvoiceSlipPdf({ order, items, photoUrls })`: Calls `Print.printToFileAsync({ html })` and opens sharing dialog for WhatsApp or other apps.
- **UI Integration**:
  - **Intake Done Screen (`IntakeScreen.js`)**: Two action buttons: "🖨️ Print Slip" and "📲 Share via WhatsApp".
  - **Order Detail Modal (`OrdersScreen.js`)**: Quick buttons to "🖨️ Print Slip" and "📲 Share WhatsApp Invoice".

### 2.3 Auto WhatsApp on Ready / Completed
- **Helper function**: `sendOrderReadyWhatsApp(order)` in `src/utils/whatsapp.js`.
  - Normalizes phone number with country code.
  - Formats message:
    ```
    🧺 CleanWave Laundry:
    Hello [Customer Name]! ✨
    Your laundry order [Order Code] is now READY for pickup/delivery!

    🧺 Total Items: [N] pcs
    💰 Total Bill: Rs [Bill] ([PAID / UNPAID - Rs X due])
    📍 Ready at: Main Counter

    You can pick it up at your earliest convenience. Thank you for trusting CleanWave Laundry! 🙏
    ```
  - Calls `Linking.openURL('whatsapp://send?phone=...&text=...')` with fallback to `https://wa.me/...`.
- **Triggers**:
  - In `OrdersScreen.js`: When order status is updated to `ready_for_delivery` (via manual button or service completion).
  - In `SortingScreen.js`: When staff taps `Mark Ready for Delivery`.
  - Displays prompt:
    `Alert.alert("Order Ready! 📦", "Order LN-XXXX is marked Ready! Would you like to notify the customer on WhatsApp?", [{ text: "Later", style: "cancel" }, { text: "📲 Send WhatsApp", onPress: () => sendOrderReadyWhatsApp(...) }])`.

## 3. Verification Plan
1. Admin Priority Settings: Edit timing in SettingsScreen, confirm persistence across app reload.
2. Intake Auto-Calculation: Select "Instant (2 hrs)", verify date and time slot auto-calculate.
3. Invoice Print & Share: Test "Print Slip" (`Print.printAsync`) and "Share PDF" (`Sharing.shareAsync`).
4. Auto WhatsApp Notification: Mark an order as Ready in OrdersScreen & SortingScreen, confirm the alert dialog appears and launches WhatsApp with pre-filled message.
