# Laundry Tracker — Order Tracking & Verification (MVP)

A React Native (Expo) + Supabase app that eliminates lost/mixed-up garments
by tying every basket to a barcode and two intake photos.

The whole app is intentionally **two screens**, not a tab bar of five:

1. **New Order** — phone number → tap-count garments → 2 photos → barcode →
   share WhatsApp receipt → tag the basket. All in one continuous flow, no
   navigating away mid-task (Steps 1–3 of the brief).
2. **Scan & Verify** — scan the basket barcode → see expected count + the
   2 intake photos → mark ready for delivery (Step 4).

## Tech stack
- **Frontend:** React Native via Expo SDK 51, React Navigation (native-stack)
- **Backend:** Supabase (Postgres + Auth + Storage)
- **Barcode:** self-contained Code128 SVG generator (`src/utils/code128.js`)
  — no DOM-dependent libraries, which is why this avoids `jsbarcode`
  (it assumes a browser `document` and breaks in React Native).
- **Scanning:** `expo-camera`'s built-in barcode scanner
- **Receipt delivery:** WhatsApp `wa.me` deep link (no customer app needed)

## Project structure
```
App.js
src/
  navigation/AppNavigator.js      # 2-screen stack
  screens/
    HomeScreen.js                 # dashboard: "New Order" / "Scan & Verify"
    IntakeScreen.js               # Steps 1–3, single continuous flow
    SortingScreen.js              # Step 4: scan, compare, mark ready
  components/
    GarmentCounterRow.js          # tap +/- counter per garment type
    BarcodeLabel.js                # renders the Code128 barcode + code
  lib/
    supabase.js                   # Supabase client
    ordersApi.js                  # all DB/storage calls in one place
  utils/
    code128.js                    # barcode encoder (bar widths)
    whatsapp.js                   # builds & sends the WhatsApp receipt
  theme.js                        # shared colors/spacing/typography
supabase/
  schema.sql                      # full DB schema — run this first
```

## 1. Set up Supabase
1. Create a project at supabase.com.
2. Open **SQL Editor** and run the entire contents of `supabase/schema.sql`.
   This creates:
   - `customers`, `orders`, `item_types`, `order_items`, `order_events`
   - the `intake-photos` storage bucket (public read, authenticated write)
   - an `order_code` generator (`LN-YYMMDD-####`)
   - Row Level Security policies scoped to authenticated staff
3. Under **Authentication**, create one login per staff member (or a shared
   staff account for the MVP). The app currently doesn't include a login
   screen — add Supabase's `signInWithPassword` on top of `src/lib/supabase.js`
   before rolling out to real staff, or temporarily relax the RLS policies to
   `using (true)` while testing solo.
4. Copy your **Project URL** and **anon public key** from
   Project Settings → API.

## 2. Configure the app
Copy `.env.example` to `.env` and fill in your values, **then** put the same
values into `app.json` → `expo.extra` (Expo reads config at build time, not
from `.env` directly unless you add `react-native-dotenv` or `expo-env`):

```json
"extra": {
  "supabaseUrl": "https://YOUR-PROJECT-REF.supabase.co",
  "supabaseAnonKey": "your-anon-key-here"
}
```

## 3. Install & run
```bash
npm install
npx expo start
```
Scan the QR code with Expo Go on a phone (camera + barcode scanning need a
real device — the simulator's camera is limited).

## How each step maps to the brief

| Brief step | Where it lives |
|---|---|
| 1. Intake & Order Creation | `IntakeScreen.js` — phone entry, `GarmentCounterRow` taps, 2-photo capture via `expo-image-picker` camera, order + barcode created via `ordersApi.createOrder` |
| 2. Instant Customer Receipt | `utils/whatsapp.js` builds the summary text (order ID, item breakdown, bill, photo links) and opens `wa.me` with it pre-filled |
| 3. Basket Tagging | Still on the same screen post-creation: barcode renders via `BarcodeLabel`, staff enters a basket label, `markBasketTagged` flips status to `washing` |
| 4. Sorting, Matching & Verification | `SortingScreen.js` — `expo-camera` scans the barcode, `fetchOrderByCode` pulls expected count + the 2 intake photos side-by-side, `markReadyForDelivery` flips status to `ready_for_delivery` |

Every transition also writes to `order_events` for a full audit trail
(who scanned what, when a basket was tagged, when it was verified).

## Known MVP limitations & natural next steps
- **WhatsApp photos:** the free `wa.me` deep link can only pre-fill text, so
  photos are sent as links (WhatsApp renders them as previews). For true
  inline image attachments sent automatically, you'd integrate the
  **WhatsApp Business Cloud API** server-side — happy to wire that in next.
- **Printing barcode tags:** the app renders the barcode on-screen; for a
  physical label printer, pipe `BarcodeLabel`'s SVG through `expo-print` or
  a Bluetooth label-printer SDK (e.g. Zebra/Brother) depending on your
  hardware.
- **Login screen:** not included yet — add one screen wrapping
  `supabase.auth.signInWithPassword` before giving this to real staff.
- **Offline queue:** if the shop floor has patchy WiFi, queue `createOrder`
  and photo uploads locally and sync when back online.
