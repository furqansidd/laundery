import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Dimensions,
} from "react-native";
import { colors, radius, spacing } from "../theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function PhotoViewerModal({
  visible,
  photos = [],
  initialIndex = 0,
  onClose,
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
    }
  }, [visible, initialIndex]);

  if (!visible || !photos || photos.length === 0) return null;

  const currentPhoto = photos[currentIndex];

  return (
    <View style={styles.overlay}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.counterText}>
            Photo {currentIndex + 1} of {photos.length}
          </Text>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          >
            <Text style={styles.closeText}>✕ Close</Text>
          </TouchableOpacity>
        </View>

        {/* Zoomable Image Container */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          maximumZoomScale={4}
          minimumZoomScale={1}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <Image
            source={{ uri: currentPhoto }}
            style={styles.image}
            resizeMode="contain"
          />
        </ScrollView>

        {/* Thumbnail Selector & Switcher */}
        {photos.length > 1 && (
          <View style={styles.footer}>
            <View style={styles.thumbnailRow}>
              {photos.map((uri, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.thumbWrap,
                    currentIndex === idx && styles.thumbActive,
                  ]}
                  onPress={() => setCurrentIndex(idx)}
                >
                  <Image source={{ uri }} style={styles.thumbnail} />
                  <Text style={styles.thumbLabel}>Photo {idx + 1}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000000",
    zIndex: 99999,
    elevation: 99999,
  },
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: "rgba(0,0,0,0.85)",
    zIndex: 10,
  },
  counterText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  closeBtn: {
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingVertical: spacing.xs + 4,
    paddingHorizontal: spacing.md + 4,
    borderRadius: radius.pill,
  },
  closeText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.72,
  },
  footer: {
    backgroundColor: "rgba(0,0,0,0.85)",
    paddingVertical: spacing.md,
    alignItems: "center",
    zIndex: 10,
  },
  thumbnailRow: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  thumbWrap: {
    alignItems: "center",
    padding: 3,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: "transparent",
  },
  thumbActive: {
    borderColor: colors.primary,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
  },
  thumbLabel: {
    color: "#AAAAAA",
    fontSize: 12,
    marginTop: 4,
    fontWeight: "600",
  },
});
