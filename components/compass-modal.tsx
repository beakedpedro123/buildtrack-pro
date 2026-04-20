/**
 * CompassModal — A real built-in compass using the device magnetometer.
 * Renders a rotating compass rose with heading degree readout.
 * Falls back gracefully on web or if sensor is unavailable.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from "react-native-reanimated";

interface CompassModalProps {
  visible: boolean;
  onClose: () => void;
}

// Cardinal direction from heading
function getCardinal(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const idx = Math.round(deg / 22.5) % 16;
  return dirs[idx];
}

export function CompassModal({ visible, onClose }: CompassModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [heading, setHeading] = useState(0);
  const [available, setAvailable] = useState(true);
  const subscriptionRef = useRef<any>(null);
  const rotation = useSharedValue(0);

  // Smooth heading updates
  const prevHeadingRef = useRef(0);

  const updateHeading = useCallback((x: number, y: number) => {
    // Calculate heading from magnetometer x,y
    let angle = Math.atan2(y, x) * (180 / Math.PI);
    // Convert to 0-360 compass heading (North = 0)
    angle = (90 - angle + 360) % 360;
    const rounded = Math.round(angle);
    setHeading(rounded);

    // Smooth rotation — handle wrap-around (e.g., 350° → 10°)
    const prev = prevHeadingRef.current;
    let diff = angle - prev;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    const newTarget = prev + diff;
    prevHeadingRef.current = newTarget;
    rotation.value = withTiming(-newTarget, { duration: 200, easing: Easing.out(Easing.quad) });
  }, [rotation]);

  useEffect(() => {
    if (!visible) return;
    if (Platform.OS === "web") {
      setAvailable(false);
      return;
    }

    let sub: any = null;
    (async () => {
      try {
        const { Magnetometer } = await import("expo-sensors");
        const isAvail = await Magnetometer.isAvailableAsync();
        if (!isAvail) {
          setAvailable(false);
          return;
        }
        setAvailable(true);
        Magnetometer.setUpdateInterval(100);
        sub = Magnetometer.addListener(({ x, y }) => {
          updateHeading(x, y);
        });
        subscriptionRef.current = sub;
      } catch {
        setAvailable(false);
      }
    })();

    return () => {
      if (sub) sub.remove();
      subscriptionRef.current = null;
    };
  }, [visible, updateHeading]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const cardinal = getCardinal(heading);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 20) }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.foreground }]}>Compass</Text>
          <TouchableOpacity onPress={onClose} style={[styles.closeBtn, { backgroundColor: colors.surface }]}>
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 15 }}>Done</Text>
          </TouchableOpacity>
        </View>

        {!available ? (
          <View style={styles.center}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>🧭</Text>
            <Text style={[styles.unavailableText, { color: colors.foreground }]}>
              Compass not available
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center", marginTop: 8 }}>
              The magnetometer sensor is not available on this device or platform.
            </Text>
          </View>
        ) : (
          <View style={styles.compassArea}>
            {/* Heading readout */}
            <Text style={[styles.headingDeg, { color: colors.foreground }]}>{heading}°</Text>
            <Text style={[styles.headingCardinal, { color: colors.primary }]}>{cardinal}</Text>

            {/* Compass Rose */}
            <View style={styles.compassRing}>
              {/* Fixed pointer (red triangle at top) */}
              <View style={styles.pointerContainer}>
                <View style={[styles.pointer, { borderBottomColor: colors.error }]} />
              </View>

              {/* Rotating compass dial */}
              <Animated.View style={[styles.dial, animatedStyle]}>
                {/* Tick marks and labels */}
                {Array.from({ length: 72 }, (_, i) => {
                  const deg = i * 5;
                  const isMajor = deg % 90 === 0;
                  const isMinor = deg % 30 === 0;
                  const label = deg === 0 ? "N" : deg === 90 ? "E" : deg === 180 ? "S" : deg === 270 ? "W" : null;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.tickContainer,
                        { transform: [{ rotate: `${deg}deg` }] },
                      ]}
                    >
                      <View
                        style={[
                          styles.tick,
                          {
                            height: isMajor ? 20 : isMinor ? 14 : 8,
                            width: isMajor ? 3 : isMinor ? 2 : 1,
                            backgroundColor: deg === 0 ? colors.error : isMajor ? colors.foreground : isMinor ? colors.muted : colors.border,
                          },
                        ]}
                      />
                      {label && (
                        <Text
                          style={[
                            styles.tickLabel,
                            {
                              color: label === "N" ? colors.error : colors.foreground,
                              fontWeight: label === "N" ? "900" : "700",
                              fontSize: label === "N" ? 22 : 18,
                            },
                          ]}
                        >
                          {label}
                        </Text>
                      )}
                    </View>
                  );
                })}
                {/* Center dot */}
                <View style={[styles.centerDot, { backgroundColor: colors.primary }]} />
              </Animated.View>
            </View>

            <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", marginTop: 20 }}>
              Hold device flat for best accuracy
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const DIAL_SIZE = 280;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
  },
  closeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  unavailableText: {
    fontSize: 18,
    fontWeight: "700",
  },
  compassArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 60,
  },
  headingDeg: {
    fontSize: 56,
    fontWeight: "800",
    letterSpacing: -2,
  },
  headingCardinal: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 30,
  },
  compassRing: {
    width: DIAL_SIZE + 40,
    height: DIAL_SIZE + 40,
    alignItems: "center",
    justifyContent: "center",
  },
  pointerContainer: {
    position: "absolute",
    top: 0,
    alignSelf: "center",
    zIndex: 10,
  },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 18,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  dial: {
    width: DIAL_SIZE,
    height: DIAL_SIZE,
    borderRadius: DIAL_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  tickContainer: {
    position: "absolute",
    width: 2,
    height: DIAL_SIZE / 2,
    alignItems: "center",
    bottom: DIAL_SIZE / 2,
    left: DIAL_SIZE / 2 - 1,
    transformOrigin: "bottom center",
  },
  tick: {
    borderRadius: 1,
  },
  tickLabel: {
    marginTop: 4,
  },
  centerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
