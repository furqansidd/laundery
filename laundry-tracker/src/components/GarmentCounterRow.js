import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors, radius, spacing, typography } from "../theme";

/**
 * One row per garment type with a big tap target: "-" [qty] "+".
 * Designed so staff can build up an order with pure taps, no keyboard.
 */
export default function GarmentCounterRow({ itemType, quantity, onChange }) {
  const dec = () => onChange(Math.max(0, quantity - 1));
  const inc = () => onChange(quantity + 1);

  return (
    <View style={[styles.row, quantity > 0 && styles.rowActive]}>
      <View style={{ flex: 1 }}>
        <Text style={typography.body}>{itemType.name}</Text>
        {itemType.default_price ? (
          <Text style={typography.caption}>Rs {itemType.default_price} / pc</Text>
        ) : null}
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
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
  rowActive: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: colors.primary,
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
});
