import { useOfflineQueue } from "@/lib/offline-queue";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "./icon-symbol";
import { Text, View, TouchableOpacity, Alert } from "react-native";

/**
 * OfflineBanner — Only shows when there are pending offline entries.
 * Tap to retry sync immediately, long-press to force clear stuck entries.
 */
export function OfflineBanner() {
  const { pendingCount, isOnline, syncPending, clearPendingQueue } = useOfflineQueue();
  const colors = useColors();

  // Only show when there are actually pending entries to sync
  if (pendingCount === 0) return null;

  const handlePress = async () => {
    if (isOnline) {
      try {
        await syncPending();
      } catch {}
    }
  };

  const handleLongPress = () => {
    Alert.alert(
      "Clear Pending Entries",
      `${pendingCount} entr${pendingCount === 1 ? "y has" : "ies have"} been stuck. Clear them? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            await clearPendingQueue();
          },
        },
      ]
    );
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={0.7}
    >
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
          {isOnline ? " — tap to retry" : ""}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
