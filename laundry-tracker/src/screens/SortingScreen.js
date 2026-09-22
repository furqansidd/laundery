import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  TextInput,
  Platform,
  StatusBar,
  Modal,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { colors, radius, spacing, typography, shadow } from "../theme";
import { fetchOrderByCode, logSortingScan, markReadyForDelivery, markOrderDeliveredWithPayment } from "../lib/ordersApi";
import { sendOrderReadyWhatsApp } from "../utils/whatsapp";

import PhotoViewerModal from "../components/PhotoViewerModal";

const MODE = { SCANNING: "scanning", MANUAL: "manual", RESULT: "result" };

export default function SortingScreen({ route }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState(MODE.SCANNING);
  const [manualCode, setManualCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { order, items }
  const [marking, setMarking] = useState(false);
  const [checkedItems, setCheckedItems] = useState({});
  const [basketVerified, setBasketVerified] = useState(false);
  const [lastScanBanner, setLastScanBanner] = useState(null);
  const [deliverModalVisible, setDeliverModalVisible] = useState(false);
  const [delivering, setDelivering] = useState(false);
  const scannedRef = useRef(false);

  // Photo viewer state
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const lookupCode = useCallback(
    async (rawCode, isCameraScan = false) => {
      if (!rawCode) return;
      const cleanRaw = rawCode.trim();

      // Detect sub-barcode suffix (e.g., LN-260902-0001-H2 -> base: LN-260902-0001, hangerIndex: 1)
      let baseCode = cleanRaw;
      let hangerIndex = null;
      const hMatch = cleanRaw.match(/^(.*)-H(\d+)$/i);
      if (hMatch) {
        baseCode = hMatch[1];
        hangerIndex = parseInt(hMatch[2], 10) - 1; // 0-indexed
      }

      setLoading(true);
      try {
        // If we are already looking at/working on this order, merge new tag or basket verification without losing existing checks
        if (result?.order?.order_code === baseCode) {
          if (hangerIndex !== null) {
            setCheckedItems((prev) => ({ ...prev, [hangerIndex]: true }));
            setLastScanBanner(`🏷️ Scanned & Verified Hanger Tag #${hangerIndex + 1} (-H${hangerIndex + 1}) ✅`);
          } else if (isCameraScan) {
            setBasketVerified(true);
            setLastScanBanner(`🧺 Scanned & Verified Main Order Basket Sticker (${baseCode}) ✅`);
          }
          setMode(MODE.RESULT);
          scannedRef.current = false;
          setLoading(false);
          return;
        }

        const found = await fetchOrderByCode(baseCode);
        if (!found) {
          Alert.alert("No order found", `No order matches code "${baseCode}".`);
          setMode(MODE.SCANNING);
          scannedRef.current = false;
          return;
        }
        await logSortingScan(found.order.id, "staff");
        setResult(found);
        if (hangerIndex !== null) {
          setCheckedItems({ [hangerIndex]: true });
          setBasketVerified(false);
          setLastScanBanner(`🏷️ Scanned & Verified Hanger Tag #${hangerIndex + 1} (-H${hangerIndex + 1}) ✅`);
        } else {
          setCheckedItems({});
          setBasketVerified(isCameraScan);
          setLastScanBanner(
            isCameraScan
              ? `🧺 Scanned & Verified Main Order Basket Sticker (${baseCode}) ✅`
              : `📋 Order ${baseCode} loaded. Ready for hanger tag & basket scanning.`
          );
        }
        setMode(MODE.RESULT);
      } catch (e) {
        Alert.alert("Lookup failed", e.message);
        setMode(MODE.SCANNING);
        scannedRef.current = false;
      } finally {
        setLoading(false);
      }
    },
    [result]
  );

  React.useEffect(() => {
    if (route?.params?.orderCode) {
      lookupCode(route.params.orderCode, false);
    }
  }, [route?.params?.orderCode, lookupCode]);

  const handleBarcodeScanned = useCallback(
    ({ data }) => {
      if (scannedRef.current) return; // debounce repeat scans of the same frame
      scannedRef.current = true;
      lookupCode(data, true);
    },
    [lookupCode]
  );

  const startScanningNextTag = () => {
    scannedRef.current = false;
    setMode(MODE.SCANNING);
  };

  const resetToScan = () => {
    scannedRef.current = false;
    setResult(null);
    setManualCode("");
    setCheckedItems({});
    setBasketVerified(false);
    setLastScanBanner(null);
    setMode(MODE.SCANNING);
  };

  const toggleCheckItem = (idx) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const toggleBasketCheck = () => {
    setBasketVerified((prev) => !prev);
  };

  const executeMarkReady = async () => {
    setMarking(true);
    try {
      await markReadyForDelivery(result.order.id, "staff");
      Alert.alert(
        "Order Ready! 📦",
        `Order ${result.order.order_code} marked Ready! Send WhatsApp notification to customer?`,
        [
          { text: "Later", onPress: resetToScan },
          {
            text: "📲 Send WhatsApp",
            onPress: async () => {
              await sendOrderReadyWhatsApp(result.order);
              resetToScan();
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert("Couldn't update status", e.message);
    } finally {
      setMarking(false);
    }
  };

  const handleExecuteDelivery = async (payStatus) => {
    if (!result || !result.order) return;
    setDelivering(true);
    try {
      const bill = Number(result.order.total_bill_amount) || 0;
      await markOrderDeliveredWithPayment({
        orderId: result.order.id,
        paymentStatus: payStatus,
        cashAmount: payStatus === "paid" ? bill : 0,
        createdBy: "staff",
      });
      setDeliverModalVisible(false);
      Alert.alert(
        "Order Delivered! 🚚",
        payStatus === "paid"
          ? `Collected Rs ${bill} cash & marked order PAID!`
          : `Order delivered and added to customer's Ledger Account.`
      );
      resetToScan();
    } catch (e) {
      Alert.alert("Delivery Error", e.message);
    } finally {
      setDelivering(false);
    }
  };

  // ---- RESULT VIEW: Premium Assembly & Handoff Verification ----
  if (mode === MODE.RESULT && result) {
    const { order, items } = result;
    const photos = order.intake_photo_urls || [];
    const speedType = order.order_type || "normal";
    const isUrgent = speedType === "urgent";
    const isExpress = speedType === "express";

    // Expand items into 1-to-1 individual garment hanger entries
    const expandedGarments = [];
    if (Array.isArray(items) && items.length > 0) {
      items.forEach((it) => {
        const qty = Math.max(1, Number(it.quantity) || 1);
        const name = it.item_types?.name || it.name || "Garment";
        const svc = it.service_type || "wash_press";
        for (let q = 0; q < qty; q++) {
          expandedGarments.push({ name, service: svc, originalItem: it });
        }
      });
    }

    const totalGarments = expandedGarments.length > 0 ? expandedGarments.length : Math.max(1, Number(order.total_item_count) || 1);
    const checkedCount = Object.keys(checkedItems).filter((k) => checkedItems[k]).length;
    const isItemsVerified = totalGarments > 0 && checkedCount >= totalGarments;
    const isAllVerified = isItemsVerified && basketVerified;

    // Compute progress percentage
    const totalSteps = totalGarments + 1; // garments + main basket
    const completedSteps = checkedCount + (basketVerified ? 1 : 0);
    const progressPercent = Math.min(100, Math.round((completedSteps / totalSteps) * 100));

    const getSvcLabel = (sKey) => {
      switch (sKey) {
        case "press_only": return "👔 Press Only";
        case "dry_clean": return "🧪 Dry Clean";
        case "wash_fold": return "🧼 Wash & Fold";
        case "wash_press": default: return "🧺 Wash & Press";
      }
    };

    const handleMarkReadyPress = () => {
      if (!isItemsVerified) {
        Alert.alert(
          "Shirt Stickers Not Verified ⚠️",
          `Only ${checkedCount} of ${totalGarments} shirt stickers have been checked. Please verify all individual shirt stickers first.`,
          [
            { text: "Verify Remaining Shirts", style: "cancel" },
            { text: "Override & Mark Ready", onPress: executeMarkReady },
          ]
        );
      } else if (!basketVerified) {
        Alert.alert(
          "Main Basket Sticker Pending ⚠️",
          "You have verified all individual shirts! Now please scan/check off the main basket sticker to complete verification.",
          [
            { text: "Check Basket Sticker", style: "cancel" },
            { text: "Override & Mark Ready", onPress: executeMarkReady },
          ]
        );
      } else {
        executeMarkReady();
      }
    };


    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scrollBody}>
          {/* Header Card */}
          <View style={[styles.card, shadow, { backgroundColor: "#1E293B", borderColor: "#334155" }]}>
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={[typography.h1, { color: "#FFFFFF" }]}>{order.order_code}</Text>
                <Text style={{ fontSize: 13, color: "#94A3B8", marginTop: 2 }}>
                  👤 {order.customers?.name || "Customer"} · 📞 {order.customers?.phone_number || "No phone"}
                </Text>
              </View>
              <View
                style={[
                  styles.badge,
                  isUrgent && styles.badgeUrgent,
                  isExpress && styles.badgeExpress,
                ]}
              >
                <Text
                  style={[
                    styles.badgeText,
                    (isUrgent || isExpress) && styles.badgeTextHighlight,
                  ]}
                >
                  {isUrgent ? "🔥 URGENT" : isExpress ? "⚡ EXPRESS" : "📦 NORMAL"}
                </Text>
              </View>
            </View>

            {/* Assembly Progress Bar */}
            <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#334155" }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: "#E2E8F0" }}>
                  Assembly Verification Progress:
                </Text>
                <Text style={{ fontSize: 12, fontWeight: "800", color: isAllVerified ? "#4ADE80" : "#FBBF24" }}>
                  {progressPercent}% ({completedSteps}/{totalSteps} Verified)
                </Text>
              </View>
              <View style={{ height: 8, backgroundColor: "#334155", borderRadius: 4, overflow: "hidden" }}>
                <View
                  style={{
                    height: "100%",
                    width: `${progressPercent}%`,
                    backgroundColor: isAllVerified ? "#22C55E" : "#F59E0B",
                    borderRadius: 4,
                  }}
                />
              </View>
            </View>
          </View>

          {/* SLA & Payment Info Card */}
          {order.delivery_date && (
            <View style={styles.deliveryBox}>
              <Text style={styles.deliveryText}>
                📅 SLA Promised: <Text style={{ fontWeight: "800" }}>{order.delivery_date}</Text> ({order.delivery_time_slot || "Anytime"})
              </Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
                  🏷️ Hanger Tags: {order.tags_count || 1} physical sticker(s)
                </Text>
                <Text style={{ fontSize: 11, fontWeight: "800", color: order.payment_status === "paid" ? "#15803D" : "#B45309" }}>
                  {order.payment_status === "paid" ? "💳 PAID CASH" : "⌛ UNPAID ON DELIVERY"}
                </Text>
              </View>
            </View>
          )}

          {/* Last Scan Feedback Notification Banner */}
          {lastScanBanner && (
            <View style={{ backgroundColor: "#F0FDF4", borderWidth: 1.5, borderColor: "#4ADE80", borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.xs, ...shadow.xs }}>
              <Text style={{ color: "#166534", fontSize: 13, fontWeight: "800", textAlign: "center" }}>
                {lastScanBanner}
              </Text>
            </View>
          )}

          {/* STEP 1: Individual Garments Verification */}
          <View style={[styles.card, shadow, { marginTop: spacing.md, paddingHorizontal: 14 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 6 }}>
              <Text style={[typography.h2, { flex: 1, flexShrink: 1 }]}>
                Step 1: Verify Shirt Tags ({checkedCount}/{totalGarments})
              </Text>
              <View style={{ backgroundColor: isItemsVerified ? "#DCFCE7" : "#FEF3C7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.xs, borderWidth: 1, borderColor: isItemsVerified ? "#86EFAC" : "#FDE68A", shrink: 0 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: isItemsVerified ? "#15803D" : "#B45309" }}>
                  {isItemsVerified ? "VERIFIED ✅" : `${totalGarments - checkedCount} REMAINING`}
                </Text>
              </View>
            </View>
            <Text style={[typography.caption, { marginBottom: spacing.xs }]}>
              Scan hanger stickers (-H1, -H2) with camera or tap to check off:
            </Text>
            {expandedGarments.map((it, idx) => {
              const isChecked = !!checkedItems[idx];
              const svcTag = getSvcLabel(it.service);
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.checkRow, isChecked && styles.checkRowActive]}
                  onPress={() => toggleCheckItem(idx)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.checkboxCircle, isChecked && styles.checkboxCircleChecked]}>
                    <Text style={{ color: isChecked ? "#FFFFFF" : colors.textMuted, fontSize: 13, fontWeight: "900" }}>
                      {isChecked ? "✓" : ""}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={[typography.body, isChecked && styles.checkedText, { fontWeight: "800", fontSize: 14 }]}>
                        Shirt Tag {idx + 1}/{totalGarments}: {it.name}
                      </Text>
                      <View style={{ backgroundColor: isChecked ? "#16A34A" : "#E2E8F0", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: "800", color: isChecked ? "#FFFFFF" : "#475569" }}>
                          {isChecked ? "VERIFIED ✅" : `-H${idx + 1}`}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "700", marginTop: 2 }}>
                      {svcTag}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* STEP 2: Main Order Basket Sticker Verification */}
          <View style={[styles.card, shadow, { marginTop: spacing.md, paddingHorizontal: 14 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 6 }}>
              <Text style={[typography.h2, { flex: 1, flexShrink: 1 }]}>
                Step 2: Verify Main Basket Sticker
              </Text>
              <View style={{ backgroundColor: basketVerified ? "#DCFCE7" : "#FEF3C7", paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.xs, borderWidth: 1, borderColor: basketVerified ? "#86EFAC" : "#FDE68A", shrink: 0 }}>
                <Text style={{ fontSize: 11, fontWeight: "800", color: basketVerified ? "#15803D" : "#B45309" }}>
                  {basketVerified ? "VERIFIED ✅" : "PENDING ⌛"}
                </Text>
              </View>
            </View>
            <Text style={[typography.caption, { marginBottom: spacing.xs }]}>
              Scan main order basket barcode ({order.order_code}) to verify assembly:
            </Text>
            <TouchableOpacity
              style={[styles.checkRow, basketVerified && styles.checkRowActive, { paddingVertical: spacing.sm + 2 }]}
              onPress={toggleBasketCheck}
              activeOpacity={0.8}
            >
              <View style={[styles.checkboxCircle, basketVerified && styles.checkboxCircleChecked]}>
                <Text style={{ color: basketVerified ? "#FFFFFF" : colors.textMuted, fontSize: 13, fontWeight: "900" }}>
                  {basketVerified ? "✓" : ""}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[typography.body, { fontWeight: "800", fontSize: 14 }]}>
                  🧺 Main Basket Sticker ({order.order_code})
                </Text>
                <Text style={{ fontSize: 11, color: basketVerified ? "#15803D" : colors.textMuted, fontWeight: "600", marginTop: 2 }}>
                  {basketVerified
                    ? "Main basket barcode scanned & verified! ✅"
                    : "Scan main basket sticker or tap to check off"}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Intake Proof Photos */}
          {photos.length > 0 && (
            <>
              <Text style={[styles.label, { marginTop: spacing.lg }]}>
                Intake Proof Photos (Tap to open full-screen & zoom) 🔍
              </Text>
              <View style={styles.photoGrid}>
                {photos.map((url, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.photoTouchWrap}
                    onPress={() => {
                      setViewerIndex(idx);
                      setViewerVisible(true);
                    }}
                  >
                    <Image source={{ uri: url }} style={styles.bigPhoto} />
                    <View style={styles.zoomBadge}>
                      <Text style={styles.zoomBadgeText}>🔍 Photo {idx + 1}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Action Buttons */}
          <View style={{ gap: 10, marginTop: spacing.lg }}>
            <TouchableOpacity
              style={[styles.primaryBtn, shadow, { backgroundColor: colors.primary, paddingVertical: 14 }]}
              onPress={startScanningNextTag}
            >
              <Text style={[styles.primaryBtnText, { fontSize: 15 }]}>
                📷 Open Camera to Scan Next Tag / Barcode
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                shadow,
                marking && styles.btnDisabled,
                isAllVerified ? { backgroundColor: "#16A34A" } : { backgroundColor: "#64748B" },
                { paddingVertical: 14 },
              ]}
              onPress={handleMarkReadyPress}
              disabled={marking}
            >
              <Text style={[styles.primaryBtnText, { fontSize: 15 }]}>
                {marking ? "Saving…" : isAllVerified ? "📦 All Tags Verified — Mark Ready for Delivery" : "📦 Mark Ready for Delivery"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                shadow,
                { backgroundColor: order.payment_status === "paid" ? "#16A34A" : "#334155", paddingVertical: 14 },
              ]}
              onPress={() => setDeliverModalVisible(true)}
            >
              <Text style={[styles.primaryBtnText, { fontSize: 15 }]}>
                {order.payment_status === "paid" ? "🚚 Deliver Order (Already Paid)" : "🚚 Deliver Order & Collect Cash"}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.linkBtn} onPress={resetToScan}>
            <Text style={styles.linkBtnText}>Scan another basket</Text>
          </TouchableOpacity>
        </ScrollView>

        <PhotoViewerModal
          visible={viewerVisible}
          photos={photos}
          initialIndex={viewerIndex}
          onClose={() => setViewerVisible(false)}
        />

        {/* Deliver & Collect Cash Modal */}
        <Modal
          visible={deliverModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setDeliverModalVisible(false)}
        >
          <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 20 }}>
            <View style={{ width: "100%", maxWidth: 360, backgroundColor: "#FFF", borderRadius: radius.md, padding: 20, ...shadow.md }}>
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: 4 }}>
                {order.payment_status === "paid" ? "🚚 Confirm Order Delivery" : "🚚 Order Delivery & Cash Collection"}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
                Order Code: {order.order_code} • Customer: {order.customers?.name || order.customers?.phone_number}
              </Text>

              <View style={{ backgroundColor: "#F8FAFC", borderRadius: radius.sm, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>Total Hanger Tags:</Text>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: colors.text }}>{order.tags_count || 1} Tags</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>Total Bill Amount:</Text>
                  <Text style={{ fontSize: 16, fontWeight: "900", color: colors.primary }}>Rs {order.total_bill_amount || 0}</Text>
                </View>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ fontSize: 12, color: colors.textMuted }}>Current Payment Status:</Text>
                  <Text style={{ fontSize: 12, fontWeight: "800", color: order.payment_status === "paid" ? "#16A34A" : "#B45309" }}>
                    {order.payment_status === "paid" ? "💳 ALREADY PAID" : "⌛ UNPAID"}
                  </Text>
                </View>
              </View>

              {delivering ? (
                <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 20 }} />
              ) : (
                <View style={{ gap: 10 }}>
                  {order.payment_status === "paid" ? (
                    <TouchableOpacity
                      style={{ backgroundColor: "#16A34A", paddingVertical: 13, borderRadius: radius.xs, alignItems: "center" }}
                      onPress={() => handleExecuteDelivery("paid")}
                    >
                      <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "800" }}>
                        ✅ Deliver Order (Already Paid - Rs 0 Due)
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={{ backgroundColor: "#16A34A", paddingVertical: 12, borderRadius: radius.xs, alignItems: "center" }}
                        onPress={() => handleExecuteDelivery("paid")}
                      >
                        <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "800" }}>
                          💵 Collect Rs {order.total_bill_amount || 0} Cash & Deliver
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{ backgroundColor: "#D97706", paddingVertical: 12, borderRadius: radius.xs, alignItems: "center" }}
                        onPress={() => handleExecuteDelivery("unpaid")}
                      >
                        <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "800" }}>
                          ⌛ Deliver on Customer Account (Mark Unpaid)
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}

                  <TouchableOpacity
                    style={{ paddingVertical: 8, alignItems: "center", marginTop: 4 }}
                    onPress={() => setDeliverModalVisible(false)}
                  >
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: "700" }}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // ---- MANUAL ENTRY VIEW (fallback if camera scan struggles) ----
  if (mode === MODE.MANUAL) {
    return (
      <SafeAreaView style={[styles.safe, styles.center, { padding: spacing.lg }]}>
        <Text style={typography.h1}>Enter Order Code</Text>
        <TextInput
          style={styles.input}
          placeholder="LN-240815-0007"
          autoCapitalize="characters"
          value={manualCode}
          onChangeText={setManualCode}
        />
        <TouchableOpacity
          style={[styles.primaryBtn, shadow, { width: "100%" }]}
          onPress={() => lookupCode(manualCode)}
        >
          <Text style={styles.primaryBtnText}>Look Up</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={() => setMode(MODE.SCANNING)}>
          <Text style={styles.linkBtnText}>Use camera scanner instead</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ---- SCANNING VIEW (default) ----
  if (!permission) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.safe, styles.center, { padding: spacing.lg }]}>
        <Text style={[typography.body, { textAlign: "center", marginBottom: spacing.md }]}>
          Camera access is needed to scan basket barcodes.
        </Text>
        <TouchableOpacity style={[styles.primaryBtn, shadow]} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkBtn} onPress={() => setMode(MODE.MANUAL)}>
          <Text style={styles.linkBtnText}>Enter code manually instead</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={{ flex: 1 }}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          barcodeScannerSettings={{ barcodeTypes: ["code128"] }}
          onBarcodeScanned={handleBarcodeScanned}
        />
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.overlayText}>Point the camera at the basket barcode</Text>
          {loading && <ActivityIndicator color="#fff" style={{ marginTop: spacing.md }} />}
          <TouchableOpacity style={styles.manualLink} onPress={() => setMode(MODE.MANUAL)}>
            <Text style={styles.manualLinkText}>Enter code manually</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.screenBg,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 6 : 0,
  },
  center: { alignItems: "center", justifyContent: "center" },
  scrollBody: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  card: {
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  label: { ...typography.caption, fontWeight: "600" },
  photoGrid: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  bigPhoto: { flex: 1, height: 160, borderRadius: radius.md },
  primaryBtn: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.textInverse, fontWeight: "700", fontSize: 16 },
  btnDisabled: { opacity: 0.5 },
  linkBtn: { marginTop: spacing.lg, alignItems: "center" },
  linkBtnText: { color: colors.primary, fontWeight: "600" },
  input: {
    width: "100%",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 18,
    textAlign: "center",
    letterSpacing: 2,
    backgroundColor: colors.surfaceMuted,
    marginVertical: spacing.lg,
  },
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.35)",
  },
  scanFrame: {
    width: 260,
    height: 160,
    borderWidth: 3,
    borderColor: "#fff",
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  overlayText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  manualLink: {
    position: "absolute",
    bottom: 40,
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
  },
  manualLinkText: { color: colors.primary, fontWeight: "700" },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 6,
    gap: 12,
  },
  checkRowActive: {
    backgroundColor: "#F0FDF4",
    borderColor: "#86EFAC",
  },
  checkbox: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textMuted,
    width: 24,
    textAlign: "center",
  },
  checkboxChecked: {
    color: "#16A34A",
  },
  checkboxCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#94A3B8",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
  },
  checkboxCircleChecked: {
    backgroundColor: "#16A34A",
    borderColor: "#16A34A",
  },
  checkedText: {
    textDecorationLine: "line-through",
    color: colors.textMuted,
  },
  photoTouchWrap: {
    flex: 1,
    position: "relative",
  },
  zoomBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  zoomBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "700",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  badge: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeUrgent: {
    backgroundColor: "#FEE2E2",
    borderColor: "#EF4444",
  },
  badgeExpress: {
    backgroundColor: "#FEF3C7",
    borderColor: "#F59E0B",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textSecondary,
  },
  badgeTextHighlight: {
    color: colors.text,
  },
  deliveryBox: {
    marginTop: spacing.xs,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: radius.sm,
    padding: spacing.xs + 2,
  },
  deliveryText: {
    fontSize: 12,
    color: colors.primary,
  },
});
