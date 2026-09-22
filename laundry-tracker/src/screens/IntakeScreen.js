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
  StatusBar,
  Modal,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import BarcodeLabel from "../components/BarcodeLabel";
import PhotoViewerModal from "../components/PhotoViewerModal";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors, radius, spacing, typography, shadow, getStatusBadgeStyle } from "../theme";
import {
  fetchItemTypes,
  createOrder,
  uploadIntakePhoto,
  searchCustomers,
  fetchAllCustomers,
  fetchCustomerOrders,
  getCustomerLedger,
  recordCustomerPayment,
  fetchPriorityTiers,
  DEFAULT_PRIORITY_TIERS,
} from "../lib/ordersApi";
import { supabase } from "../lib/supabase";
import {
  buildReceiptMessage,
  sendWhatsAppReceipt,
  sharePdfInvoiceWithPhotos,
  shareInvoiceSlipPdf,
  printInvoiceSlip,
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
  const [serviceTypes, setServiceTypes] = useState({}); // { item_type_id: service_type }
  const [unitTypes, setUnitTypes] = useState({}); // { item_type_id: unit_type }
  const [priorityTiers, setPriorityTiers] = useState(DEFAULT_PRIORITY_TIERS);
  const [orderType, setOrderType] = useState("normal"); // "normal" | "express" | "urgent" | "instant"
  const [slaTier, setSlaTier] = useState("standard_48_72h"); // "instant_2h" | "express_2_4h" | "fast_24h" | "standard_48_72h"
  const [tagsCount, setTagsCount] = useState(1); // Dynamic 1 to N physical hanger tags
  const [paymentStatus, setPaymentStatus] = useState("unpaid"); // "unpaid" | "paid"
  const [deliveryDate, setDeliveryDate] = useState("Tomorrow");
  const [deliveryTimeSlot, setDeliveryTimeSlot] = useState("Evening (5-8 PM)");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);

  // Customer suggestions & Khata Ledger state
  const [suggestions, setSuggestions] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [customerHistory, setCustomerHistory] = useState([]);
  const [customerLedger, setCustomerLedger] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleModalVisible, setSettleModalVisible] = useState(false);

  // Photo viewer state
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  // Popup Modals state
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [garmentsModalVisible, setGarmentsModalVisible] = useState(false);
  const [garmentSearchQuery, setGarmentSearchQuery] = useState("");

  const [allCustomersList, setAllCustomersList] = useState([]);

  const loadAllCustomersCache = async () => {
    try {
      const list = await fetchAllCustomers();
      setAllCustomersList(list || []);
    } catch (e) {
      console.log("Customer cache error:", e);
    }
  };

  // Reload garment service types and customer registry whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchItemTypes()
        .then(setItemTypes)
        .catch((e) => console.log("Garment fetch error:", e));
      loadAllCustomersCache();
      fetchPriorityTiers()
        .then((tiers) => {
          if (Array.isArray(tiers) && tiers.length > 0) {
            setPriorityTiers(tiers);
          }
        })
        .catch((e) => console.log("Priorities fetch error:", e));
    }, [])
  );

  // Auto-calculate smart tags count whenever items or service selections change
  useEffect(() => {
    const selectedServices = new Set();
    let totalGarments = 0;

    itemTypes.forEach((t) => {
      const breakdown = serviceBreakdowns[t.id] || { [serviceTypes[t.id] || "wash_press"]: quantities[t.id] || 0 };
      Object.entries(breakdown).forEach(([sKey, qty]) => {
        const q = Number(qty) || 0;
        if (q > 0) {
          selectedServices.add(sKey);
          totalGarments += q;
        }
      });
    });

    if (totalGarments === 0) {
      setTagsCount(1);
    } else if (selectedServices.size > 1) {
      // Mixed services (e.g. Wash & Press + Press Only) -> Auto suggest 1 tag per distinct service group
      setTagsCount(Math.max(1, selectedServices.size));
    } else {
      // Single service type -> Auto suggest 1 bundle tag
      setTagsCount(1);
    }
  }, [quantities, serviceBreakdowns, serviceTypes, itemTypes]);

  const loadCustomerHistory = async (phoneNumber) => {
    if (!phoneNumber || phoneNumber.trim().length < 4) {
      setCustomerHistory([]);
      setCustomerLedger(null);
      return;
    }
    setHistoryLoading(true);
    try {
      const pastOrders = await fetchCustomerOrders(phoneNumber.trim());
      setCustomerHistory(pastOrders || []);
      if (pastOrders && pastOrders.length > 0) {
        setHistoryExpanded(true);
      }
      const ledgerData = await getCustomerLedger(phoneNumber.trim());
      setCustomerLedger(ledgerData);
    } catch (e) {
      console.log("Customer history error:", e);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleNameChange = (val) => {
    setCustomerName(val);
    setSelectedCustomerId(null);
    const q = val.trim().toLowerCase();

    if (q.length >= 2) {
      const matches = allCustomersList.filter((c) => {
        const nMatch = c.name?.toLowerCase().includes(q);
        const pMatch = c.phone_number?.includes(q);
        return nMatch || pMatch;
      });
      setSuggestions(matches.slice(0, 5));
    } else {
      setSuggestions([]);
    }
  };

  const handlePhoneChange = (val) => {
    setPhone(val);
    setSelectedCustomerId(null);
    const q = val.trim();

    if (q.length >= 2) {
      const matches = allCustomersList.filter((c) => {
        const pMatch = c.phone_number?.includes(q);
        const nMatch = c.name?.toLowerCase().includes(q.toLowerCase());
        return pMatch || nMatch;
      });
      setSuggestions(matches.slice(0, 5));

      if (q.length >= 4) {
        loadCustomerHistory(q);
      }
    } else {
      setSuggestions([]);
      setCustomerHistory([]);
      setCustomerLedger(null);
    }
  };

  const selectCustomer = (customer) => {
    setCustomerName(customer.name || "");
    setPhone(customer.phone_number || "");
    setSelectedCustomerId(customer.id);
    setSuggestions([]);
    Keyboard.dismiss();
    if (customer.phone_number) {
      loadCustomerHistory(customer.phone_number);
    }
  };

  const handleRecordLedgerPayment = async () => {
    if (!phone || !settleAmount) return;
    const amt = Number(settleAmount) || 0;
    if (amt <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid payment amount.");
      return;
    }
    try {
      await recordCustomerPayment({ phoneNumber: phone.trim(), amount: amt, note: "Recorded on Intake" });
      Alert.alert("Payment Recorded", `Successfully recorded Rs ${amt} cash payment for ${customerName || phone}!`);
      setSettleAmount("");
      setSettleModalVisible(false);
      loadCustomerHistory(phone);
    } catch (e) {
      Alert.alert("Payment Failed", e.message);
    }
  };

  const handleReorderPastItems = (pastOrder) => {
    if (!pastOrder || !pastOrder.order_items) return;
    const newQty = {};
    const newSt = {};

    pastOrder.order_items.forEach((item) => {
      const match = itemTypes.find(
        (it) => it.id === item.item_type_id || it.name === item.item_types?.name
      );
      if (match) {
        newQty[match.id] = (newQty[match.id] || 0) + (item.quantity || 1);
        if (item.service_type) {
          newSt[match.id] = item.service_type;
        }
      }
    });

    setQuantities(newQty);
    setServiceTypes(newSt);
    Alert.alert(
      "Items Re-filled",
      `Copied items from order ${pastOrder.order_code} into current intake!`
    );
  };


  const [serviceBreakdowns, setServiceBreakdowns] = useState({}); // { item_type_id: { wash_press: N, dry_clean: N, ... } }

  const updateServiceBreakdownQty = (itemTypeId, serviceKey, delta) => {
    Keyboard.dismiss();
    setServiceBreakdowns((prev) => {
      const curItem = prev[itemTypeId] || { [serviceTypes[itemTypeId] || "wash_press"]: quantities[itemTypeId] || 0 };
      const current = curItem[serviceKey] || 0;
      const next = Math.max(0, current + delta);
      const updatedItem = { ...curItem, [serviceKey]: next };

      const totalQty = Object.values(updatedItem).reduce((a, b) => a + (Number(b) || 0), 0);
      setQuantities((qPrev) => ({ ...qPrev, [itemTypeId]: totalQty }));

      return { ...prev, [itemTypeId]: updatedItem };
    });
  };

  const updateQty = (id, delta) => {
    Keyboard.dismiss();
    if (delta > 0) {
      const sKey = serviceTypes[id] || "wash_press";
      updateServiceBreakdownQty(id, sKey, 1);
    } else {
      const curQty = quantities[id] || 0;
      if (curQty <= 0) return;
      const breakdown = serviceBreakdowns[id] || { [serviceTypes[id] || "wash_press"]: curQty };
      const keysWithQty = Object.keys(breakdown).filter((k) => (breakdown[k] || 0) > 0);
      if (keysWithQty.length > 0) {
        const lastKey = keysWithQty[keysWithQty.length - 1];
        updateServiceBreakdownQty(id, lastKey, -1);
      }
    }
  };

  const updateServiceType = (id, stKey) => {
    setServiceTypes((prev) => ({ ...prev, [id]: stKey }));
    const qty = quantities[id] || 1;
    setQuantities((prev) => ({ ...prev, [id]: qty }));
    setServiceBreakdowns((prev) => ({
      ...prev,
      [id]: { wash_press: 0, press_only: 0, dry_clean: 0, wash_fold: 0, [stKey]: qty },
    }));
  };

  const updateUnitType = (id, uKey) => {
    setUnitTypes((prev) => ({ ...prev, [id]: uKey }));
  };

  const getItemUnitPrice = (itemTypeObj, sKey) => {
    const base = Number(itemTypeObj.default_price) || 30;
    switch (sKey) {
      case "press_only": return Math.round(base * 0.5);
      case "dry_clean": return Math.round(base * 2.2);
      case "wash_fold": return Math.round(base * 0.8);
      case "wash_press": default: return base;
    }
  };

  const totalCount = itemTypes.reduce((sum, t) => {
    const bd = serviceBreakdowns[t.id];
    if (bd) {
      return sum + Object.values(bd).reduce((a, b) => a + (Number(b) || 0), 0);
    }
    return sum + (quantities[t.id] || 0);
  }, 0);

  const totalBill = itemTypes.reduce((sum, t) => {
    const bd = serviceBreakdowns[t.id];
    const qty = quantities[t.id] || 0;
    if (bd) {
      let itemSum = 0;
      Object.entries(bd).forEach(([sKey, q]) => {
        const p = getItemUnitPrice(t, sKey);
        itemSum += (Number(q) || 0) * p;
      });
      return sum + itemSum;
    }
    if (!qty) return sum;
    const sType = serviceTypes[t.id] || "wash_press";
    const uPrice = getItemUnitPrice(t, sType);
    return sum + qty * uPrice;
  }, 0);

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
    phone.trim().length >= 5 &&
    customerName.trim().length >= 2 &&
    totalCount > 0 &&
    !saving;

  // DateTimePicker states
  const [datePickerValue, setDatePickerValue] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [timePickerValue, setTimePickerValue] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const formatDateFormatted = (d) => {
    if (!d) return "Today";
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    const str = d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });

    if (isToday) return `Today (${str})`;
    if (isTomorrow) return `Tomorrow (${str})`;
    return str;
  };

  const formatTimeFormatted = (t) => {
    if (!t) return "05:00 PM";
    return t.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  };

  const handleSelectOrderType = (typeKey) => {
    setOrderType(typeKey);
    const now = new Date();
    const tier = priorityTiers.find((t) => t.key === typeKey);
    const hours =
      tier?.hours ||
      (typeKey === "instant"
        ? 2
        : typeKey === "urgent"
        ? 4
        : typeKey === "express"
        ? 24
        : 48);

    if (hours <= 4) {
      setSlaTier(hours <= 2 ? "instant_2h" : "express_2_4h");
    } else if (hours <= 24) {
      setSlaTier("fast_24h");
    } else {
      setSlaTier("standard_48_72h");
    }

    const targetDate = new Date(now.getTime() + hours * 60 * 60 * 1000);
    setDatePickerValue(targetDate);
    setTimePickerValue(targetDate);

    const isToday = targetDate.toDateString() === now.toDateString();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const isTomorrow = targetDate.toDateString() === tomorrow.toDateString();

    const dateLabel = isToday
      ? `${formatDateFormatted(targetDate)} (Today)`
      : isTomorrow
      ? `${formatDateFormatted(targetDate)} (Tomorrow)`
      : formatDateFormatted(targetDate);

    setDeliveryDate(dateLabel);
    setDeliveryTimeSlot(`${formatTimeFormatted(targetDate)} (${hours}h SLA)`);
  };

  const handleOpenDatePicker = () => {
    Keyboard.dismiss();
    setShowDatePicker(true);
  };

  const handleOpenTimePicker = () => {
    Keyboard.dismiss();
    if (orderType === "urgent") {
      Alert.alert(
        "🔒 Time Auto-Locked",
        "URGENT orders are locked to Next 3 Hours SLA."
      );
      return;
    }
    setShowTimePicker(true);
  };

  const handleCreateOrder = async () => {
    Keyboard.dismiss();
    setSaving(true);
    setStep(STEPS.SAVING);
    try {
      const items = [];
      itemTypes.forEach((t) => {
        const uType = unitTypes[t.id] || t.unit_type || "piece";
        const breakdown = serviceBreakdowns[t.id] || { [serviceTypes[t.id] || "wash_press"]: quantities[t.id] || 0 };

        Object.entries(breakdown).forEach(([sKey, qty]) => {
          const q = Number(qty) || 0;
          if (q > 0) {
            const uPrice = getItemUnitPrice(t, sKey);
            items.push({
              item_type_id: t.id,
              name: t.name,
              service_type: sKey,
              unit_type: uType,
              quantity: q,
              unit_price: uPrice,
            });
          }
        });
      });

      const { order, customer } = await createOrder({
        phoneNumber: phone.trim(),
        customerName: customerName.trim(),
        customerAddress: "",
        items,
        photoUrls: [],
        createdBy: "staff",
        orderType,
        slaTier,
        paymentStatus,
        tagsCount,
        deliveryDate,
        deliveryTimeSlot,
      });

      const uploadedUrls = [];
      for (let i = 0; i < photos.length; i++) {
        try {
          const url = await uploadIntakePhoto(photos[i], order.order_code, i + 1);
          uploadedUrls.push(url);
        } catch (err) {
          console.log("Intake photo upload skipped/failed:", err.message);
          uploadedUrls.push(photos[i]);
        }
      }

      // Determine initial service status from items
      const hasWashPress = items.some((i) => i.service_type === "wash_press");
      const hasPressOnly = items.some((i) => i.service_type === "press_only");
      const hasDryClean = items.some((i) => i.service_type === "dry_clean");
      const hasWashFold = items.some((i) => i.service_type === "wash_fold");

      let initialStatus = "intake";
      if (hasWashPress) initialStatus = "wash_press";
      else if (hasPressOnly) initialStatus = "press_only";
      else if (hasDryClean) initialStatus = "dry_clean";
      else if (hasWashFold) initialStatus = "wash_fold";

      try {
        await supabase
          .from("orders")
          .update({ intake_photo_urls: uploadedUrls, status: initialStatus })
          .eq("id", order.id);
      } catch (e) {}

      setCreatedOrder({
        ...order,
        status: initialStatus,
        customer_name: customerName.trim(),
        customer_phone: phone.trim(),
        intake_photo_urls: uploadedUrls,
        local_photos: [...photos],
        items,
        order_type: orderType,
        delivery_date: deliveryDate,
        delivery_time_slot: deliveryTimeSlot,
      });
      setStep(STEPS.DONE);
    } catch (e) {
      Alert.alert("Couldn't create order", e.message);
      setStep(STEPS.DETAILS);
    } finally {
      setSaving(false);
    }
  };

  // Send formatted WhatsApp receipt with photo links directly to customer
  const handleSendWhatsAppReceipt = async () => {
    const message = buildReceiptMessage({
      order: createdOrder,
      items: createdOrder?.items || [],
      photoUrls: createdOrder?.intake_photo_urls || [],
    });

    await sendWhatsAppReceipt({
      phoneNumber: createdOrder?.customer_phone || phone.trim(),
      message,
    });
  };

  // Generate and share PDF invoice containing order details & photos
  const handleSharePdfInvoice = async () => {
    await shareInvoiceSlipPdf({
      order: createdOrder,
      items: createdOrder?.items || [],
      photoUrls: createdOrder?.intake_photo_urls || [],
    });
  };

  // Directly print invoice slip to printer (AirPrint / POS / WiFi / PDF)
  const handlePrintInvoiceSlip = async () => {
    await printInvoiceSlip({
      order: createdOrder,
      items: createdOrder?.items || [],
      photoUrls: createdOrder?.intake_photo_urls || [],
    });
  };

  // Print barcode sticker
  const handlePrintBarcode = async () => {
    await printBarcodeLabel({
      orderCode: createdOrder.order_code,
      customerName: createdOrder.customer_name || customerName,
      tagsCount: createdOrder.tags_count || tagsCount,
      items: createdOrder.items || [],
      totalBill: createdOrder.total_bill_amount || 0,
    });
  };

  const resetFlow = () => {
    setStep(STEPS.DETAILS);
    setQuantities({});
    setServiceBreakdowns({});
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

              {(createdOrder.items || []).map((it, idx) => {
                const svcText =
                  it.service_type === "press_only" ? "👔 Press Only" :
                  it.service_type === "dry_clean" ? "🧪 Dry Clean" :
                  it.service_type === "wash_fold" ? "🧼 Wash & Fold" :
                  "🧺 Wash & Press";
                return (
                  <View key={idx} style={styles.tableRow}>
                    <View style={{ flex: 2 }}>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>
                        {getGarmentIcon(it.name)} {it.name}
                      </Text>
                      <Text style={{ fontSize: 10, color: colors.primary, fontWeight: "700", marginTop: 1 }}>
                        {svcText}
                      </Text>
                    </View>
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
                );
              })}

              {/* Total Summary */}
              <View style={styles.tableTotalRow}>
                <Text style={styles.tableTotalLabel}>Total Pieces: {totalCount} pcs</Text>
                <Text style={styles.tableTotalValue}>Total: Rs {totalBill}</Text>
              </View>
            </View>

            {/* Multi-Hanger Barcodes Visual at End of Invoice */}
            <View style={{ width: "100%", marginTop: spacing.sm, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, alignItems: "center" }}>
              <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary, marginBottom: 6 }}>
                🏷️ PHYSICAL HANGER TAGS ({createdOrder.tags_count || tagsCount || 1} STICKERS)
              </Text>

              {Array.from({ length: Math.max(1, createdOrder.tags_count || tagsCount || 1) }).map((_, idx) => {
                const totalT = Math.max(1, createdOrder.tags_count || tagsCount || 1);
                const tagCode = totalT > 1 ? `${createdOrder.order_code}-H${idx + 1}` : createdOrder.order_code;
                return (
                  <View key={idx} style={{ width: "100%", alignItems: "center", marginBottom: spacing.xs, backgroundColor: "#F8FAFC", padding: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ fontSize: 10, fontWeight: "800", color: colors.textMuted, marginBottom: 2 }}>
                      TAG {idx + 1} OF {totalT} • {createdOrder.customer_name || customerName}
                    </Text>
                    <BarcodeLabel
                      value={tagCode}
                      customerName={createdOrder.customer_name || customerName}
                      moduleWidth={2}
                      height={45}
                    />
                  </View>
                );
              })}
            </View>
          </View>

          {/* Action Button 1: Print Modern Invoice Slip */}
          <TouchableOpacity
            style={[styles.primaryBtn, shadow, { marginTop: spacing.md, backgroundColor: "#0284C7" }]}
            onPress={handlePrintInvoiceSlip}
          >
            <Text style={styles.primaryBtnText}>
              🖨️ Print Client Invoice Slip
            </Text>
          </TouchableOpacity>

          {/* Action Button 2: Share PDF Invoice via WhatsApp */}
          <TouchableOpacity
            style={[styles.primaryBtn, shadow, { marginTop: spacing.sm, backgroundColor: "#25D366" }]}
            onPress={handleSharePdfInvoice}
          >
            <Text style={styles.primaryBtnText}>
              📲 Share Invoice via WhatsApp
            </Text>
          </TouchableOpacity>

          {/* Action Button 3: Send WhatsApp Text Receipt */}
          <TouchableOpacity
            style={[styles.primaryBtn, shadow, { marginTop: spacing.sm, backgroundColor: "#059669" }]}
            onPress={handleSendWhatsAppReceipt}
          >
            <Text style={styles.primaryBtnText}>
              💬 Send Text Receipt via WhatsApp
            </Text>
          </TouchableOpacity>

          {/* Action Button 4: Print Barcode Hanger Sticker Tags */}
          <TouchableOpacity
            style={styles.printBtn}
            onPress={handlePrintBarcode}
          >
            <Text style={styles.printBtnText}>
              🏷️ Print {createdOrder.tags_count || tagsCount || 1} Hanger Tags (70x48mm)
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
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: 80 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View style={styles.topHeader}>
          <View>
            <Text style={styles.headerTitle}>CleanWave Intake</Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "600" }}>New Garment Order Entry</Text>
          </View>
          <View style={styles.headerCountBadge}>
            <Text style={styles.headerCountText}>
              {totalCount} Items • Rs {totalBill}
            </Text>
          </View>
        </View>

        {/* 1. CUSTOMER BOX */}
        <View style={[styles.customerBox, shadow.sm]}>
          {/* Customer Name */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.fieldLabel}>👤 Customer Name</Text>
              {selectedCustomerId && (
                <Text style={styles.savedBadge}>✓ Saved Client</Text>
              )}
            </View>
            <TextInput
              style={styles.input}
              placeholder="e.g. Ali Ahmed"
              placeholderTextColor={colors.textLight}
              value={customerName}
              onChangeText={handleNameChange}
              returnKeyType="next"
            />
          </View>

          {/* Customer Phone Number */}
          <View style={[styles.inputGroup, { marginTop: 10 }]}>
            <Text style={styles.fieldLabel}>📞 Phone Number</Text>
            <TextInput
              style={styles.input}
              placeholder="03XX XXXXXXX"
              placeholderTextColor={colors.textLight}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={handlePhoneChange}
              returnKeyType="next"
            />
          </View>

          {/* Live Autocomplete Dropdown */}
          {suggestions.length > 0 && (
            <View style={[styles.suggestionsBox, shadow.md, { marginTop: 4 }]}>
              <Text style={styles.suggestionsTitle}>
                Select Saved Customer (Tap to Auto-fill):
              </Text>
              {suggestions.map((c) => (
                <TouchableOpacity
                  key={c.id || c.phone_number}
                  style={styles.suggestionRow}
                  onPress={() => selectCustomer(c)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.suggestionName}>👤 {c.name || "Client"}</Text>
                    <Text style={styles.suggestionPhone}>📞 {c.phone_number}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Khata Ledger Summary Banner */}
        {customerLedger && (
          <View style={{ backgroundColor: customerLedger.pendingBalance > 0 ? "#FFFBEB" : "#F0FDF4", borderWidth: 1.5, borderColor: customerLedger.pendingBalance > 0 ? "#FCD34D" : "#86EFAC", borderRadius: radius.md, padding: 12, marginVertical: 8, ...shadow.sm }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={{ fontSize: 12, fontWeight: "800", color: customerLedger.pendingBalance > 0 ? "#B45309" : "#15803D" }}>
                  {customerLedger.pendingBalance > 0 ? `💰 Pending Account Balance: Rs ${customerLedger.pendingBalance}` : "✅ Customer Account Clear (Rs 0 Due)"}
                </Text>
                <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                  Total Business: Rs {customerLedger.totalBill} • Paid: Rs {customerLedger.totalPaid} ({customerLedger.totalOrders} Orders)
                </Text>
              </View>
              {customerLedger.pendingBalance > 0 && (
                <TouchableOpacity
                  style={{ backgroundColor: "#D97706", paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.xs }}
                  onPress={() => setSettleModalVisible(true)}
                >
                  <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "800" }}>💵 Settle Balance</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* 2. COMPACT DELIVERY SCHEDULE SUMMARY CARD */}
        <View style={[styles.compactCard, shadow.sm]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={styles.cardHeaderLabel}>📅 PROMISED DELIVERY SCHEDULE & SLA</Text>
              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.primary, marginTop: 3 }}>
                {deliveryDate || formatDateFormatted(datePickerValue)} • {deliveryTimeSlot || formatTimeFormatted(timePickerValue)}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: "700", color: orderType === "urgent" ? "#DC2626" : orderType === "express" ? "#2563EB" : colors.textMuted, marginTop: 2 }}>
                Priority: {orderType.toUpperCase()} ({orderType === "urgent" ? "Instant / 2-4 hrs" : orderType === "express" ? "Same Day" : "Standard"})
              </Text>
            </View>
            <TouchableOpacity
              style={styles.editCardBtn}
              onPress={() => setScheduleModalVisible(true)}
            >
              <Text style={{ fontSize: 12, fontWeight: "800", color: colors.primary }}>✏️ Edit</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 3. COMPACT GARMENT SUMMARY CARD */}
        <TouchableOpacity
          style={[styles.compactCard, shadow.sm]}
          onPress={() => setGarmentsModalVisible(true)}
          activeOpacity={0.8}
        >
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeaderLabel}>👔 SELECTED GARMENTS ({totalCount} ITEMS)</Text>
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>Tap to Pick ➔</Text>
          </View>

          {/* Selected Pills Preview */}
          {totalCount === 0 ? (
            <View style={styles.emptyItemsBox}>
              <Text style={{ fontSize: 18, marginBottom: 4 }}>🧺</Text>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.textMuted }}>No garments added yet. Tap card to pick items!</Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              {itemTypes.map((t) => {
                const bd = serviceBreakdowns[t.id];
                if (!bd) return null;
                const activeSvcKeys = Object.keys(bd).filter((k) => (bd[k] || 0) > 0);
                if (activeSvcKeys.length === 0) return null;
                const icon = getGarmentIcon(t.name);

                return activeSvcKeys.map((sKey) => {
                  const q = bd[sKey];
                  const svcText =
                    sKey === "press_only" ? "Press" :
                    sKey === "dry_clean" ? "DryClean" :
                    sKey === "wash_fold" ? "WashFold" : "WashPress";

                  return (
                    <View key={`${t.id}-${sKey}`} style={styles.garmentPill}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text }}>
                        {icon} {t.name} x{q}
                      </Text>
                      <Text style={{ fontSize: 10, fontWeight: "800", color: colors.primary, marginLeft: 4 }}>
                        ({svcText})
                      </Text>
                    </View>
                  );
                });
              })}
            </View>
          )}
        </TouchableOpacity>

        {/* 4. HANGER TAGS & PAYMENT SETTLEMENT ROW */}
        <View style={[styles.compactCard, shadow.sm]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "800", color: colors.text }}>🏷️ Hanger Tags ({tagsCount} Stickers)</Text>
              <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 1 }}>Sub-tags generated for garments</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <TouchableOpacity
                style={[styles.cBtn, tagsCount <= 1 && styles.cBtnDisabled]}
                onPress={() => setTagsCount(Math.max(1, tagsCount - 1))}
                disabled={tagsCount <= 1}
              >
                <Text style={styles.cBtnText}>–</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 15, fontWeight: "900", color: colors.primary, minWidth: 16, textAlign: "center" }}>{tagsCount}</Text>
              <TouchableOpacity style={styles.cBtn} onPress={() => setTagsCount(tagsCount + 1)}>
                <Text style={styles.cBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
            <TouchableOpacity
              style={[
                styles.payToggleBtn,
                paymentStatus === "paid" && styles.payTogglePaidActive,
              ]}
              onPress={() => setPaymentStatus("paid")}
            >
              <Text style={{ fontSize: 12, fontWeight: "800", color: paymentStatus === "paid" ? "#15803D" : colors.textMuted }}>
                💳 PAID CASH
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.payToggleBtn,
                paymentStatus === "unpaid" && styles.payToggleUnpaidActive,
              ]}
              onPress={() => setPaymentStatus("unpaid")}
            >
              <Text style={{ fontSize: 12, fontWeight: "800", color: paymentStatus === "unpaid" ? "#B45309" : colors.textMuted }}>
                ⌛ UNPAID (On Delivery)
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 5. INTAKE PHOTOS */}
        <View style={[styles.compactCard, shadow.sm]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: colors.text }}>📷 Garment Intake Photos ({photos.length}/2)</Text>
            <Text style={{ fontSize: 11, color: colors.textMuted }}>Proof of stains/damage</Text>
          </View>
          <View style={styles.photoRow}>
            {photos.map((uri, idx) => (
              <View key={uri} style={styles.photoWrap}>
                <TouchableOpacity onPress={() => openPhotoViewer(idx)}>
                  <Image source={{ uri }} style={styles.photo} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.removeBadge} onPress={() => removePhoto(uri)}>
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
        </View>

        {/* Submit Order Button */}
        <TouchableOpacity
          style={[styles.primaryBtn, shadow.md, !canSubmit && styles.btnDisabled, { marginTop: 8 }]}
          onPress={handleCreateOrder}
          disabled={!canSubmit}
        >
          <Text style={styles.primaryBtnText}>
            Create Order ({totalCount} Pcs • Rs {totalBill}) ➔
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Native DateTimePicker Dialogs */}
      {showDatePicker && (
        <DateTimePicker
          value={datePickerValue}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          minimumDate={new Date()}
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (date) {
              setDatePickerValue(date);
              setDeliveryDate(formatDateFormatted(date));
            }
          }}
        />
      )}

      {showTimePicker && (
        <DateTimePicker
          value={timePickerValue}
          mode="time"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, time) => {
            setShowTimePicker(false);
            if (time) {
              setTimePickerValue(time);
              setDeliveryTimeSlot(formatTimeFormatted(time));
            }
          }}
        />
      )}

      {/* POPUP MODAL 1: DELIVERY SCHEDULE & SLA */}
      <Modal
        visible={scheduleModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setScheduleModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: "#FFF", borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 20, gap: 16 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontSize: 17, fontWeight: "800", color: colors.text }}>📅 Delivery Schedule & SLA</Text>
              <TouchableOpacity onPress={() => setScheduleModalVisible(false)}>
                <Text style={{ fontSize: 18, color: colors.textMuted }}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Speed Selector */}
            <View>
              <Text style={styles.fieldLabel}>Order Speed & Priority</Text>
              <View style={styles.speedRow}>
                {priorityTiers.map((sp) => {
                  const active = orderType === sp.key;
                  return (
                    <TouchableOpacity
                      key={sp.key}
                      style={[styles.speedCard, active && styles.speedCardActive]}
                      onPress={() => handleSelectOrderType(sp.key)}
                    >
                      <Text style={styles.speedIcon}>{sp.icon}</Text>
                      <Text style={[styles.speedLabel, active && styles.speedLabelActive]}>{sp.label}</Text>
                      <Text style={styles.speedDesc}>{sp.desc || `${sp.hours}h`}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Pickers */}
            <View style={styles.scheduleRow}>
              <TouchableOpacity style={styles.pickerCard} onPress={handleOpenDatePicker}>
                <Text style={styles.pickerCardLabel}>📅 Pick Delivery Date</Text>
                <Text style={styles.pickerCardValue}>{deliveryDate || formatDateFormatted(datePickerValue)}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.pickerCard} onPress={handleOpenTimePicker}>
                <Text style={styles.pickerCardLabel}>🕒 Pick Time Slot</Text>
                <Text style={styles.pickerCardValue}>{deliveryTimeSlot || formatTimeFormatted(timePickerValue)}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { marginTop: 10 }]}
              onPress={() => setScheduleModalVisible(false)}
            >
              <Text style={styles.primaryBtnText}>Done / Confirm Schedule</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* POPUP MODAL 2: GARMENTS & SERVICES SELECTOR */}
      <Modal
        visible={garmentsModalVisible}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setGarmentsModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }}>
          {/* Header Bar */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 14, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={{ fontSize: 17, fontWeight: "800", color: colors.text, letterSpacing: -0.3 }}>👔 Select Garments & Services</Text>
              <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>Pick quantities and service breakdown per garment</Text>
            </View>
            <TouchableOpacity
              style={{ backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, elevation: 2 }}
              onPress={() => setGarmentsModalVisible(false)}
            >
              <Text style={{ color: "#FFF", fontSize: 12, fontWeight: "800" }}>Done ({totalCount} Pcs)</Text>
            </TouchableOpacity>
          </View>

          {/* Garment Search Bar */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "#FFF", borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
            <TextInput
              style={[styles.input, { backgroundColor: "#F8FAFC", borderRadius: radius.md }]}
              placeholder="🔍 Search garment (Shirt, Coat, Jeans...)"
              placeholderTextColor={colors.textLight}
              value={garmentSearchQuery}
              onChangeText={setGarmentSearchQuery}
            />
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
            {itemTypes
              .filter((t) => !garmentSearchQuery.trim() || t.name.toLowerCase().includes(garmentSearchQuery.trim().toLowerCase()))
              .map((t) => {
                const qty = quantities[t.id] || 0;
                const sType = serviceTypes[t.id] || "wash_press";
                const icon = getGarmentIcon(t.name);
                const unitPrice = getItemUnitPrice(t, sType);

                return (
                  <View key={t.id} style={[styles.garmentRowCard, qty > 0 && styles.garmentRowCardActive]}>
                    <View style={styles.garmentMainRow}>
                      <Text style={{ fontSize: 22, marginRight: 10 }}>{icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text }}>{t.name}</Text>
                        <Text style={{ fontSize: 11, color: colors.textMuted }}>
                          Rs {unitPrice} / pc {qty > 0 ? `• Selected: ${qty} pcs` : ""}
                        </Text>
                      </View>

                      {/* Main Stepper */}
                      <View style={styles.counterRow}>
                        <TouchableOpacity
                          style={[styles.cBtn, qty === 0 && styles.cBtnDisabled]}
                          onPress={() => updateQty(t.id, -1)}
                          disabled={qty === 0}
                        >
                          <Text style={styles.cBtnText}>–</Text>
                        </TouchableOpacity>

                        <Text style={styles.cQty}>{qty}</Text>

                        <TouchableOpacity style={styles.cBtn} onPress={() => updateQty(t.id, 1)}>
                          <Text style={styles.cBtnText}>+</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Per Item Service Type & Split Quantity Control */}
                    {qty > 0 && (
                      <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)" }}>
                        <Text style={{ fontSize: 11, fontWeight: "800", color: colors.text, marginBottom: 6 }}>
                          Select Service (Or split count per service):
                        </Text>

                        <View style={{ gap: 5 }}>
                          {[
                            { key: "wash_press", label: "Wash & Press", icon: "🧺", color: "#2563EB", bgLight: "#EFF6FF" },
                            { key: "press_only", label: "Press Only", icon: "👔", color: "#0284C7", bgLight: "#F0F9FF" },
                            { key: "dry_clean", label: "Dry Clean", icon: "🧪", color: "#7C3AED", bgLight: "#F5F3FF" },
                            { key: "wash_fold", label: "Wash & Fold", icon: "🧼", color: "#0D9488", bgLight: "#F0FDFA" },
                          ].map((st) => {
                            const bd = serviceBreakdowns[t.id] || { [sType]: qty };
                            const sQty = bd[st.key] || 0;
                            const p = getItemUnitPrice(t, st.key);
                            const isSel = sQty > 0;

                            return (
                              <View
                                key={st.key}
                                style={[
                                  {
                                    flexDirection: "row",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    paddingVertical: 6,
                                    paddingHorizontal: 10,
                                    borderRadius: radius.sm,
                                    backgroundColor: "#F8FAFC",
                                    borderWidth: 1,
                                    borderColor: "#E2E8F0",
                                  },
                                  isSel && { backgroundColor: st.bgLight, borderColor: st.color },
                                ]}
                              >
                                <TouchableOpacity
                                  style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}
                                  onPress={() => updateServiceType(t.id, st.key)}
                                  activeOpacity={0.7}
                                >
                                  <Text style={{ fontSize: 16 }}>{st.icon}</Text>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 12, fontWeight: "800", color: isSel ? st.color : colors.text }}>
                                      {st.label}
                                    </Text>
                                    <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: "600" }}>
                                      Rs {p} / unit
                                    </Text>
                                  </View>
                                </TouchableOpacity>

                                {/* Per-Service Mini Stepper */}
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                  <TouchableOpacity
                                    style={[styles.svcStepperBtn, sQty === 0 && styles.svcStepperBtnDisabled]}
                                    onPress={() => updateServiceBreakdownQty(t.id, st.key, -1)}
                                    disabled={sQty === 0}
                                  >
                                    <Text style={[styles.svcStepperBtnText, sQty === 0 && { color: "#CBD5E1" }]}>–</Text>
                                  </TouchableOpacity>

                                  <Text style={[styles.svcStepperQtyText, isSel && { color: st.color }]}>
                                    {sQty}
                                  </Text>

                                  <TouchableOpacity
                                    style={[styles.svcStepperBtn, { backgroundColor: st.color, borderColor: st.color }]}
                                    onPress={() => updateServiceBreakdownQty(t.id, st.key, 1)}
                                  >
                                    <Text style={[styles.svcStepperBtnText, { color: "#FFFFFF" }]}>+</Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
          </ScrollView>

          {/* Sticky Bottom Bar inside Garments Modal */}
          <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#FFF", padding: 16, borderTopWidth: 1, borderTopColor: colors.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View>
              <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "700" }}>TOTAL BILL</Text>
              <Text style={{ fontSize: 18, fontWeight: "900", color: colors.primary }}>Rs {totalBill} ({totalCount} Pcs)</Text>
            </View>
            <TouchableOpacity
              style={{ backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.sm }}
              onPress={() => setGarmentsModalVisible(false)}
            >
              <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "800" }}>Apply & Return ➔</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Photo Zoom Viewer */}
      <PhotoViewerModal
        visible={viewerVisible}
        photos={photos}
        initialIndex={viewerIndex}
        onClose={() => setViewerVisible(false)}
      />

      {/* Settle Khata Payment Modal */}
      <Modal
        visible={settleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSettleModalVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 }}>
          <View style={{ width: "100%", maxWidth: 360, backgroundColor: "#FFF", borderRadius: radius.md, padding: 20, ...shadow.md }}>
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, marginBottom: 4 }}>💵 Record Account Payment</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
              Customer: {customerName || phone} • Pending Balance: Rs {customerLedger?.pendingBalance || 0}
            </Text>

            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.text, marginBottom: 4 }}>Payment Amount (Rs)</Text>
            <TextInput
              style={[styles.input, { marginBottom: 14 }]}
              placeholder={`Enter amount (e.g. ${customerLedger?.pendingBalance || 500})`}
              keyboardType="numeric"
              value={settleAmount}
              onChangeText={setSettleAmount}
            />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 10, borderRadius: radius.xs, borderWidth: 1, borderColor: colors.border, alignItems: "center" }}
                onPress={() => setSettleModalVisible(false)}
              >
                <Text style={{ fontWeight: "700", color: colors.textMuted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 10, borderRadius: radius.xs, backgroundColor: "#D97706", alignItems: "center" }}
                onPress={handleRecordLedgerPayment}
              >
                <Text style={{ fontWeight: "800", color: "#FFF" }}>Collect & Record</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.screenBg,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) + 6 : 0,
  },
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
    marginBottom: 10,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  headerTitle: {
    fontSize: 23,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.4,
  },
  headerCountBadge: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  headerCountText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  customerBox: {
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    zIndex: 999,
  },
  inputGroup: {
    position: "relative",
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
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
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 14,
    color: colors.text,
    fontWeight: "500",
  },
  suggestionsBox: {
    position: "absolute",
    top: 65,
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
  compactCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
  },
  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardHeaderLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.6,
  },
  editCardBtn: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  addItemsBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  emptyItemsBox: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: radius.sm,
    padding: 14,
    alignItems: "center",
    marginTop: 4,
  },
  payToggleBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    backgroundColor: "#F8FAFC",
  },
  payTogglePaidActive: {
    backgroundColor: "#DCFCE7",
    borderColor: "#16A34A",
  },
  payToggleUnpaidActive: {
    backgroundColor: "#FEF3C7",
    borderColor: "#D97706",
  },
  garmentPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
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
  sectionContainer: {
    marginVertical: 4,
  },
  speedRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  speedCard: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 6,
    alignItems: "center",
  },
  speedCardActive: {
    backgroundColor: "#EFF6FF",
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  speedIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  speedLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text,
  },
  speedLabelActive: {
    color: colors.primary,
  },
  speedDesc: {
    fontSize: 9,
    color: colors.textMuted,
  },
  scheduleRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  subLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 2,
  },
  pillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  miniPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  miniPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  miniPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  miniPillTextActive: {
    color: colors.textInverse,
  },
  garmentRowCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 8,
    marginBottom: 6,
  },
  garmentRowCardActive: {
    backgroundColor: "#EFF6FF",
    borderColor: colors.primary,
  },
  garmentMainRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  cBtnDisabled: {
    backgroundColor: colors.border,
  },
  cBtnText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 18,
  },
  cQty: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    minWidth: 20,
    textAlign: "center",
  },
  svcStepperBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.xs,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  svcStepperBtnDisabled: {
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
  },
  svcStepperBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    lineHeight: 18,
  },
  svcStepperQtyText: {
    fontSize: 13,
    fontWeight: "900",
    minWidth: 22,
    textAlign: "center",
    color: colors.text,
  },
  servicePillGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  svcPill: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.xs,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
  },
  svcPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  svcPillText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  svcPillTextActive: {
    color: colors.textInverse,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: "#3B82F6",
    marginBottom: spacing.md,
    overflow: "hidden",
    ...shadow.sm,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primary,
  },
  historySubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  historyToggleText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  historyList: {
    padding: 12,
    backgroundColor: "#FAFAFA",
  },
  historyOrderBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 10,
  },
  historyOrderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyOrderCode: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.text,
  },
  historyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  historyBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  historyOrderMeta: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    fontWeight: "600",
  },
  historyItemsSnippet: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyItemSnippetText: {
    fontSize: 12,
    color: colors.text,
    lineHeight: 18,
  },
  refillBtn: {
    marginTop: 8,
    backgroundColor: colors.primary,
    paddingVertical: 8,
    borderRadius: radius.xs,
    alignItems: "center",
  },
  refillBtnText: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: "800",
  },
  pickerCard: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  pickerCardLocked: {
    backgroundColor: "#F1F5F9",
    borderColor: "#CBD5E1",
  },
  pickerCardLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primary,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  pickerCardValue: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  pickerCardSub: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 2,
    fontWeight: "600",
  },
});


