import { useOfflineQueue } from "@/lib/offline-queue";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "./icon-symbol";
import { Text, View } from "react-native";

export function OfflineBanner() {
  const { isOnline, pendingCount } = useOfflineQueue();
  const colors = useColors();

  if (isOnline && pendingCount === 0) return null;

  return (
    <View
      style={{
        backgroundColor: isOnline ? colors.success : colors.warning,
        paddingHorizontal: 16,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
      }}
    >
      <IconSymbol
        name={isOnline ? "arrow.clockwise" : "wifi.slash"}
        size={16}
        color="#fff"
      />
      <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600", flex: 1 }}>
        {isOnline
          ? `Syncing ${pendingCount} offline entr${pendingCount === 1 ? "y" : "ies"}...`
          : `Offline — ${pendingCount} entr${pendingCount === 1 ? "y" : "ies"} queued`}
      </Text>
    </View>
  );
}
