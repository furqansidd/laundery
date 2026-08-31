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
} from "react-native";
import { colors, radius, spacing, typography, shadow } from "../theme";
import { fetchAllOrders, updateOrderStatus } from "../lib/ordersApi";
import BarcodeLabel from "../components/BarcodeLabel";
import PhotoViewerModal from "../components/PhotoViewerModal";
import {
  buildReceiptMessage,
  sendWhatsAppReceipt,
  sharePdfInvoiceWithPhotos,
} from "../utils/whatsapp";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "intake", label: "Intake" },
  { key: "washing", label: "Washing" },
  { key: "ready_for_delivery", label: "Ready" },
  { key: "delivered", label: "Delivered" },
];

const STATUS_COLORS = {
  intake: { bg: "#FEF3C7", text: "#D97706", label: "Intake" },
  washing: { bg: "#DBEAFE", text: "#2563EB", label: "Washing" },
  sorting: { bg: "#F3E8FF", text: "#9333EA", label: "Sorting" },
  ready_for_delivery: { bg: "#DCFCE7", text: "#16A34A", label: "Ready" },
  delivered: { bg: "#E2E8F0", text: "#475569", label: "Delivered" },
  cancelled: { bg: "#FEE2E2", text: "#DC2626", label: "Cancelled" },
};

export default function OrdersScreen() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Photo viewer modal state
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerPhotos, setViewerPhotos] = useState([]);
  const [viewerIndex, setViewerIndex] = useState(0);

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

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus, `Updated to ${newStatus}`, "staff");
      Alert.alert("Status Updated", `Order marked as ${newStatus}`);
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder((prev) => ({ ...prev, status: newStatus }));
      }
      loadOrders();
    } catch (e) {
      Alert.alert("Failed to update status", e.message);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!selectedOrder) return;
    const message = buildReceiptMessage({
      order: selectedOrder,
      items: (selectedOrder.order_items || []).map((i) => ({
        name: i.item_types?.name || "Garment",
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
    await sharePdfInvoiceWithPhotos({
      order: selectedOrder,
      items: (selectedOrder.order_items || []).map((i) => ({
        name: i.item_types?.name || "Garment",
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
            <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
              <Text style={[styles.statusText, { color: statusCfg.text }]}>
                {statusCfg.label}
              </Text>
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

          <View style={styles.summaryRow}>
            <Text style={styles.piecesText}>
              {item.total_item_count} items
            </Text>
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
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[typography.caption, { marginTop: spacing.sm }]}>
            Loading orders…
          </Text>
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
              <Text style={{ fontSize: 40, marginBottom: spacing.sm }}>📋</Text>
              <Text style={typography.h2}>No orders found</Text>
              <Text style={typography.caption}>
                Try adjusting your search or filter criteria.
              </Text>
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
                  {(selectedOrder.order_items || []).map((it, idx) => (
                    <View key={idx} style={styles.itemRow}>
                      <Text style={styles.itemName}>
                        • {it.item_types?.name || "Garment"}
                      </Text>
                      <Text style={styles.itemQty}>x{it.quantity}</Text>
                    </View>
                  ))}
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
              <View style={[styles.statusActionRow, { marginTop: spacing.sm, marginBottom: 2 }]}>
                <TouchableOpacity
                  style={[styles.statusBtn, { backgroundColor: "#25D366", flex: 1 }]}
                  onPress={handleSendWhatsApp}
                >
                  <Text style={styles.statusBtnText}>💬 WhatsApp Receipt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusBtn, { backgroundColor: colors.primary, flex: 1 }]}
                  onPress={handleSharePdf}
                >
                  <Text style={styles.statusBtnText}>📄 PDF Receipt</Text>
                </TouchableOpacity>
              </View>

              {/* Status Advancement Actions */}
              <View style={styles.statusActionRow}>
                {selectedOrder.status !== "ready_for_delivery" && (
                  <TouchableOpacity
                    style={[styles.statusBtn, { backgroundColor: "#16A34A" }]}
                    onPress={() =>
                      handleStatusChange(selectedOrder.id, "ready_for_delivery")
                    }
                  >
                    <Text style={styles.statusBtnText}>
                      Mark Ready for Delivery
                    </Text>
                  </TouchableOpacity>
                )}
                {selectedOrder.status !== "delivered" && (
                  <TouchableOpacity
                    style={[styles.statusBtn, { backgroundColor: "#334155" }]}
                    onPress={() =>
                      handleStatusChange(selectedOrder.id, "delivered")
                    }
                  >
                    <Text style={styles.statusBtnText}>Mark Delivered</Text>
                  </TouchableOpacity>
                )}
              </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
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
});
