import { Linking, Alert } from "react-native";
import * as Sharing from "expo-sharing";
import * as Print from "expo-print";
import { encodeCode128B } from "./code128";

/**
 * Normalizes phone numbers for WhatsApp API (e.g. 03001234567 -> 923001234567).
 */
export function formatPhoneForWhatsApp(phoneNumber) {
  let digits = (phoneNumber || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("0") && digits.length === 11) {
    digits = "92" + digits.slice(1);
  } else if (digits.length === 10 && digits.startsWith("3")) {
    digits = "92" + digits;
  }
  return digits;
}

export function getServiceTypeLabel(serviceKey) {
  switch (serviceKey) {
    case "press_only": return "👔 Press Only";
    case "dry_clean": return "🧪 Dry Clean";
    case "wash_fold": return "🧼 Wash & Fold";
    case "wash_press": default: return "🧺 Wash & Press";
  }
}

export function getOrderTypeLabel(typeKey) {
  switch (typeKey) {
    case "urgent": return "🔥 URGENT (Instant / 2-4 Hours)";
    case "express": return "⚡ EXPRESS (Same Day)";
    case "normal": default: return "📦 NORMAL (Standard)";
  }
}

/**
 * Builds the formatted receipt text for customer WhatsApp sharing.
 * Includes customer info, order type, delivery schedule, garment breakdown (with service type), and photos.
 */
export function buildReceiptMessage({ order = {}, items = [], photoUrls = [] }) {
  const customerName =
    order.customer_name || order.customers?.name || "Valued Customer";
  const orderCode = order.order_code || "LN-ORDER";
  const dateStr = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const orderTypeStr = getOrderTypeLabel(order.order_type || "normal");
  const delDateStr = order.delivery_date || "As per schedule";
  const delTimeStr = order.delivery_time_slot || "Anytime";

  const totalItems =
    order.total_item_count ||
    items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  const totalBill =
    order.total_bill_amount ??
    order.total_bill ??
    items.reduce(
      (sum, i) =>
        sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
      0
    );

  const activeItems = (items || []).filter(
    (i) => (Number(i.quantity) || 0) > 0
  );
  const itemList =
    activeItems.length > 0
      ? activeItems.map((i) => {
          const name = i.name || i.item_types?.name || "Garment";
          const serviceTag = getServiceTypeLabel(i.service_type);
          const qty = Number(i.quantity) || 0;
          const price = Number(i.unit_price) || 0;
          return `• ${name} [${serviceTag}] x${qty} — Rs ${qty * price}`;
        })
      : ["• Laundry Service (General)"];

  const validPhotoUrls = (photoUrls || []).filter(
    (url) => typeof url === "string" && url.trim().length > 0
  );

  const photoSection =
    validPhotoUrls.length > 0
      ? [
          `📸 *Intake Proof Photos (${validPhotoUrls.length} attached):*`,
          ...validPhotoUrls.map((url, idx) => `Photo ${idx + 1}: ${url}`),
          `--------------------------------`,
        ]
      : [];

  const lines = [
    `🧺 *CleanWave Laundry — Order Receipt*`,
    `--------------------------------`,
    `👤 Customer: *${customerName}*`,
    `🧾 Order Code: *${orderCode}*`,
    `🏷️ Physical Hanger Tags: *${order.tags_count || 1} Tags*`,
    `⚡ SLA Priority: *${orderTypeStr}*`,
    `📅 Promised Delivery: *${delDateStr} (${delTimeStr})*`,
    `💳 Payment Settlement: *${order.payment_status === "paid" ? "PAID CASH" : "UNPAID (On Return)"}*`,
    `--------------------------------`,
    `📋 *Garment & Service Breakdown:*`,
    ...itemList,
    `--------------------------------`,
    `🧺 Total Items: *${totalItems} pcs*`,
    `💰 Total Bill: *Rs ${totalBill}*`,
    `--------------------------------`,
    ...photoSection,
    `✨ *Status:* Processing`,
    `We will notify you once your garments are ready for pickup/delivery!`,
    ``,
    `Thank you for choosing CleanWave Laundry! 🌟`,
  ];

  return lines.filter((l) => l !== undefined).join("\n");
}

/**
 * Opens WhatsApp directly with customer chat and prefilled receipt text.
 */
export async function sendWhatsAppReceipt({ phoneNumber, message }) {
  try {
    const formattedDigits = formatPhoneForWhatsApp(phoneNumber);
    const encodedText = encodeURIComponent(message);

    // Try native app scheme first if phone is provided
    const nativeUrl = formattedDigits
      ? `whatsapp://send?phone=${formattedDigits}&text=${encodedText}`
      : `whatsapp://send?text=${encodedText}`;

    const canOpenNative = await Linking.canOpenURL(nativeUrl).catch(
      () => false
    );

    if (canOpenNative) {
      await Linking.openURL(nativeUrl);
      return true;
    }

    // Fallback to web universal link
    const webUrl = formattedDigits
      ? `https://wa.me/${formattedDigits}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`;

    await Linking.openURL(webUrl);
    return true;
  } catch (err) {
    Alert.alert(
      "WhatsApp Error",
      "Could not launch WhatsApp. Please check if WhatsApp is installed."
    );
    return false;
  }
}

/**
 * Generates modern, compact 80mm printable and shareable receipt slip HTML
 */
export function generateInvoiceSlipHtml({ order = {}, items = [], photoUrls = [] }) {
  const customerName =
    order.customer_name || order.customers?.name || "Valued Customer";
  const customerPhone =
    order.customer_phone || order.customers?.phone_number || "";
  const orderCode = order.order_code || "LN-ORDER";
  const dateStr = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const orderTypeStr = getOrderTypeLabel(order.order_type || "normal");
  const delDateStr = order.delivery_date || "As per schedule";
  const delTimeStr = order.delivery_time_slot || "Anytime";

  const activeItems = (items || []).filter(
    (i) => (Number(i.quantity) || 0) > 0
  );
  const totalItems =
    order.total_item_count ||
    items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  const totalBill =
    order.total_bill_amount ??
    order.total_bill ??
    items.reduce(
      (sum, i) =>
        sum + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
      0
    );

  const isPaid = order.payment_status === "paid";

  // Encode Code128 Barcode for invoice
  const { widths, bars } = encodeCode128B(orderCode);
  const moduleWidth = 2;
  const totalBarcodeWidth = widths.reduce((a, b) => a + b, 0) * moduleWidth;

  let x = 0;
  let barcodeRects = "";
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i] * moduleWidth;
    if (bars[i]) {
      barcodeRects += `<rect x="${x}" y="0" width="${w}" height="48" fill="#0f172a" />`;
    }
    x += w;
  }

  // Build Table Rows
  const tableRows = (
    activeItems.length > 0
      ? activeItems
      : [{ name: "Laundry Service", quantity: totalItems || 1, unit_price: totalBill }]
  )
    .map((it) => {
      const name = it.name || it.item_types?.name || "Garment";
      const serviceTag = getServiceTypeLabel(it.service_type);
      const qty = Number(it.quantity) || 0;
      const price = Number(it.unit_price) || 0;
      return `
      <tr>
        <td style="padding: 7px 4px; border-bottom: 1px dashed #e2e8f0;">
          <div style="font-weight: 700; color: #0f172a; font-size: 13px;">${name}</div>
          <div style="font-size: 10px; font-weight: 700; color: #0284c7; margin-top: 1px;">${serviceTag}</div>
        </td>
        <td style="padding: 7px 4px; border-bottom: 1px dashed #e2e8f0; text-align: center; font-weight: 700; font-size: 13px;">${qty}</td>
        <td style="padding: 7px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; color: #64748b; font-size: 12px;">Rs ${price}</td>
        <td style="padding: 7px 4px; border-bottom: 1px dashed #e2e8f0; text-align: right; font-weight: 800; color: #0f172a; font-size: 13px;">Rs ${qty * price}</td>
      </tr>
    `;
    })
    .join("");

  // Build Photos HTML Gallery
  const validPhotoUrls = (photoUrls || []).filter(
    (url) => typeof url === "string" && url.trim().length > 0
  );

  const photosHtml =
    validPhotoUrls.length > 0
      ? `
      <div style="margin-top: 14px; padding-top: 12px; border-top: 1px dashed #cbd5e1;">
        <div style="font-size: 11px; font-weight: 800; color: #0284c7; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
          📸 Intake Photos (${validPhotoUrls.length})
        </div>
        <div style="display: flex; gap: 8px; justify-content: space-between;">
          ${validPhotoUrls
            .map(
              (url, idx) => `
            <div style="flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; overflow: hidden; background-color: #f8fafc; text-align: center;">
              <img src="${url}" style="width: 100%; height: 110px; object-fit: cover; display: block;" />
              <div style="padding: 3px; font-size: 10px; font-weight: 700; color: #475569; background: #f1f5f9;">Photo ${idx + 1}</div>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `
      : "";

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          @page {
            size: 80mm auto;
            margin: 3mm;
          }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 8px;
            background-color: #f8fafc;
          }
          .invoice-box {
            max-width: 380px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.06);
          }
          .brand-header {
            text-align: center;
            border-bottom: 2px solid #0284c7;
            padding-bottom: 10px;
            margin-bottom: 12px;
          }
          .brand-name {
            font-size: 20px;
            font-weight: 900;
            color: #0284c7;
            letter-spacing: -0.3px;
          }
          .brand-tag {
            font-size: 11px;
            color: #64748b;
            margin-top: 2px;
          }
          .meta-grid {
            background-color: #f8fafc;
            border-radius: 8px;
            padding: 10px;
            margin-bottom: 12px;
            border: 1px solid #e2e8f0;
          }
          .meta-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
          }
          .meta-row:last-child {
            margin-bottom: 0;
          }
          .meta-label {
            font-size: 11px;
            color: #64748b;
            font-weight: 600;
          }
          .meta-val {
            font-size: 12px;
            font-weight: 700;
            color: #0f172a;
          }
          .badge-box {
            background-color: #e0f2fe;
            border: 1px solid #7dd3fc;
            border-radius: 6px;
            padding: 8px 10px;
            margin-bottom: 12px;
          }
          .schedule-text {
            font-size: 12px;
            font-weight: 800;
            color: #0369a1;
          }
          .priority-text {
            font-size: 11px;
            font-weight: 700;
            color: #0284c7;
            margin-top: 2px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
          }
          th {
            background-color: #f1f5f9;
            padding: 6px 4px;
            font-size: 10px;
            font-weight: 800;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .totals-box {
            background-color: ${isPaid ? "#f0fdf4" : "#fef3c7"};
            border: 1px solid ${isPaid ? "#bbf7d0" : "#fde68a"};
            border-radius: 8px;
            padding: 10px 12px;
            margin-top: 10px;
          }
          .totals-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .total-amount {
            font-size: 18px;
            font-weight: 900;
            color: ${isPaid ? "#15803d" : "#b45309"};
          }
          .payment-pill {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 10px;
            font-weight: 800;
            background-color: ${isPaid ? "#16a34a" : "#d97706"};
            color: #ffffff;
            margin-top: 4px;
          }
          .barcode-section {
            text-align: center;
            margin-top: 14px;
            padding-top: 12px;
            border-top: 1px dashed #cbd5e1;
          }
          .barcode-svg {
            display: block;
            width: 220px;
            height: 40px;
            margin: 0 auto;
          }
          .barcode-code {
            font-size: 13px;
            font-weight: 800;
            letter-spacing: 2px;
            color: #0f172a;
            margin-top: 3px;
          }
          .footer-note {
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
            margin-top: 12px;
            line-height: 1.4;
          }
        </style>
      </head>
      <body>
        <div class="invoice-box">
          <div class="brand-header">
            <div class="brand-name">🧺 CleanWave Laundry</div>
            <div class="brand-tag">Premium Care & Garment Tracking Slip</div>
          </div>

          <div class="meta-grid">
            <div class="meta-row">
              <span class="meta-label">Customer:</span>
              <span class="meta-val">${customerName}</span>
            </div>
            ${
              customerPhone
                ? `<div class="meta-row">
                    <span class="meta-label">Phone:</span>
                    <span class="meta-val">${customerPhone}</span>
                  </div>`
                : ""
            }
            <div class="meta-row">
              <span class="meta-label">Order Code:</span>
              <span class="meta-val">${orderCode}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Date & Time:</span>
              <span class="meta-val">${dateStr} • ${timeStr}</span>
            </div>
          </div>

          <div class="badge-box">
            <div class="schedule-text">📅 Promised: ${delDateStr} (${delTimeStr})</div>
            <div class="priority-text">⚡ Priority: ${orderTypeStr}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Item</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: right;">Rate</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>

          <div class="totals-box">
            <div class="totals-header">
              <div style="font-size: 12px; font-weight: 700; color: #334155;">
                Total Items: <strong>${totalItems} pcs</strong>
              </div>
              <div class="total-amount">Rs ${totalBill}</div>
            </div>
            <div style="display: flex; justify-content: flex-end;">
              <span class="payment-pill">
                ${isPaid ? "✓ PAID IN FULL" : "⌛ UNPAID (Due on Pickup)"}
              </span>
            </div>
          </div>

          ${photosHtml}

          <div class="barcode-section">
            <svg class="barcode-svg" viewBox="0 0 ${totalBarcodeWidth} 48" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="${totalBarcodeWidth}" height="48" fill="#ffffff"/>
              ${barcodeRects}
            </svg>
            <div class="barcode-code">${orderCode}</div>
          </div>

          <div class="footer-note">
            Thank you for trusting CleanWave Laundry! 🙏<br/>
            We will notify you via WhatsApp once packed & ready.
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Directly prints the modern invoice slip using the system print sheet (AirPrint, POS thermal, WiFi, PDF).
 */
export async function printInvoiceSlip({ order = {}, items = [], photoUrls = [] }) {
  try {
    const html = generateInvoiceSlipHtml({ order, items, photoUrls });
    await Print.printAsync({ html });
    return true;
  } catch (err) {
    Alert.alert("Print Error", err.message || "Failed to initiate printer.");
    return false;
  }
}

/**
 * Generates modern PDF slip and opens the system Share sheet to send to WhatsApp or save.
 */
export async function shareInvoiceSlipPdf({ order = {}, items = [], photoUrls = [] }) {
  try {
    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (!isSharingAvailable) {
      Alert.alert(
        "Sharing Not Supported",
        "Document sharing is not supported on this device."
      );
      return false;
    }

    const html = generateInvoiceSlipHtml({ order, items, photoUrls });
    const file = await Print.printToFileAsync({ html });
    const orderCode = order.order_code || "LN-ORDER";

    await Sharing.shareAsync(file.uri, {
      mimeType: "application/pdf",
      dialogTitle: `Share Invoice for ${orderCode}`,
      UTI: "com.adobe.pdf",
    });
    return true;
  } catch (err) {
    Alert.alert("PDF Share Error", err.message);
    return false;
  }
}

/** Legacy alias for backwards compatibility */
export const sharePdfInvoiceWithPhotos = shareInvoiceSlipPdf;

/**
 * Sends customer an automatic WhatsApp message notifying them that their order is completed and ready.
 */
export async function sendOrderReadyWhatsApp(order = {}) {
  const phone = order.customer_phone || order.customers?.phone_number || "";
  const name = order.customer_name || order.customers?.name || "Valued Customer";
  const code = order.order_code || "LN-ORDER";
  const totalItems =
    order.total_item_count ||
    (order.order_items || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0) ||
    1;
  const totalBill =
    order.total_bill_amount ??
    order.total_bill ??
    (order.order_items || []).reduce(
      (s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
      0
    );
  const isPaid = order.payment_status === "paid";
  const payText = isPaid
    ? "✅ PAID CASH"
    : `⌛ UNPAID (Rs ${totalBill} due on collection)`;

  const message = [
    `🧺 *CleanWave Laundry — Order Ready!*`,
    `--------------------------------`,
    `Hello *${name}*! ✨`,
    ``,
    `Great news! Your laundry order is washed, packed, and *READY FOR PICKUP*! 📦`,
    ``,
    `🧾 Order Code: *${code}*`,
    `🧺 Total Garments: *${totalItems} pcs*`,
    `💰 Total Bill: *Rs ${totalBill}* (${payText})`,
    `📍 Pickup Location: *Main Laundry Counter*`,
    `--------------------------------`,
    `You can collect your fresh garments at your earliest convenience. Thank you for choosing CleanWave Laundry! 🙏`,
  ].join("\n");

  return await sendWhatsAppReceipt({ phoneNumber: phone, message });
}

/**
 * Format and send Customer Account Ledger Statement via WhatsApp
 */
export async function sendCustomerLedgerWhatsApp({ customerName, phoneNumber, ledgerData }) {
  if (!phoneNumber) {
    Alert.alert("Error", "No phone number available for WhatsApp sharing.");
    return false;
  }

  const name = customerName || "Valued Customer";
  const totalOrders = ledgerData?.totalOrders || 0;
  const totalBill = ledgerData?.totalBill || 0;
  const totalPaid = ledgerData?.totalPaid || 0;
  const pending = ledgerData?.pendingBalance || 0;

  let msg = `🧺 *LAUNDRY ACCOUNT STATEMENT*\n`;
  msg += `👤 Customer: *${name}*\n`;
  msg += `📞 Phone: ${phoneNumber}\n`;
  msg += `📅 Date: ${new Date().toLocaleDateString()}\n`;
  msg += `--------------------------------\n`;
  msg += `📦 Total Orders: ${totalOrders}\n`;
  msg += `💰 Total Bill Amount: Rs ${totalBill}\n`;
  msg += `💵 Total Payments Received: Rs ${totalPaid}\n`;
  msg += `--------------------------------\n`;
  if (pending > 0) {
    msg += `🔴 *PENDING ACCOUNT BALANCE: Rs ${pending}*\n\n`;
    msg += `Kindly clear your pending balance at your earliest convenience. Thank you for your business! 🙏`;
  } else {
    msg += `🟢 *ALL DUES CLEARED (Rs 0 BALANCE)*\n\n`;
    msg += `Thank you for being a valued customer! 🙏`;
  }

  const formattedPhone = formatPhoneForWhatsApp(phoneNumber);
  const encodedText = encodeURIComponent(msg);
  const waUrl = `whatsapp://send?phone=${formattedPhone}&text=${encodedText}`;

  try {
    const canOpen = await Linking.canOpenURL(waUrl);
    if (canOpen) {
      await Linking.openURL(waUrl);
      return true;
    } else {
      const webUrl = `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodedText}`;
      await Linking.openURL(webUrl);
      return true;
    }
  } catch (err) {
    Alert.alert("WhatsApp Error", "Could not open WhatsApp on this device.");
    return false;
  }
}
