/**
 * CompassModal — A real built-in compass using the device magnetometer.
 * Renders a rotating compass rose with heading degree readout.
 * Detects low accuracy and shows a figure-8 calibration prompt (like iOS Compass).
 * Falls back gracefully on web or if sensor is unavailable.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";

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

// Detect if magnetometer readings indicate poor calibration
// Low magnitude = weak/uncalibrated sensor. Erratic jumps = interference.
function computeMagnitude(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

export function CompassModal({ visible, onClose }: CompassModalProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [heading, setHeading] = useState(0);
  const [available, setAvailable] = useState(true);
  const [needsCalibration, setNeedsCalibration] = useState(false);
  const [calibrationDismissed, setCalibrationDismissed] = useState(false);
  const subscriptionRef = useRef<any>(null);
  const rotation = useSharedValue(0);

  // Figure-8 animation for calibration prompt
  const figure8X = useSharedValue(0);
  const figure8Y = useSharedValue(0);
  const figure8Opacity = useSharedValue(1);

  // Calibration detection: track recent magnitudes
  const magnitudeHistoryRef = useRef<number[]>([]);
  const headingHistoryRef = useRef<number[]>([]);
  const calibrationCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Smooth heading updates
  const prevHeadingRef = useRef(0);

  const updateHeading = useCallback((x: number, y: number, z: number) => {
    // Calculate heading from magnetometer x,y
    let angle = Math.atan2(y, x) * (180 / Math.PI);
    // Convert to 0-360 compass heading (North = 0)
    angle = (90 - angle + 360) % 360;
    const rounded = Math.round(angle);
    setHeading(rounded);

    // Track magnitude for calibration detection
    const mag = computeMagnitude(x, y, z);
    magnitudeHistoryRef.current.push(mag);
    headingHistoryRef.current.push(angle);
    if (magnitudeHistoryRef.current.length > 30) magnitudeHistoryRef.current.shift();
    if (headingHistoryRef.current.length > 30) headingHistoryRef.current.shift();

    // Smooth rotation — handle wrap-around (e.g., 350° → 10°)
    const prev = prevHeadingRef.current;
    let diff = angle - prev;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    const newTarget = prev + diff;
    prevHeadingRef.current = newTarget;
    rotation.value = withTiming(-newTarget, { duration: 200, easing: Easing.out(Easing.quad) });
  }, [rotation]);

  // Periodically check calibration quality
  useEffect(() => {
    if (!visible || !available) return;

    const checkCalibration = () => {
      const mags = magnitudeHistoryRef.current;
      const headings = headingHistoryRef.current;

      if (mags.length < 10) return; // Not enough data yet

      // Check 1: Very low magnitude (sensor not calibrated)
      const avgMag = mags.reduce((a, b) => a + b, 0) / mags.length;
      if (avgMag < 5) {
        setNeedsCalibration(true);
        return;
      }

      // Check 2: High variance in magnitude (interference/uncalibrated)
      const magVariance = mags.reduce((sum, m) => sum + Math.pow(m - avgMag, 2), 0) / mags.length;
      const magStdDev = Math.sqrt(magVariance);
      const coeffOfVariation = magStdDev / avgMag;
      if (coeffOfVariation > 0.5) {
        setNeedsCalibration(true);
        return;
      }

      // Check 3: Erratic heading jumps (more than 60° between consecutive readings)
      if (headings.length >= 10) {
        let bigJumps = 0;
        for (let i = 1; i < headings.length; i++) {
          let hDiff = Math.abs(headings[i] - headings[i - 1]);
          if (hDiff > 180) hDiff = 360 - hDiff;
          if (hDiff > 60) bigJumps++;
        }
        if (bigJumps > headings.length * 0.3) {
          setNeedsCalibration(true);
          return;
        }
      }

      // Readings look good
      setNeedsCalibration(false);
    };

    calibrationCheckRef.current = setInterval(checkCalibration, 2000);
    // Initial check after 3 seconds of data collection
    const initialCheck = setTimeout(checkCalibration, 3000);

    return () => {
      if (calibrationCheckRef.current) clearInterval(calibrationCheckRef.current);
      clearTimeout(initialCheck);
    };
  }, [visible, available]);

  // Start figure-8 animation when calibration is needed
  useEffect(() => {
    if (needsCalibration && !calibrationDismissed) {
      // Animate a figure-8 path
      figure8X.value = withRepeat(
        withSequence(
          withTiming(30, { duration: 800, easing: Easing.inOut(Easing.sin) }),
          withTiming(-30, { duration: 800, easing: Easing.inOut(Easing.sin) }),
          withTiming(30, { duration: 800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false
      );
      figure8Y.value = withRepeat(
        withSequence(
          withTiming(-20, { duration: 400, easing: Easing.inOut(Easing.sin) }),
          withTiming(20, { duration: 800, easing: Easing.inOut(Easing.sin) }),
          withTiming(-20, { duration: 800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false
      );
      figure8Opacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 1200 }),
          withTiming(1, { duration: 1200 }),
        ),
        -1,
        true
      );
    }
  }, [needsCalibration, calibrationDismissed, figure8X, figure8Y, figure8Opacity]);

  const figure8Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: figure8X.value },
      { translateY: figure8Y.value },
    ],
    opacity: figure8Opacity.value,
  }));

  useEffect(() => {
    if (!visible) return;
    // Reset state when opening
    setCalibrationDismissed(false);
    magnitudeHistoryRef.current = [];
    headingHistoryRef.current = [];
    prevHeadingRef.current = 0;

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
        sub = Magnetometer.addListener(({ x, y, z }) => {
          updateHeading(x, y, z);
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
  const showCalibrationBanner = needsCalibration && !calibrationDismissed;

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
            {/* Calibration Banner */}
            {showCalibrationBanner && (
              <View style={[styles.calibrationBanner, { backgroundColor: colors.warning + "18", borderColor: colors.warning + "40" }]}>
                <View style={styles.calibrationContent}>
                  <Animated.View style={[styles.figure8Icon, figure8Style]}>
                    <Text style={{ fontSize: 28 }}>📱</Text>
                  </Animated.View>
                  <View style={styles.calibrationTextArea}>
                    <Text style={[styles.calibrationTitle, { color: colors.warning }]}>
                      Calibration Needed
                    </Text>
                    <Text style={[styles.calibrationDesc, { color: colors.muted }]}>
                      Move your device in a figure-8 pattern to improve compass accuracy
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setCalibrationDismissed(true)}
                  style={[styles.dismissBtn, { backgroundColor: colors.warning + "20" }]}
                >
                  <Text style={{ color: colors.warning, fontSize: 13, fontWeight: "600" }}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Heading readout */}
            <Text style={[styles.headingDeg, { color: colors.foreground }]}>{heading}°</Text>
            <Text style={[styles.headingCardinal, { color: colors.primary }]}>{cardinal}</Text>

            {/* Accuracy indicator */}
            <View style={[styles.accuracyBadge, { backgroundColor: needsCalibration ? colors.warning + "20" : colors.success + "20" }]}>
              <View style={[styles.accuracyDot, { backgroundColor: needsCalibration ? colors.warning : colors.success }]} />
              <Text style={{ fontSize: 11, fontWeight: "600", color: needsCalibration ? colors.warning : colors.success }}>
                {needsCalibration ? "Low Accuracy" : "Good Accuracy"}
              </Text>
            </View>

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
    paddingBottom: 40,
  },
  headingDeg: {
    fontSize: 56,
    fontWeight: "800",
    letterSpacing: -2,
  },
  headingCardinal: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 8,
  },
  accuracyBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 20,
    gap: 6,
  },
  accuracyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
  // Calibration banner styles
  calibrationBanner: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    alignItems: "center",
  },
  calibrationContent: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  figure8Icon: {
    width: 50,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  calibrationTextArea: {
    flex: 1,
  },
  calibrationTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 3,
  },
  calibrationDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  dismissBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
  },
});
