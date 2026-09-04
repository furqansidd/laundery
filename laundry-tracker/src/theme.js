// Single source of truth for colors, spacing, radius and typography
export const colors = {
  bg: "#0F172A",          // Dark slate background for header contrast
  screenBg: "#F1F5F9",    // Soft slate-gray background for elevated contrast
  surface: "#FFFFFF",     // Crisp white cards
  surfaceMuted: "#F8FAFC",// Light container fill
  surfaceSubtle: "#EEF2F6",
  border: "#E2E8F0",      // Soft light gray borders
  borderDarker: "#CBD5E1",
  borderFocus: "#2563EB", // Active focus border
  primary: "#2563EB",     // Vibrant Royal Indigo/Blue
  primaryLight: "#EFF6FF",// Soft blue tint for selected items
  primaryDark: "#1D4ED8",
  success: "#10B981",     // Modern Emerald green
  successLight: "#ECFDF5",
  warning: "#D97706",     // Vibrant Amber
  warningLight: "#FEF3C7",
  danger: "#EF4444",      // Crimson Red
  dangerLight: "#FEF2F2",
  text: "#0F172A",        // Very dark navy for primary text
  textMuted: "#64748B",   // Slate gray for secondary text
  textLight: "#94A3B8",   // Light slate
  textInverse: "#FFFFFF",
  purple: "#8B5CF6",
  purpleLight: "#F5F3FF",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
};

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
};

export const typography = {
  h1: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  h2: { fontSize: 19, fontWeight: "700", color: colors.text, letterSpacing: -0.3 },
  h3: { fontSize: 16, fontWeight: "700", color: colors.text },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
  bodyBold: { fontSize: 14, fontWeight: "700", color: colors.text },
  caption: { fontSize: 12, color: colors.textMuted },
  badgeText: { fontSize: 12, fontWeight: "700" },
};

export const shadow = {
  sm: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  md: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  lg: {
    shadowColor: "#0F172A",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
};

export const getStatusBadgeStyle = (status) => {
  switch (status) {
    case "intake":
      return { bg: colors.warningLight, text: colors.warning, label: "Intake 🧺" };
    case "wash_press":
      return { bg: "#EFF6FF", text: "#2563EB", label: "Wash & Press 🧺" };
    case "press_only":
      return { bg: "#F0F9FF", text: "#0284C7", label: "Pressing 👔" };
    case "dry_clean":
      return { bg: "#F5F3FF", text: "#7C3AED", label: "Dry Clean 🧪" };
    case "wash_fold":
      return { bg: "#F0FDFA", text: "#0D9488", label: "Wash & Fold 🧼" };
    case "washing":
      return { bg: colors.primaryLight, text: colors.primary, label: "Washing 🧼" };
    case "sorting":
      return { bg: "#F5F3FF", text: "#8B5CF6", label: "Sorting 🔍" };
    case "ready_for_delivery":
      return { bg: colors.successLight, text: colors.success, label: "Ready 📦" };
    case "delivered":
      return { bg: colors.surfaceMuted, text: colors.textMuted, label: "Delivered ✅" };
    default:
      return { bg: colors.surfaceMuted, text: colors.textMuted, label: status || "Pending" };
  }
};


