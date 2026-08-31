import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { encodeCode128B } from "../utils/code128";
import { colors, radius, spacing } from "../theme";

export default function BarcodeLabel({
  value,
  customerName = "",
  moduleWidth = 2,
  height = 50,
}) {
  const code = value || "LN-0000";
  const { widths, bars } = useMemo(() => encodeCode128B(code), [code]);

  const rawWidth = useMemo(
    () => widths.reduce((a, b) => a + b, 0) * moduleWidth,
    [widths, moduleWidth]
  );

  let x = 0;
  const rects = widths.map((w, i) => {
    const barWidth = w * moduleWidth;
    const currentX = x;
    x += barWidth;

    if (!bars[i]) return null;

    return (
      <Rect
        key={i}
        x={currentX}
        y={0}
        width={barWidth}
        height={height}
        fill="#000000"
      />
    );
  });

  return (
    <View style={styles.wrap}>
      {customerName ? (
        <Text style={styles.customerName}>{customerName}</Text>
      ) : null}

      <View style={styles.svgContainer}>
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${rawWidth} ${height}`}
          preserveAspectRatio="xMidYMid meet"
        >
          {rects}
        </Svg>
      </View>

      <Text style={styles.codeText}>{code}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: 4,
    width: "100%",
    overflow: "hidden",
  },
  customerName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#000000",
    marginBottom: 4,
    textAlign: "center",
  },
  svgContainer: {
    width: "100%",
    maxWidth: 220,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
  },
  codeText: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#000000",
    textAlign: "center",
  },
});
