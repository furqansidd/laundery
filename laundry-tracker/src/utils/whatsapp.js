import { Linking, Alert } from "react-native";
import * as Sharing from "expo-sharing";

/**
 * Builds the formatted receipt text for customer sharing.
 */
export function buildReceiptMessage({ order, items, photoUrls = [] }) {
  const customerName = order.customer_name || order.customers?.name || "Valued Customer";
  const lines = [
    `🧺 *CleanWave Laundry — Order Receipt*`,
    `--------------------------------`,
    `👤 Customer: *${customerName}*`,
    `🧾 Order Code: *${order.order_code}*`,
    `📅 Date: ${new Date().toLocaleDateString()}`,
    ``,
    `*Garment Breakdown:*`,
    ...items
      .filter((i) => i.quantity > 0)
      .map((i) => `• ${i.name} x${i.quantity} — Rs ${i.quantity * i.unit_price}`),
    `--------------------------------`,
    `🧺 Total Items: *${order.total_item_count || items.reduce((a, b) => a + b.quantity, 0)} pcs*`,
    `💰 Total Bill: *Rs ${order.total_bill_amount || order.total_bill}*`,
    `--------------------------------`,
    `📸 *Intake Proof Photos attached.*`,
    `We will notify you once your order is washed, packed, and ready for pickup!`,
    `Thank you for choosing CleanWave Laundry! ✨`,
  ];
  return lines.join("\n");
}

/**
 * Shares real photo files directly to WhatsApp/System Share Sheet.
 */
export async function shareRealPhotosAndReceipt({ photoUris = [], message = "" }) {
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert("Sharing not available", "Sharing is not supported on this device.");
      return false;
    }

    // Share the primary proof photo directly as an image file
    if (photoUris.length > 0) {
      for (let i = 0; i < photoUris.length; i++) {
        await Sharing.shareAsync(photoUris[i], {
          mimeType: "image/jpeg",
          dialogTitle: `Share Proof Photo ${i + 1} & Receipt to Customer`,
          UTI: "public.jpeg",
        });
      }
      return true;
    }

    return false;
  } catch (err) {
    Alert.alert("Share Failed", err.message);
    return false;
  }
}

/**
 * Opens WhatsApp directly via deep link with formatted text receipt.
 */
export async function sendWhatsAppReceipt({ phoneNumber, message }) {
  const digitsOnly = (phoneNumber || "").replace(/[^\d]/g, "");
  const url = digitsOnly
    ? `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    Alert.alert(
      "WhatsApp not available",
      "Could not open WhatsApp on this device. Make sure it is installed."
    );
    return false;
  }
  await Linking.openURL(url);
  return true;
}
