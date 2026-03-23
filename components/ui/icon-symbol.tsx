// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "briefcase.fill": "work",
  "clock.fill": "access-time",
  "doc.text.fill": "description",
  "person.3.fill": "group",
  "person.fill": "person",
  "plus": "add",
  "checkmark.circle.fill": "check-circle",
  "xmark.circle.fill": "cancel",
  "camera.fill": "camera-alt",
  "photo.fill": "photo-library",
  "dollarsign.circle.fill": "attach-money",
  "chart.bar.fill": "bar-chart",
  "arrow.clockwise": "refresh",
  "bell.fill": "notifications",
  "gear": "settings",
  "location.fill": "location-on",
  "wifi.slash": "wifi-off",
  "arrow.up.arrow.down": "swap-vert",
  "trash.fill": "delete",
  "pencil": "edit",
  "eye.fill": "visibility",
  "star.fill": "star",
  "exclamationmark.triangle.fill": "warning",
  "info.circle.fill": "info",
  "checkmark": "check",
  "xmark": "close",
  "magnifyingglass": "search",
  "square.and.arrow.up": "share",
  "building.2.fill": "business",
  "hammer.fill": "construction",
  "wrench.fill": "build",
  "list.bullet": "list",
  "calendar": "calendar-today",
  "clock": "schedule",
  "person.badge.plus": "person-add",
  "arrow.left": "arrow-back",
  "ellipsis": "more-horiz",
  "cloud.fill": "cloud",
  "cloud.bolt.fill": "cloud-off",
  "timer": "timer",
  "mic.fill": "mic",
  "target": "track-changes",
  "flag.fill": "flag",
  "chart.line.uptrend.xyaxis": "show-chart",
  "dollarsign.square.fill": "payments",
  "shield.fill": "shield" as const,
  "shield.checkmark.fill": "verified-user" as const,
} satisfies Record<string, ComponentProps<typeof MaterialIcons>["name"]>;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
