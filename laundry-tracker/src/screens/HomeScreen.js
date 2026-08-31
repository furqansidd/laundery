import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from "react-native";
import { colors, radius, spacing, typography, shadow } from "../theme";

const ACTIONS = [
  {
    key: "Intake",
    title: "New Order",
    subtitle: "Count garments, snap photos, generate barcode",
    emoji: "🧺",
  },
  {
    key: "Sorting",
    title: "Scan & Verify",
    subtitle: "Scan a basket, match against intake photos, mark ready",
    emoji: "🔍",
  },
];

export default function HomeScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.brand}>Laundry Tracker</Text>
        <Text style={typography.caption}>Order tracking & verification</Text>
      </View>

      <View style={styles.body}>
        {ACTIONS.map((a) => (
          <TouchableOpacity
            key={a.key}
            style={[styles.card, shadow]}
            onPress={() => navigation.navigate(a.key)}
            activeOpacity={0.8}
          >
            <Text style={styles.emoji}>{a.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={typography.h2}>{a.title}</Text>
              <Text style={typography.caption}>{a.subtitle}</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  brand: { ...typography.h1 },
  body: { paddingHorizontal: spacing.lg, gap: spacing.md, marginTop: spacing.md },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.md,
  },
  emoji: { fontSize: 32 },
  chevron: { fontSize: 28, color: colors.textMuted },
});
