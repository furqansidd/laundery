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
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { colors, radius, spacing, typography, shadow } from "../theme";
import { fetchOrderByCode, logSortingScan, markReadyForDelivery } from "../lib/ordersApi";

import PhotoViewerModal from "../components/PhotoViewerModal";

const MODE = { SCANNING: "scanning", MANUAL: "manual", RESULT: "result" };

export default function SortingScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState(MODE.SCANNING);
  const [manualCode, setManualCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { order, items }
  const [marking, setMarking] = useState(false);
  const [checkedItems, setCheckedItems] = useState({});
  const scannedRef = useRef(false);

  // Photo viewer state
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const lookupCode = useCallback(async (code) => {
    if (!code) return;
    setLoading(true);
    try {
      const found = await fetchOrderByCode(code);
      if (!found) {
        Alert.alert("No order found", `No order matches code "${code}".`);
        setMode(MODE.SCANNING);
        scannedRef.current = false;
        return;
      }
      await logSortingScan(found.order.id, "staff");
      setResult(found);
      setCheckedItems({});
      setMode(MODE.RESULT);
    } catch (e) {
      Alert.alert("Lookup failed", e.message);
      setMode(MODE.SCANNING);
      scannedRef.current = false;
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBarcodeScanned = useCallback(
    ({ data }) => {
      if (scannedRef.current) return; // debounce repeat scans of the same frame
      scannedRef.current = true;
      lookupCode(data);
    },
    [lookupCode]
  );

  const resetToScan = () => {
    scannedRef.current = false;
    setResult(null);
    setManualCode("");
    setCheckedItems({});
    setMode(MODE.SCANNING);
  };

  const toggleCheckItem = (idx) => {
    setCheckedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleMarkReady = async () => {
    setMarking(true);
    try {
      await markReadyForDelivery(result.order.id, "staff");
      Alert.alert("Marked Ready for Delivery", result.order.order_code, [
        { text: "Scan next basket", onPress: resetToScan },
      ]);
    } catch (e) {
      Alert.alert("Couldn't update status", e.message);
    } finally {
      setMarking(false);
    }
  };

  // ---- RESULT VIEW: expected count + the 2 intake photos side by side ----
  if (mode === MODE.RESULT && result) {
    const { order, items } = result;
    const photos = order.intake_photo_urls || [];
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scrollBody}>
          <Text style={typography.h1}>{order.order_code}</Text>
          <Text style={typography.caption}>
            {order.customers?.phone_number}
            {order.customers?.name ? ` · ${order.customers.name}` : ""}
          </Text>

          <View style={[styles.card, shadow]}>
            <Text style={typography.h2}>Expected: {order.total_item_count} pieces</Text>
            <Text style={[typography.caption, { marginBottom: spacing.xs }]}>
              Tap items to check off during packing:
            </Text>
            {items.map((it, idx) => {
              const isChecked = !!checkedItems[idx];
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.checkRow, isChecked && styles.checkRowActive]}
                  onPress={() => toggleCheckItem(idx)}
                >
                  <Text style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                    {isChecked ? "✓" : "○"}
                  </Text>
                  <Text
                    style={[
                      typography.body,
                      { flex: 1 },
                      isChecked && styles.checkedText,
                    ]}
                  >
                    {it.item_types?.name} x{it.quantity}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

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

          <TouchableOpacity
            style={[styles.primaryBtn, shadow, marking && styles.btnDisabled]}
            onPress={handleMarkReady}
            disabled={marking}
          >
            <Text style={styles.primaryBtnText}>
              {marking ? "Saving…" : "✅ Verified — Mark Ready for Delivery"}
            </Text>
          </TouchableOpacity>

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
  safe: { flex: 1, backgroundColor: colors.surface },
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    marginTop: 4,
    gap: spacing.sm,
  },
  checkRowActive: {
    backgroundColor: "#DCFCE7",
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
});
