import { useOfflineQueue } from "@/lib/offline-queue";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "./icon-symbol";
import { Text, View } from "react-native";

/**
 * OfflineBanner — Only shows when there are pending offline entries.
 * Does NOT show a generic "you're offline" banner (which was causing
 * false positives on mobile with 5G service).
 */
export function OfflineBanner() {
  const { pendingCount } = useOfflineQueue();
  const colors = useColors();

  // Only show when there are actually pending entries to sync
  if (pendingCount === 0) return null;

  return (
    <View
      style={{
        backgroundColor: colors.warning,
        paddingHorizontal: 16,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <IconSymbol
        name="arrow.clockwise"
        size={16}
        color="#fff"
      />
      <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600", flex: 1 }}>
        {`${pendingCount} entr${pendingCount === 1 ? "y" : "ies"} pending sync`}
      </Text>
    </View>
  );
}
