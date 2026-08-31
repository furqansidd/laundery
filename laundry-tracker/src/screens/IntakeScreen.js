import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Platform,
  ScrollView,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import BarcodeLabel from "../components/BarcodeLabel";
import PhotoViewerModal from "../components/PhotoViewerModal";
import { colors, radius, spacing, typography, shadow } from "../theme";
import {
  fetchItemTypes,
  createOrder,
  uploadIntakePhoto,
  searchCustomers,
} from "../lib/ordersApi";
import { supabase } from "../lib/supabase";
import {
  buildReceiptMessage,
  sendWhatsAppReceipt,
  shareRealPhotosAndReceipt,
} from "../utils/whatsapp";
import { printBarcodeLabel } from "../utils/print";

const STEPS = {
  DETAILS: "details",
  SAVING: "saving",
  DONE: "done",
};

// Auto-map icons for garment types
const getGarmentIcon = (name = "") => {
  const n = name.toLowerCase();
  if (n.includes("shirt") || n.includes("t-shirt") || n.includes("top")) return "👕";
  if (n.includes("jeans")) return "👖";
  if (n.includes("pant") || n.includes("trouser")) return "👖";
  if (n.includes("sock")) return "🧦";
  if (n.includes("suit") || n.includes("blazer") || n.includes("coat")) return "👔";
  if (n.includes("bed") || n.includes("sheet") || n.includes("pillow")) return "🛏️";
  if (n.includes("towel")) return "🧣";
  if (n.includes("jacket") || n.includes("hoodie")) return "🧥";
  if (n.includes("blanket")) return "🛋️";
  if (n.includes("saree") || n.includes("lehenga")) return "🥻";
  if (n.includes("kurta") || n.includes("dress") || n.includes("frock")) return "👗";
  return "🧺";
};

export default function IntakeScreen({ navigation }) {
  const [step, setStep] = useState(STEPS.DETAILS);
  const [itemTypes, setItemTypes] = useState([]);
  const [quantities, setQuantities] = useState({}); // { item_type_id: qty }
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);

  // Customer suggestions
  const [suggestions, setSuggestions] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);

  // Photo viewer state
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  useEffect(() => {
    fetchItemTypes()
      .then(setItemTypes)
      .catch((e) => Alert.alert("Couldn't load garment list", e.message));
  }, []);

  const handleNameChange = async (val) => {
    setCustomerName(val);
    setSelectedCustomerId(null);

    if (val.trim().length >= 2) {
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

  const handlePhoneChange = async (val) => {
    setPhone(val);
    if (!selectedCustomerId && val.trim().length >= 4 && customerName.trim().length < 2) {
      try {
        const results = await searchCustomers(val.trim());
        setSuggestions(results);
      } catch (err) {
        setSuggestions([]);
      }
    }
  };

  const selectCustomer = (customer) => {
    setCustomerName(customer.name || "");
    setPhone(customer.phone_number || "");
    setSelectedCustomerId(customer.id);
    setSuggestions([]);
    Keyboard.dismiss();
  };

  const updateQty = (id, delta) => {
    Keyboard.dismiss();
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
  const totalBill = itemTypes.reduce(
    (sum, t) => sum + (quantities[t.id] || 0) * Number(t.default_price),
    0
  );

  const takePhoto = useCallback(async () => {
    Keyboard.dismiss();
    if (photos.length >= 2) {
      Alert.alert("Already have 2 photos", "Remove one first to retake.");
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera permission needed", "Enable camera access to photograph garments.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      allowsEditing: false,
    });
    if (!result.canceled) {
      setPhotos((p) => [...p, result.assets[0].uri]);
    }
  }, [photos]);

  const removePhoto = (uri) => setPhotos((p) => p.filter((x) => x !== uri));

  const openPhotoViewer = (index = 0) => {
    Keyboard.dismiss();
    if (photos.length === 0) return;
    setViewerIndex(index);
    setViewerVisible(true);
  };

  const canSubmit =
    phone.trim().length >= 7 &&
    customerName.trim().length >= 2 &&
    totalCount > 0 &&
    photos.length === 2 &&
    !saving;

  const handleCreateOrder = async () => {
    Keyboard.dismiss();
    setSaving(true);
    setStep(STEPS.SAVING);
    try {
      const items = itemTypes
        .filter((t) => (quantities[t.id] || 0) > 0)
        .map((t) => ({
          item_type_id: t.id,
          name: t.name,
          quantity: quantities[t.id] || 0,
          unit_price: Number(t.default_price),
        }));

      const { order, customer } = await createOrder({
        phoneNumber: phone.trim(),
        customerName: customerName.trim(),
        items,
        photoUrls: [],
        createdBy: "staff",
      });

      const uploadedUrls = [];
      for (let i = 0; i < photos.length; i++) {
        const url = await uploadIntakePhoto(photos[i], order.order_code, i + 1);
        uploadedUrls.push(url);
      }

      await supabase
        .from("orders")
        .update({ intake_photo_urls: uploadedUrls, status: "washing" })
        .eq("id", order.id);

      setCreatedOrder({
        ...order,
        status: "washing",
        customer_name: customerName.trim(),
        customer_phone: phone.trim(),
        intake_photo_urls: uploadedUrls,
        local_photos: [...photos],
        items,
      });
      setStep(STEPS.DONE);
    } catch (e) {
      Alert.alert("Couldn't create order", e.message);
      setStep(STEPS.DETAILS);
    } finally {
      setSaving(false);
    }
  };

  // Share real photos + formatted invoice to client via WhatsApp
  const handleShareInvoiceAndPhotos = async () => {
    const photoList = createdOrder?.local_photos || photos;
    const message = buildReceiptMessage({
      order: createdOrder,
      items: createdOrder.items || [],
      photoUrls: createdOrder.intake_photo_urls || [],
    });

    if (photoList && photoList.length > 0) {
      await shareRealPhotosAndReceipt({
        photoUris: photoList,
        message,
      });
    } else {
      await sendWhatsAppReceipt({
        phoneNumber: createdOrder.customer_phone || phone.trim(),
        message,
      });
    }
  };

  // Print barcode sticker
  const handlePrintBarcode = async () => {
    await printBarcodeLabel({
      orderCode: createdOrder.order_code,
      customerName: createdOrder.customer_name || customerName,
      itemCount: totalCount,
      totalBill: totalBill,
    });
  };

  const resetFlow = () => {
    setStep(STEPS.DETAILS);
    setQuantities({});
    setCustomerName("");
    setPhone("");
    setSelectedCustomerId(null);
    setSuggestions([]);
    setPhotos([]);
    setCreatedOrder(null);
  };

  if (step === STEPS.SAVING) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[typography.body, { marginTop: spacing.md, fontWeight: "700" }]}>
          Saving order & uploading photos…
        </Text>
      </SafeAreaView>
    );
  }

  // =========================================================================
  // STEP: DONE — CLEAN INVOICE & COMPACT BARCODE SCREEN
  // =========================================================================
  if (step === STEPS.DONE && createdOrder) {
    const orderDate = new Date().toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const orderTime = new Date().toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.invoiceScroll}>
          {/* Invoice Card */}
          <View style={[styles.invoiceCard, shadow]}>
            {/* Store Header */}
            <View style={styles.invoiceHeader}>
              <Text style={styles.invoiceBrand}>🧺 CleanWave Laundry</Text>
              <Text style={styles.invoiceType}>INVOICE</Text>
            </View>

            {/* Customer & Timestamp Details */}
            <View style={styles.invoiceMetaRow}>
              <View>
                <Text style={styles.metaLabel}>CUSTOMER</Text>
                <Text style={styles.metaValue}>{createdOrder.customer_name || customerName}</Text>
                <Text style={styles.metaSub}>{createdOrder.customer_phone || phone}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.metaLabel}>DATE & TIME</Text>
                <Text style={styles.metaValue}>{orderDate}</Text>
                <Text style={styles.metaSub}>{orderTime}</Text>
              </View>
            </View>

            {/* Itemized Garments Breakdown Table */}
            <View style={styles.tableBox}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 2 }]}>ITEM</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "center" }]}>QTY</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>PRICE</Text>
                <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>TOTAL</Text>
              </View>

              {(createdOrder.items || []).map((it, idx) => (
                <View key={idx} style={styles.tableRow}>
                  <Text style={[styles.td, { flex: 2, fontWeight: "600" }]}>
                    {getGarmentIcon(it.name)} {it.name}
                  </Text>
                  <Text style={[styles.td, { flex: 1, textAlign: "center" }]}>
                    {it.quantity}
                  </Text>
                  <Text style={[styles.td, { flex: 1, textAlign: "right", color: colors.textMuted }]}>
                    Rs {it.unit_price}
                  </Text>
                  <Text style={[styles.td, { flex: 1, textAlign: "right", fontWeight: "700" }]}>
                    Rs {it.quantity * it.unit_price}
                  </Text>
                </View>
              ))}

              {/* Total Summary */}
              <View style={styles.tableTotalRow}>
                <Text style={styles.tableTotalLabel}>Total Pieces: {totalCount} pcs</Text>
                <Text style={styles.tableTotalValue}>Total: Rs {totalBill}</Text>
              </View>
            </View>

            {/* Barcode Visual at End of Invoice */}
            <BarcodeLabel
              value={createdOrder.order_code}
              customerName={createdOrder.customer_name || customerName}
              moduleWidth={2}
              height={50}
            />
          </View>

          {/* Action Button 1: Share Invoice & Photos to Client */}
          <TouchableOpacity
            style={[styles.primaryBtn, shadow, { marginTop: spacing.md }]}
            onPress={handleShareInvoiceAndPhotos}
          >
            <Text style={styles.primaryBtnText}>
              📲 Share Invoice & Photos to Client
            </Text>
          </TouchableOpacity>

          {/* Action Button 2: Print Barcode Tag */}
          <TouchableOpacity
            style={styles.printBtn}
            onPress={handlePrintBarcode}
          >
            <Text style={styles.printBtnText}>
              🖨️ Print Barcode Tag
            </Text>
          </TouchableOpacity>

          {/* Start New Order */}
          <TouchableOpacity style={styles.linkBtn} onPress={resetFlow}>
            <Text style={styles.linkBtnText}>＋ Start New Order</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // =========================================================================
  // STEP: DETAILS — INTAKE SCREEN
  // =========================================================================
  return (
    <SafeAreaView style={styles.safe}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.mainLayout}>
          {/* Top Header */}
          <View style={styles.topHeader}>
            <Text style={styles.headerTitle}>Create Order</Text>
            <View style={styles.headerCountBadge}>
              <Text style={styles.headerCountText}>
                {totalCount} Items • Rs {totalBill}
              </Text>
            </View>
          </View>

          {/* Customer Input Box */}
          <View style={styles.customerBox}>
            {/* Customer Name */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Customer Name</Text>
                {selectedCustomerId && (
                  <Text style={styles.savedBadge}>✓ Saved Client</Text>
                )}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Type customer name…"
                value={customerName}
                onChangeText={handleNameChange}
                returnKeyType="next"
              />

              {/* Live Autocomplete Dropdown */}
              {suggestions.length > 0 && (
                <View style={[styles.suggestionsBox, shadow]}>
                  <Text style={styles.suggestionsTitle}>
                    Select Previous Customer:
                  </Text>
                  {suggestions.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={styles.suggestionRow}
                      onPress={() => selectCustomer(c)}
                    >
                      <Text style={styles.suggestionName}>👤 {c.name || "Client"}</Text>
                      <Text style={styles.suggestionPhone}>📞 {c.phone_number}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Customer Phone Number */}
            <View style={[styles.inputGroup, { marginTop: 6 }]}>
              <Text style={styles.fieldLabel}>Customer Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="03XX XXXXXXX"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={handlePhoneChange}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>
          </View>

          {/* Garments POS Tile Grid */}
          <View style={styles.garmentsSection}>
            <Text style={styles.sectionTitle}>Garments (Tap to count)</Text>
            <View style={styles.tilesGrid}>
              {itemTypes.slice(0, 9).map((t) => {
                const qty = quantities[t.id] || 0;
                const isSelected = qty > 0;
                const icon = getGarmentIcon(t.name);

                return (
                  <View
                    key={t.id}
                    style={[styles.tileCard, isSelected && styles.tileCardActive]}
                  >
                    <TouchableOpacity
                      style={styles.tileTapArea}
                      onPress={() => updateQty(t.id, 1)}
                      activeOpacity={0.75}
                    >
                      <Text style={styles.tileIcon}>{icon}</Text>
                      <Text style={styles.tileName} numberOfLines={1}>
                        {t.name}
                      </Text>
                      <Text style={styles.tilePrice}>
                        Rs {Number(t.default_price).toFixed(0)}
                      </Text>
                    </TouchableOpacity>

                    {/* Quantity Stepper */}
                    <View style={styles.stepperRow}>
                      <TouchableOpacity
                        style={[styles.stepperBtn, qty === 0 && styles.stepperBtnDisabled]}
                        onPress={() => updateQty(t.id, -1)}
                        disabled={qty === 0}
                      >
                        <Text style={styles.stepperBtnText}>−</Text>
                      </TouchableOpacity>

                      <Text style={[styles.stepperCount, isSelected && styles.stepperCountActive]}>
                        {qty}
                      </Text>

                      <TouchableOpacity
                        style={styles.stepperBtn}
                        onPress={() => updateQty(t.id, 1)}
                      >
                        <Text style={styles.stepperBtnText}>＋</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Photos & Action Section */}
          <View style={styles.bottomSection}>
            <View style={styles.photoHeaderRow}>
              <Text style={styles.fieldLabel}>Wide-Angle Proof Photos ({photos.length}/2)</Text>
            </View>

            <View style={styles.photoRow}>
              {photos.map((uri, idx) => (
                <View key={uri} style={styles.photoWrap}>
                  <TouchableOpacity onPress={() => openPhotoViewer(idx)}>
                    <Image source={{ uri }} style={styles.photo} />
                    <View style={styles.zoomTag}>
                      <Text style={styles.zoomTagText}>🔍 Photo {idx + 1}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.removeBadge}
                    onPress={() => removePhoto(uri)}
                  >
                    <Text style={styles.removeBadgeText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {photos.length < 2 && (
                <TouchableOpacity style={styles.addPhotoBox} onPress={takePhoto}>
                  <Text style={{ fontSize: 22 }}>📷</Text>
                  <Text style={styles.addPhotoText}>Take Photo {photos.length + 1}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.primaryBtn, shadow, !canSubmit && styles.btnDisabled]}
              onPress={handleCreateOrder}
              disabled={!canSubmit}
            >
              <Text style={styles.primaryBtnText}>
                Create Order & Generate Barcode
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>

      {/* Photo Zoom Viewer */}
      <PhotoViewerModal
        visible={viewerVisible}
        photos={photos}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  mainLayout: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === "android" ? spacing.md : spacing.xs,
    paddingBottom: spacing.sm,
    justifyContent: "space-between",
  },
  topHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
    paddingHorizontal: 2,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
  },
  headerCountBadge: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  headerCountText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  customerBox: {
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    zIndex: 999,
  },
  inputGroup: {
    position: "relative",
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  savedBadge: {
    fontSize: 11,
    fontWeight: "700",
    color: "#16A34A",
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: Platform.OS === "ios" ? 7 : 5,
    fontSize: 13,
    color: colors.text,
  },
  suggestionsBox: {
    position: "absolute",
    top: 48,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    zIndex: 99999,
    elevation: 99999,
    padding: spacing.xs,
    gap: 2,
  },
  suggestionsTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.primary,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  suggestionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceMuted,
  },
  suggestionName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  suggestionPhone: {
    fontSize: 12,
    color: colors.textMuted,
  },
  garmentsSection: {
    flex: 1,
    marginVertical: spacing.xs + 2,
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 6,
  },
  tilesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  tileCard: {
    width: "31%",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: 6,
    alignItems: "center",
  },
  tileCardActive: {
    backgroundColor: "#EFF6FF",
    borderColor: colors.primary,
  },
  tileTapArea: {
    alignItems: "center",
    width: "100%",
  },
  tileIcon: {
    fontSize: 22,
    marginBottom: 2,
  },
  tileName: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
  },
  tilePrice: {
    fontSize: 10,
    color: colors.textMuted,
    marginBottom: 4,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: 3,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperBtnDisabled: {
    opacity: 0.3,
  },
  stepperBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primary,
  },
  stepperCount: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textMuted,
  },
  stepperCountActive: {
    color: colors.primary,
    fontWeight: "800",
  },
  bottomSection: {
    gap: 6,
  },
  photoHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  photoRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  photoWrap: {
    position: "relative",
  },
  photo: {
    width: 75,
    height: 60,
    borderRadius: radius.sm,
  },
  zoomTag: {
    position: "absolute",
    bottom: 2,
    left: 2,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  zoomTagText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "700",
  },
  removeBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: colors.danger,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
  },
  addPhotoBox: {
    width: 75,
    height: 60,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  addPhotoText: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: "600",
    marginTop: 2,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  primaryBtnText: {
    color: colors.textInverse,
    fontWeight: "700",
    fontSize: 14,
  },
  printBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    paddingVertical: 11,
    alignItems: "center",
    marginTop: spacing.xs,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  printBtnText: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 14,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  linkBtn: {
    marginTop: spacing.md,
    alignItems: "center",
  },
  linkBtnText: {
    color: colors.textMuted,
    fontWeight: "700",
    fontSize: 14,
  },
  // Invoice Styles
  invoiceScroll: {
    padding: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  invoiceCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  invoiceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: spacing.xs,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.primary,
  },
  invoiceBrand: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.primary,
  },
  invoiceType: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 1,
  },
  invoiceMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  metaLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    marginBottom: 2,
    letterSpacing: 0.5,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  metaSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  tableBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  th: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted,
  },
  td: {
    fontSize: 13,
    color: colors.text,
  },
  tableTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#EFF6FF",
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
  },
  tableTotalLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text,
  },
  tableTotalValue: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
  },
  compactBarcodeBox: {
    marginTop: 4,
    alignItems: "center",
  },
});
