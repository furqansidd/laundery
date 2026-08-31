// Single source of truth for colors, spacing and typography so every screen
// looks like one coherent product instead of a patchwork of styles.
export const colors = {
  bg: "#0F172A",
  surface: "#FFFFFF",
  surfaceMuted: "#F1F5F9",
  border: "#E2E8F0",
  primary: "#2563EB",
  primaryDark: "#1D4ED8",
  success: "#16A34A",
  warning: "#D97706",
  danger: "#DC2626",
  text: "#0F172A",
  textMuted: "#64748B",
  textInverse: "#FFFFFF",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
};

export const typography = {
  h1: { fontSize: 26, fontWeight: "700", color: colors.text },
  h2: { fontSize: 20, fontWeight: "700", color: colors.text },
  body: { fontSize: 15, color: colors.text },
  caption: { fontSize: 13, color: colors.textMuted },
};

export const shadow = {
  shadowColor: "#0F172A",
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};
