import { supabase } from "./supabase";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SERVICES_STORAGE_KEY = "@laundry_tracker_services";
const PRIORITIES_STORAGE_KEY = "@laundry_tracker_priorities";
const ORDERS_STORAGE_KEY = "@laundry_tracker_orders";
let LOCAL_ORDERS_STORE = [];
let ordersLoadedFromStorage = false;

export async function ensureLocalOrdersLoaded() {
  if (ordersLoadedFromStorage && LOCAL_ORDERS_STORE.length > 0) return;
  try {
    const raw = await AsyncStorage.getItem(ORDERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Merge without duplicates
        const map = new Map();
        parsed.forEach((o) => { if (o && o.order_code) map.set(o.order_code, o); });
        LOCAL_ORDERS_STORE.forEach((o) => { if (o && o.order_code) map.set(o.order_code, o); });
        LOCAL_ORDERS_STORE = Array.from(map.values());
      }
    }
  } catch (e) {
    console.log("Error loading orders from AsyncStorage:", e);
  }
  ordersLoadedFromStorage = true;
}

export async function saveLocalOrdersToStorage() {
  try {
    await AsyncStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(LOCAL_ORDERS_STORE));
  } catch (e) {
    console.log("Error saving orders to AsyncStorage:", e);
  }
}

export const DEFAULT_PRIORITY_TIERS = [
  { key: "instant", label: "Instant", icon: "⚡", hours: 2, desc: "Instant / 2-3 hrs", badge: "2 Hours" },
  { key: "urgent", label: "Urgent", icon: "🔥", hours: 4, desc: "Rush delivery (4 hrs)", badge: "4 Hours" },
  { key: "express", label: "Express", icon: "🚀", hours: 24, desc: "Same day / 24 hrs", badge: "24 Hours" },
  { key: "normal", label: "Normal", icon: "📦", hours: 48, desc: "Standard (48 hrs)", badge: "48 Hours" },
];

const DEFAULT_ITEM_TYPES = [
  { id: 1, name: "Shirt", unit_type: "piece", default_price: 40, sort_order: 1 },
  { id: 2, name: "Pant", unit_type: "piece", default_price: 50, sort_order: 2 },
  { id: 3, name: "Kurta", unit_type: "piece", default_price: 60, sort_order: 3 },
  { id: 4, name: "Bed Sheet", unit_type: "piece", default_price: 100, sort_order: 4 },
  { id: 5, name: "Towel", unit_type: "piece", default_price: 30, sort_order: 5 },
  { id: 6, name: "Quilt / Blanket (Kg)", unit_type: "kg", default_price: 120, sort_order: 6 },
  { id: 7, name: "Socks (Pair)", unit_type: "pair", default_price: 40, sort_order: 7 },
  { id: 8, name: "Family Bundle", unit_type: "bundle", default_price: 800, sort_order: 8 },
  { id: 9, name: "Suit", unit_type: "piece", default_price: 300, sort_order: 9 },
  { id: 10, name: "Saree", unit_type: "piece", default_price: 150, sort_order: 10 },
];

/** Fetch item types/services with local storage priority + Supabase sync */
export async function fetchItemTypes() {
  try {
    const cached = await AsyncStorage.getItem(SERVICES_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.log("AsyncStorage read error:", err);
  }

  try {
    const { data, error } = await supabase
      .from("item_types")
      .select("*")
      .order("sort_order", { ascending: true });
    if (!error && data && data.length > 0) {
      await AsyncStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(data));
      return data;
    }
  } catch (err) {
    console.log("Supabase fetchItemTypes error:", err);
  }

  // Save default items to local storage so edits stick locally immediately
  try {
    await AsyncStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(DEFAULT_ITEM_TYPES));
  } catch (e) {}
  return DEFAULT_ITEM_TYPES;
}

/** Add a new service item type */
export async function addServiceItem({ name, unit_type, default_price }) {
  const currentList = await fetchItemTypes();
  const nextId = currentList.length > 0 ? Math.max(...currentList.map((i) => Number(i.id) || 0)) + 1 : 1;
  const newItem = {
    id: nextId,
    name,
    unit_type,
    default_price: Number(default_price) || 0,
    sort_order: nextId,
  };

  try {
    await supabase.from("item_types").insert(newItem);
  } catch (err) {
    console.log("Supabase insert item error:", err);
  }

  const updatedList = [...currentList, newItem];
  await AsyncStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(updatedList));
  return updatedList;
}

/** Update an existing service item type (e.g. price, name) */
export async function updateServiceItem(id, updates) {
  const currentList = await fetchItemTypes();
  const updatedList = currentList.map((item) => {
    if (item.id === id) {
      return {
        ...item,
        ...updates,
        default_price: updates.default_price !== undefined ? Number(updates.default_price) : item.default_price,
      };
    }
    return item;
  });

  try {
    await supabase.from("item_types").update(updates).eq("id", id);
  } catch (err) {
    console.log("Supabase update item error:", err);
  }

  await AsyncStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(updatedList));
  return updatedList;
}

/** Delete a service item type */
export async function deleteServiceItem(id) {
  const currentList = await fetchItemTypes();
  const updatedList = currentList.filter((item) => item.id !== id);

  try {
    await supabase.from("item_types").delete().eq("id", id);
  } catch (err) {
    console.log("Supabase delete item error:", err);
  }

  await AsyncStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(updatedList));
  return updatedList;
}

/** Fetch customer order history by phone number */
export async function fetchCustomerOrders(phoneNumber) {
  if (!phoneNumber || phoneNumber.trim().length < 4) return [];
  const cleanPhone = phoneNumber.trim();

  let dbOrders = [];
  try {
    const { data: cust } = await supabase
      .from("customers")
      .select("id")
      .eq("phone_number", cleanPhone)
      .maybeSingle();

    if (cust) {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(phone_number, name), order_items(quantity, unit_price, service_type, weight_kg, pair_count, item_types(name))")
        .eq("customer_id", cust.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        dbOrders = data;
      }
    }
  } catch (err) {
    console.log("Supabase fetchCustomerOrders error:", err);
  }

  // Merge with local orders store matching phone number
  const localMatches = LOCAL_ORDERS_STORE.filter(
    (o) => o.customers?.phone_number === cleanPhone
  );

  const map = new Map();
  dbOrders.forEach((o) => map.set(o.order_code, o));
  localMatches.forEach((o) => {
    if (!map.has(o.order_code)) map.set(o.order_code, o);
  });

  return Array.from(map.values());
}


/** Search customers by phone number OR name prefix for live suggestions */
export async function searchCustomers(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim().toLowerCase();

  let dbResults = [];
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("id, phone_number, name, address")
      .or(`phone_number.ilike.%${q}%,name.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(8);
    if (!error && data) dbResults = data;
  } catch (e) {}

  const allLocal = await fetchAllCustomers();
  const localResults = allLocal.filter(
    (c) =>
      c.phone_number?.toLowerCase().includes(q) ||
      c.name?.toLowerCase().includes(q) ||
      c.address?.toLowerCase().includes(q)
  );

  const map = new Map();
  dbResults.forEach((c) => map.set(c.phone_number, c));
  localResults.forEach((c) => {
    if (!map.has(c.phone_number)) map.set(c.phone_number, c);
  });

  return Array.from(map.values()).slice(0, 8);
}

/** Search customer by exact phone number match */
export async function findCustomerByPhone(phoneNumber) {
  if (!phoneNumber || phoneNumber.trim().length < 5) return null;
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("phone_number", phoneNumber.trim())
    .maybeSingle();
  if (error) return null;
  return data;
}

const CUSTOMERS_STORAGE_KEY = "@laundry_tracker_customers";
const PAYMENTS_STORAGE_KEY = "@laundry_tracker_payments";

/** Helper: Save customer into persistent local storage */
export async function saveCustomerToLocalRegistry(customerObj) {
  if (!customerObj || !customerObj.phone_number) return;
  try {
    const existing = await AsyncStorage.getItem(CUSTOMERS_STORAGE_KEY);
    let list = existing ? JSON.parse(existing) : [];
    if (!Array.isArray(list)) list = [];
    const idx = list.findIndex((c) => c.phone_number === customerObj.phone_number);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...customerObj };
    } else {
      list.unshift(customerObj);
    }
    await AsyncStorage.setItem(CUSTOMERS_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {}
}

let CUSTOMERS_CACHE = null;

/** Fetch all customers (Supabase + Local AsyncStorage) - Fast & Cached */
export async function fetchAllCustomers(forceRefresh = false) {
  if (CUSTOMERS_CACHE && !forceRefresh) {
    return CUSTOMERS_CACHE;
  }

  let dbCustomers = [];
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) dbCustomers = data;
  } catch (e) {}

  let localCustomers = [];
  try {
    const stored = await AsyncStorage.getItem(CUSTOMERS_STORAGE_KEY);
    if (stored) localCustomers = JSON.parse(stored) || [];
  } catch (e) {}

  const map = new Map();
  dbCustomers.forEach((c) => {
    if (c.phone_number) map.set(c.phone_number, c);
  });
  localCustomers.forEach((c) => {
    if (c.phone_number && !map.has(c.phone_number)) map.set(c.phone_number, c);
  });

  CUSTOMERS_CACHE = Array.from(map.values());
  return CUSTOMERS_CACHE;
}

/** Look up (or implicitly create) a customer by phone number, address, notes. */
export async function upsertCustomerByPhone(phoneNumber, name, address = "", notes = "") {
  let resultCustomer = null;
  const cleanPhone = (phoneNumber || "").trim();

  try {
    const { data: existing, error: findError } = await supabase
      .from("customers")
      .select("*")
      .eq("phone_number", cleanPhone)
      .maybeSingle();

    if (!findError && existing) {
      resultCustomer = existing;
      const updates = {};
      if (name && name !== existing.name) updates.name = name;
      if (address && address !== existing.address) updates.address = address;
      if (notes && notes !== existing.notes) updates.notes = notes;

      if (Object.keys(updates).length > 0) {
        try {
          await supabase.from("customers").update(updates).eq("id", existing.id);
          resultCustomer = { ...existing, ...updates };
        } catch (e) {
          if (name) {
            await supabase.from("customers").update({ name }).eq("id", existing.id);
            resultCustomer = { ...existing, name };
          }
        }
      }
    } else {
      // Try insert with address & notes
      try {
        const { data, error } = await supabase
          .from("customers")
          .insert({ phone_number: cleanPhone, name, address, notes })
          .select()
          .single();
        if (!error && data) resultCustomer = data;
      } catch (e) {}

      // Fallback insert without optional columns if schema differs
      if (!resultCustomer) {
        try {
          const { data } = await supabase
            .from("customers")
            .insert({ phone_number: cleanPhone, name })
            .select()
            .single();
          if (data) resultCustomer = data;
        } catch (e) {}
      }
    }
  } catch (err) {}

  if (!resultCustomer) {
    resultCustomer = {
      id: "local-cust-" + Date.now(),
      phone_number: cleanPhone,
      name,
      address,
      notes,
      created_at: new Date().toISOString(),
    };
  }

  await saveCustomerToLocalRegistry(resultCustomer);
  return resultCustomer;
}

/** Compute Khata / Ledger for a customer */
export async function getCustomerLedger(phoneNumber) {
  if (!phoneNumber) return { totalOrders: 0, totalBill: 0, totalPaid: 0, pendingBalance: 0, orders: [], payments: [] };

  const pastOrders = await fetchCustomerOrders(phoneNumber);
  
  let dbPayments = [];
  try {
    const { data } = await supabase
      .from("customer_payments")
      .select("*")
      .eq("customer_phone", phoneNumber)
      .order("created_at", { ascending: false });
    if (data) dbPayments = data;
  } catch (e) {}

  let localPayments = [];
  try {
    const stored = await AsyncStorage.getItem(PAYMENTS_STORAGE_KEY);
    if (stored) {
      const allP = JSON.parse(stored) || [];
      localPayments = allP.filter((p) => p.customer_phone === phoneNumber);
    }
  } catch (e) {}

  const allPayments = [...dbPayments, ...localPayments];

  const totalOrders = pastOrders.length;
  const totalBill = pastOrders.reduce((sum, o) => sum + (Number(o.total_bill_amount) || 0), 0);
  
  // Paid orders amount
  const paidOrdersSum = pastOrders
    .filter((o) => o.payment_status === "paid")
    .reduce((sum, o) => sum + (Number(o.total_bill_amount) || 0), 0);

  // Direct ledger payments
  const directPaymentsSum = allPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const totalPaid = paidOrdersSum + directPaymentsSum;
  const pendingBalance = Math.max(0, totalBill - totalPaid);

  return {
    totalOrders,
    totalBill,
    totalPaid,
    pendingBalance,
    orders: pastOrders,
    payments: allPayments,
  };
}

/** Record a cash/online payment to clear customer pending udhaar balance */
export async function recordCustomerPayment({ phoneNumber, amount, note = "", createdBy = "staff" }) {
  const payAmt = Number(amount) || 0;
  if (payAmt <= 0) return;

  const newPayment = {
    id: "pay-" + Date.now(),
    customer_phone: phoneNumber,
    amount: payAmt,
    note,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  };

  try {
    await supabase.from("customer_payments").insert(newPayment);
  } catch (e) {}

  // Save locally
  try {
    const existing = await AsyncStorage.getItem(PAYMENTS_STORAGE_KEY);
    let list = existing ? JSON.parse(existing) : [];
    list.unshift(newPayment);
    await AsyncStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {}

  // Also auto-update unpaid orders if payment amount matches/clears them
  const pastOrders = await fetchCustomerOrders(phoneNumber);
  const unpaid = pastOrders.filter((o) => o.payment_status === "unpaid");
  let remainingPay = payAmt;
  for (const ord of unpaid) {
    if (remainingPay <= 0) break;
    const bill = Number(ord.total_bill_amount) || 0;
    if (remainingPay >= bill) {
      try {
        await updateOrderStatus(ord.id, ord.status, "Paid via Ledger payment", createdBy);
        await supabase.from("orders").update({ payment_status: "paid" }).eq("id", ord.id);
        ord.payment_status = "paid";
      } catch (e) {}
      remainingPay -= bill;
    }
  }

  return newPayment;
}

/** Create a full order: customer, order row, order_items, and an audit event. */
export async function createOrder({
  phoneNumber,
  customerName,
  customerAddress = "",
  items,
  photoUrls,
  createdBy,
  basketLabel,
  orderType = "normal",
  slaTier = "standard_48_72h",
  paymentStatus = "unpaid",
  tagsCount = 1,
  deliveryDate = null,
  deliveryTimeSlot = null,
}) {
  let customer;
  try {
    customer = await upsertCustomerByPhone(phoneNumber, customerName, customerAddress);
  } catch (err) {
    customer = { id: "local-cust-" + Date.now(), phone_number: phoneNumber, name: customerName, address: customerAddress };
    await saveCustomerToLocalRegistry(customer);
  }

  let orderCode;
  try {
    orderCode = await generateOrderCode();
  } catch (err) {
    const today = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    const rand = Math.floor(1000 + Math.random() * 9000);
    orderCode = `LN-${today}-${rand}`;
  }

  const totalItemCount = items.reduce((sum, i) => sum + (i.unit_type === "pair" ? (i.pair_count || 1) * 2 : (i.quantity || 1)), 0);
  const computedTagsCount = items.reduce((sum, i) => sum + Math.max(1, Number(i.quantity) || 1), 0);
  const finalTagsCount = Math.max(1, computedTagsCount, Number(tagsCount) || 0);

  const totalBillAmount = items.reduce(
    (sum, i) => sum + (i.unit_type === "kg" ? (i.weight_kg || 1) * i.unit_price : i.quantity * i.unit_price),
    0
  );

  let order;
  try {
    const { data, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_code: orderCode,
        customer_id: customer.id,
        order_type: orderType,
        sla_tier: slaTier,
        payment_status: paymentStatus,
        tags_count: finalTagsCount,
        delivery_date: deliveryDate,
        delivery_time_slot: deliveryTimeSlot,
        total_item_count: totalItemCount,
        total_bill_amount: totalBillAmount,
        intake_photo_urls: photoUrls,
        created_by: createdBy,
        basket_label: basketLabel || null,
      })
      .select()
      .single();

    if (orderError) throw orderError;
    order = data;
  } catch (err) {
    // Silent offline fallback
    order = {
      id: "ord-" + Date.now(),
      order_code: orderCode,
      customer_id: customer.id,
      order_type: orderType,
      sla_tier: slaTier,
      payment_status: paymentStatus,
      tags_count: finalTagsCount,
      delivery_date: deliveryDate,
      delivery_time_slot: deliveryTimeSlot,
      total_item_count: totalItemCount,
      total_bill_amount: totalBillAmount,
      intake_photo_urls: photoUrls,
      created_by: createdBy,
      basket_label: basketLabel || null,
      status: "intake",
      created_at: new Date().toISOString(),
    };
  }

  const rows = items
    .filter((i) => (i.quantity > 0 || i.weight_kg > 0))
    .map((i) => ({
      order_id: order.id,
      item_type_id: i.item_type_id,
      service_type: i.service_type || "wash_press",
      unit_type: i.unit_type || "piece",
      quantity: i.quantity || 1,
      weight_kg: i.weight_kg || 0,
      pair_count: i.pair_count || 0,
      unit_price: i.unit_price,
    }));

  if (rows.length) {
    try {
      await supabase.from("order_items").insert(rows);
    } catch (e) {}
  }

  try {
    await logEvent(order.id, "created", `Order created with ${totalItemCount} items (${orderType.toUpperCase()})`, createdBy);
  } catch (e) {}

  const fullOrderObj = {
    ...order,
    customers: { phone_number: phoneNumber, name: customerName },
    order_items: items.map((i) => ({
      ...i,
      item_types: { name: i.name, unit_type: i.unit_type },
    })),
  };

  // Add to local in-memory store
  LOCAL_ORDERS_STORE.unshift(fullOrderObj);
  await saveLocalOrdersToStorage();

  return { order: fullOrderObj, customer };
}

export async function logEvent(orderId, eventType, note, createdBy) {
  try {
    await supabase
      .from("order_events")
      .insert({ order_id: orderId, event_type: eventType, note, created_by: createdBy });
  } catch (e) {}
}

/** Fetch an order plus its line items by order_code or sub-tag code (e.g. LN-240815-0007-H2) */
export async function fetchOrderByCode(rawCode) {
  if (!rawCode) return null;

  // Clean sub-tag suffix if scanned tag is "LN-240815-0007-H2" -> "LN-240815-0007"
  const orderCode = rawCode.trim().split("-H")[0].split("-TAG")[0];

  try {
    const { data: order, error } = await supabase
      .from("orders")
      .select("*, customers(phone_number, name)")
      .eq("order_code", orderCode.trim())
      .maybeSingle();

    if (!error && order) {
      const { data: items } = await supabase
        .from("order_items")
        .select("quantity, unit_price, service_type, unit_type, weight_kg, pair_count, item_types(name)")
        .eq("order_id", order.id);

      return { order, items: items || [] };
    }
  } catch (e) {}

  // Fallback to local in-memory store
  const localMatch = LOCAL_ORDERS_STORE.find(
    (o) => o.order_code.toLowerCase() === orderCode.trim().toLowerCase()
  );
  if (localMatch) {
    return { order: localMatch, items: localMatch.order_items || [] };
  }

  return null;
}

export async function markBasketTagged(orderId, basketLabel, createdBy) {
  try {
    await supabase
      .from("orders")
      .update({ status: "washing", basket_label: basketLabel })
      .eq("id", orderId);
  } catch (e) {}

  const match = LOCAL_ORDERS_STORE.find((o) => o.id === orderId);
  if (match) {
    match.status = "washing";
    match.basket_label = basketLabel;
  }
  await saveLocalOrdersToStorage();
}

export async function markReadyForDelivery(orderId, createdBy) {
  try {
    await supabase
      .from("orders")
      .update({ status: "ready_for_delivery", ready_at: new Date().toISOString() })
      .eq("id", orderId);
  } catch (e) {}

  const match = LOCAL_ORDERS_STORE.find((o) => o.id === orderId);
  if (match) {
    match.status = "ready_for_delivery";
    match.ready_at = new Date().toISOString();
  }
  await saveLocalOrdersToStorage();
}

export async function logSortingScan(orderId, createdBy) {
  await logEvent(orderId, "scanned_at_sorting", "Scanned at sorting table", createdBy);
}

/** Fetch all orders with customer details and line items for Order History */
export async function fetchAllOrders(statusFilter = "all", searchQuery = "") {
  await ensureLocalOrdersLoaded();
  let dbOrders = [];
  try {
    const { data, error } = await supabase
      .from("orders")
      .select("*, customers(phone_number, name), order_items(quantity, unit_price, service_type, item_types(name))")
      .order("created_at", { ascending: false });

    if (!error && data) {
      dbOrders = data;
    }
  } catch (e) {}

  // Merge DB orders and local offline orders
  const map = new Map();
  dbOrders.forEach((o) => map.set(o.order_code, o));
  LOCAL_ORDERS_STORE.forEach((o) => {
    if (!map.has(o.order_code)) map.set(o.order_code, o);
  });

  let combined = Array.from(map.values());

  const serviceKeys = ["wash_press", "press_only", "dry_clean", "wash_fold"];

  if (statusFilter && statusFilter !== "all") {
    if (statusFilter === "intake") {
      combined = combined.filter((o) => {
        if (o.status === "delivered" || o.status === "cancelled" || o.status === "ready_for_delivery") return false;
        const items = o.order_items || [];
        const moved = new Set(o.moved_services || []);
        if (items.length === 0) return moved.size === 0;
        // Intake list shows order if at least one service has NOT been dispatched yet
        return items.some((it) => !moved.has(it.service_type));
      });
    } else if (serviceKeys.includes(statusFilter)) {
      // Filtering by specific Service Stage (e.g. wash_press, press_only, dry_clean, wash_fold)
      combined = combined.filter((o) => {
        if (o.status === "delivered" || o.status === "cancelled") return false;
        const items = o.order_items || [];
        const moved = new Set(o.moved_services || []);
        const hasServiceItem = items.some((it) => it.service_type === statusFilter);
        const isMovedToService = moved.has(statusFilter);
        return hasServiceItem && isMovedToService;
      });
    } else {
      combined = combined.filter((o) => o.status === statusFilter);
    }
  }

  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    combined = combined.filter((o) => {
      const codeMatch = o.order_code?.toLowerCase().includes(q);
      const phoneMatch = o.customers?.phone_number?.toLowerCase().includes(q);
      const nameMatch = o.customers?.name?.toLowerCase().includes(q);
      const basketMatch = o.basket_label?.toLowerCase().includes(q);
      return codeMatch || phoneMatch || nameMatch || basketMatch;
    });
  }

  return combined;
}

/** Generic status updater for orders (e.g. marked delivered, washing, etc.) */
export async function updateOrderStatus(orderId, newStatus, note = "", createdBy = "staff") {
  const updates = { status: newStatus };
  if (newStatus === "ready_for_delivery") {
    updates.ready_at = new Date().toISOString();
  } else if (newStatus === "delivered") {
    updates.delivered_at = new Date().toISOString();
  }

  try {
    await supabase
      .from("orders")
      .update(updates)
      .eq("id", orderId);
  } catch (e) {}

  const match = LOCAL_ORDERS_STORE.find((o) => o.id === orderId);
  if (match) {
    match.status = newStatus;
    if (newStatus === "ready_for_delivery") match.ready_at = new Date().toISOString();
    if (newStatus === "delivered") match.delivered_at = new Date().toISOString();
  }
  await saveLocalOrdersToStorage();

  try {
    await logEvent(orderId, newStatus, note || `Status updated to ${newStatus}`, createdBy);
  } catch (e) {}
}

/** Advance a specific service stage for an order (e.g. Move 'press_only' or 'wash_press') */
export async function moveServiceStage(orderId, serviceKey, createdBy = "staff") {
  let match = LOCAL_ORDERS_STORE.find((o) => o.id === orderId);

  if (!match) {
    try {
      const { data } = await supabase
        .from("orders")
        .select("*, customers(phone_number, name), order_items(quantity, unit_price, service_type, item_types(name))")
        .eq("id", orderId)
        .maybeSingle();
      if (data) {
        match = data;
        LOCAL_ORDERS_STORE.unshift(match);
      }
    } catch (e) {}
  }

  if (!match) return null;

  if (!Array.isArray(match.moved_services)) {
    match.moved_services = [];
  }

  if (!match.moved_services.includes(serviceKey)) {
    match.moved_services.push(serviceKey);
  }

  const orderItems = match.order_items || [];
  const distinctServices = Array.from(new Set(orderItems.map((i) => i.service_type)));

  const totalDistinct = distinctServices.length > 0 ? distinctServices.length : 1;
  const allMoved = distinctServices.length > 0
    ? distinctServices.every((s) => match.moved_services.includes(s))
    : match.moved_services.length >= 1;

  let newStatus = serviceKey;
  if (allMoved) {
    newStatus = "sorting";
  } else {
    // Keep in intake so remaining non-moved services stay in Intake list
    newStatus = "intake";
  }

  match.status = newStatus;
  await saveLocalOrdersToStorage();

  try {
    await supabase
      .from("orders")
      .update({ status: newStatus, moved_services: match.moved_services })
      .eq("id", orderId);
  } catch (e) {}

  try {
    await logEvent(
      orderId,
      `moved_to_${serviceKey}`,
      `Items moved to ${serviceKey.toUpperCase()} stage (${match.moved_services.length}/${totalDistinct} services moved)`,
      createdBy
    );
  } catch (e) {}

  return match;
}

/** Mark a specific service stage completed/ready for an order */
export async function completeServiceStage(orderId, serviceKey, createdBy = "staff") {
  let match = LOCAL_ORDERS_STORE.find((o) => o.id === orderId);

  if (!match) {
    try {
      const { data } = await supabase
        .from("orders")
        .select("*, customers(phone_number, name), order_items(quantity, unit_price, service_type, item_types(name))")
        .eq("id", orderId)
        .maybeSingle();
      if (data) {
        match = data;
        LOCAL_ORDERS_STORE.unshift(match);
      }
    } catch (e) {}
  }

  if (!match) return null;

  if (!Array.isArray(match.completed_services)) {
    match.completed_services = [];
  }

  if (!match.completed_services.includes(serviceKey)) {
    match.completed_services.push(serviceKey);
  }

  const orderItems = match.order_items || [];
  const distinctServices = Array.from(new Set(orderItems.map((i) => i.service_type)));

  const totalDistinct = distinctServices.length > 0 ? distinctServices.length : 1;
  const allCompleted = distinctServices.length > 0
    ? distinctServices.every((s) => match.completed_services.includes(s))
    : match.completed_services.length >= 1;

  let updates = {
    completed_services: match.completed_services,
  };

  if (allCompleted) {
    match.status = "ready_for_delivery";
    match.ready_at = new Date().toISOString();
    updates.status = "ready_for_delivery";
    updates.ready_at = match.ready_at;
  }

  await saveLocalOrdersToStorage();

  try {
    await supabase.from("orders").update(updates).eq("id", orderId);
  } catch (e) {}

  try {
    await logEvent(
      orderId,
      `completed_${serviceKey}`,
      `Service stage ${serviceKey.toUpperCase()} completed/ready (${match.completed_services.length}/${totalDistinct} services completed)`,
      createdBy
    );
  } catch (e) {}

  return match;
}

/** Mark order delivered, update payment_status, and optionally record cash payment */
export async function markOrderDeliveredWithPayment({ orderId, paymentStatus = "paid", cashAmount = 0, createdBy = "staff" }) {
  const updates = {
    status: "delivered",
    payment_status: paymentStatus,
    delivered_at: new Date().toISOString(),
  };

  try {
    await supabase.from("orders").update(updates).eq("id", orderId);
  } catch (e) {}

  const match = LOCAL_ORDERS_STORE.find((o) => o.id === orderId);
  if (match) {
    match.status = "delivered";
    match.payment_status = paymentStatus;
    match.delivered_at = new Date().toISOString();
  }
  await saveLocalOrdersToStorage();

  // If cash collected, record a ledger payment if cashAmount > 0
  const phone = match?.customers?.phone_number;
  if (paymentStatus === "paid" && Number(cashAmount) > 0 && phone) {
    await recordCustomerPayment({
      phoneNumber: phone,
      amount: Number(cashAmount),
      note: `Collected cash on delivery (Order ${match.order_code || ''})`,
      createdBy,
    });
  }

  try {
    await logEvent(orderId, "delivered", `Order delivered (${paymentStatus.toUpperCase()})`, createdBy);
  } catch (e) {}
}

/** Fetch priority turnaround tiers with local AsyncStorage caching */
export async function fetchPriorityTiers() {
  try {
    const cached = await AsyncStorage.getItem(PRIORITIES_STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.log("AsyncStorage read error for priorities:", err);
  }

  // Fallback to default priority tiers and persist
  try {
    await AsyncStorage.setItem(PRIORITIES_STORAGE_KEY, JSON.stringify(DEFAULT_PRIORITY_TIERS));
  } catch (e) {}
  return DEFAULT_PRIORITY_TIERS;
}

/** Save updated priority tiers list */
export async function savePriorityTiers(tiers) {
  try {
    await AsyncStorage.setItem(PRIORITIES_STORAGE_KEY, JSON.stringify(tiers));
    return tiers;
  } catch (err) {
    console.log("Error saving priorities:", err);
    throw err;
  }
}

/** Update an individual priority tier */
export async function updatePriorityTier(key, updates) {
  const current = await fetchPriorityTiers();
  const updated = current.map((t) => {
    if (t.key === key) {
      return { ...t, ...updates };
    }
    return t;
  });
  await savePriorityTiers(updated);
  return updated;
}
