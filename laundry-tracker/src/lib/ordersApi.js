import { supabase } from "./supabase";
import * as FileSystem from "expo-file-system/legacy";
import { decode } from "base64-arraybuffer";

/** Fetch the reference list of garment types for the tap-counter UI. */
export async function fetchItemTypes() {
  const { data, error } = await supabase
    .from("item_types")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data;
}

/** Search customers by phone number OR name prefix for live suggestions */
export async function searchCustomers(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim();
  const { data, error } = await supabase
    .from("customers")
    .select("id, phone_number, name")
    .or(`phone_number.ilike.%${q}%,name.ilike.%${q}%`)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) return [];
  return data || [];
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

/** Look up (or implicitly create) a customer by phone number. */
export async function upsertCustomerByPhone(phoneNumber, name) {
  const { data: existing, error: findError } = await supabase
    .from("customers")
    .select("*")
    .eq("phone_number", phoneNumber)
    .maybeSingle();
  if (findError) throw findError;
  if (existing) {
    if (name && name !== existing.name) {
      await supabase.from("customers").update({ name }).eq("id", existing.id);
      return { ...existing, name };
    }
    return existing;
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({ phone_number: phoneNumber, name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Upload a local photo URI to the intake-photos bucket, return its public URL. */
export async function uploadIntakePhoto(localUri, orderCode, index) {
  let fileData;
  try {
    const base64 = await FileSystem.readAsStringAsync(localUri, {
      encoding: "base64",
    });
    fileData = decode(base64);
  } catch {
    const response = await fetch(localUri);
    const blob = await response.blob();
    fileData = blob;
  }

  const path = `${orderCode}/${index}-${Date.now()}.jpg`;

  const { error } = await supabase.storage
    .from("intake-photos")
    .upload(path, fileData, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;

  const { data } = supabase.storage.from("intake-photos").getPublicUrl(path);
  return data.publicUrl;
}

/** Generate the next human-readable order code via the DB function. */
export async function generateOrderCode() {
  const { data, error } = await supabase.rpc("generate_order_code");
  if (error) throw error;
  return data;
}

/**
 * Create a full order: customer, order row, order_items, and an audit event.
 * `items` = [{ item_type_id, name, quantity, unit_price }]
 */
export async function createOrder({
  phoneNumber,
  customerName,
  items,
  photoUrls,
  createdBy,
  basketLabel,
}) {
  const customer = await upsertCustomerByPhone(phoneNumber, customerName);
  const orderCode = await generateOrderCode();

  const totalItemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalBillAmount = items.reduce(
    (sum, i) => sum + i.quantity * i.unit_price,
    0
  );

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_code: orderCode,
      customer_id: customer.id,
      total_item_count: totalItemCount,
      total_bill_amount: totalBillAmount,
      intake_photo_urls: photoUrls,
      created_by: createdBy,
      basket_label: basketLabel || null,
    })
    .select()
    .single();
  if (orderError) throw orderError;

  const rows = items
    .filter((i) => i.quantity > 0)
    .map((i) => ({
      order_id: order.id,
      item_type_id: i.item_type_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
    }));
  if (rows.length) {
    const { error: itemsError } = await supabase.from("order_items").insert(rows);
    if (itemsError) throw itemsError;
  }

  await logEvent(order.id, "created", `Order created with ${totalItemCount} items`, createdBy);

  return { order, customer };
}

export async function logEvent(orderId, eventType, note, createdBy) {
  const { error } = await supabase
    .from("order_events")
    .insert({ order_id: orderId, event_type: eventType, note, created_by: createdBy });
  if (error) throw error;
}

/** Fetch an order plus its line items by order_code — used when scanning. */
export async function fetchOrderByCode(orderCode) {
  const { data: order, error } = await supabase
    .from("orders")
    .select("*, customers(phone_number, name)")
    .eq("order_code", orderCode.trim())
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("quantity, unit_price, item_types(name)")
    .eq("order_id", order.id);
  if (itemsError) throw itemsError;

  return { order, items };
}

export async function markBasketTagged(orderId, basketLabel, createdBy) {
  const { error } = await supabase
    .from("orders")
    .update({ status: "washing", basket_label: basketLabel })
    .eq("id", orderId);
  if (error) throw error;
  await logEvent(orderId, "basket_tagged", `Tagged to basket ${basketLabel}`, createdBy);
}

export async function markReadyForDelivery(orderId, createdBy) {
  const { error } = await supabase
    .from("orders")
    .update({ status: "ready_for_delivery", ready_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) throw error;
  await logEvent(orderId, "marked_ready", "Verified and packed", createdBy);
}

export async function logSortingScan(orderId, createdBy) {
  await logEvent(orderId, "scanned_at_sorting", "Scanned at sorting table", createdBy);
}

/** Fetch all orders with customer details and line items for Order History */
export async function fetchAllOrders(statusFilter = "all", searchQuery = "") {
  let query = supabase
    .from("orders")
    .select("*, customers(phone_number, name), order_items(quantity, unit_price, item_types(name))")
    .order("created_at", { ascending: false });

  if (statusFilter && statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) throw error;

  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    return (data || []).filter((o) => {
      const codeMatch = o.order_code?.toLowerCase().includes(q);
      const phoneMatch = o.customers?.phone_number?.toLowerCase().includes(q);
      const nameMatch = o.customers?.name?.toLowerCase().includes(q);
      const basketMatch = o.basket_label?.toLowerCase().includes(q);
      return codeMatch || phoneMatch || nameMatch || basketMatch;
    });
  }

  return data || [];
}

/** Generic status updater for orders (e.g. marked delivered, washing, etc.) */
export async function updateOrderStatus(orderId, newStatus, note = "", createdBy = "staff") {
  const updates = { status: newStatus };
  if (newStatus === "ready_for_delivery") {
    updates.ready_at = new Date().toISOString();
  } else if (newStatus === "delivered") {
    updates.delivered_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("orders")
    .update(updates)
    .eq("id", orderId);
  if (error) throw error;

  await logEvent(orderId, newStatus, note || `Status updated to ${newStatus}`, createdBy);
}

