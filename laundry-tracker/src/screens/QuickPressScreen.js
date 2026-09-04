import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
  Keyboard,
  Platform,
  StatusBar,
} from "react-native";
import { colors, radius, spacing, typography, shadow } from "../theme";
import { createOrder, searchCustomers } from "../lib/ordersApi";
import BarcodeLabel from "../components/BarcodeLabel";
import { sendWhatsAppReceipt, buildReceiptMessage } from "../utils/whatsapp";
import { printBarcodeLabel } from "../utils/print";

const PRESS_ITEMS = [
  { id: 101, name: "Shirt (Press)", price: 30, icon: "👕" },
  { id: 102, name: "Pant (Press)", price: 35, icon: "👖" },
  { id: 103, name: "Kurta (Press)", price: 40, icon: "👗" },
  { id: 104, name: "Suit (Press)", price: 150, icon: "🧥" },
];

export default function QuickPressScreen({ navigation }) {
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [paymentStatus, setPaymentStatus] = useState("paid"); // "paid" | "unpaid"
  const [saving, setSaving] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);

  const handlePhoneChange = async (val) => {
    setPhone(val);
    if (val.trim().length >= 4) {
      try {
        const results = await searchCustomers(val.trim());
        setSuggestions(results);
      } catch (err) {
        setSuggestions([]);
      }
    } else {
      setSuggestions([]);
    }
  };

  const selectCustomer = (c) => {
    setCustomerName(c.name || "Walk-in");
    setPhone(c.phone_number || "");
    setSelectedCustomerId(c.id);
    setSuggestions([]);
    Keyboard.dismiss();
  };

  const updateQty = (id, delta) => {
    setQuantities((prev) => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: next };
    });
  };

  const totalCount = Object.values(quantities).reduce((a, b) => a + (b || 0), 0);
  const totalBill = PRESS_ITEMS.reduce(
    (sum, item) => sum + (quantities[item.id] || 0) * item.price,
    0
  );

  const canSubmit = phone.trim().length >= 5 && totalCount > 0 && !saving;

  const handleQuickSubmit = async () => {
    Keyboard.dismiss();
    setSaving(true);
    try {
      const items = PRESS_ITEMS.filter((i) => (quantities[i.id] || 0) > 0).map(
        (i) => ({
          item_type_id: i.id,
          name: i.name,
          service_type: "press_only",
          unit_type: "piece",
          quantity: quantities[i.id] || 0,
          unit_price: i.price,
        })
      );

      const nameToUse = customerName.trim() || "Walk-in Customer";

      const { order } = await createOrder({
        phoneNumber: phone.trim(),
        customerName: nameToUse,
        items,
        photoUrls: [],
        createdBy: "quick_counter",
        orderType: "urgent",
        slaTier: "express_2_4h",
        paymentStatus,
        tagsCount: 1,
        deliveryDate: "Today",
        deliveryTimeSlot: "Instant / Spot Press",
      });

      setCreatedOrder({
        ...order,
        customer_name: nameToUse,
        customer_phone: phone.trim(),
        items,
      });
    } catch (e) {
      Alert.alert("Quick Press Error", e.message);
    } finally {
      setSaving(false);
    }
  };

  const resetQuickFlow = () => {
    setCreatedOrder(null);
    setQuantities({});
    setCustomerName("");
    setPhone("");
    setSuggestions([]);
  };

  const handleWhatsApp = async () => {
    if (!createdOrder) return;
    const message = buildReceiptMessage({
      order: createdOrder,
      items: createdOrder.items || [],
      photoUrls: [],
    });
    await sendWhatsAppReceipt({
      phoneNumber: createdOrder.customer_phone,
      message,
    });
  };

  const handlePrint = async () => {
    if (!createdOrder) return;
    const itemsList = createdOrder.items || [];
    const totalQty = itemsList.length > 0 ? itemsList.reduce((a, b) => a + Number(b.quantity || 1), 0) : 1;
    await printBarcodeLabel({
      orderCode: createdOrder.order_code,
      customerName: createdOrder.customer_name,
      tagsCount: totalQty,
      items: itemsList,
      totalBill: createdOrder.total_bill_amount || 0,
    });
  };

  if (createdOrder) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.invoiceScroll}>
          <View style={[styles.invoiceCard, shadow]}>
            <View style={styles.successHeader}>
              <Text style={styles.successIcon}>⚡</Text>
              <Text style={styles.successTitle}>Spot Press Order Created!</Text>
              <Text style={styles.orderCodeText}>{createdOrder.order_code}</Text>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.metaText}>👤 {createdOrder.customer_name}</Text>
              <Text style={styles.metaText}>📞 {createdOrder.customer_phone}</Text>
              <Text style={[styles.paymentBadge, paymentStatus === "paid" ? styles.badgePaid : styles.badgeUnpaid]}>
                {paymentStatus === "paid" ? "💳 PAID CASH" : "⌛ UNPAID"}
              </Text>
            </View>

            <View style={styles.tableBox}>
              {(createdOrder.items || []).map((it, idx) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={{ flex: 2, fontWeight: "700" }}>{it.name}</Text>
                  <Text style={{ flex: 1, textAlign: "center" }}>x{it.quantity}</Text>
                  <Text style={{ flex: 1, textAlign: "right", fontWeight: "700" }}>
                    Rs {it.quantity * it.unit_price}
                  </Text>
                </View>
              ))}
              <View style={styles.tableTotalRow}>
                <Text style={styles.totalLabel}>Total ({totalCount} pcs)</Text>
                <Text style={styles.totalValue}>Rs {totalBill}</Text>
              </View>
            </View>

            <BarcodeLabel
              value={createdOrder.order_code}
              customerName={createdOrder.customer_name}
              moduleWidth={2}
              height={50}
            />
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: "#25D366", marginTop: spacing.md }]}
            onPress={handleWhatsApp}
          >
            <Text style={styles.primaryBtnText}>💬 Send WhatsApp Receipt</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.printBtn} onPress={handlePrint}>
            <Text style={styles.printBtnText}>🖨️ Print Instant Slip</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.resetBtn} onPress={resetQuickFlow}>
            <Text style={styles.resetBtnText}>⚡ Next Customer (5-Sec Counter)</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.bodyScroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>⚡ 5-Second Quick Press Counter</Text>
          <Text style={styles.headerSub}>Walk-in instant ironing & cash settlement</Text>
        </View>

        {/* Fast Customer Input */}
        <View style={styles.box}>
          <Text style={styles.label}>Customer Phone Number *</Text>
          <TextInput
            style={styles.input}
            placeholder="03XX XXXXXXX"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={handlePhoneChange}
          />

          {suggestions.length > 0 && (
            <View style={styles.suggestionsBox}>
              {suggestions.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.suggestionRow}
                  onPress={() => selectCustomer(c)}
                >
                  <Text style={styles.sName}>👤 {c.name || "Client"}</Text>
                  <Text style={styles.sPhone}>📞 {c.phone_number}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Text style={[styles.label, { marginTop: spacing.xs }]}>Customer Name (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="Walk-in Customer"
            value={customerName}
            onChangeText={setCustomerName}
          />
        </View>

        {/* Quick Press Garments Grid */}
        <View style={styles.box}>
          <Text style={styles.label}>Select Press Items (Tap +)</Text>
          <View style={styles.itemsGrid}>
            {PRESS_ITEMS.map((item) => {
              const qty = quantities[item.id] || 0;
              const active = qty > 0;
              return (
                <View key={item.id} style={[styles.itemCard, active && styles.itemCardActive]}>
                  <Text style={{ fontSize: 24 }}>{item.icon}</Text>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemPrice}>Rs {item.price}</Text>

                  <View style={styles.stepper}>
                    <TouchableOpacity
                      style={[styles.stepBtn, qty === 0 && styles.stepBtnDisabled]}
                      onPress={() => updateQty(item.id, -1)}
                      disabled={qty === 0}
                    >
                      <Text style={styles.stepBtnText}>–</Text>
                    </TouchableOpacity>

                    <Text style={styles.qtyText}>{qty}</Text>

                    <TouchableOpacity style={styles.stepBtn} onPress={() => updateQty(item.id, 1)}>
                      <Text style={styles.stepBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* Payment Status Selector */}
        <View style={styles.box}>
          <Text style={styles.label}>Cash Payment Settlement</Text>
          <View style={styles.payRow}>
            <TouchableOpacity
              style={[styles.payCard, paymentStatus === "paid" && styles.payCardPaid]}
              onPress={() => setPaymentStatus("paid")}
            >
              <Text style={styles.payIcon}>💳</Text>
              <Text style={[styles.payLabel, paymentStatus === "paid" && styles.payLabelPaid]}>
                PAID CASH
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.payCard, paymentStatus === "unpaid" && styles.payCardUnpaid]}
              onPress={() => setPaymentStatus("unpaid")}
            >
              <Text style={styles.payIcon}>⌛</Text>
              <Text style={[styles.payLabel, paymentStatus === "unpaid" && styles.payLabelUnpaid]}>
                UNPAID (On Return)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Submit Action */}
        <TouchableOpacity
          style={[styles.primaryBtn, shadow, !canSubmit && styles.btnDisabled]}
          onPress={handleQuickSubmit}
          disabled={!canSubmit}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              ⚡ Collect Rs {totalBill} & Generate Slip ({totalCount} pcs)
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.screenBg,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 6 : 0,
  },
  bodyScroll: { padding: spacing.md, paddingBottom: 60 },
  header: { marginBottom: spacing.sm },
  headerTitle: { fontSize: 20, fontWeight: "800", color: colors.primary },
  headerSub: { fontSize: 12, color: colors.textMuted },
  box: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  label: { fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    fontSize: 14,
    color: colors.text,
  },
  suggestionsBox: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    padding: 4,
    marginTop: 4,
  },
  suggestionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted,
  },
  sName: { fontSize: 12, fontWeight: "700" },
  sPhone: { fontSize: 11, color: colors.textMuted },
  itemsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  itemCard: {
    width: "48%",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    alignItems: "center",
  },
  itemCardActive: { borderColor: colors.primary, backgroundColor: "#EFF6FF" },
  itemName: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  itemPrice: { fontSize: 11, color: colors.primary, fontWeight: "800", marginBottom: 6 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnDisabled: { backgroundColor: colors.border },
  stepBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  qtyText: { fontSize: 14, fontWeight: "800", minWidth: 20, textAlign: "center" },
  payRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  payCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 6,
  },
  payCardPaid: { backgroundColor: "#DCFCE7", borderColor: "#16A34A" },
  payCardUnpaid: { backgroundColor: "#FEF3C7", borderColor: "#D97706" },
  payIcon: { fontSize: 16 },
  payLabel: { fontSize: 11, fontWeight: "800", color: colors.textMuted },
  payLabelPaid: { color: "#15803D" },
  payLabelUnpaid: { color: "#B45309" },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  btnDisabled: { opacity: 0.4 },
  invoiceScroll: { padding: spacing.md },
  invoiceCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  successHeader: { alignItems: "center", marginBottom: spacing.md },
  successIcon: { fontSize: 32 },
  successTitle: { fontSize: 18, fontWeight: "800", color: colors.primary },
  orderCodeText: { fontSize: 14, fontWeight: "700", color: colors.textMuted },
  metaRow: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  metaText: { fontSize: 12, fontWeight: "700" },
  paymentBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, fontSize: 10, fontWeight: "800" },
  badgePaid: { backgroundColor: "#DCFCE7", color: "#15803D" },
  badgeUnpaid: { backgroundColor: "#FEF3C7", color: "#B45309" },
  tableBox: { width: "100%", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.md },
  tableRow: { flexDirection: "row", paddingVertical: 4 },
  tableTotalRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6, marginTop: 4 },
  totalLabel: { fontWeight: "700", fontSize: 13 },
  totalValue: { fontWeight: "800", fontSize: 15, color: colors.primary },
  printBtn: { width: "100%", backgroundColor: "#fff", borderWidth: 1.5, borderColor: colors.primary, paddingVertical: 12, borderRadius: radius.md, alignItems: "center", marginTop: spacing.xs },
  printBtnText: { color: colors.primary, fontWeight: "800" },
  resetBtn: { marginTop: spacing.md, alignItems: "center" },
  resetBtnText: { color: colors.primary, fontWeight: "700", fontSize: 14 },
});
