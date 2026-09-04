import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

export const CHARGING_UNITS = [
  { key: "piece", label: "Per Piece", icon: "👕" },
  { key: "pair", label: "Per Pair", icon: "🧦" },
  { key: "bundle", label: "Per Bundle", icon: "📦" },
  { key: "kg", label: "Per Kilogram", icon: "⚖️" },
];

export const SERVICE_TYPES = [
  { key: "wash_press", label: "Wash & Press", icon: "🧺", priceFactor: 1.0 },
  { key: "press_only", label: "Press Only", icon: "👔", priceFactor: 0.5 },
  { key: "dry_clean", label: "Dry Clean", icon: "🧪", priceFactor: 2.2 },
  { key: "wash_fold", label: "Wash & Fold", icon: "🧼", priceFactor: 0.8 },
];

export function getServicePrice(defaultPrice, serviceKey) {
  const base = Number(defaultPrice) || 30;
  const match = SERVICE_TYPES.find((s) => s.key === serviceKey);
  const factor = match ? match.priceFactor : 1.0;
  return Math.round(base * factor);
}

export function getServiceLabel(serviceKey) {
  const match = SERVICE_TYPES.find((s) => s.key === serviceKey);
  return match ? `${match.icon} ${match.label}` : "🧺 Wash & Press";
}

/**
 * Enhanced Garment Counter Row with Charging Unit Selector & Service Type Selector.
 * Exactly matches client design (Per Piece, Per Pair, Per Bundle, Per Kilogram).
 */
export default function GarmentCounterRow({
  itemType,
  quantity,
  unitType = "piece",
  serviceType = "wash_press",
  onChange,
  onUnitTypeChange,
  onServiceChange,
}) {
  const dec = () => onChange(Math.max(0, quantity - 1));
  const inc = () => onChange(quantity + 1);

  const unitPrice = getServicePrice(itemType.default_price, serviceType);
  const currentUnit = CHARGING_UNITS.find((u) => u.key === (unitType || itemType.unit_type || "piece")) || CHARGING_UNITS[0];

  return (
    <View style={[styles.card, quantity > 0 && styles.cardActive]}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={typography.body}>{itemType.name}</Text>
          <Text style={typography.caption}>
            Rs {unitPrice} / {currentUnit.label} {quantity > 0 ? `(Total: Rs ${unitPrice * quantity})` : ""}
          </Text>
        </View>

        <View style={styles.stepper}>
          <TouchableOpacity
            style={[styles.stepBtn, quantity === 0 && styles.stepBtnDisabled]}
            onPress={dec}
            disabled={quantity === 0}
          >
            <Text style={styles.stepBtnText}>–</Text>
          </TouchableOpacity>

          <Text style={styles.qty}>{quantity}</Text>

          <TouchableOpacity style={styles.stepBtn} onPress={inc}>
            <Text style={styles.stepBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Charging Unit Pills (Per Piece, Per Pair, Per Bundle, Per Kilogram) */}
      <View style={styles.unitSelector}>
        <Text style={styles.serviceTitle}>How do you charge for this item?</Text>
        <View style={styles.pillsContainer}>
          {CHARGING_UNITS.map((u) => {
            const active = (unitType || itemType.unit_type || "piece") === u.key;
            return (
              <TouchableOpacity
                key={u.key}
                style={[styles.unitPill, active && styles.unitPillActive]}
                onPress={() => onUnitTypeChange && onUnitTypeChange(u.key)}
              >
                <Text style={[styles.unitPillText, active && styles.unitPillTextActive]}>
                  {u.icon} {u.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {quantity > 0 && (
        <View style={styles.serviceSelector}>
          <Text style={styles.serviceTitle}>Select Service Type:</Text>
          <View style={styles.pillsContainer}>
            {SERVICE_TYPES.map((st) => {
              const active = serviceType === st.key;
              const p = getServicePrice(itemType.default_price, st.key);
              return (
                <TouchableOpacity
                  key={st.key}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => onServiceChange && onServiceChange(st.key)}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {st.icon} {st.label} (Rs {p})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardActive: {
    backgroundColor: "#EFF6FF",
    borderColor: colors.primary,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stepBtnDisabled: {
    backgroundColor: colors.border,
  },
  stepBtnText: {
    color: colors.textInverse,
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 22,
  },
  qty: {
    minWidth: 32,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
    color: colors.text,
  },
  unitSelector: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.04)",
  },
  unitPill: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  unitPillActive: {
    backgroundColor: "#1E293B",
    borderColor: "#1E293B",
  },
  unitPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#475569",
  },
  unitPillTextActive: {
    color: "#FFFFFF",
  },
  serviceSelector: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  serviceTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 4,
  },
  pillsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pillText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  pillTextActive: {
    color: colors.textInverse,
  },
});

