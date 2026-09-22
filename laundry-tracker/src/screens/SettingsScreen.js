import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { colors, radius, shadow, typography } from "../theme";
import {
  fetchItemTypes,
  addServiceItem,
  updateServiceItem,
  deleteServiceItem,
  fetchAllCustomers,
  getCustomerLedger,
  recordCustomerPayment,
  fetchPriorityTiers,
  updatePriorityTier,
} from "../lib/ordersApi";
import { sendCustomerLedgerWhatsApp } from "../utils/whatsapp";

export default function SettingsScreen() {
  const [activeTab, setActiveTab] = useState("services"); // "services" | "ledger" | "priorities"
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // New service form state
  const [newName, setNewName] = useState("");
  const [newUnitType, setNewUnitType] = useState("piece");
  const [newPrice, setNewPrice] = useState("");

  // Edit price inline state
  const [editingId, setEditingId] = useState(null);
  const [editPriceVal, setEditPriceVal] = useState("");

  // Customer Khata & Directory State
  const [customersList, setCustomersList] = useState([]);
  const [custLoading, setCustLoading] = useState(false);
  const [custSearch, setCustSearch] = useState("");
  const [selectedCust, setSelectedCust] = useState(null);
  const [ledgerData, setLedgerData] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerModalVisible, setLedgerModalVisible] = useState(false);
  const [paymentAmt, setPaymentAmt] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  // Priorities & SLA Timing State
  const [prioritiesList, setPrioritiesList] = useState([]);
  const [prioritiesLoading, setPrioritiesLoading] = useState(false);
  const [editingPriority, setEditingPriority] = useState(null);
  const [editPriorityHours, setEditPriorityHours] = useState("");
  const [editPriorityDesc, setEditPriorityDesc] = useState("");
  const [priorityModalVisible, setPriorityModalVisible] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadServices();
      loadCustomers();
      loadPriorities();
    }, [])
  );

  const loadServices = async () => {
    setLoading(true);
    try {
      const list = await fetchItemTypes();
      setServices(list || []);
    } catch (err) {
      console.log("Error loading services:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    setCustLoading(true);
    try {
      const list = await fetchAllCustomers();
      setCustomersList(list || []);
    } catch (err) {
      console.log("Error loading customers:", err);
    } finally {
      setCustLoading(false);
    }
  };

  const loadPriorities = async () => {
    setPrioritiesLoading(true);
    try {
      const list = await fetchPriorityTiers();
      setPrioritiesList(list || []);
    } catch (err) {
      console.log("Error loading priorities:", err);
    } finally {
      setPrioritiesLoading(false);
    }
  };

  const handleOpenEditPriority = (tier) => {
    setEditingPriority(tier);
    setEditPriorityHours(String(tier.hours || 1));
    setEditPriorityDesc(tier.desc || "");
    setPriorityModalVisible(true);
  };

  const handleSavePriority = async () => {
    if (!editingPriority) return;
    const h = Number(editPriorityHours);
    if (!h || h <= 0) {
      Alert.alert("Invalid Hours", "Please enter a valid number of turnaround hours.");
      return;
    }
    setSavingPriority(true);
    try {
      const updated = await updatePriorityTier(editingPriority.key, {
        hours: h,
        desc: editPriorityDesc.trim() || `${h} Hours turnaround`,
        badge: `${h} Hours`,
      });
      setPrioritiesList(updated);
      setPriorityModalVisible(false);
      Alert.alert("Priority Updated", `${editingPriority.label} turnaround timing updated to ${h} Hours!`);
    } catch (e) {
      Alert.alert("Update Failed", e.message);
    } finally {
      setSavingPriority(false);
    }
  };

  const handleOpenLedger = async (cust) => {
    setSelectedCust(cust);
    setLedgerModalVisible(true);
    setLedgerLoading(true);
    try {
      const data = await getCustomerLedger(cust.phone_number);
      setLedgerData(data);
    } catch (e) {
      Alert.alert("Ledger Error", e.message);
    } finally {
      setLedgerLoading(false);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedCust || !paymentAmt) return;
    const amt = Number(paymentAmt) || 0;
    if (amt <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid payment amount.");
      return;
    }

    setSavingPayment(true);
    try {
      await recordCustomerPayment({
        phoneNumber: selectedCust.phone_number,
        amount: amt,
        note: paymentNote.trim() || "Recorded on Customer Ledger",
        createdBy: "staff",
      });
      Alert.alert("Payment Saved", `Recorded Rs ${amt} cash payment for ${selectedCust.name || selectedCust.phone_number}!`);
      setPaymentAmt("");
      setPaymentNote("");
      // Reload ledger
      const updatedData = await getCustomerLedger(selectedCust.phone_number);
      setLedgerData(updatedData);
      loadCustomers();
    } catch (e) {
      Alert.alert("Payment Failed", e.message);
    } finally {
      setSavingPayment(false);
    }
  };

  const handleAddService = async () => {
    if (!newName.trim()) {
      Alert.alert("Error", "Please enter a service name.");
      return;
    }
    if (!newPrice || isNaN(newPrice) || Number(newPrice) < 0) {
      Alert.alert("Error", "Please enter a valid price amount.");
      return;
    }

    setSaving(true);
    try {
      const updated = await addServiceItem({
        name: newName.trim(),
        unit_type: newUnitType,
        default_price: Number(newPrice),
      });
      setServices(updated);
      setNewName("");
      setNewPrice("");
      setNewUnitType("piece");
      setModalVisible(false);
      Alert.alert("Success", "New service added successfully!");
    } catch (err) {
      Alert.alert("Error", "Failed to add service.");
    } finally {
      setSaving(false);
    }
  };

  const handleStartEditPrice = (item) => {
    setEditingId(item.id);
    setEditPriceVal(String(item.default_price));
  };

  const handleSavePrice = async (item) => {
    if (!editPriceVal || isNaN(editPriceVal) || Number(editPriceVal) < 0) {
      Alert.alert("Error", "Please enter a valid price amount.");
      return;
    }
    try {
      const updated = await updateServiceItem(item.id, {
        default_price: Number(editPriceVal),
      });
      setServices(updated);
      setEditingId(null);
    } catch (err) {
      Alert.alert("Error", "Failed to update price.");
    }
  };

  const handleDelete = (item) => {
    Alert.alert(
      "Confirm Delete",
      `Are you sure you want to remove "${item.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const updated = await deleteServiceItem(item.id);
              setServices(updated);
            } catch (e) {
              Alert.alert("Error", "Failed to delete service.");
            }
          },
        },
      ]
    );
  };

  const getItemIcon = (name = "") => {
    const lower = name.toLowerCase();
    if (lower.includes("shirt")) return "👔";
    if (lower.includes("pant") || lower.includes("trouser")) return "👖";
    if (lower.includes("kurta") || lower.includes("suit")) return "🥻";
    if (lower.includes("bed") || lower.includes("sheet")) return "🛏️";
    if (lower.includes("towel")) return "🧖";
    if (lower.includes("quilt") || lower.includes("blanket")) return "🛏️";
    if (lower.includes("sock")) return "🧦";
    if (lower.includes("bundle")) return "🧺";
    if (lower.includes("saree")) return "👗";
    return "👕";
  };

  const filteredCustomers = customersList.filter((c) => {
    if (!custSearch.trim()) return true;
    const q = custSearch.trim().toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.phone_number?.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q)
    );
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* Main Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>⚙️ Management & Accounts</Text>
        <Text style={styles.headerSubtitle}>
          Manage laundry services, customer directory & account ledgers
        </Text>
      </View>

      {/* Top Tab Bar Switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "services" && styles.tabBtnActive]}
          onPress={() => setActiveTab("services")}
        >
          <Text style={[styles.tabBtnText, activeTab === "services" && styles.tabBtnTextActive]}>
            ⚙️ Services ({services.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "ledger" && styles.tabBtnActive]}
          onPress={() => {
            setActiveTab("ledger");
            loadCustomers();
          }}
        >
          <Text style={[styles.tabBtnText, activeTab === "ledger" && styles.tabBtnTextActive]}>
            📖 Ledgers ({customersList.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "priorities" && styles.tabBtnActive]}
          onPress={() => {
            setActiveTab("priorities");
            loadPriorities();
          }}
        >
          <Text style={[styles.tabBtnText, activeTab === "priorities" && styles.tabBtnTextActive]}>
            ⚡ Priorities ({prioritiesList.length})
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === "services" && (
        <View style={{ flex: 1 }}>
          {/* Services Action Bar */}
          <View style={styles.actionBar}>
            <Text style={styles.sectionTitle}>Services & Rates</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.addButtonText}>+ Add Service</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading services...</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent}>
              {services.map((item) => {
                const isEditing = editingId === item.id;
                return (
                  <View key={String(item.id)} style={styles.serviceCard}>
                    <View style={styles.serviceLeft}>
                      <View style={styles.iconContainer}>
                        <Text style={styles.serviceIcon}>{getItemIcon(item.name)}</Text>
                      </View>
                      <View style={styles.serviceDetails}>
                        <Text style={styles.serviceName}>{item.name}</Text>
                        <View style={styles.unitBadge}>
                          <Text style={styles.unitBadgeText}>
                            {item.unit_type?.toUpperCase() || "PIECE"}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Right side price editing */}
                    <View style={styles.serviceRight}>
                      {isEditing ? (
                        <View style={styles.editPriceRow}>
                          <Text style={styles.currencyPrefix}>Rs</Text>
                          <TextInput
                            style={styles.priceInput}
                            value={editPriceVal}
                            onChangeText={setEditPriceVal}
                            keyboardType="numeric"
                            autoFocus
                          />
                          <TouchableOpacity
                            style={styles.saveIconBtn}
                            onPress={() => handleSavePrice(item)}
                          >
                            <Text style={styles.saveIconText}>✓</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.priceDisplayBtn}
                          onPress={() => handleStartEditPrice(item)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.priceAmount}>Rs {item.default_price}</Text>
                          <Text style={styles.editLabel}>Edit</Text>
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => handleDelete(item)}
                      >
                        <Text style={styles.deleteBtnText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* CUSTOMER LEDGER TAB */}
      {activeTab === "ledger" && (
        <View style={{ flex: 1 }}>
          {/* Customer Search Bar */}
          <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
            <TextInput
              style={styles.searchBarInput}
              placeholder="Search customer by name, phone, address…"
              placeholderTextColor={colors.textMuted}
              value={custSearch}
              onChangeText={setCustSearch}
            />
          </View>

          {custLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading customer registry...</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent}>
              {filteredCustomers.length === 0 ? (
                <View style={styles.centerContainer}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>📖</Text>
                  <Text style={typography.h2}>No Customers Found</Text>
                  <Text style={typography.caption}>
                    Customers created during intake will appear here with full Ledger history.
                  </Text>
                </View>
              ) : (
                filteredCustomers.map((cust) => (
                  <TouchableOpacity
                    key={cust.phone_number || cust.id}
                    style={styles.customerCard}
                    onPress={() => handleOpenLedger(cust)}
                    activeOpacity={0.7}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.custCardName}>👤 {cust.name || "Valued Client"}</Text>
                        <Text style={styles.custCardPhone}>📞 {cust.phone_number}</Text>
                        {cust.address ? (
                          <Text style={styles.custCardAddress}>📍 {cust.address}</Text>
                        ) : null}
                      </View>
                      <View style={styles.ledgerActionBadge}>
                        <Text style={{ fontSize: 11, fontWeight: "800", color: colors.primary }}>
                          📖 View Ledger ➔
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}
        </View>
      )}

      {/* Priorities & SLA Turnaround Tab */}
      {activeTab === "priorities" && (
        <View style={{ flex: 1 }}>
          <View style={styles.actionBar}>
            <View>
              <Text style={styles.sectionTitle}>Order Priorities & SLA</Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                Turnaround hours auto-calculate delivery promises on Intake
              </Text>
            </View>
          </View>

          {prioritiesLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading priorities...</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.scrollContent}>
              {prioritiesList.map((tier) => (
                <View key={tier.key} style={styles.priorityCard}>
                  <View style={styles.priorityCardHeader}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                      <Text style={{ fontSize: 26 }}>{tier.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text }}>
                          {tier.label}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>
                          {tier.desc}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.hoursBadge}>
                      <Text style={styles.hoursBadgeText}>⏱️ {tier.hours}h SLA</Text>
                    </View>
                  </View>

                  <View style={styles.priorityCardFooter}>
                    <Text style={{ fontSize: 11, color: colors.textMuted }}>
                      Promise Formula: Current Time + {tier.hours} Hours
                    </Text>
                    <TouchableOpacity
                      style={styles.editPriorityBtn}
                      onPress={() => handleOpenEditPriority(tier)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.editPriorityBtnText}>✏️ Edit Timing</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Add New Service Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add New Laundry Service</Text>

            <Text style={styles.inputLabel}>Service / Item Name</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Double Blanket, Heavy Suit"
              placeholderTextColor={colors.textMuted}
              value={newName}
              onChangeText={setNewName}
            />

            <Text style={styles.inputLabel}>Unit Type</Text>
            <View style={styles.unitSelectorRow}>
              {["piece", "kg", "pair", "bundle"].map((ut) => (
                <TouchableOpacity
                  key={ut}
                  style={[
                    styles.unitChip,
                    newUnitType === ut && styles.unitChipSelected,
                  ]}
                  onPress={() => setNewUnitType(ut)}
                >
                  <Text
                    style={[
                      styles.unitChipText,
                      newUnitType === ut && styles.unitChipTextSelected,
                    ]}
                  >
                    {ut.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Default Price (Rs)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 150"
              placeholderTextColor={colors.textMuted}
              value={newPrice}
              onChangeText={setNewPrice}
              keyboardType="numeric"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleAddService}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>Save Service</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Priority Turnaround Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={priorityModalVisible}
        onRequestClose={() => setPriorityModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editingPriority?.icon} Edit {editingPriority?.label} Timing
            </Text>

            <Text style={styles.inputLabel}>Turnaround Timing (in Hours)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. 2, 4, 24"
              placeholderTextColor={colors.textMuted}
              value={editPriorityHours}
              onChangeText={setEditPriorityHours}
              keyboardType="numeric"
              autoFocus
            />

            <Text style={styles.inputLabel}>Description / Subtitle</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Rush delivery (4 hrs)"
              placeholderTextColor={colors.textMuted}
              value={editPriorityDesc}
              onChangeText={setEditPriorityDesc}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setPriorityModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleSavePriority}
                disabled={savingPriority}
              >
                {savingPriority ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.confirmBtnText}>Save SLA Timing</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Customer Khata Ledger Detail Modal */}
      {selectedCust && (
        <Modal
          animationType="slide"
          presentationStyle="pageSheet"
          visible={ledgerModalVisible}
          onRequestClose={() => setLedgerModalVisible(false)}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.screenBg }}>
            <View style={styles.ledgerHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ledgerTitle}>👤 {selectedCust.name || "Customer Ledger"}</Text>
                <Text style={styles.ledgerSub}>📞 {selectedCust.phone_number}</Text>
              </View>
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={() => setLedgerModalVisible(false)}
              >
                <Text style={styles.closeBtnText}>✕ Close</Text>
              </TouchableOpacity>
            </View>

            {ledgerLoading ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>Calculating Customer Ledger...</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ padding: 20 }}>
                {/* Financial Summary Box */}
                {ledgerData && (
                  <View style={styles.summaryBox}>
                    <View style={styles.summaryGrid}>
                      <View style={styles.summaryItem}>
                        <Text style={styles.summaryItemLabel}>Total Orders</Text>
                        <Text style={styles.summaryItemVal}>{ledgerData.totalOrders}</Text>
                      </View>
                      <View style={styles.summaryItem}>
                        <Text style={styles.summaryItemLabel}>Total Bill</Text>
                        <Text style={styles.summaryItemVal}>Rs {ledgerData.totalBill}</Text>
                      </View>
                      <View style={styles.summaryItem}>
                        <Text style={styles.summaryItemLabel}>Total Paid</Text>
                        <Text style={[styles.summaryItemVal, { color: "#16A34A" }]}>Rs {ledgerData.totalPaid}</Text>
                      </View>
                    </View>

                    <View style={styles.pendingBalanceRow}>
                      <Text style={styles.pendingBalanceLabel}>💰 Pending Account Balance</Text>
                      <Text style={[styles.pendingBalanceVal, { color: ledgerData.pendingBalance > 0 ? "#DC2626" : "#16A34A" }]}>
                        Rs {ledgerData.pendingBalance}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={{
                        backgroundColor: "#25D366",
                        paddingVertical: 10,
                        borderRadius: radius.xs,
                        alignItems: "center",
                        marginTop: 12,
                      }}
                      onPress={() =>
                        sendCustomerLedgerWhatsApp({
                          customerName: selectedCust.name,
                          phoneNumber: selectedCust.phone_number,
                          ledgerData,
                        })
                      }
                    >
                      <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "800" }}>
                        💬 Share Account Statement via WhatsApp
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Record Payment Section */}
                <View style={styles.recordPaymentCard}>
                  <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text, marginBottom: 8 }}>
                    💵 Record Cash/Online Payment
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                    <TextInput
                      style={[styles.modalInput, { flex: 1 }]}
                      placeholder="Payment Amount (Rs)"
                      placeholderTextColor={colors.textMuted}
                      keyboardType="numeric"
                      value={paymentAmt}
                      onChangeText={setPaymentAmt}
                    />
                    <TouchableOpacity
                      style={styles.paySubmitBtn}
                      onPress={handleRecordPayment}
                      disabled={savingPayment}
                    >
                      {savingPayment ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.paySubmitBtnText}>Collect Payment</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={[styles.modalInput, { fontSize: 12, paddingVertical: 8 }]}
                    placeholder="Optional Payment Note (e.g. Paid cash at counter)"
                    placeholderTextColor={colors.textMuted}
                    value={paymentNote}
                    onChangeText={setPaymentNote}
                  />
                </View>

                {/* Order & Transaction History Breakdown */}
                <Text style={{ fontSize: 16, fontWeight: "800", color: colors.text, marginTop: 16, marginBottom: 10 }}>
                  📋 Ledger Timeline & Order History
                </Text>

                {(() => {
                  const ordersList = (ledgerData?.orders || []).map((o) => ({
                    type: "order",
                    date: new Date(o.created_at || Date.now()),
                    data: o,
                  }));
                  const paymentsList = (ledgerData?.payments || []).map((p) => ({
                    type: "payment",
                    date: new Date(p.created_at || Date.now()),
                    data: p,
                  }));

                  const combinedTimeline = [...ordersList, ...paymentsList].sort((a, b) => b.date - a.date);

                  if (combinedTimeline.length === 0) {
                    return (
                      <View style={{ padding: 20, alignItems: "center" }}>
                        <Text style={{ color: colors.textMuted, fontSize: 13 }}>No orders or payments found for this customer.</Text>
                      </View>
                    );
                  }

                  return combinedTimeline.map((item, idx) => {
                    if (item.type === "order") {
                      const ord = item.data;
                      const orderItems = ord.order_items || [];
                      const itemsSummary = orderItems
                        .map((it) => {
                          const name = it.item_types?.name || it.name || "Garment";
                          const qty = it.quantity || 1;
                          return `${qty}x ${name}`;
                        })
                        .join(", ");

                      return (
                        <View key={"ord_" + ord.id + "_" + idx} style={[styles.ledgerOrderCard, shadow.xs]}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text style={{ fontSize: 14, fontWeight: "800", color: colors.text }}>📦 {ord.order_code}</Text>
                              <Text style={{ fontSize: 11, color: colors.textMuted }}>
                                ({new Date(ord.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })})
                              </Text>
                            </View>
                            <View style={[styles.paymentBadge, { backgroundColor: ord.payment_status === "paid" ? "#DCFCE7" : "#FEF3C7" }]}>
                              <Text style={{ fontSize: 11, fontWeight: "800", color: ord.payment_status === "paid" ? "#15803D" : "#B45309" }}>
                                {ord.payment_status === "paid" ? "💳 PAID CASH" : "⌛ UNPAID ACCOUNT"}
                              </Text>
                            </View>
                          </View>

                          {itemsSummary ? (
                            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, fontWeight: "600" }}>
                              👕 Items: {itemsSummary}
                            </Text>
                          ) : null}

                          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
                            <Text style={{ fontSize: 11, color: colors.textMuted }}>
                              Status: <Text style={{ fontWeight: "700", color: colors.primary }}>{ord.status}</Text>
                            </Text>
                            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.primary }}>
                              Rs {Number(ord.total_bill_amount || 0).toFixed(0)}
                            </Text>
                          </View>
                        </View>
                      );
                    } else {
                      const pay = item.data;
                      return (
                        <View key={"pay_" + pay.id + "_" + idx} style={[styles.ledgerOrderCard, { backgroundColor: "#F0FDF4", borderColor: "#86EFAC" }]}>
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text style={{ fontSize: 14, fontWeight: "800", color: "#166534" }}>💵 Cash Payment Received</Text>
                            </View>
                            <Text style={{ fontSize: 15, fontWeight: "900", color: "#15803D" }}>
                              + Rs {Number(pay.amount || 0).toFixed(0)}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 11, color: "#15803D", marginTop: 4 }}>
                            📅 Date: {new Date(pay.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            {pay.note ? ` · Note: "${pay.note}"` : ""}
                          </Text>
                        </View>
                      );
                    }
                  });
                })()}
              </ScrollView>
            )}
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 24) : 0,
  },
  header: {
    backgroundColor: colors.bg,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    ...typography.h1,
    color: colors.textInverse,
  },
  headerSubtitle: {
    ...typography.caption,
    color: "#94A3B8",
    marginTop: 4,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabBtnActive: {
    borderBottomColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  tabBtnTextActive: {
    color: colors.primary,
    fontWeight: "800",
  },
  actionBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 14,
    marginBottom: 10,
  },
  sectionTitle: {
    ...typography.h2,
    fontSize: 18,
  },
  addButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
    ...shadow.sm,
  },
  addButtonText: {
    color: colors.textInverse,
    fontWeight: "700",
    fontSize: 14,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    color: colors.textMuted,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  searchBarInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
    ...shadow.sm,
  },
  customerCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  custCardName: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },
  custCardPhone: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
    marginTop: 2,
  },
  custCardAddress: {
    fontSize: 11,
    color: colors.primary,
    marginTop: 4,
  },
  ledgerActionBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  serviceCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  serviceLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  serviceIcon: {
    fontSize: 22,
  },
  serviceDetails: {
    flex: 1,
  },
  serviceName: {
    ...typography.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
  unitBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  unitBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "800",
  },
  serviceRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  priceDisplayBtn: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    alignItems: "flex-end",
    marginRight: 8,
  },
  priceAmount: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
  },
  editLabel: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: "600",
  },
  editPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primaryLight,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 8,
  },
  currencyPrefix: {
    fontWeight: "700",
    color: colors.primary,
    marginRight: 4,
  },
  priceInput: {
    width: 60,
    height: 36,
    backgroundColor: colors.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: 6,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
  },
  saveIconBtn: {
    backgroundColor: colors.success,
    width: 32,
    height: 32,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 6,
  },
  saveIconText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
  },
  deleteBtn: {
    padding: 8,
  },
  deleteBtnText: {
    fontSize: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 20,
    ...shadow.lg,
  },
  modalTitle: {
    ...typography.h2,
    marginBottom: 16,
    color: colors.text,
  },
  inputLabel: {
    ...typography.caption,
    fontWeight: "700",
    color: colors.text,
    marginTop: 12,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.text,
  },
  unitSelectorRow: {
    flexDirection: "row",
    gap: 8,
  },
  unitChip: {
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  unitChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  unitChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },
  unitChipTextSelected: {
    color: colors.textInverse,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 24,
  },
  cancelBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.sm,
  },
  cancelBtnText: {
    color: colors.textMuted,
    fontWeight: "700",
  },
  confirmBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: radius.sm,
    ...shadow.sm,
  },
  confirmBtnText: {
    color: colors.textInverse,
    fontWeight: "800",
  },
  ledgerHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ledgerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  ledgerSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.xs,
  },
  closeBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textMuted,
  },
  summaryBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
    ...shadow.sm,
  },
  summaryGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryItemLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  summaryItemVal: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    marginTop: 4,
  },
  pendingBalanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pendingBalanceLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
  },
  pendingBalanceVal: {
    fontSize: 18,
    fontWeight: "900",
  },
  recordPaymentCard: {
    backgroundColor: "#FFFBEB",
    borderRadius: radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: "#FCD34D",
    marginBottom: 16,
  },
  paySubmitBtn: {
    backgroundColor: "#D97706",
    paddingHorizontal: 16,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radius.sm,
  },
  paySubmitBtnText: {
    color: "#FFF",
    fontWeight: "800",
    fontSize: 12,
  },
  ledgerOrderCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  paymentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  priorityCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  priorityCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hoursBadge: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  hoursBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
  },
  priorityCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  editPriorityBtn: {
    backgroundColor: colors.surfaceHover,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editPriorityBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primary,
  },
});
