import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  RefreshControl,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Modal,
  ScrollView,
  Platform,
  StatusBar,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { colors, radius, spacing, typography, shadow, getStatusBadgeStyle } from "../theme";
import { fetchAllOrders, updateOrderStatus, moveServiceStage, completeServiceStage, markOrderDeliveredWithPayment } from "../lib/ordersApi";
import BarcodeLabel from "../components/BarcodeLabel";
import PhotoViewerModal from "../components/PhotoViewerModal";
import {
  buildReceiptMessage,
  sendWhatsAppReceipt,
  sharePdfInvoiceWithPhotos,
  shareInvoiceSlipPdf,
  printInvoiceSlip,
  sendOrderReadyWhatsApp,
} from "../utils/whatsapp";

const STATUS_FILTERS = [
  { key: "all", label: "All 📋" },
  { key: "intake", label: "Intake 🧺" },
  { key: "washing", label: "Washing 🧼" },
  { key: "wash_press", label: "Wash & Press 🧺" },
  { key: "press_only", label: "Pressing 👔" },
  { key: "dry_clean", label: "Dry Clean 🧪" },
  { key: "wash_fold", label: "Wash & Fold 🧼" },
  { key: "ready_for_delivery", label: "Ready 📦" },
  { key: "delivered", label: "Delivered ✅" },
];

const STATUS_COLORS = {
  intake: { bg: "#FFFBEB", text: "#D97706", label: "Intake 🧺" },
  wash_press: { bg: "#EFF6FF", text: "#2563EB", label: "Wash & Press 🧺" },
  washing: { bg: "#EFF6FF", text: "#2563EB", label: "Washing 🧼" },
  press_only: { bg: "#F0F9FF", text: "#0284C7", label: "Pressing 👔" },
  dry_clean: { bg: "#F5F3FF", text: "#7C3AED", label: "Dry Clean 🧪" },
  wash_fold: { bg: "#F0FDFA", text: "#0D9488", label: "Wash & Fold 🧼" },
  sorting: { bg: "#F5F3FF", text: "#8B5CF6", label: "Sorting / Tag Verification 🔍" },
  ready_for_delivery: { bg: "#ECFDF5", text: "#10B981", label: "Ready 📦" },
  delivered: { bg: "#F1F5F9", text: "#64748B", label: "Delivered ✅" },
  cancelled: { bg: "#FEF2F2", text: "#EF4444", label: "Cancelled ✕" },
};

const getServiceStageButtons = (orderObj, currentTab = "all") => {
  if (
    orderObj?.status === "ready_for_delivery" ||
    orderObj?.status === "delivered" ||
    orderObj?.status === "cancelled"
  ) {
    return [];
  }

  const items = orderObj?.order_items || [];
  const services = new Set(items.map((i) => i.service_type));
  const movedServices = new Set(orderObj?.moved_services || []);
  const completedServices = new Set(orderObj?.completed_services || []);

  const serviceKeys = ["wash_press", "press_only", "dry_clean", "wash_fold"];
  const isSpecificTab = serviceKeys.includes(currentTab);

  let targetServices = isSpecificTab ? [currentTab] : Array.from(services);

  const buttons = [];

  targetServices.forEach((sKey) => {
    if (!services.has(sKey)) return;

    if (sKey === "wash_press") {
      if (!movedServices.has("wash_press")) {
        buttons.push({ key: "wash_press", actionType: "move", label: "🧺 Move to Wash & Press", bg: "#2563EB" });
      } else if (!completedServices.has("wash_press")) {
        buttons.push({ key: "wash_press", actionType: "complete", label: "✓ Mark Wash & Press Ready", bg: "#16A34A" });
      }
    } else if (sKey === "dry_clean") {
      if (!movedServices.has("dry_clean")) {
        buttons.push({ key: "dry_clean", actionType: "move", label: "🧪 Move to Dry Clean", bg: "#7C3AED" });
      } else if (!completedServices.has("dry_clean")) {
        buttons.push({ key: "dry_clean", actionType: "complete", label: "✓ Mark Dry Clean Ready", bg: "#16A34A" });
      }
    } else if (sKey === "press_only") {
      if (!movedServices.has("press_only")) {
        buttons.push({ key: "press_only", actionType: "move", label: "👔 Move to Pressing", bg: "#0284C7" });
      } else if (!completedServices.has("press_only")) {
        buttons.push({ key: "press_only", actionType: "complete", label: "✓ Mark Pressing Ready", bg: "#16A34A" });
      }
    } else if (sKey === "wash_fold") {
      if (!movedServices.has("wash_fold")) {
        buttons.push({ key: "wash_fold", actionType: "move", label: "🧼 Move to Wash & Fold", bg: "#0D9488" });
      } else if (!completedServices.has("wash_fold")) {
        buttons.push({ key: "wash_fold", actionType: "complete", label: "✓ Mark Wash & Fold Ready", bg: "#16A34A" });
      }
    }
  });

  return buttons;
};

export default function OrdersScreen({ navigation }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Delivery Cash Collection modal state
  const [deliverModalVisible, setDeliverModalVisible] = useState(false);
  const [deliveryTargetOrder, setDeliveryTargetOrder] = useState(null);
  const [delivering, setDelivering] = useState(false);

  // Photo viewer modal state
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerPhotos, setViewerPhotos] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);

  const handleOpenDeliveryModal = (orderObj) => {
    setDeliveryTargetOrder(orderObj);
    setDeliverModalVisible(true);
  };

  const handleExecuteDelivery = async (payStatus) => {
    if (!deliveryTargetOrder) return;
    setDelivering(true);
    try {
      const bill = Number(deliveryTargetOrder.total_bill_amount) || 0;
      await markOrderDeliveredWithPayment({
        orderId: deliveryTargetOrder.id,
        paymentStatus: payStatus,
        cashAmount: payStatus === "paid" ? bill : 0,
        createdBy: "staff",
      });
      setDeliverModalVisible(false);
      if (selectedOrder && selectedOrder.id === deliveryTargetOrder.id) {
        setSelectedOrder(null);
        setModalVisible(false);
      }
      setDeliveryTargetOrder(null);
      Alert.alert(
        "Order Delivered! 🚚",
        payStatus === "paid"
          ? `Collected Rs ${bill} cash & marked order PAID!`
          : `Order delivered and added to customer's Ledger Account.`
      );
      loadOrders();
    } catch (e) {
      Alert.alert("Delivery Error", e.message);
    } finally {
      setDelivering(false);
    }
  };

  const loadOrders = useCallback(async () => {
    try {
      const data = await fetchAllOrders(statusFilter, searchQuery);
      setOrders(data);
    } catch (e) {
      Alert.alert("Error loading orders", e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, searchQuery]);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders])
  );

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);


  const onRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const openPhotoViewer = (photos, index = 0) => {
    if (!photos || photos.length === 0) {
      Alert.alert("No photos", "This order does not have intake proof photos.");
      return;
    }
    setViewerPhotos(photos);
    setViewerIndex(index);
    setViewerVisible(true);
  };

  const handleStatusChange = async (orderId, newStatus, customOrderObj = null, customLabel = null, actionType = "move") => {
    try {
      let statusLabel = customLabel || newStatus;
      const isServiceKey = ["wash_press", "press_only", "dry_clean", "wash_fold"].includes(newStatus);

      // Optimistically update orders in state immediately without waiting
      setOrders((prevOrders) =>
        prevOrders.map((ord) => {
          if (ord.id !== orderId) return ord;
          const updated = { ...ord };
          if (isServiceKey) {
            if (actionType === "complete") {
              const completed = Array.isArray(ord.completed_services) ? [...ord.completed_services] : [];
              if (!completed.includes(newStatus)) completed.push(newStatus);
              updated.completed_services = completed;
            } else {
              const moved = Array.isArray(ord.moved_services) ? [...ord.moved_services] : [];
              if (!moved.includes(newStatus)) moved.push(newStatus);
              updated.moved_services = moved;
            }
          } else {
            updated.status = newStatus;
          }
          return updated;
        })
      );

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder((prev) => {
          if (!prev) return prev;
          const updated = { ...prev };
          if (isServiceKey) {
            if (actionType === "complete") {
              const completed = Array.isArray(prev.completed_services) ? [...prev.completed_services] : [];
              if (!completed.includes(newStatus)) completed.push(newStatus);
              updated.completed_services = completed;
            } else {
              const moved = Array.isArray(prev.moved_services) ? [...prev.moved_services] : [];
              if (!moved.includes(newStatus)) moved.push(newStatus);
              updated.moved_services = moved;
            }
          } else {
            updated.status = newStatus;
          }
          return updated;
        });
      }

      if (isServiceKey) {
        if (actionType === "complete") {
          await completeServiceStage(orderId, newStatus, "staff");
        } else {
          await moveServiceStage(orderId, newStatus, "staff");
        }
      } else {
        if (!customLabel) {
          if (newStatus === "washing") {
            statusLabel = "Washing & Processing 🧺";
          } else if (newStatus === "ready_for_delivery") {
            statusLabel = "Ready for Delivery 📦";
          } else if (newStatus === "delivered") {
            statusLabel = "Delivered & Closed 🚚";
          }
        }
        await updateOrderStatus(orderId, newStatus, `Moved to ${statusLabel}`, "staff");
      }

      const targetOrder = customOrderObj || selectedOrder || orders.find((o) => o.id === orderId);
      if (newStatus === "ready_for_delivery" || actionType === "complete") {
        setTimeout(() => {
          Alert.alert(
            "Order Ready! 📦",
            `Order ${targetOrder?.order_code || ""} is marked Ready! Would you like to notify the customer on WhatsApp?`,
            [
              { text: "Later", style: "cancel" },
              {
                text: "📲 Send WhatsApp",
                onPress: () => {
                  if (targetOrder) {
                    sendOrderReadyWhatsApp(targetOrder);
                  }
                },
              },
            ]
          );
        }, 350);
      }

      // Re-sync fully with persistent storage
      await loadOrders();
    } catch (e) {
      Alert.alert("Failed to update status", e.message);
      loadOrders();
    }
  };

  const handleSendWhatsApp = async () => {
    if (!selectedOrder) return;
    const message = buildReceiptMessage({
      order: selectedOrder,
      items: (selectedOrder.order_items || []).map((i) => ({
        name: i.item_types?.name || i.name || "Garment",
        service_type: i.service_type || "wash_press",
        quantity: i.quantity,
        unit_price: i.unit_price,
      })),
      photoUrls: selectedOrder.intake_photo_urls || [],
    });
    await sendWhatsAppReceipt({
      phoneNumber: selectedOrder.customers?.phone_number || "",
      message,
    });
  };

  const handleSharePdf = async () => {
    if (!selectedOrder) return;
    await shareInvoiceSlipPdf({
      order: selectedOrder,
      items: (selectedOrder.order_items || []).map((i) => ({
        name: i.item_types?.name || i.name || "Garment",
        service_type: i.service_type || "wash_press",
        quantity: i.quantity,
        unit_price: i.unit_price,
      })),
      photoUrls: selectedOrder.intake_photo_urls || [],
    });
  };

  const handlePrintSlip = async () => {
    if (!selectedOrder) return;
    await printInvoiceSlip({
      order: selectedOrder,
      items: (selectedOrder.order_items || []).map((i) => ({
        name: i.item_types?.name || i.name || "Garment",
        service_type: i.service_type || "wash_press",
        quantity: i.quantity,
        unit_price: i.unit_price,
      })),
      photoUrls: selectedOrder.intake_photo_urls || [],
    });
  };

  const renderOrderItem = ({ item }) => {
    const statusCfg = STATUS_COLORS[item.status] || {
      bg: "#E2E8F0",
      text: "#475569",
      label: item.status,
    };
    const photos = item.intake_photo_urls || [];
    const orderDate = item.created_at
      ? new Date(item.created_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";

    const speedType = item.order_type || "normal";
    const isUrgent = speedType === "urgent";
    const isExpress = speedType === "express";

    return (
      <View style={[styles.card, shadow]}>
        {/* Clickable Card Header & Info */}
        <TouchableOpacity
          onPress={() => {
            setSelectedOrder(item);
            setModalVisible(true);
          }}
          activeOpacity={0.7}
        >
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.orderCode}>{item.order_code}</Text>
              <Text style={styles.dateText}>{orderDate}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              {(isUrgent || isExpress) && (
                <View
                  style={[
                    styles.speedBadge,
                    isUrgent ? styles.badgeUrgent : styles.badgeExpress,
                  ]}
                >
                  <Text style={styles.speedBadgeText}>
                    {isUrgent ? "🔥 URGENT" : "⚡ EXPRESS"}
                  </Text>
                </View>
              )}
              <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                <Text style={[styles.statusText, { color: statusCfg.text }]}>
                  {statusCfg.label}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.customerRow}>
            <Text style={styles.customerName}>
              {item.customers?.name || "Customer"}
            </Text>
            <Text style={styles.customerPhone}>
              {item.customers?.phone_number || "No phone"}
            </Text>
          </View>

          {item.delivery_date && (
            <Text style={styles.delDateText}>
              📅 Promised: {item.delivery_date} ({item.delivery_time_slot || "Anytime"})
            </Text>
          )}

          {/* Garment Services Breakdown Badges */}
          {(() => {
            const serviceKeys = ["wash_press", "press_only", "dry_clean", "wash_fold"];
            const isSpecificTab = serviceKeys.includes(statusFilter);
            const items = isSpecificTab
              ? (item.order_items || []).filter((it) => (it.service_type || "wash_press") === statusFilter)
              : item.order_items || [];
            const movedServices = new Set(item.moved_services || []);
            const completedServices = new Set(item.completed_services || []);

            const servicesList = Array.from(
              new Set(items.map((it) => {
                switch (it.service_type) {
                  case "press_only": return { key: "press_only", name: "👔 Press Only" };
                  case "dry_clean": return { key: "dry_clean", name: "🧪 Dry Clean" };
                  case "wash_fold": return { key: "wash_fold", name: "🧼 Wash & Fold" };
                  case "wash_press": default: return { key: "wash_press", name: "🧺 Wash & Press" };
                }
              }))
            );
            if (servicesList.length === 0) return null;
            return (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {servicesList.map((svcObj, sIdx) => {
                  const isMoved = movedServices.has(svcObj.key);
                  const isDone = completedServices.has(svcObj.key);

                  let bg = "#FFFBEB";
                  let border = "#FDE68A";
                  let color = "#B45309";
                  let labelText = `${svcObj.name} ⌛ (Pending Intake)`;

                  if (isDone) {
                    bg = "#DCFCE7";
                    border = "#86EFAC";
                    color = "#15803D";
                    labelText = `${svcObj.name} ✅ (Ready)`;
                  } else if (isMoved) {
                    bg = "#EFF6FF";
                    border = "#BFDBFE";
                    color = "#1D4ED8";
                    labelText = `${svcObj.name} ⏳ (Processing)`;
                  }

                  return (
                    <View
                      key={sIdx}
                      style={{
                        backgroundColor: bg,
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 4,
                        borderWidth: 1,
                        borderColor: border,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "700", color: color }}>
                        {labelText}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          })()}

          <View style={styles.summaryRow}>
            {(() => {
              const serviceKeys = ["wash_press", "press_only", "dry_clean", "wash_fold"];
              const isSpecificTab = serviceKeys.includes(statusFilter);
              const items = isSpecificTab
                ? (item.order_items || []).filter((it) => (it.service_type || "wash_press") === statusFilter)
                : item.order_items || [];
              const tabItemCount = isSpecificTab
                ? items.reduce((sum, i) => sum + (i.quantity || 1), 0)
                : item.total_item_count;

              return (
                <Text style={styles.piecesText}>
                  {tabItemCount} {isSpecificTab ? "item in stage" : "items"}
                </Text>
              );
            })()}
            <Text style={styles.amountText}>
              Rs {Number(item.total_bill_amount || 0).toFixed(0)}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Independent Thumbnail Row */}
        {photos.length > 0 && (
          <View style={styles.photoThumbRow}>
            <Text style={styles.photoHint}>Intake Photos (Tap to zoom):</Text>
            <View style={styles.thumbImagesContainer}>
              {photos.map((url, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.thumbTouch}
                  onPress={() => openPhotoViewer(photos, idx)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Image source={{ uri: url }} style={styles.photoThumb} />
                  <Text style={styles.thumbTag}>Photo {idx + 1} 🔍</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Quick Stage Advancement Action Bar */}
        {(() => {
          const moveBtns = getServiceStageButtons(item, statusFilter);
          const isFinalStage = item.status === "ready_for_delivery" || item.status === "delivered";

          return (
            <View style={{ flexDirection: "row", gap: 6, marginTop: spacing.sm, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border, flexWrap: "wrap" }}>
              {!isFinalStage && (
                <>
                  {moveBtns.map((btn) => (
                    <TouchableOpacity
                      key={btn.key + "_" + btn.actionType}
                      style={{ flex: 1, minWidth: 120, backgroundColor: btn.bg, paddingVertical: 8, paddingHorizontal: 6, borderRadius: radius.xs, alignItems: "center" }}
                      onPress={() => handleStatusChange(item.id, btn.key, item, btn.label.replace("Move to ", "").replace("✓ Mark ", ""), btn.actionType)}
                    >
                      <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "800" }}>{btn.label}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {item.status === "ready_for_delivery" && (
                <>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: "#7C3AED", paddingVertical: 8, borderRadius: radius.xs, alignItems: "center" }}
                    onPress={() => navigation?.navigate("SortingTab", { orderCode: item.order_code })}
                  >
                    <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "800" }}>🔍 Verify & Assemble Order</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: item.payment_status === "paid" ? "#16A34A" : "#334155", paddingVertical: 8, borderRadius: radius.xs, alignItems: "center" }}
                    onPress={() => handleOpenDeliveryModal(item)}
                  >
                    <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "800" }}>
                      {item.payment_status === "paid" ? "🚚 Deliver (Already Paid)" : "🚚 Deliver & Collect Cash"}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {item.status === "delivered" && (
                <View style={{ flex: 1, backgroundColor: "#F1F5F9", paddingVertical: 6, borderRadius: radius.xs, alignItems: "center" }}>
                  <Text style={{ color: "#64748B", fontSize: 11, fontWeight: "800" }}>
                    ✅ Order Delivered ({item.payment_status === "paid" ? "PAID CASH" : "UNPAID ACCOUNT"})
                  </Text>
                </View>
              )}
            </View>
          );
        })()}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Top Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Order History</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 Search by code, name, or phone…"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="always"
        />

        {/* Filter Pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContainer}
        >
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterPill, active && styles.filterPillActive]}
                onPress={() => setStatusFilter(f.key)}
              >
                <Text
                  style={[
                    styles.filterText,
                    active && styles.filterTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Orders List */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={renderOrderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No orders found.</Text>
            </View>
          }
        />
      )}

      {/* Still, Non-Scrolling Order Detail Sheet */}
      {selectedOrder && (
        <Modal
          visible={modalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setModalVisible(false)}
        >
          <SafeAreaView style={styles.modalSafe}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                <Text style={styles.modalOrderCode}>{selectedOrder.order_code}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        STATUS_COLORS[selectedOrder.status]?.bg || "#E2E8F0",
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      {
                        color:
                          STATUS_COLORS[selectedOrder.status]?.text || "#475569",
                      },
                    ]}
                  >
                    {STATUS_COLORS[selectedOrder.status]?.label || selectedOrder.status}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
              >
                <Text style={styles.modalCloseText}>✕ Close</Text>
              </TouchableOpacity>
            </View>

            {/* Still Modal Body (Non-scrolling flex container) */}
            <View style={styles.stillModalBody}>
              {/* Customer Info Card */}
              <View style={[styles.detailCard, shadow]}>
                <Text style={styles.detailCardTitle}>CUSTOMER DETAILS</Text>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Name</Text>
                  <Text style={styles.detailValue}>
                    {selectedOrder.customers?.name || "Not provided"}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Phone</Text>
                  <Text style={styles.detailValue}>
                    {selectedOrder.customers?.phone_number || "Not provided"}
                  </Text>
                </View>
              </View>

              {/* Garment Breakdown */}
              <View style={[styles.detailCard, shadow, { flex: 1 }]}>
                <Text style={styles.detailCardTitle}>GARMENT BREAKDOWN</Text>
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                  {(selectedOrder.order_items || []).map((it, idx) => {
                    const getSvcBadge = (sKey) => {
                      switch (sKey) {
                        case "press_only": return "👔 Press Only";
                        case "dry_clean": return "🧪 Dry Clean";
                        case "wash_fold": return "🧼 Wash & Fold";
                        case "wash_press": default: return "🧺 Wash & Press";
                      }
                    };
                    return (
                      <View key={idx} style={[styles.itemRow, { alignItems: "center" }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.itemName}>
                            • {it.item_types?.name || it.name || "Garment"}
                          </Text>
                          <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "700", marginLeft: 10 }}>
                            {getSvcBadge(it.service_type)}
                          </Text>
                        </View>
                        <Text style={styles.itemQty}>x{it.quantity || 1}</Text>
                      </View>
                    );
                  })}
                </ScrollView>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    Total Pieces: {selectedOrder.total_item_count}
                  </Text>
                  <Text style={styles.totalValue}>
                    Rs {Number(selectedOrder.total_bill_amount).toFixed(0)}
                  </Text>
                </View>
              </View>

              {/* Proof Photos inside Modal */}
              {selectedOrder.intake_photo_urls?.length > 0 && (
                <View style={[styles.detailCard, shadow]}>
                  <Text style={styles.detailCardTitle}>
                    INTAKE PROOF PHOTOS (TAP TO ZOOM)
                  </Text>
                  <View style={styles.photoGrid}>
                    {selectedOrder.intake_photo_urls.map((url, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.bigPhotoWrap}
                        onPress={() =>
                          openPhotoViewer(selectedOrder.intake_photo_urls, idx)
                        }
                      >
                        <Image source={{ uri: url }} style={styles.modalPhoto} />
                        <Text style={styles.photoTag}>Photo {idx + 1} 🔍</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Receipt Sharing Actions */}
              <View style={[styles.statusActionRow, { marginTop: spacing.sm, marginBottom: 4, gap: 6 }]}>
                <TouchableOpacity
                  style={[styles.statusBtn, { backgroundColor: "#0284C7", flex: 1 }]}
                  onPress={handlePrintSlip}
                >
                  <Text style={styles.statusBtnText}>🖨️ Print Slip</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusBtn, { backgroundColor: "#25D366", flex: 1 }]}
                  onPress={handleSharePdf}
                >
                  <Text style={styles.statusBtnText}>📲 Share WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusBtn, { backgroundColor: colors.surfaceHover, borderWidth: 1, borderColor: colors.border, flex: 0.8 }]}
                  onPress={handleSendWhatsApp}
                >
                  <Text style={[styles.statusBtnText, { color: colors.text }]}>💬 Text</Text>
                </TouchableOpacity>
              </View>

              {selectedOrder.status === "ready_for_delivery" && (
                <TouchableOpacity
                  style={[styles.statusBtn, { backgroundColor: "#16A34A", marginBottom: 6 }]}
                  onPress={() => sendOrderReadyWhatsApp(selectedOrder)}
                >
                  <Text style={styles.statusBtnText}>📦 Send Ready Notice via WhatsApp</Text>
                </TouchableOpacity>
              )}

              {/* Status Advancement Actions */}
              {(() => {
                const moveBtns = getServiceStageButtons(selectedOrder);
                return (
                  <View style={styles.statusActionRow}>
                    {moveBtns.map((btn) => (
                      <TouchableOpacity
                        key={btn.key + "_" + btn.actionType}
                        style={[styles.statusBtn, { backgroundColor: btn.bg, flex: 1 }]}
                        onPress={() =>
                          handleStatusChange(selectedOrder.id, btn.key, selectedOrder, btn.label.replace("Move to ", "").replace("✓ Mark ", ""), btn.actionType)
                        }
                      >
                        <Text style={styles.statusBtnText}>{btn.label}</Text>
                      </TouchableOpacity>
                    ))}
                    {selectedOrder.status === "ready_for_delivery" && (
                      <>
                        <TouchableOpacity
                          style={[styles.statusBtn, { backgroundColor: "#7C3AED", flex: 1 }]}
                          onPress={() => {
                            setModalVisible(false);
                            navigation?.navigate("SortingTab", { orderCode: selectedOrder.order_code });
                          }}
                        >
                          <Text style={styles.statusBtnText}>🔍 Verify & Assemble Order</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.statusBtn, { backgroundColor: selectedOrder?.payment_status === "paid" ? "#16A34A" : "#334155", flex: 1 }]}
                          onPress={() => handleOpenDeliveryModal(selectedOrder)}
                        >
                          <Text style={styles.statusBtnText}>
                            {selectedOrder?.payment_status === "paid" ? "🚚 Deliver (Already Paid)" : "🚚 Deliver & Collect Cash"}
                          </Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                );
              })()}
            </View>

            {/* Photo viewer overlay inside detail modal */}
            <PhotoViewerModal
              visible={viewerVisible}
              photos={viewerPhotos}
              initialIndex={viewerIndex}
              onClose={() => setViewerVisible(false)}
            />
          </SafeAreaView>
        </Modal>
      )}

      {/* Global Photo Viewer Overlay */}
      <PhotoViewerModal
          visible={viewerVisible}
          photos={viewerPhotos}
          initialIndex={viewerIndex}
          onClose={() => setViewerVisible(false)}
        />

        {/* Deliver & Collect Cash Modal */}
        {deliveryTargetOrder && (
          <Modal
            visible={deliverModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setDeliverModalVisible(false)}
          >
            <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", alignItems: "center", padding: 20 }}>
              <View style={{ width: "100%", maxWidth: 360, backgroundColor: "#FFF", borderRadius: radius.md, padding: 20, ...shadow.md }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text, marginBottom: 4 }}>
                  {deliveryTargetOrder.payment_status === "paid" ? "🚚 Confirm Order Delivery" : "🚚 Order Delivery & Cash Collection"}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>
                  Order Code: {deliveryTargetOrder.order_code} • Customer: {deliveryTargetOrder.customers?.name || deliveryTargetOrder.customers?.phone_number}
                </Text>

                <View style={{ backgroundColor: "#F8FAFC", borderRadius: radius.sm, padding: 12, borderWidth: 1, borderColor: colors.border, marginBottom: 16 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>Total Hanger Tags:</Text>
                    <Text style={{ fontSize: 12, fontWeight: "800", color: colors.text }}>{deliveryTargetOrder.tags_count || 1} Tags</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>Total Bill Amount:</Text>
                    <Text style={{ fontSize: 16, fontWeight: "900", color: colors.primary }}>Rs {deliveryTargetOrder.total_bill_amount || 0}</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>Current Payment Status:</Text>
                    <Text style={{ fontSize: 12, fontWeight: "800", color: deliveryTargetOrder.payment_status === "paid" ? "#16A34A" : "#B45309" }}>
                      {deliveryTargetOrder.payment_status === "paid" ? "💳 ALREADY PAID" : "⌛ UNPAID"}
                    </Text>
                  </View>
                </View>

                {delivering ? (
                  <ActivityIndicator size="large" color={colors.primary} style={{ marginVertical: 20 }} />
                ) : (
                  <View style={{ gap: 10 }}>
                    {deliveryTargetOrder.payment_status === "paid" ? (
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
                            💵 Collect Rs {deliveryTargetOrder.total_bill_amount || 0} Cash & Deliver
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
        )}
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
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    marginBottom: 4,
  },
  searchInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterScroll: { marginTop: spacing.sm },
  filterContainer: { gap: spacing.xs, paddingBottom: spacing.xs },
  filterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  filterTextActive: {
    color: colors.textInverse,
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xl * 2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  orderCode: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
  },
  dateText: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "700",
  },
  customerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  customerName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  customerPhone: {
    fontSize: 13,
    color: colors.textMuted,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
  },
  piecesText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  amountText: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
  },
  photoThumbRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  photoHint: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: "700",
  },
  thumbImagesContainer: {
    flexDirection: "row",
    gap: spacing.md,
  },
  thumbTouch: {
    alignItems: "center",
  },
  photoThumb: {
    width: 55,
    height: 55,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  thumbTag: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: "700",
    marginTop: 2,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl * 2,
  },
  modalSafe: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalOrderCode: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  modalCloseBtn: {
    padding: spacing.xs,
  },
  modalCloseText: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 15,
  },
  stillModalBody: {
    flex: 1,
    padding: spacing.md,
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  detailCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  detailCardTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: "600",
  },
  detailValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  itemName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  itemQty: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.primary,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontWeight: "700",
    fontSize: 13,
    color: colors.text,
  },
  totalValue: {
    fontWeight: "800",
    fontSize: 16,
    color: colors.primary,
  },
  photoGrid: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: 2,
  },
  bigPhotoWrap: {
    flex: 1,
    position: "relative",
  },
  modalPhoto: {
    width: "100%",
    height: 90,
    borderRadius: radius.sm,
  },
  photoTag: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.65)",
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  statusActionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  statusBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  statusBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  speedBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  badgeUrgent: {
    backgroundColor: "#FEE2E2",
    borderColor: "#EF4444",
  },
  badgeExpress: {
    backgroundColor: "#FEF3C7",
    borderColor: "#F59E0B",
  },
  speedBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.text,
  },
  delDateText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
    marginTop: 2,
  },
});
